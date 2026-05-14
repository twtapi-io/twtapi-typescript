/**
 * User profile lookup, followers, tweets timeline, and follow action.
 *
 * Numeric IDs (`userId`) are strings everywhere to avoid JS precision loss
 * on 64-bit values.
 */

import { iterItems } from "../pagination.js";
import type { Transport } from "../transport.js";
import type { JsonObject, PaginationOptions } from "../types.js";

export interface PageOptions {
  /** Page size. Default 20, max 200. */
  count?: number;
  /** Cursor returned from a previous page. */
  cursor?: string;
}

export class Users {
  constructor(private readonly transport: Transport) {}

  /**
   * Fetch a user's full profile by handle. `GET /user`
   */
  get(username: string): Promise<JsonObject> {
    return this.transport.request("GET", "/user", { params: { username } });
  }

  /**
   * Resolve a handle to a numeric `user_id`. `GET /id_by_username`
   */
  byUsername(username: string): Promise<JsonObject> {
    return this.transport.request("GET", "/id_by_username", { params: { username } });
  }

  /**
   * Resolve a `user_id` to a handle. `GET /username_by_id`
   */
  byId(userId: string): Promise<JsonObject> {
    return this.transport.request("GET", "/username_by_id", { params: { user_id: userId } });
  }

  /**
   * One page of followers. `GET /followers`
   *
   * Response: `{ count, followers[], cursor_bottom, cursor_top? }`.
   */
  followers(userId: string, options: PageOptions = {}): Promise<JsonObject> {
    return this.transport.request("GET", "/followers", {
      params: { user_id: userId, count: options.count, cursor: options.cursor },
    });
  }

  /**
   * Iterate every follower across pages. Honours `count`, `maxPages`, `maxItems`.
   */
  followersIter(
    userId: string,
    options: PaginationOptions = {},
  ): AsyncIterableIterator<JsonObject> {
    return iterItems<JsonObject>(
      (cursor) => this.followers(userId, { count: options.count, cursor }),
      { itemsField: "followers", maxPages: options.maxPages, maxItems: options.maxItems },
    );
  }

  /**
   * One page of a user's tweets. `GET /user_tweets`
   *
   * Response: `{ count, tweets[], cursor_top, cursor_bottom }`.
   */
  tweets(userId: string, options: PageOptions = {}): Promise<JsonObject> {
    return this.transport.request("GET", "/user_tweets", {
      params: { user_id: userId, count: options.count, cursor: options.cursor },
    });
  }

  /**
   * Iterate every tweet across pages.
   */
  tweetsIter(userId: string, options: PaginationOptions = {}): AsyncIterableIterator<JsonObject> {
    return iterItems<JsonObject>(
      (cursor) => this.tweets(userId, { count: options.count, cursor }),
      { itemsField: "tweets", maxPages: options.maxPages, maxItems: options.maxItems },
    );
  }

  /**
   * Follow a user from the cookie owner's account. `POST /follow`
   * Requires engagement cookies.
   */
  follow(userId: string): Promise<JsonObject> {
    return this.transport.request("POST", "/follow", {
      json: { user_id: userId },
      sendCookies: true,
    });
  }
}
