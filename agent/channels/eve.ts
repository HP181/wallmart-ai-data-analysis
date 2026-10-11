import { eveChannel } from "eve/channels/eve";
import { none } from "eve/channels/auth";
import { chatLimiter, getClientIp } from "@/lib/rate-limit";

/**
 * Rate-limit auth fn. Runs inside routeAuth before every eve session request
 * (session create, follow-up, cancel, etc.). When the IP is over limit, throws
 * an object with a `response` property — routeAuth catches it and returns the
 * response directly, short-circuiting the route handler.
 *
 * Returning null passes control to the next auth fn (none() for anonymous traffic).
 */
const rateLimitFn = async (request: Request): Promise<null> => {
  const ip = getClientIp(request.headers);
  const result = await chatLimiter.check(ip);
  if (!result.allowed) {
    throw {
      response: Response.json(
        { ok: false, error: "Too many requests. Please wait before sending another message." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(result.retryAfterMs / 1_000)),
            "Cache-Control": "no-store",
          },
        },
      ),
    };
  }
  return null;
};

// Public demo: accept anonymous browser traffic.
// Replace none() with a real AuthFn before handling private/production data.
export default eveChannel({
  auth: [rateLimitFn, none()],
});
