/**
 * Next.js 16 Proxy (formerly middleware) — body-size guard for the eve chat
 * channel on the local dev server.
 *
 * On Vercel, withEve routes /eve/v1/* directly to the Eve Nitro function at
 * the CDN level, bypassing this proxy entirely. Rate limiting is therefore
 * enforced inside the Eve channel's auth array (agent/channels/eve.ts) so it
 * runs on both Vercel and local dev.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Maximum allowed Content-Length for a chat POST body (bytes). */
const MAX_CHAT_BODY_BYTES = 8_192; // 8 KB — comfortably above any real message

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

  return NextResponse.next();
}

export const config = {
  matcher: ["/eve/v1/session", "/eve/v1/session/:sessionId+"],
};
