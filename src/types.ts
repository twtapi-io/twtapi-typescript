/**
 * Shared types used by the SDK surface.
 *
 * Response payloads are typed as `Record<string, unknown>` (with documented
 * field names in JSDoc) rather than as strict interfaces — the public spec
 * has documented divergences from the live server, and locking a brittle
 * interface in place would hurt callers more than it would help. Treat the
 * dictionary as a passthrough of the API JSON, narrow when needed.
 *
 * NOTE on identifiers: every numeric ID (`user_id`, `tweet_id`,
 * `community_id`, `media_id`) is returned as a *string* to avoid JS
 * precision loss on 64-bit IDs. The SDK accepts them as `string` too —
 * never coerce to `number`.
 */

import type { CookieInit, Ct0RotatedCallback } from "./cookies.js";

/** Generic JSON response payload returned by every endpoint. */
export type JsonObject = Record<string, unknown>;

/** Minimal structured logger interface. Off by default. */
export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
}

/** Construction options for the `TwtAPI` client. */
export interface TwtAPIOptions {
  /** Your twtapi.io key. Get one at https://twtapi.io/dashboard. */
  apiKey: string;
  /** Override the API host. Defaults to `https://api.twtapi.io`. */
  baseUrl?: string;
  /** Sent verbatim as `X-Proxy: protocol://user:pass@host:port`. */
  proxy?: string;
  /** Per-request deadline in milliseconds. Defaults to 30_000. */
  timeout?: number;
  /** Retry budget. Defaults to 2. Pass 0 to disable. */
  retries?: number;
  /** Optional engagement cookie: 𝕏 `auth_token`. */
  authToken?: string;
  /** Optional engagement cookie: 𝕏 `ct0`. Auto-rotates. */
  ct0?: string;
  /** Fired whenever `X-Twitter-New-Ct0` rotates the held `ct0`. */
  onCt0Rotated?: Ct0RotatedCallback;
  /** Optional structured logger. */
  logger?: Logger;
}

/** Common pagination options for `*_iter` methods. */
export interface PaginationOptions {
  /** Page size. Default 20, max 200. */
  count?: number;
  /** Maximum number of pages to walk. */
  maxPages?: number;
  /** Maximum number of items to yield. */
  maxItems?: number;
}

export type { CookieInit, Ct0RotatedCallback };
