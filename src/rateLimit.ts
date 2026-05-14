/**
 * Snapshot of the most recently seen rate-limit headers.
 *
 * Per the spec, every successful response carries:
 *     X-RateLimit-Limit       steady-state RPS for the matched bucket
 *     X-RateLimit-Remaining   requests left in the current window
 *     X-RateLimit-Reset       Unix timestamp when the window resets
 *
 * The live server consistently sends only `Remaining` — the SDK tolerates
 * `Limit` and `Reset` being missing.
 *
 * `client.lastRateLimit` returns the last snapshot seen, or `null` until
 * the first successful response.
 */

export interface RateLimit {
  readonly limit: number | null;
  readonly remaining: number | null;
  readonly reset: number | null;
}

function parseInt10(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

export function rateLimitFromHeaders(headers: Headers): RateLimit | null {
  const limit = parseInt10(headers.get("X-RateLimit-Limit"));
  const remaining = parseInt10(headers.get("X-RateLimit-Remaining"));
  const reset = parseInt10(headers.get("X-RateLimit-Reset"));
  if (limit === null && remaining === null && reset === null) return null;
  return { limit, remaining, reset };
}
