/**
 * Next.js 16 Proxy (formerly middleware) — rate-limits and body-size-guards
 * the eve chat channel at the platform edge.
 *
 * Runs before every matched request. In-process state is shared within one
 * Fluid Compute instance, so limits apply per warm instance. For strict
 * multi-instance enforcement, back the limiter with a shared store.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { chatLimiter } from "@/lib/rate-limit";

/** Maximum allowed Content-Length for a chat POST body (bytes). */
const MAX_CHAT_BODY_BYTES = 8_192; // 8 KB — comfortably above any real message

function getIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function json(body: object, status: number, extra?: HeadersInit): NextResponse {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

export function proxy(request: NextRequest): NextResponse {
  // Only gate session POST requests (creates + follow-ups).
  if (request.method !== "POST") return NextResponse.next();

  // Reject suspiciously large bodies before the route handler reads them.
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const bytes = parseInt(contentLength, 10);
    if (Number.isFinite(bytes) && bytes > MAX_CHAT_BODY_BYTES) {
      return json(
        { ok: false, error: `Request body too large (max ${MAX_CHAT_BODY_BYTES} bytes).` },
        413,
      );
    }
  }

  // Per-IP rate limit.
  const ip = getIp(request);
  const result = chatLimiter.check(ip);
  if (!result.allowed) {
    const retryAfter = String(Math.ceil(result.retryAfterMs / 1_000));
    return json(
      { ok: false, error: "Too many requests. Please wait before sending another message." },
      429,
      { "Retry-After": retryAfter },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/eve/v1/session", "/eve/v1/session/:sessionId+"],
};
