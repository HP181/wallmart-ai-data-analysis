import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "@/lib/config";

const db = vi.hoisted(() => ({ runReadQueries: vi.fn(), runReadQuery: vi.fn(), probeDataset: vi.fn() }));
vi.mock("@/lib/db", () => db);

import { GET } from "@/app/api/health/route";
import { MODEL_ID } from "@/lib/app-info";

const get = () => GET(new Request("http://localhost/api/health"));
const SECRET_URL = "postgresql://owner:hunter2@ep-secret-host.neon.tech/neondb";

describe("GET /api/health", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.DATABASE_URL = SECRET_URL;
    delete process.env.DATABASE_URL_READONLY;
    resetConfigForTests();
    db.probeDataset.mockReset();
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("reports ok with dataset facts and no secrets", async () => {
    db.probeDataset.mockResolvedValue({ rowCount: 9969, hasTypedDateColumns: true, databaseName: "neondb" });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    const text = await res.text();
    expect(text).not.toMatch(/hunter2|ep-secret-host|owner/);
    const body = JSON.parse(text);
    expect(body).toMatchObject({
      status: "ok",
      checks: { config: { ok: true, readOnlyRole: false }, database: { ok: true }, schema: { ok: true } },
      dataset: { rows: 9969, database: "neondb" },
      model: MODEL_ID,
    });
    expect(typeof body.checks.database.latencyMs).toBe("number");
  });

  it("reports degraded (still 200) when the typed date columns are missing", async () => {
    db.probeDataset.mockResolvedValue({ rowCount: 9969, hasTypedDateColumns: false, databaseName: "neondb" });
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.checks.schema).toEqual({ ok: false, hint: "Run `npm run db:migrate`." });
  });

  it("reports whether a read-only role is configured", async () => {
    process.env.DATABASE_URL_READONLY = "postgresql://reader:pw@ep-x.neon.tech/neondb";
    resetConfigForTests();
    db.probeDataset.mockResolvedValue({ rowCount: 1, hasTypedDateColumns: true });
    expect((await (await get()).json()).checks.config.readOnlyRole).toBe(true);
  });

  it("returns 503 naming the missing variables, without probing the database", async () => {
    delete process.env.DATABASE_URL;
    resetConfigForTests();
    const res = await get();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.checks.config).toEqual({ ok: false, missing: ["DATABASE_URL"], invalid: [] });
    expect(db.probeDataset).not.toHaveBeenCalled();
  });

  it("returns 503 with only an error code when the database is unreachable", async () => {
    db.probeDataset.mockRejectedValue(
      Object.assign(new Error(`connect ECONNREFUSED ${SECRET_URL}`), { code: "08006" }),
    );
    const res = await get();
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toMatch(/hunter2|ep-secret-host|ECONNREFUSED/);
    expect(JSON.parse(text)).toMatchObject({ status: "error", checks: { database: { ok: false, error: "db_unavailable" } } });
  });

  it("flags a missing table or columns as a schema problem", async () => {
    db.probeDataset.mockRejectedValue(Object.assign(new Error('relation "walmart" does not exist'), { code: "42P01" }));
    const res = await get();
    expect(res.status).toBe(503);
    expect((await res.json()).checks.database.error).toBe("schema_out_of_date");
  });
});
