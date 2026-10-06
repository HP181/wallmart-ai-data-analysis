import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "@/lib/config";

const db = vi.hoisted(() => ({ runReadQueries: vi.fn(), runReadQuery: vi.fn(), probeDataset: vi.fn() }));
vi.mock("@/lib/db", () => db);

import { GET } from "@/app/api/data/route";

const get = (qs = "") => GET(new Request(`http://localhost/api/data${qs}`));

describe("GET /api/data", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://u:hunter2@ep-secret-host.neon.tech/neondb";
    resetConfigForTests();
    db.runReadQueries.mockReset();
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("returns one page with the total from a single batched round trip", async () => {
    db.runReadQueries.mockResolvedValue([[{ invoice_id: 11 }, { invoice_id: 12 }], [{ total: 9969 }]]);
    const res = await get("?page=2&pageSize=10&sort=total&dir=desc&category=Cash");

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      rows: [{ invoice_id: 11 }, { invoice_id: 12 }],
      page: 2,
      pageSize: 10,
      total: 9969,
      totalPages: 997,
      sort: "total",
      dir: "desc",
    });

    expect(db.runReadQueries).toHaveBeenCalledTimes(1);
    const [statements] = db.runReadQueries.mock.calls[0];
    expect(statements).toHaveLength(2);
    expect(statements[0].params).toEqual(["Cash", 10, 10]); // category, limit, offset
    expect(statements[1].text).toMatch(/^SELECT COUNT\(\*\)/);
  });

  it("rejects bad input before touching the database", async () => {
    for (const qs of ["?sort=password", "?pageSize=100000", "?page=-1", "?year=abc", "?date_from=nope", "?dir=up"]) {
      const res = await get(qs);
      expect(res.status, qs).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("invalid_request");
      expect(body.error.requestId).toBe(res.headers.get("x-request-id"));
    }
    expect(db.runReadQueries).not.toHaveBeenCalled();
  });

  it("returns sanitized errors for database failures", async () => {
    db.runReadQueries.mockRejectedValue(
      Object.assign(new Error("password authentication failed for user u at ep-secret-host (hunter2)"), { code: "28P01" }),
    );
    const res = await get();
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toMatch(/hunter2|ep-secret-host|password authentication/);
    expect(JSON.parse(text).error.code).toBe("db_unavailable");
  });

  it("maps statement timeouts to 504", async () => {
    db.runReadQueries.mockRejectedValue(Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" }));
    const res = await get();
    expect(res.status).toBe(504);
    expect((await res.json()).error.code).toBe("db_timeout");
  });

  it("reports a clear configuration error when DATABASE_URL is missing", async () => {
    // The route never imports the driver at load time; the failure is raised lazily and mapped.
    const { ConfigError } = await import("@/lib/config");
    db.runReadQueries.mockRejectedValue(new ConfigError(["DATABASE_URL"], []));
    const res = await get();
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("config_error");
  });
});
