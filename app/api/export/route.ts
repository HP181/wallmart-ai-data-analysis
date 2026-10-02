import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql.query(
      "SELECT * FROM walmart ORDER BY invoice_id LIMIT 10000"
    ) as Record<string, unknown>[];

    if (!rows.length) {
      return NextResponse.json({ error: "No data found" }, { status: 404 });
    }

    const columns = Object.keys(rows[0]);

    // Build CSV — quote fields that contain commas or quotes
    function escapeCell(val: unknown): string {
      if (val === null || val === undefined) return "";
      const s = String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    }

    const header = columns.join(",");
    const body = rows.map((row) => columns.map((c) => escapeCell(row[c])).join(","));
    const csv = [header, ...body].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="walmart_cleaned_data.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
