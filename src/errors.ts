/**
 * Typed exception hierarchy for the twtapi SDK.
 *
 * Every error from the API surfaces as a `TwtAPIError` subclass carrying the
 * HTTP status, the server's `error` code, the human `message`, and the raw
 * response body. Specific subclasses are raised for each documented status:
 *
 *     400 BadRequestError      402 BillingError         403 PermissionError
 *     401 AuthenticationError                           404 NotFoundError
 *     408 RequestTimeoutError  422 ValidationError      429 RateLimitError
 *     500 InternalError        502 UpstreamError        503 ServiceUnavailableError
 *
 * Catch `TwtAPIError` to handle anything from this SDK; catch a subclass to
 * react to a specific failure mode.
 */

export type RateLimitScope = "plan" | "account";

export interface TwtAPIErrorOptions {
  status?: number;
  error?: string;
  body?: unknown;
}

export class TwtAPIError extends Error {
  readonly status: number | undefined;
  readonly error: string | undefined;
  readonly body: unknown;

  constructor(message: string, options: TwtAPIErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.status = options.status;
    this.error = options.error;
    this.body = options.body;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 400 — your request was malformed (missing param, wrong type, bad JSON). */
export class BadRequestError extends TwtAPIError {}

/** 401 — `X-API-Key` is missing or invalid. */
export class AuthenticationError extends TwtAPIError {}

/** 402 — your plan does not cover this endpoint, or billing is past due. */
export class BillingError extends TwtAPIError {}

/** 403 — `engagement_cookies_required`, `account_not_activated`, etc. */
export class PermissionError extends TwtAPIError {}

/** 404 — the target resource does not exist or is not visible. */
export class NotFoundError extends TwtAPIError {}

/** 408 — the upstream did not respond in time. Safe to retry. */
export class RequestTimeoutError extends TwtAPIError {}

/** 422 — the upstream rejected the request as semantically invalid. */
export class ValidationError extends TwtAPIError {}

/** 422 with `duplicate_tweet` or `tweet_silently_dropped_likely_duplicate`. */
export class DuplicateTweetError extends ValidationError {}

/** 422 with `tweet_too_long`. */
export class TweetTooLongError extends ValidationError {}

export interface RateLimitErrorOptions extends TwtAPIErrorOptions {
  retryAfter?: number;
  scope?: RateLimitScope;
}

/** 429 — rate-limited. Inspect `retryAfter` (seconds) and `scope` (`plan` / `account`). */
export class RateLimitError extends TwtAPIError {
  readonly retryAfter: number | undefined;
  readonly scope: RateLimitScope | undefined;

  constructor(message: string, options: RateLimitErrorOptions = {}) {
    super(message, options);
    this.retryAfter = options.retryAfter;
    this.scope = options.scope;
  }
}

/** 500 — unexpected server-side failure. Safe to retry with backoff. */
export class InternalError extends TwtAPIError {}

/** 502 — upstream gateway error. Safe to retry with backoff. */
export class UpstreamError extends TwtAPIError {}

/** 503 — planned or unplanned outage. */
export class ServiceUnavailableError extends TwtAPIError {}

/** Connectivity failure (DNS, TCP, TLS, read timeout, AbortError). */
export class NetworkError extends TwtAPIError {}

const REASON_TO_CLASS: Record<
  string,
  new (
    message: string,
    options?: TwtAPIErrorOptions,
  ) => TwtAPIError
> = {
  duplicate_tweet: DuplicateTweetError,
  tweet_silently_dropped_likely_duplicate: DuplicateTweetError,
  tweet_too_long: TweetTooLongError,
};

const STATUS_TO_CLASS: Record<
  number,
  new (
    message: string,
    options?: TwtAPIErrorOptions,
  ) => TwtAPIError
> = {
  400: BadRequestError,
  401: AuthenticationError,
  402: BillingError,
  403: PermissionError,
  404: NotFoundError,
  408: RequestTimeoutError,
  500: InternalError,
  502: UpstreamError,
  503: ServiceUnavailableError,
};

function coerceNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Build the right exception subclass from an HTTP status + parsed JSON body.
 *
 * The server returns `{"error": "<reason>", "message": "<text>", ...}` on
 * failure. We map status → class, then refine 422s by `error` reason.
 * `retryAfterHeader` is the parsed `Retry-After` HTTP header, used as a
 * fallback when the JSON body omits `retry_after`.
 */
export function fromResponse(args: {
  status: number;
  body: unknown;
  retryAfterHeader?: number;
}): TwtAPIError {
  const { status, retryAfterHeader } = args;
  const body = isPlainObject(args.body) ? args.body : {};
  const reason = typeof body["error"] === "string" ? (body["error"] as string) : undefined;
  const rawMessage = body["message"];
  const message =
    typeof rawMessage === "string" && rawMessage.length > 0
      ? rawMessage
      : reason
        ? `HTTP ${status}: ${reason}`
        : `HTTP ${status}`;

  if (status === 429) {
    const retryAfter = coerceNumber(body["retry_after"]) ?? retryAfterHeader;
    const rawScope = body["scope"];
    const scope: RateLimitScope | undefined =
      rawScope === "plan" || rawScope === "account" ? rawScope : undefined;
    return new RateLimitError(message, {
      status,
      error: reason,
      body,
      retryAfter,
      scope,
    });
  }

  if (status === 422) {
    const Cls = reason ? (REASON_TO_CLASS[reason] ?? ValidationError) : ValidationError;
    return new Cls(message, { status, error: reason, body });
  }

  const Cls = STATUS_TO_CLASS[status] ?? TwtAPIError;
  return new Cls(message, { status, error: reason, body });
}
