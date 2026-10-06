import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "@/lib/config";

const db = vi.hoisted(() => ({ runReadQueries: vi.fn(), runReadQuery: vi.fn(), probeDataset: vi.fn() }));
vi.mock("@/lib/db", () => db);

import { GET } from "@/app/api/export/route";
import { EXPORT_COLUMNS } from "@/lib/data/rows";

type Statement = { text: string; params: unknown[] };

function makeRow(id: number, overrides: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = Object.fromEntries(EXPORT_COLUMNS.map((c) => [c, `${c}-${id}`]));
  row.invoice_id = id;
  return { ...row, ...overrides };
}

/** A fake table of `n` rows that honours keyset paging like the real SQL does. */
function fakeTable(n: number, overrides: (id: number) => Record<string, unknown> = () => ({})) {
  const calls: Statement[] = [];
  db.runReadQuery.mockImplementation(async (statement: Statement) => {
    calls.push(statement);
    const afterId = Number(statement.params[0]);
    const limit = Number(statement.params[statement.params.length - 1]);
    const out = [];
    for (let id = afterId + 1; id <= n && out.length < limit; id++) out.push(makeRow(id, overrides(id)));
    return out;
  });
  return calls;
}

const get = (qs = "", init?: RequestInit) => GET(new Request(`http://localhost/api/export${qs}`, init));
const lines = (csv: string) => csv.split("\r\n").filter((l) => l !== "");

describe("GET /api/export", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://u:pw@ep-x.neon.tech/neondb";
    process.env.EXPORT_BATCH_SIZE = "100";
    delete process.env.EXPORT_MAX_ROWS;
    resetConfigForTests();
    db.runReadQuery.mockReset();
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("streams a header plus every row, fetching bounded keyset batches", async () => {
    const calls = fakeTable(250);
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toContain("walmart_cleaned_data.csv");
    expect(res.headers.get("x-request-id")).toBeTruthy();

    const out = lines(await res.text());
    expect(out[0]).toBe(EXPORT_COLUMNS.join(","));
    expect(out).toHaveLength(251);
    expect(out[1].split(",")[0]).toBe("1");
    expect(out[250].split(",")[0]).toBe("250");

    // 100 + 100 + 50: the short last batch ends the export without an extra query.
    expect(calls.map((c) => c.params[0])).toEqual([0, 100, 200]);
    expect(calls.every((c) => c.params[c.params.length - 1] === 100)).toBe(true);
  });

  it("terminates correctly when the row count is an exact multiple of the batch size", async () => {
    const calls = fakeTable(200);
    const out = lines(await (await get()).text());
    expect(out).toHaveLength(201);
    expect(calls.map((c) => c.params[0])).toEqual([0, 100, 200]); // third call returns nothing
  });

  it("returns only the header for an empty table or filter", async () => {
    fakeTable(0);
    const res = await get("?category=Nothing");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(EXPORT_COLUMNS.join(",") + "\r\n");
  });

  it("applies the same filters as /api/data", async () => {
    const calls = fakeTable(5);
    await (await get("?category=Health%20and%20beauty&year=2021")).text();
    expect(calls[0].params).toEqual([0, "Health and beauty", 2021, 100]);
  });

  it("rejects bad filters with a JSON 400 instead of starting a download", async () => {
    fakeTable(5);
    const res = await get("?year=abc");
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(db.runReadQuery).not.toHaveBeenCalled();
  });

  it("stops at EXPORT_MAX_ROWS", async () => {
    process.env.EXPORT_MAX_ROWS = "150";
    resetConfigForTests();
    const calls = fakeTable(1000);
    const out = lines(await (await get()).text());
    expect(out).toHaveLength(151);
    expect(calls).toHaveLength(2);
  });

  it("escapes commas, quotes, newlines and spreadsheet formulas", async () => {
    fakeTable(1, () => ({ city: 'Dallas, "TX"', branch: "=cmd|' /C calc'!A0", category: "line1\nline2", total: -12.5 }));
    const csv = await (await get()).text();
    expect(csv).toContain('"Dallas, ""TX"""');
    expect(csv).toContain("'=cmd|' /C calc'!A0");
    expect(csv).not.toMatch(/,=cmd/);
    expect(csv).toContain('"line1\nline2"');
    expect(csv).toContain(",-12.5,"); // real negative numbers are untouched
  });

  it("returns a proper JSON error when the first batch fails (no half-started download)", async () => {
    db.runReadQuery.mockRejectedValue(Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" }));
    const res = await get();
    expect(res.status).toBe(504);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect((await res.json()).error.code).toBe("db_timeout");
  });

  it("errors the stream (not a silently truncated file) when a later batch fails", async () => {
    let call = 0;
    db.runReadQuery.mockImplementation(async (s: Statement) => {
      call++;
      if (call === 2) throw new Error("connection reset");
      return Array.from({ length: 100 }, (_, i) => makeRow(Number(s.params[0]) + i + 1));
    });
    const res = await get();
    expect(res.status).toBe(200); // headers were already sent
    await expect(res.text()).rejects.toThrow("connection reset");
  });

  it("stops fetching when the client cancels", async () => {
    const calls = fakeTable(100_000);
    const res = await get();
    const reader = res.body!.getReader();
    await reader.read(); // first chunk
    await reader.cancel();
    const callsAtCancel = calls.length;
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.length).toBe(callsAtCancel);
    expect(calls.length).toBeLessThan(5); // nowhere near 1000 batches
  });
});
