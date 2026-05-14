/**
 * Official TypeScript / Node.js client for the twtapi.io HTTP API.
 *
 * Quickstart:
 *
 * ```ts
 * import { TwtAPI } from "twtapi";
 *
 * const client = new TwtAPI({ apiKey: "tw_..." });
 * const user = await client.users.get("elonmusk");
 * console.log(user.screen_name, user.followers);
 * ```
 *
 * Get an API key at https://twtapi.io/dashboard. Full reference at
 * https://twtapi.io/docs.
 */

export { TwtAPI } from "./client.js";
export { CookieState } from "./cookies.js";
export type { CookieInit, Ct0RotatedCallback } from "./cookies.js";
export {
  AuthenticationError,
  BadRequestError,
  BillingError,
  DuplicateTweetError,
  fromResponse,
  InternalError,
  NetworkError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  RequestTimeoutError,
  ServiceUnavailableError,
  TweetTooLongError,
  TwtAPIError,
  UpstreamError,
  ValidationError,
} from "./errors.js";
export type { RateLimitErrorOptions, RateLimitScope, TwtAPIErrorOptions } from "./errors.js";
export { iterItems, iterPages } from "./pagination.js";
export type { ItemIterOptions, IterOptions, PageFetcher } from "./pagination.js";
export type { RateLimit } from "./rateLimit.js";
export type {
  CommentTweetOptions,
  CreateTweetOptions,
} from "./resources/tweets.js";
export type {
  EmailCodeOptions,
  LoginOptions,
  LoginResult,
} from "./resources/auth.js";
export type {
  MembersIterOptions,
  RequestJoinOptions,
} from "./resources/communities.js";
export type {
  SearchCallable,
  SearchIterOptions,
  SearchPageOptions,
  SearchProduct,
} from "./resources/search.js";
export type { PageOptions } from "./resources/users.js";
export type { JsonObject, Logger, PaginationOptions, TwtAPIOptions } from "./types.js";
