import { describe, expect, it } from "vitest";
import { ConfigError } from "@/lib/config";
import { AppError, errorBody, invalidQuery, toAppError } from "@/lib/errors";

const SECRET = "postgresql://user:hunter2@ep-secret-host.neon.tech/neondb";

describe("toAppError", () => {
  it("keeps AppErrors as they are", () => {
    const e = invalidQuery("bad dimension");
    expect(toAppError(e)).toBe(e);
    expect(e.status).toBe(400);
  });

  it("maps statement timeouts", () => {
    const e = toAppError(Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" }));
    expect(e.code).toBe("db_timeout");
    expect(e.status).toBe(504);
  });

  it("maps missing columns/tables to a migration hint", () => {
    for (const code of ["42703", "42P01"]) {
      const e = toAppError(Object.assign(new Error('column "sale_date" does not exist'), { code }));
      expect(e.code).toBe("schema_out_of_date");
      expect(e.message).toContain("npm run db:migrate");
    }
  });

  it("maps auth, privilege and connection failures to db_unavailable", () => {
    for (const code of ["28P01", "28000", "42501", "08006"]) {
      expect(toAppError(Object.assign(new Error("x"), { code })).code).toBe("db_unavailable");
    }
    expect(toAppError(new TypeError("fetch failed")).code).toBe("db_unavailable");
  });

  it("maps ConfigError to config_error", () => {
    const e = toAppError(new ConfigError(["DATABASE_URL"], []));
    expect(e.code).toBe("config_error");
    expect(e.status).toBe(503);
  });

  it("never exposes raw error text for unknown failures", () => {
    const raw = new Error(`connection to ${SECRET} failed: password authentication for hunter2`);
    const e = toAppError(raw);
    expect(e.code).toBe("internal_error");
    expect(e.message).not.toMatch(/hunter2|secret-host|postgres/i);
    expect(e.cause).toBe(raw); // kept for logging only
  });

  it("never leaks driver messages through mapped errors either", () => {
    const e = toAppError(Object.assign(new Error(`password for ${SECRET} rejected`), { code: "28P01" }));
    expect(JSON.stringify(errorBody(e))).not.toMatch(/hunter2|secret-host/);
  });

  it("handles non-Error throwables", () => {
    for (const v of ["boom", 42, null, undefined, { weird: true }]) {
      expect(toAppError(v).code).toBe("internal_error");
    }
  });
});

describe("errorBody", () => {
  it("includes the request id when provided", () => {
    const body = errorBody(new AppError("invalid_request", "nope"), "req-12345678");
    expect(body).toEqual({ error: { code: "invalid_request", message: "nope", requestId: "req-12345678" } });
    expect(errorBody(new AppError("invalid_request", "nope")).error).not.toHaveProperty("requestId");
  });
});
