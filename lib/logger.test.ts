import { afterEach, describe, expect, it } from "vitest";
import { createLogger, redact, serializeError, type LogRecord } from "@/lib/logger";

function capture() {
  const records: LogRecord[] = [];
  const lines: string[] = [];
  const log = createLogger({ app: "test" }, (_level, line, record) => {
    lines.push(line);
    records.push(record);
  });
  return { log, records, lines };
}

describe("createLogger", () => {
  const saved = process.env.LOG_LEVEL;
  afterEach(() => {
    if (saved === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = saved;
  });

  it("writes one JSON object per line with time, level, msg and bindings", () => {
    const { log, lines } = capture();
    log.info("hello", { n: 1 });
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toMatchObject({ level: "info", msg: "hello", app: "test", n: 1 });
    expect(new Date(parsed.time).toString()).not.toBe("Invalid Date");
    expect(lines[0]).not.toContain("\n");
  });

  it("child loggers add bindings without mutating the parent", () => {
    const { log, records } = capture();
    log.child({ requestId: "abc" }).info("a");
    log.info("b");
    expect(records[0].requestId).toBe("abc");
    expect(records[1].requestId).toBeUndefined();
  });

  it("filters by LOG_LEVEL", () => {
    process.env.LOG_LEVEL = "warn";
    const { log, records } = capture();
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(records.map((r) => r.msg)).toEqual(["w", "e"]);
    process.env.LOG_LEVEL = "nonsense";
    const again = capture();
    again.log.debug("d");
    again.log.info("i");
    expect(again.records.map((r) => r.msg)).toEqual(["i"]);
  });

  it("serializes errors and redacts connection strings", () => {
    const { log, records } = capture();
    log.error("failed", { err: new Error("could not connect to postgresql://u:pw123@host.neon.tech/db") });
    const err = records[0].err as { message: string; name: string };
    expect(err.name).toBe("Error");
    expect(err.message).toBe("could not connect to postgres://[redacted]");
    expect(JSON.stringify(records[0])).not.toContain("pw123");
  });

  it("survives unserializable fields", () => {
    const { log, lines } = capture();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    log.info("cyc", { cyclic });
    expect(JSON.parse(lines[0]).note).toMatch(/unserializable/);
  });
});

describe("redact / serializeError", () => {
  it("redacts postgres URLs and credential-looking pairs", () => {
    expect(redact("x postgres://a:b@c/d y")).toBe("x postgres://[redacted] y");
    expect(redact("password=hunter2 token: abc123")).toBe("password=[redacted] token: [redacted]");
  });

  it("includes error code, cause and a bounded stack", () => {
    const inner = Object.assign(new Error("inner"), { code: "57014" });
    const outer = new Error("outer", { cause: inner });
    const s = serializeError(outer) as { cause: { code: string }; stack: string };
    expect(s.cause.code).toBe("57014");
    expect(s.stack.split("\n").length).toBeLessThanOrEqual(8);
    expect(serializeError("plain")).toEqual({ message: "plain" });
  });
});
