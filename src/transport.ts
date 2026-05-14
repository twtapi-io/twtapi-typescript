/**
 * HTTP transport for the twtapi SDK.
 *
 * Owns: header injection (`X-API-Key`, optional engagement cookies, optional
 * `X-Proxy`), JSON encode/decode, error mapping, automatic `ct0` rotation,
 * retry policy, rate-limit tracking, and optional structured logging with
 * secret masking.
 *
 * Everything above this layer calls `transport.request(method, path, ...)`
 * and gets back a parsed JSON object (or throws a `TwtAPIError`).
 */

import { CookieState } from "./cookies.js";
import { NetworkError, type TwtAPIError, fromResponse } from "./errors.js";
import { type RateLimit, rateLimitFromHeaders } from "./rateLimit.js";
import type { JsonObject, Logger } from "./types.js";

export const DEFAULT_BASE_URL = "https://api.twtapi.io";
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_USER_AGENT = "twtapi-typescript/0.1.0";

const NEW_CT0_HEADER = "X-Twitter-New-Ct0";
const RETRY_STATUSES = new Set([408, 429, 500, 502, 503]);
const NON_IDEMPOTENT_PATHS = new Set(["/tweet", "/comment"]);
const RETRY_AFTER_CAP_S = 60;
const BACKOFF_CAP_S = 8;

