/**
 * In-process token-bucket rate limiter.
 *
 * Each process instance (Fluid Compute function, local dev server) enforces its
 * own limits. On Vercel Fluid Compute the same Node.js instance handles many
 * concurrent requests, so this is effective for burst prevention. For strict
 * cross-instance enforcement, add a shared store such as Vercel KV / Redis.
 *
 * Rate is configurable via env vars (integers, defaults below). Invalid values
 * fall back to the defaults so misconfiguration never breaks the application.
 */

type Bucket = { tokens: number; lastRefill: number };

export type RateLimitConfig = {
  /** Maximum requests allowed per window. */
  limit: number;
  /** Window size in milliseconds. */
  windowMs: number;
};

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly limit: number;
  private readonly refillRate: number; // tokens per ms

  constructor({ limit, windowMs }: RateLimitConfig) {
    this.limit = limit;
    this.refillRate = limit / windowMs;
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      // First request from this key: consume one token immediately.
      bucket = { tokens: this.limit - 1, lastRefill: now };
      this.buckets.set(key, bucket);
      return { allowed: true };
    }

    // Refill tokens proportionally to elapsed time.
    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(this.limit, bucket.tokens + elapsed * this.refillRate);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true };
    }

    const retryAfterMs = Math.ceil((1 - bucket.tokens) / this.refillRate);
    return { allowed: false, retryAfterMs };
  }

  /** Remove fully-refilled buckets so the Map cannot grow without bound. */
  prune(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      const refilled = bucket.tokens + (now - bucket.lastRefill) * this.refillRate;
      if (refilled >= this.limit) this.buckets.delete(key);
    }
  }
}

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

const WINDOW_MS = 60_000; // 1 minute

/**
 * Export rate limiter: 5 exports per IP per minute by default.
 * CSV exports can be expensive; keep this conservative.
 * Override with RATE_LIMIT_EXPORT env var (positive integer).
 */
export const exportLimiter = new RateLimiter({
  limit: parseEnvInt("RATE_LIMIT_EXPORT", 5),
  windowMs: WINDOW_MS,
});

/**
 * Chat rate limiter: 20 messages per IP per minute by default.
 * Override with RATE_LIMIT_CHAT env var (positive integer).
 */
export const chatLimiter = new RateLimiter({
  limit: parseEnvInt("RATE_LIMIT_CHAT", 20),
  windowMs: WINDOW_MS,
});
