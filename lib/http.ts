import { randomUUID } from "node:crypto";
import { errorBody, toAppError } from "@/lib/errors";
import { createLogger, logger, type Logger } from "@/lib/logger";

export const REQUEST_ID_HEADER = "x-request-id";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Reuse a caller-supplied request id when it is well formed (so ids can be
 * traced across a proxy), otherwise mint one. The format check also stops
 * log injection through a crafted header.
 */
export function resolveRequestId(headers: Headers): string {
  const supplied = headers.get(REQUEST_ID_HEADER);
  return supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();
}

export type RouteContext = {
  requestId: string;
  log: Logger;
};

export type RouteHandler = (request: Request, ctx: RouteContext) => Promise<Response>;

function withRequestId(res: Response, requestId: string): Response {
  const headers = new Headers(res.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  // Pass the body through untouched so streaming responses keep streaming.
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

/**
 * Wrap a route handler with request ids, access logging and sanitized errors.
 * Handlers can throw freely: AppErrors keep their (safe) message, anything
 * else is logged in full and returned as a generic 500.
 */
export function withRoute(name: string, handler: RouteHandler, baseLogger: Logger = logger) {
  return async function route(request: Request): Promise<Response> {
    const requestId = resolveRequestId(request.headers);
    const url = new URL(request.url);
    const log = baseLogger.child({ requestId, route: name });
    const started = performance.now();

    let response: Response;
    try {
      response = await handler(request, { requestId, log });
    } catch (err) {
      const appError = toAppError(err);
      log[appError.status >= 500 ? "error" : "warn"]("request failed", {
        err: appError.cause ?? appError,
        code: appError.code,
      });
      response = jsonResponse(errorBody(appError, requestId), { status: appError.status });
    }

    log.info("request", {
      method: request.method,
      path: url.pathname,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
    });
    return withRequestId(response, requestId);
  };
}

/** A logger for non-request work (agent tool calls, startup). */
export function taskLogger(bindings: Record<string, unknown>): Logger {
  return createLogger({ app: "walmart-ai-analyst", ...bindings });
}
