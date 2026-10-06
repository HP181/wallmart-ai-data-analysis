import { afterEach, describe, expect, it } from "vitest";
import {
  ConfigError,
  checkConfig,
  databaseNameFromUrl,
  getConfig,
  loadConfig,
  resetConfigForTests,
} from "@/lib/config";

const URL_OK = "postgresql://user:s3cret@ep-example.neon.tech/neondb?sslmode=require";

describe("loadConfig", () => {
  it("applies defaults", () => {
    const c = loadConfig({ DATABASE_URL: URL_OK });
    expect(c).toEqual({
      databaseUrl: URL_OK,
      usingReadOnlyRole: false,
      queryTimeoutMs: 8000,
      maxQueryRows: 500,
      exportBatchSize: 1000,
      exportMaxRows: 250000,
    });
  });

  it("prefers the read-only URL when provided", () => {
    const ro = "postgresql://ro:pw@ep-example.neon.tech/neondb";
    const c = loadConfig({ DATABASE_URL: URL_OK, DATABASE_URL_READONLY: ro });
    expect(c.databaseUrl).toBe(ro);
    expect(c.usingReadOnlyRole).toBe(true);
  });

  it("treats blank optional values as unset", () => {
    const c = loadConfig({ DATABASE_URL: URL_OK, DATABASE_URL_READONLY: "  ", MAX_QUERY_ROWS: "" });
    expect(c.usingReadOnlyRole).toBe(false);
    expect(c.maxQueryRows).toBe(500);
  });

  it("parses numeric overrides", () => {
    const c = loadConfig({ DATABASE_URL: URL_OK, DB_QUERY_TIMEOUT_MS: "2500", MAX_QUERY_ROWS: "100" });
    expect(c.queryTimeoutMs).toBe(2500);
    expect(c.maxQueryRows).toBe(100);
  });

  it("names a missing DATABASE_URL", () => {
    expect.assertions(3);
    try {
      loadConfig({});
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).missing).toEqual(["DATABASE_URL"]);
      expect((err as ConfigError).message).toContain("DATABASE_URL");
    }
  });

  it("flags invalid values by name and never echoes them", () => {
    expect.assertions(4);
    try {
      loadConfig({ DATABASE_URL: "mysql://u:topsecret@host/db", MAX_QUERY_ROWS: "banana", DB_QUERY_TIMEOUT_MS: "5" });
    } catch (err) {
      const e = err as ConfigError;
      expect(e.invalid.sort()).toEqual(["DATABASE_URL", "DB_QUERY_TIMEOUT_MS", "MAX_QUERY_ROWS"]);
      expect(e.missing).toEqual([]);
      expect(e.message).not.toContain("topsecret");
      expect(e.message).not.toContain("banana");
    }
  });
});

describe("checkConfig", () => {
  it("reports status without throwing or leaking values", () => {
    expect(checkConfig({ DATABASE_URL: URL_OK })).toEqual({ ok: true, missing: [], invalid: [] });
    expect(checkConfig({})).toEqual({ ok: false, missing: ["DATABASE_URL"], invalid: [] });
    const bad = checkConfig({ DATABASE_URL: "nonsense-value" });
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).not.toContain("nonsense-value");
  });
});

describe("getConfig", () => {
  const saved = process.env.DATABASE_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
    resetConfigForTests();
  });

  it("throws a ConfigError lazily instead of at import time", () => {
    delete process.env.DATABASE_URL;
    resetConfigForTests();
    expect(() => getConfig()).toThrow(ConfigError);
  });

  it("caches a valid config", () => {
    process.env.DATABASE_URL = URL_OK;
    resetConfigForTests();
    expect(getConfig()).toBe(getConfig());
  });
});

describe("databaseNameFromUrl", () => {
  it("returns only the database name", () => {
    expect(databaseNameFromUrl(URL_OK)).toBe("neondb");
    expect(databaseNameFromUrl("postgres://u:p@h/")).toBeUndefined();
    expect(databaseNameFromUrl("not a url")).toBeUndefined();
    expect(databaseNameFromUrl(undefined)).toBeUndefined();
  });
});
