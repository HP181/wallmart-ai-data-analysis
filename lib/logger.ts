/**
 * Minimal structured logger: one JSON object per line on stdout/stderr, which
 * is what Vercel, Datadog, CloudWatch and `jq` all understand.
 *
 * Deliberately dependency-free and safe to import anywhere (it never reads
 * validated config, so a bad environment cannot break logging itself).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogRecord = {
  time: string;
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
};

export type LogSink = (level: LogLevel, line: string, record: LogRecord) => void;

const stdoutSink: LogSink = (level, line) => {
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
};

/** Strip connection strings and credentials out of any string before logging it. */
export function redact(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgres://[redacted]")
    .replace(/(password|passwd|pwd|apikey|api_key|secret|token)(["'\s:=]+)[^\s"',;]+/gi, "$1$2[redacted]");
}

export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const out: Record<string, unknown> = {
      name: err.name,
      message: redact(err.message),
    };
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") out.code = code;
    if (err.stack) out.stack = redact(err.stack).split("\n").slice(0, 8).join("\n");
    if (err.cause !== undefined) out.cause = serializeError(err.cause);
    return out;
  }
  return { message: redact(String(err)) };
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

function currentLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return raw in ORDER ? (raw as LogLevel) : "info";
}

export function createLogger(
  bindings: Record<string, unknown> = {},
  sink: LogSink = stdoutSink,
): Logger {
  const write = (level: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[level] < ORDER[currentLevel()]) return;
    const safeFields: Record<string, unknown> = { ...fields };
    if ("err" in safeFields) safeFields.err = serializeError(safeFields.err);
    const record: LogRecord = {
      time: new Date().toISOString(),
      level,
      msg,
      ...bindings,
      ...safeFields,
    };
    let line: string;
    try {
      line = JSON.stringify(record);
    } catch {
      line = JSON.stringify({ time: record.time, level, msg, note: "unserializable log fields" });
    }
    sink(level, line, record);
  };

  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    child: (extra) => createLogger({ ...bindings, ...extra }, sink),
  };
}

/** Process-wide root logger. */
export const logger = createLogger({ app: "walmart-ai-analyst" });
