import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { REQUEST_ID_HEADER, jsonResponse, resolveRequestId, withRoute } from "@/lib/http";
import { createLogger, type LogRecord } from "@/lib/logger";

function harness() {
  const records: LogRecord[] = [];
  const log = createLogger({ app: "test" }, (_l, _line, record) => records.push(record));
  return { log, records };
}
const req = (headers: Record<string, string> = {}, url = "http://localhost/api/x?secret=1") =>
  new Request(url, { headers });

describe("resolveRequestId", () => {
  it("reuses a well-formed id", () => {
    expect(resolveRequestId(new Headers({ [REQUEST_ID_HEADER]: "trace-abc_123.XYZ" }))).toBe("trace-abc_123.XYZ");
  });

  it("replaces missing, short or malicious ids", () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(resolveRequestId(new Headers())).toMatch(uuid);
    expect(resolveRequestId(new Headers({ [REQUEST_ID_HEADER]: "short" }))).toMatch(uuid);
    // (Headers itself rejects newlines; quotes and braces could still forge JSON in a log line.)
    expect(resolveRequestId(new Headers({ [REQUEST_ID_HEADER]: 'abcdefgh"}{"level":"error","msg":"forged' }))).toMatch(uuid);
    expect(resolveRequestId(new Headers({ [REQUEST_ID_HEADER]: "has spaces in it 123" }))).toMatch(uuid);
    expect(resolveRequestId(new Headers({ [REQUEST_ID_HEADER]: "x".repeat(65) }))).toMatch(uuid);
  });
});

describe("withRoute", () => {
  it("adds the request id to the response and logs one access line", async () => {
    const { log, records } = harness();
    const route = withRoute("t.ok", async () => jsonResponse({ ok: true }), log);
    const res = await route(req({ [REQUEST_ID_HEADER]: "req-12345678" }));
    expect(res.status).toBe(200);
    expect(res.headers.get(REQUEST_ID_HEADER)).toBe("req-12345678");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true });

    const access = records.filter((r) => r.msg === "request");
    expect(access).toHaveLength(1);
    expect(access[0]).toMatchObject({ requestId: "req-12345678", route: "t.ok", method: "GET", path: "/api/x", status: 200 });
    expect(typeof access[0].durationMs).toBe("number");
    // The query string can contain user input, so only the path is logged.
    expect(JSON.stringify(records)).not.toContain("secret=1");
  });

  it("passes the request id and a bound logger to the handler", async () => {
    const { log, records } = harness();
    const route = withRoute(
      "t.ctx",
      async (_r, ctx) => {
        ctx.log.info("inside");
        return jsonResponse({ id: ctx.requestId });
      },
      log,
    );
    const res = await route(req());
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(res.headers.get(REQUEST_ID_HEADER));
    expect(records.find((r) => r.msg === "inside")).toMatchObject({ requestId: body.id, route: "t.ctx" });
  });

  it("turns an AppError into its status and a safe JSON body, logged at warn for 4xx", async () => {
    const { log, records } = harness();
    const route = withRoute("t.400", async () => { throw new AppError("invalid_request", "bad input"); }, log);
    const res = await route(req());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string; requestId: string } };
    expect(body.error).toEqual({ code: "invalid_request", message: "bad input", requestId: res.headers.get(REQUEST_ID_HEADER) });
    expect(records.find((r) => r.msg === "request failed")?.level).toBe("warn");
  });

  it("returns a generic 500 for unknown errors and logs the details server-side only", async () => {
    const { log, records } = harness();
    const route = withRoute(
      "t.500",
      async () => { throw new Error("boom postgresql://user:hunter2@secret-host/db"); },
      log,
    );
    const res = await route(req());
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toMatch(/hunter2|secret-host|boom/);
    expect(JSON.parse(text).error.code).toBe("internal_error");

    const failure = records.find((r) => r.msg === "request failed")!;
    expect(failure.level).toBe("error");
    expect(failure.requestId).toBe(res.headers.get(REQUEST_ID_HEADER));
    expect(JSON.stringify(failure)).toContain("boom"); // details are kept for operators
    expect(JSON.stringify(failure)).not.toContain("hunter2"); // but credentials never are
    expect(records.find((r) => r.msg === "request")).toMatchObject({ status: 500 });
  });

  it("keeps streaming bodies streaming", async () => {
    const { log } = harness();
    const route = withRoute(
      "t.stream",
      async () => {
        const stream = new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode("a,b\r\n"));
            c.enqueue(new TextEncoder().encode("1,2\r\n"));
            c.close();
          },
        });
        return new Response(stream, { headers: { "content-type": "text/csv" } });
      },
      log,
    );
    const res = await route(req());
    expect(res.headers.get("content-type")).toBe("text/csv");
    expect(res.headers.get(REQUEST_ID_HEADER)).toBeTruthy();
    expect(await res.text()).toBe("a,b\r\n1,2\r\n");
  });
});
