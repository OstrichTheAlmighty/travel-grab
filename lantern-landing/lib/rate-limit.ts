// TODO: swap the in-memory store for Upstash Redis (or Vercel KV) in production.
// The current Map is per-serverless-instance and resets on cold start, which means
// limits are not enforced across concurrent instances. Upstash example:
//   import { Ratelimit } from "@upstash/ratelimit";
//   import { Redis }     from "@upstash/redis";
//   const ratelimit = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.fixedWindow(max, `${windowSec}s`) });

export interface RateLimitConfig {
  windowMs: number; // sliding-window duration in ms
  max: number;      // max requests per window per IP
}

export interface RateLimitResult {
  allowed:   boolean;
  remaining: number;
  resetAt:   number; // epoch ms when window resets
}

interface Entry {
  count:       number;
  windowStart: number;
}

export function createRateLimiter(config: RateLimitConfig) {
  const store = new Map<string, Entry>();

  // Periodically evict expired entries so the Map does not grow without bound.
  // This runs lazily on each check() call once the store exceeds 2000 entries.
  function evictExpired() {
    if (store.size < 2000) return;
    const cutoff = Date.now() - config.windowMs;
    for (const [ip, entry] of store) {
      if (entry.windowStart < cutoff) store.delete(ip);
    }
  }

  return function check(ip: string): RateLimitResult {
    evictExpired();

    const now   = Date.now();
    const entry = store.get(ip);

    // First request, or previous window has expired → start a fresh window
    if (!entry || now - entry.windowStart >= config.windowMs) {
      store.set(ip, { count: 1, windowStart: now });
      return { allowed: true, remaining: config.max - 1, resetAt: now + config.windowMs };
    }

    if (entry.count >= config.max) {
      return {
        allowed:   false,
        remaining: 0,
        resetAt:   entry.windowStart + config.windowMs,
      };
    }

    entry.count++;
    return {
      allowed:   true,
      remaining: config.max - entry.count,
      resetAt:   entry.windowStart + config.windowMs,
    };
  };
}

// ── IP extraction ─────────────────────────────────────────────────────────────

export function getClientIP(req: Request): string {
  const fwd  = (req.headers as Headers).get("x-forwarded-for");
  const real = (req.headers as Headers).get("x-real-ip");
  return fwd?.split(",")[0]?.trim() ?? real ?? "127.0.0.1";
}

// ── Standard 429 response ─────────────────────────────────────────────────────

export function rateLimitedResponse(resetAt: number): Response {
  return new Response(
    JSON.stringify({ error: "rate_limited", retryAfter: Math.ceil((resetAt - Date.now()) / 1000) }),
    {
      status:  429,
      headers: {
        "Content-Type":  "application/json",
        "Retry-After":   String(Math.ceil((resetAt - Date.now()) / 1000)),
        "X-RateLimit-Reset": String(Math.floor(resetAt / 1000)),
      },
    },
  );
}
