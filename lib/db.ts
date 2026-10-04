import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export type QueryResult = {
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
  error?: string;
};

const FORBIDDEN = [
  "INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER", "TRUNCATE",
  "EXEC", "EXECUTE", "GRANT", "REVOKE", "SLEEP(", "BENCHMARK(",
];

export function validateSQL(query: string): { valid: boolean; reason?: string } {
  const upper = query.trim().toUpperCase();
  if (!upper.startsWith("SELECT")) {
    return { valid: false, reason: "Only SELECT queries are allowed." };
  }
  for (const kw of FORBIDDEN) {
    if (upper.includes(kw)) {
      return { valid: false, reason: `Forbidden keyword: ${kw}` };
    }
  }
  const stripped = query.trimEnd().replace(/;$/, "");
  if (stripped.includes(";")) {
    return { valid: false, reason: "Multiple statements are not allowed." };
  }
  if (!upper.includes("WALMART")) {
    return { valid: false, reason: "Query must reference the walmart table." };
  }
  return { valid: true };
}

export async function getWalmartData(): Promise<Record<string, unknown>[]> {
  const rows = await sql.query(
    "SELECT * FROM walmart ORDER BY invoice_id LIMIT 10000"
  );
  return rows as Record<string, unknown>[];
}

export async function executeQuery(query: string): Promise<QueryResult> {
  const check = validateSQL(query);
  if (!check.valid) {
    return { rows: [], columns: [], rowCount: 0, error: check.reason };
  }

  try {
    // Add LIMIT safety cap if not already present
    const safeQuery = /\bLIMIT\b/i.test(query) ? query : `${query.trimEnd().replace(/;$/, "")} LIMIT 500`;
    const rows = await sql.query(safeQuery) as Record<string, unknown>[];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { rows, columns, rowCount: rows.length };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Query execution failed";
    return { rows: [], columns: [], rowCount: 0, error: message };
  }
}
