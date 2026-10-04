import { NextResponse } from "next/server";
import { getWalmartData } from "@/lib/db";

export async function GET() {
  try {
    const rows = await getWalmartData();
    return NextResponse.json({ rows, count: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch data";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
