import { describe, it, expect, vi } from "vitest";

// Hoist mock refs so they're available when vi.mock factories run.
const { mockLimitFn, MockRatelimit } = vi.hoisted(() => {
  const mockLimitFn = vi.fn();
  const MockRatelimit = vi.fn().mockReturnValue({ limit: mockLimitFn });
  (MockRatelimit as unknown as Record<string, unknown>).slidingWindow = vi
    .fn()
    .mockReturnValue("1m-sliding");
  return { mockLimitFn, MockRatelimit };
});

vi.mock("@upstash/redis", () => ({ Redis: vi.fn().mockReturnValue({}) }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: MockRatelimit }));

import { exportLimiter, chatLimiter, getClientIp } from "@/lib/rate-limit";

describe("rate limiters", () => {
  it("allows the request when Upstash returns success", async () => {
    mockLimitFn.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });
    expect(await exportLimiter.check("1.2.3.4")).toEqual({ allowed: true });
  });

  it("blocks and returns retryAfterMs when Upstash returns failure", async () => {
    const reset = Date.now() + 5_000;
    mockLimitFn.mockResolvedValue({ success: false, reset });
    const result = await exportLimiter.check("1.2.3.4");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(5_000);
    }
  });

  it("uses a separate key namespace for chatLimiter", async () => {
    mockLimitFn.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });
    await chatLimiter.check("10.0.0.1");
    expect(mockLimitFn).toHaveBeenCalledWith("10.0.0.1");
  });

  it("clamps retryAfterMs to 0 when reset is in the past", async () => {
    mockLimitFn.mockResolvedValue({ success: false, reset: Date.now() - 1_000 });
    const result = await exportLimiter.check("1.2.3.4");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.retryAfterMs).toBe(0);
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
