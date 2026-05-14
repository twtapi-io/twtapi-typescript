/**
 * Tweet reads (retweets / quotes / comments / reply_ids) and mutations.
 *
 * Per the public API:
 * - `/retweets` returns compact users under `users[]`.
 * - `/quotes`, `/user_tweets`, `/search` return tweets under `tweets[]`.
 * - `/comments` returns reply tweets under `comments[]`.
 * - `/reply_ids` returns string IDs under `reply_ids[]`.
 * - `POST /tweet` and `POST /comment` accept either `media_id` (single) or
 *   `media_ids` (array, up to 4) for attachments.
 */

import { iterItems } from "../pagination.js";
import type { Transport } from "../transport.js";
import type { JsonObject, PaginationOptions } from "../types.js";
import type { PageOptions } from "./users.js";

export interface CreateTweetOptions {
  /** Tweet ID to reply to. Mutually exclusive with `attachmentUrl`. */
  inReplyTo?: string;
  /** URL of a tweet to quote. Mutually exclusive with `inReplyTo`. */
  attachmentUrl?: string;
  /** Single `media_id` from `media.upload`. */
  mediaId?: string;
  /** Up to 4 `media_id` values from `media.upload`. */
  mediaIds?: string[];
}

export interface CommentTweetOptions {
  mediaId?: string;
  mediaIds?: string[];
}

function attachMedia(
  payload: Record<string, unknown>,
  mediaId: string | undefined,
  mediaIds: string[] | undefined,
): void {
  if (mediaId !== undefined) payload["media_id"] = mediaId;
  if (mediaIds && mediaIds.length > 0) payload["media_ids"] = mediaIds;
}

export class Tweets {
  constructor(private readonly transport: Transport) {}

  // -------------------------------------------------------------- reads

  /**
   * Users who retweeted a tweet. `GET /retweets`
   */
  retweets(tweetId: string, options: PageOptions = {}): Promise<JsonObject> {
    return this.transport.request("GET", "/retweets", {
      params: { tweet_id: tweetId, count: options.count, cursor: options.cursor },
    });
  }

  retweetsIter(
    tweetId: string,
    options: PaginationOptions = {},
  ): AsyncIterableIterator<JsonObject> {
    return iterItems<JsonObject>(
      (cursor) => this.retweets(tweetId, { count: options.count, cursor }),
      { itemsField: "users", maxPages: options.maxPages, maxItems: options.maxItems },
    );
  }

  /**
   * Quote-tweets of a given tweet. `GET /quotes`
   */
  quotes(tweetId: string, options: PageOptions = {}): Promise<JsonObject> {
    return this.transport.request("GET", "/quotes", {
      params: { tweet_id: tweetId, count: options.count, cursor: options.cursor },
    });
  }

  quotesIter(tweetId: string, options: PaginationOptions = {}): AsyncIterableIterator<JsonObject> {
    return iterItems<JsonObject>(
      (cursor) => this.quotes(tweetId, { count: options.count, cursor }),
      { itemsField: "tweets", maxPages: options.maxPages, maxItems: options.maxItems },
    );
  }

  /**
   * Replies (full content) to a tweet. `GET /comments`
   */
  comments(tweetId: string, options: { cursor?: string } = {}): Promise<JsonObject> {
    return this.transport.request("GET", "/comments", {
      params: { tweet_id: tweetId, cursor: options.cursor },
    });
  }

  commentsIter(
    tweetId: string,
    options: { maxPages?: number; maxItems?: number } = {},
  ): AsyncIterableIterator<JsonObject> {
    return iterItems<JsonObject>((cursor) => this.comments(tweetId, { cursor }), {
      itemsField: "comments",
      maxPages: options.maxPages,
      maxItems: options.maxItems,
    });
  }

  /**
   * Just the IDs of replies to a tweet (cheaper than `comments`). `GET /reply_ids`
   */
  replyIds(tweetId: string, options: { cursor?: string } = {}): Promise<JsonObject> {
    return this.transport.request("GET", "/reply_ids", {
      params: { tweet_id: tweetId, cursor: options.cursor },
    });
  }

  replyIdsIter(
    tweetId: string,
    options: { maxPages?: number; maxItems?: number } = {},
  ): AsyncIterableIterator<string> {
    return iterItems<string>((cursor) => this.replyIds(tweetId, { cursor }), {
      itemsField: "reply_ids",
      maxPages: options.maxPages,
      maxItems: options.maxItems,
    });
  }

  // ------------------------------------------------------------- writes

  /**
   * Post a new tweet. Requires engagement cookies. `POST /tweet`
   *
   * `inReplyTo` and `attachmentUrl` are mutually exclusive. Use either
   * `mediaId` (single) or `mediaIds` (up to 4) to attach media uploaded
   * via `media.upload`.
   */
  create(text: string, options: CreateTweetOptions = {}): Promise<JsonObject> {
    const payload: Record<string, unknown> = { text };
    if (options.inReplyTo !== undefined) payload["in_reply_to"] = options.inReplyTo;
    if (options.attachmentUrl !== undefined) payload["attachment_url"] = options.attachmentUrl;
    attachMedia(payload, options.mediaId, options.mediaIds);
    return this.transport.request("POST", "/tweet", { json: payload, sendCookies: true });
  }

  /**
   * Reply to a tweet. `POST /comment`. Requires engagement cookies.
   */
  comment(tweetId: string, text: string, options: CommentTweetOptions = {}): Promise<JsonObject> {
    const payload: Record<string, unknown> = { tweet_id: tweetId, text };
    attachMedia(payload, options.mediaId, options.mediaIds);
    return this.transport.request("POST", "/comment", { json: payload, sendCookies: true });
  }

  /** Like a tweet. `POST /like` */
  like(tweetId: string): Promise<JsonObject> {
    return this.transport.request("POST", "/like", {
      json: { tweet_id: tweetId },
      sendCookies: true,
    });
  }

  /** Retweet a tweet. `POST /retweet` */
  retweet(tweetId: string): Promise<JsonObject> {
    return this.transport.request("POST", "/retweet", {
      json: { tweet_id: tweetId },
      sendCookies: true,
    });
  }

  /** Bookmark a tweet. `POST /bookmark` */
  bookmark(tweetId: string): Promise<JsonObject> {
    return this.transport.request("POST", "/bookmark", {
      json: { tweet_id: tweetId },
      sendCookies: true,
    });
  }

  /** Delete one of the cookie owner's tweets. `POST /delete_tweet` */
  delete(tweetId: string): Promise<JsonObject> {
    return this.transport.request("POST", "/delete_tweet", {
      json: { tweet_id: tweetId },
      sendCookies: true,
    });
  }
}
