import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let chatLimiter: Ratelimit | null | undefined;

function duration(value: string | undefined): `${number} ${"s" | "m" | "h" | "d"}` {
  const match = value?.trim().match(/^(\d+)\s*\/\s*(\d+)\s*(s|m|h|d)?$/i);
  if (!match) return "1 m";
  return `${Number(match[2])} ${(match[3] ?? "m").toLowerCase()}` as `${number} ${"s" | "m" | "h" | "d"}`;
}

function requestsPerWindow(value: string | undefined): number {
  const match = value?.trim().match(/^(\d+)\s*\//);
  const parsed = match ? Number(match[1]) : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 10;
}

function getChatLimiter(): Ratelimit | null {
  if (chatLimiter !== undefined) return chatLimiter;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    chatLimiter = null;
    return chatLimiter;
  }

  const setting = process.env.RATE_LIMIT_CHAT;
  chatLimiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(
      requestsPerWindow(setting),
      duration(setting),
    ),
    prefix: "walmart-ai:chat",
    analytics: true,
  });
  return chatLimiter;
}

export type RateLimitResult = {
  success: boolean;
  limit?: number;
  remaining?: number;
  reset?: number;
};

/** Rate limit durable eve tool calls, not only Next route handlers. */
export async function checkChatRateLimit(identifier: string): Promise<RateLimitResult> {
  const limiter = getChatLimiter();
  if (!limiter) return { success: true };
  const result = await limiter.limit(identifier);
  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}

export function resetRateLimitForTests(): void {
  chatLimiter = undefined;
}

