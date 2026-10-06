import { neon } from "@neondatabase/serverless";
import { getConfig, databaseNameFromUrl } from "@/lib/config";
import { logger } from "@/lib/logger";

/**
 * Database access.
 *
 * Defence in depth, because no amount of string checking makes arbitrary SQL
 * safe:
 *   1. Callers only ever pass statements compiled from allowlisted structures
 *      (see lib/query and lib/data); user and model input are bound as
 *      parameters, never concatenated.
 *   2. Every statement runs in a READ ONLY transaction, so a bug upstream
 *      still cannot write.
 *   3. `SET LOCAL statement_timeout` bounds how long any query may run.
 *   4. Set DATABASE_URL_READONLY to a role that only has SELECT (see
 *      scripts/sql/optional/readonly_role.sql) so the database itself refuses
 *      writes no matter what the application does.
 */

export type Statement = {
  text: string;
  params: unknown[];
};

export type Row = Record<string, unknown>;

type SqlClient = ReturnType<typeof neon>;

let client: { sql: SqlClient; url: string } | undefined;
let warnedAboutWriteRole = false;

function getSql(): SqlClient {
  const config = getConfig();
  if (!client || client.url !== config.databaseUrl) {
    client = { sql: neon(config.databaseUrl), url: config.databaseUrl };
  }
  if (!config.usingReadOnlyRole && !warnedAboutWriteRole) {
    warnedAboutWriteRole = true;
    logger.warn(
      "DATABASE_URL_READONLY is not set: queries run read-only per transaction, but as the primary role. " +
        "Create a SELECT-only role for defence in depth (scripts/sql/optional/readonly_role.sql).",
    );
  }
  return client.sql;
}

export type RunOptions = {
  /** Aborts the in-flight HTTP request, e.g. when the user cancels a turn. */
  signal?: AbortSignal;
};

/**
 * Run one or more read-only statements in a single transaction (one HTTP
 * round trip) and return each statement's rows, in order.
 */
export async function runReadQueries(
  statements: Statement[],
  options: RunOptions = {},
): Promise<Row[][]> {
  if (statements.length === 0) return [];
  const { queryTimeoutMs } = getConfig();
  const sql = getSql();

  // The timeout is a validated integer from config, so inlining it is safe
  // (SET does not accept bind parameters).
  const timeout = Math.trunc(queryTimeoutMs);
  const results = await sql.transaction(
    [
      sql.query(`SET LOCAL statement_timeout = ${timeout}`),
      ...statements.map((s) => sql.query(s.text, s.params as unknown[])),
    ],
    {
      readOnly: true,
      ...(options.signal ? { fetchOptions: { signal: options.signal } } : {}),
    },
  );

  // results[0] is the SET LOCAL command.
  return (results as unknown as Row[][]).slice(1);
}

export async function runReadQuery(statement: Statement, options?: RunOptions): Promise<Row[]> {
  const [rows] = await runReadQueries([statement], options);
  return rows ?? [];
}

export type DatasetStatus = {
  rowCount: number;
  hasTypedDateColumns: boolean;
  databaseName?: string;
};

/** Cheap probe used by /api/health. Throws on any database problem. */
export async function probeDataset(options?: RunOptions): Promise<DatasetStatus> {
  const rows = await runReadQuery(
    {
      text:
        "SELECT (SELECT COUNT(*) FROM walmart)::int AS row_count, " +
        "EXISTS (SELECT 1 FROM information_schema.columns " +
        "WHERE table_schema = current_schema() AND table_name = 'walmart' AND column_name = 'sale_date') AS typed",
      params: [],
    },
    options,
  );
  const row = rows[0] ?? {};
  return {
    rowCount: Number(row.row_count ?? 0),
    hasTypedDateColumns: Boolean(row.typed),
    databaseName: databaseNameFromUrl(getConfig().databaseUrl),
  };
}
