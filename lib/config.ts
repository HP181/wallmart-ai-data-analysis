import { z } from "zod";

/**
 * Explicit, validated runtime configuration.
 *
 * Nothing here runs at import time, so a missing variable can never crash a
 * build or an unrelated route. Callers get a ConfigError that names the
 * offending variables (never their values) the first time configuration is
 * actually needed.
 */

export class ConfigError extends Error {
  readonly missing: string[];
  readonly invalid: string[];

  constructor(missing: string[], invalid: string[]) {
    const parts: string[] = [];
    if (missing.length) parts.push(`missing: ${missing.join(", ")}`);
    if (invalid.length) parts.push(`invalid: ${invalid.join(", ")}`);
    super(`Invalid server configuration (${parts.join("; ")}).`);
    this.name = "ConfigError";
    this.missing = missing;
    this.invalid = invalid;
  }
}

const postgresUrl = z
  .string()
  .min(1)
  .refine((v) => /^postgres(ql)?:\/\//i.test(v), {
    message: "must start with postgres:// or postgresql://",
  });

/** Treat empty strings (`FOO=`) as unset so defaults apply. */
const blankToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const boundedInt = (min: number, max: number, fallback: number) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().min(min).max(max).default(fallback));

const envSchema = z.object({
  DATABASE_URL: postgresUrl,
  DATABASE_URL_READONLY: z.preprocess(blankToUndefined, postgresUrl.optional()),
  DB_QUERY_TIMEOUT_MS: boundedInt(500, 60_000, 8_000),
  MAX_QUERY_ROWS: boundedInt(1, 5_000, 500),
  EXPORT_BATCH_SIZE: boundedInt(100, 5_000, 1_000),
  EXPORT_MAX_ROWS: boundedInt(1, 5_000_000, 250_000),
  /** Hard ceiling for one analyzeData tool call (ms). Belt-and-suspenders above DB_QUERY_TIMEOUT_MS. */
  TOOL_TIMEOUT_MS: boundedInt(5_000, 120_000, 20_000),
  /** Log a warning when a DB transaction takes longer than this (ms). */
  SLOW_QUERY_MS: boundedInt(100, 30_000, 3_000),
});

export type Config = {
  /** Connection string used for every application query. */
  databaseUrl: string;
  /** True when DATABASE_URL_READONLY is set, i.e. queries run as a read-only role. */
  usingReadOnlyRole: boolean;
  /** Server-side statement timeout applied to every query transaction. */
  queryTimeoutMs: number;
  /** Hard cap on rows returned by an analyst query. */
  maxQueryRows: number;
  /** Rows fetched per keyset page while streaming the CSV export. */
  exportBatchSize: number;
  /** Hard cap on rows in one CSV export. */
  exportMaxRows: number;
  /** Hard ceiling for one analyzeData tool call, belt-and-suspenders above queryTimeoutMs. */
  toolTimeoutMs: number;
  /** Warn when a DB transaction exceeds this duration. */
  slowQueryMs: number;
};

export type ConfigStatus = {
  ok: boolean;
  missing: string[];
  invalid: string[];
};

type Env = Record<string, string | undefined>;

function describeIssues(error: z.ZodError): ConfigStatus {
  const missing = new Set<string>();
  const invalid = new Set<string>();
  for (const issue of error.issues) {
    const name = String(issue.path[0] ?? "unknown");
    // Zod reports an absent required string as "invalid_type" with no value.
    if (issue.code === "invalid_type" && /undefined/i.test(issue.message)) missing.add(name);
    else invalid.add(name);
  }
  return { ok: false, missing: [...missing], invalid: [...invalid] };
}

/** Pure parse of an environment object. Throws ConfigError. */
export function loadConfig(env: Env = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const { missing, invalid } = describeIssues(parsed.error);
    throw new ConfigError(missing, invalid);
  }
  const v = parsed.data;
  return {
    databaseUrl: v.DATABASE_URL_READONLY ?? v.DATABASE_URL,
    usingReadOnlyRole: Boolean(v.DATABASE_URL_READONLY),
    queryTimeoutMs: v.DB_QUERY_TIMEOUT_MS,
    maxQueryRows: v.MAX_QUERY_ROWS,
    exportBatchSize: v.EXPORT_BATCH_SIZE,
    exportMaxRows: v.EXPORT_MAX_ROWS,
    toolTimeoutMs: v.TOOL_TIMEOUT_MS,
    slowQueryMs: v.SLOW_QUERY_MS,
  };
}

/** Like loadConfig but reports problems instead of throwing. Never includes values. */
export function checkConfig(env: Env = process.env): ConfigStatus {
  const parsed = envSchema.safeParse(env);
  return parsed.success ? { ok: true, missing: [], invalid: [] } : describeIssues(parsed.error);
}

let cached: Config | undefined;

/** Validated config, parsed once per process. Throws ConfigError. */
export function getConfig(): Config {
  cached ??= loadConfig();
  return cached;
}

/** Test hook: forget the cached config. */
export function resetConfigForTests(): void {
  cached = undefined;
}

/** Database name from a connection string, or undefined. Never returns credentials or host. */
export function databaseNameFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const name = new URL(url).pathname.replace(/^\//, "");
    return name || undefined;
  } catch {
    return undefined;
  }
}
