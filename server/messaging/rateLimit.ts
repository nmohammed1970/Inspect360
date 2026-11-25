type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Sliding fixed-window limiter. Returns true if allowed. */
export function takeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

export const MESSAGING_SEND_LIMIT = 30;
export const MESSAGING_SEND_WINDOW_MS = 60_000;
export const MESSAGING_UPLOAD_LIMIT = 40;
export const MESSAGING_UPLOAD_WINDOW_MS = 60_000;
