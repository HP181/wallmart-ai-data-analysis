import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Row, Statement } from "@/lib/db";

/**
 * Integration-test database: a real Postgres (PGlite, WASM) loaded with the
 * actual cleaned dataset and the actual migration file, laid out exactly like
 * the table scripts/migrate_to_neon.py creates (date/time as TEXT).
 */

const ROOT = path.resolve(__dirname, "../..");
export const CSV_PATH = path.join(ROOT, "public/Walmart_cleaned_data.csv");
export const MIGRATION_PATH = path.join(ROOT, "scripts/sql/001_typed_datetime_and_indexes.sql");

const CREATE_TABLE = `
CREATE TABLE walmart (
  invoice_id integer, branch text, city text, category text,
  unit_price double precision, quantity smallint,
  "date" text, "time" text,
  payment_method text, rating double precision, profit_margin double precision,
  total double precision, profit_amount double precision,
  year smallint, month smallint, month_name text, day_of_week text,
  week_number smallint, hour smallint, shift text, revenue_tier text
)`;

export type CsvRow = Record<string, string>;

/** Parse the dataset in JS, independently of Postgres, for expected values. */
export function readCsvRows(): CsvRow[] {
  const text = readFileSync(CSV_PATH, "utf8");
  if (text.includes('"')) throw new Error("Test CSV parser assumes no quoted fields.");
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const columns = header.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(columns.map((c, i) => [c, cells[i]]));
  });
}

export type TestDb = {
  pg: PGlite;
  run: (statement: Statement) => Promise<Row[]>;
  close: () => Promise<void>;
};

export async function createWalmartDb(options: { migrate?: boolean } = {}): Promise<TestDb> {
  const pg = new PGlite();
  await pg.exec(CREATE_TABLE);
  await pg.query(`COPY walmart FROM '/dev/blob' WITH (FORMAT csv, HEADER true)`, [], {
    blob: new Blob([readFileSync(CSV_PATH)]),
  });
  if (options.migrate !== false) {
    await pg.exec(readFileSync(MIGRATION_PATH, "utf8"));
  }
  return {
    pg,
    run: async ({ text, params }) => (await pg.query<Row>(text, params as unknown[])).rows,
    close: () => pg.close(),
  };
}
