/**
 * Public entry point: `TwtAPI`.
 *
 * Composes resource namespaces (`users`, `tweets`, `search`, `auth`,
 * `media`, `account`, `communities`) over a shared `Transport`. Exposes
 * cookie management (`setCookies`, `cookies.ct0`, `onCt0Rotated`) and
 * the latest rate-limit snapshot (`lastRateLimit`).
 */

import { CookieState, type Ct0RotatedCallback } from "./cookies.js";
import type { RateLimit } from "./rateLimit.js";
import { Account } from "./resources/account.js";
import { Auth } from "./resources/auth.js";
import { Communities } from "./resources/communities.js";
import { Media } from "./resources/media.js";
import { type SearchCallable, createSearch } from "./resources/search.js";
import { Tweets } from "./resources/tweets.js";
import { Users } from "./resources/users.js";
import { Transport } from "./transport.js";
import type { TwtAPIOptions } from "./types.js";

/**
 * Synchronous-looking, promise-returning client for the twtapi.io HTTP API.
 *
 * @example
 * ```ts
 * import { TwtAPI } from "twtapi";
 *
 * const client = new TwtAPI({ apiKey: "tw_..." });
 * const user = await client.users.get("elonmusk");
 *
 * // For engagement endpoints, supply X cookies once. The SDK auto-rotates
 * // ct0 whenever the upstream returns X-Twitter-New-Ct0.
 * client.setCookies({ authToken: "...", ct0: "..." });
 * await client.tweets.like("1812256370960879853");
 * ```
 */
export class TwtAPI {
  private readonly _cookies: CookieState;
  private readonly _transport: Transport;
  readonly users: Users;
  readonly tweets: Tweets;
  readonly search: SearchCallable;
  readonly auth: Auth;
  readonly media: Media;
  readonly account: Account;
  readonly communities: Communities;

  constructor(options: TwtAPIOptions) {
    this._cookies = new CookieState({
      authToken: options.authToken,
      ct0: options.ct0,
      onCt0Rotated: options.onCt0Rotated,
    });
    this._transport = new Transport({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      proxy: options.proxy,
      timeout: options.timeout,
      retries: options.retries,
      cookies: this._cookies,
      logger: options.logger,
    });
    this.users = new Users(this._transport);
    this.tweets = new Tweets(this._transport);
    this.search = createSearch(this._transport);
    this.auth = new Auth(this._transport);
    this.media = new Media(this._transport);
    this.account = new Account(this._transport, this._cookies);
    this.communities = new Communities(this._transport);
  }

  /** The held cookie state. Read `cookies.ct0` to persist after rotation. */
  get cookies(): CookieState {
    return this._cookies;
  }

  /** Snapshot of `X-RateLimit-*` headers from the most recent response. */
  get lastRateLimit(): RateLimit | null {
    return this._transport.lastRateLimit;
  }

  /** Set the engagement cookies attached to every authenticated call. */
  setCookies(cookies: { authToken: string; ct0: string }): void {
    this._cookies.set(cookies.authToken, cookies.ct0);
  }

  /** Register a callback fired whenever the server returns a fresh `ct0`. */
  onCt0Rotated(callback: Ct0RotatedCallback | undefined): void {
    this._cookies.setOnRotated(callback);
  }
}
