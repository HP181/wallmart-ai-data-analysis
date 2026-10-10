import { describe, it, expect, beforeEach, vi } from "vitest";
import { RateLimiter, getClientIp } from "@/lib/rate-limit";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({ limit: 3, windowMs: 1_000 });
  });

  it("allows requests up to the limit", () => {
    expect(limiter.check("ip1")).toEqual({ allowed: true });
    expect(limiter.check("ip1")).toEqual({ allowed: true });
    expect(limiter.check("ip1")).toEqual({ allowed: true });
  });

  it("blocks the request after the limit is reached", () => {
    limiter.check("ip1");
    limiter.check("ip1");
    limiter.check("ip1");
    const result = limiter.check("ip1");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks different keys independently", () => {
    limiter.check("ip1");
    limiter.check("ip1");
    limiter.check("ip1");
    // ip2 is unaffected
    expect(limiter.check("ip2")).toEqual({ allowed: true });
  });

  it("refills tokens over time", () => {
    vi.useFakeTimers();
    limiter.check("ip1");
    limiter.check("ip1");
    limiter.check("ip1");
    expect(limiter.check("ip1").allowed).toBe(false);

    // Advance 500 ms — should refill ~1.5 tokens → 1 request allowed
    vi.advanceTimersByTime(500);
    expect(limiter.check("ip1").allowed).toBe(true);
    expect(limiter.check("ip1").allowed).toBe(false);

    vi.useRealTimers();
  });

  it("prune removes fully-refilled buckets", () => {
    vi.useFakeTimers();
    limiter.check("ip1");
    vi.advanceTimersByTime(2_000); // enough to fully refill
    limiter.prune();
    // After pruning, the next check starts fresh (allowed)
    expect(limiter.check("ip1")).toEqual({ allowed: true });
    vi.useRealTimers();
  });
});

describe("getClientIp", () => {
  it("prefers x-forwarded-for and takes the first IP", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" });
    expect(getClientIp(h)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const h = new Headers({ "x-real-ip": "5.6.7.8" });
    expect(getClientIp(h)).toBe("5.6.7.8");
  });

  it("returns 'unknown' when no IP header is present", () => {
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});
