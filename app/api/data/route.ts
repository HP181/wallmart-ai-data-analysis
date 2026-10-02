import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    console.log("rrr")
    const rows = await sql.query(
      "SELECT * FROM walmart ORDER BY invoice_id LIMIT 10000"
    ) as Record<string, unknown>[];
    console.log({count: rows.length})
    return NextResponse.json({ rows, count: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch data";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