export interface TransportOptions {
  apiKey: string;
  baseUrl?: string;
  proxy?: string;
  timeout?: number;
  retries?: number;
  cookies?: CookieState;
  logger?: Logger;
  userAgent?: string;
  /** Inject a custom fetch (for tests). Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  params?: Record<string, unknown>;
  json?: unknown;
  sendCookies?: boolean;
  extraHeaders?: Record<string, string>;
}

export class Transport {
  private readonly _apiKey: string;
  private readonly _baseUrl: string;
  private readonly _proxy: string | undefined;
  private readonly _timeout: number;
  private readonly _retries: number;
  private readonly _cookies: CookieState;
  private readonly _logger: Logger | undefined;
  private readonly _userAgent: string;
  private readonly _fetch: typeof fetch;
  private _lastRateLimit: RateLimit | null = null;

  constructor(options: TransportOptions) {
    if (!options.apiKey) {
      throw new Error("apiKey is required");
    }
    this._apiKey = options.apiKey;
    this._baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this._proxy = options.proxy;
    this._timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this._retries = Math.max(0, options.retries ?? 2);
    this._cookies = options.cookies ?? new CookieState();
    this._logger = options.logger;
    this._userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this._fetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  get cookies(): CookieState {
    return this._cookies;
  }

  get baseUrl(): string {
    return this._baseUrl;
  }

  get lastRateLimit(): RateLimit | null {
    return this._lastRateLimit;
  }

  /**
   * Issue one HTTP request and return parsed JSON.
   *
   * `sendCookies: true` attaches the held `auth_token` + `ct0` (required for
   * engagement / community / helper endpoints that act on a specific 𝕏
   * account).
   */
  async request(method: string, path: string, options: RequestOptions = {}): Promise<JsonObject> {
    const url = this._buildUrl(path, options.params);
    const retryable = isRetryable(method, path);
    const hasBody = options.json !== undefined;

    let attempt = 0;
    while (true) {
      attempt += 1;
      const headers = this._buildHeaders({
        sendCookies: options.sendCookies === true,
        extra: options.extraHeaders,
        hasBody,
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this._timeout);
      const t0 = Date.now();

      let response: Response;
      try {
        response = await this._fetch(url, {
          method: method.toUpperCase(),
          headers,
          body: hasBody ? JSON.stringify(options.json) : undefined,
          signal: controller.signal,
          redirect: "manual",
        });
      } catch (err) {
        clearTimeout(timer);
        const reason = describeNetworkError(err);
        this._logFailed(method, path, reason, Date.now() - t0);
        if (attempt > this._retries) {
          throw new NetworkError(reason);
        }
        await sleep(backoffMs(attempt));
        continue;
      } finally {
        clearTimeout(timer);
      }

      this._captureCt0Rotation(response);
      this._captureRateLimit(response);
      this._logCompleted(method, path, response.status, Date.now() - t0);

      const status = response.status;
      if (RETRY_STATUSES.has(status) && retryable && attempt <= this._retries) {
        const waitS = await this._waitForRetry(status, response, attempt);
        await sleep(waitS * 1000);
        continue;
      }

      return await this._handleResponse(response);
    }
  }

  // ------------------------------------------------------------- internals

  private _buildUrl(path: string, params?: Record<string, unknown>): string {
    const base = /^https?:\/\//i.test(path)
      ? path
      : `${this._baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    if (!params) return base;
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      search.append(key, String(value));
    }
    const qs = search.toString();
    return qs.length > 0 ? `${base}${base.includes("?") ? "&" : "?"}${qs}` : base;
  }

  private _buildHeaders(args: {
    sendCookies: boolean;
    extra: Record<string, string> | undefined;
    hasBody: boolean;
  }): Headers {
    const headers = new Headers({
      "X-API-Key": this._apiKey,
      "User-Agent": this._userAgent,
      Accept: "application/json",
    });
    if (args.hasBody) headers.set("Content-Type", "application/json");
    if (this._proxy) headers.set("X-Proxy", this._proxy);
    if (args.sendCookies) {
      const { authToken, ct0 } = this._cookies.snapshot();
      if (authToken) headers.set("X-Twitter-Auth-Token", authToken);
      if (ct0) headers.set("X-Twitter-Ct0", ct0);
    }
    if (args.extra) {
      for (const [k, v] of Object.entries(args.extra)) headers.set(k, v);
    }
    return headers;
  }

  private _captureCt0Rotation(response: Response): void {
    const newCt0 = response.headers.get(NEW_CT0_HEADER);
    if (newCt0) this._cookies.rotateCt0(newCt0);
  }

  private _captureRateLimit(response: Response): void {
    const snapshot = rateLimitFromHeaders(response.headers);
    if (snapshot !== null) this._lastRateLimit = snapshot;
  }

  private async _waitForRetry(
    status: number,
    response: Response,
    attempt: number,
  ): Promise<number> {
    if (status === 429) {
      const body = await peekJson(response);
      const fromBody = coerceNumber(isPlainObject(body) ? body["retry_after"] : undefined);
      const fromHeader = coerceNumber(response.headers.get("Retry-After"));
      const wait = fromBody ?? fromHeader ?? 1;
      return Math.min(wait, RETRY_AFTER_CAP_S);
    }
    return Math.min(0.5 * 2 ** (attempt - 1), BACKOFF_CAP_S);
  }

  private async _handleResponse(response: Response): Promise<JsonObject> {
    const status = response.status;
    const body = await parseJson(response);
    if (status >= 200 && status < 300) {
      return isPlainObject(body) ? body : { data: body };
    }
    const retryAfterHeader = coerceNumber(response.headers.get("Retry-After"));
    throw fromResponse({ status, body, retryAfterHeader }) as TwtAPIError;
  }

  private _logCompleted(method: string, path: string, status: number, durationMs: number): void {
    this._logger?.info("twtapi request", {
      method,
      path,
      status,
      duration_ms: durationMs,
      api_key: mask(this._apiKey),
    });
  }

  private _logFailed(method: string, path: string, reason: string, durationMs: number): void {
    this._logger?.warn("twtapi request failed", {
      method,
      path,
      error: reason,
      duration_ms: durationMs,
      api_key: mask(this._apiKey),
    });
  }
}

// ----------------------------------------------------------------- helpers

function isRetryable(method: string, path: string): boolean {
  if (method.toUpperCase() !== "POST") return true;
  const basePath = (path.split("?", 1)[0] ?? "").startsWith("/")
    ? (path.split("?", 1)[0] as string)
    : `/${path.split("?", 1)[0] ?? ""}`;
  return !NON_IDEMPOTENT_PATHS.has(basePath);
}

function backoffMs(attempt: number): number {
  return Math.min(500 * 2 ** (attempt - 1), BACKOFF_CAP_S * 1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeNetworkError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "AbortError") return "AbortError: request timed out";
    return `${err.name}: ${err.message}`;
  }
  return String(err);
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: "invalid_json", message: text.slice(0, 500) };
  }
}

async function peekJson(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

function coerceNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mask(secret: string): string {
  if (!secret) return "";
  return `${secret.slice(0, 8)}…`;
}
