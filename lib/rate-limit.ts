/**
 * Rate limiters backed by Upstash Redis for cross-instance enforcement on
 * Vercel Fluid Compute.
 *
 * Setup:
 *   1. Add Upstash Redis from the Vercel Marketplace.
 *   2. Run `vercel env pull` to sync UPSTASH_REDIS_REST_URL and
 *      UPSTASH_REDIS_REST_TOKEN to your local .env.local.
 *
 * Rate is configurable via env vars (positive integers). Invalid values fall
 * back to the defaults so misconfiguration never breaks the application.
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

/** Extract the originating client IP from standard proxy headers. */
export function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function makeLimiter(limit: number, prefix: string) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  const rl = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, "1 m"),
    prefix,
  });
  return {
    async check(key: string): Promise<RateLimitResult> {
      const result = await rl.limit(key);
      if (result.success) return { allowed: true };
      return { allowed: false, retryAfterMs: Math.max(0, result.reset - Date.now()) };
    },
  };
}

/**
 * Export rate limiter: 5 exports per IP per minute by default.
 * Override with RATE_LIMIT_EXPORT env var (positive integer).
 */
export const exportLimiter = makeLimiter(parseEnvInt("RATE_LIMIT_EXPORT", 5), "rl:export");

/**
 * Chat rate limiter: 20 messages per IP per minute by default.
 * Override with RATE_LIMIT_CHAT env var (positive integer).
 */
export const chatLimiter = makeLimiter(parseEnvInt("RATE_LIMIT_CHAT", 20), "rl:chat");
