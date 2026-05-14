import { describe, expect, it } from "vitest";
import {
  AuthenticationError,
  BadRequestError,
  BillingError,
  DuplicateTweetError,
  InternalError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  RequestTimeoutError,
  ServiceUnavailableError,
  TweetTooLongError,
  TwtAPIError,
  UpstreamError,
  ValidationError,
  fromResponse,
} from "../src/errors.js";

describe("fromResponse — status to class map", () => {
  const cases: Array<[number, new (...args: unknown[]) => TwtAPIError]> = [
    [400, BadRequestError],
    [401, AuthenticationError],
    [402, BillingError],
    [403, PermissionError],
    [404, NotFoundError],
    [408, RequestTimeoutError],
    [500, InternalError],
    [502, UpstreamError],
    [503, ServiceUnavailableError],
  ];

  for (const [status, Cls] of cases) {
    it(`maps ${status} to ${Cls.name}`, () => {
      const err = fromResponse({ status, body: { error: "x", message: "y" } });
      expect(err).toBeInstanceOf(Cls);
      expect(err).toBeInstanceOf(TwtAPIError);
      expect(err.status).toBe(status);
    });
  }
});

describe("fromResponse — 422 reason refinement", () => {
  it("duplicate_tweet → DuplicateTweetError", () => {
    const err = fromResponse({
      status: 422,
      body: { error: "duplicate_tweet", message: "dup" },
    });
    expect(err).toBeInstanceOf(DuplicateTweetError);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it("tweet_silently_dropped_likely_duplicate → DuplicateTweetError", () => {
    const err = fromResponse({
      status: 422,
      body: { error: "tweet_silently_dropped_likely_duplicate", message: "silent" },
    });
    expect(err).toBeInstanceOf(DuplicateTweetError);
  });

  it("tweet_too_long → TweetTooLongError", () => {
    const err = fromResponse({
      status: 422,
      body: { error: "tweet_too_long", message: "too long" },
    });
    expect(err).toBeInstanceOf(TweetTooLongError);
  });

  it("unrecognised reason → ValidationError", () => {
    const err = fromResponse({
      status: 422,
      body: { error: "weird", message: "..." },
    });
    expect(err).toBeInstanceOf(ValidationError);
    expect(err).not.toBeInstanceOf(DuplicateTweetError);
  });
});

describe("fromResponse — 429 carries retryAfter + scope", () => {
  it("reads from body", () => {
    const err = fromResponse({
      status: 429,
      body: { error: "rate_limited", message: "slow down", retry_after: 12, scope: "plan" },
    });
    expect(err).toBeInstanceOf(RateLimitError);
    const rl = err as RateLimitError;
    expect(rl.retryAfter).toBe(12);
    expect(rl.scope).toBe("plan");
  });

  it("falls back to header when body has no retry_after", () => {
    const err = fromResponse({
      status: 429,
      body: { error: "rate_limited", message: "slow down" },
      retryAfterHeader: 7,
    });
    expect((err as RateLimitError).retryAfter).toBe(7);
  });
});

describe("TwtAPIError shape", () => {
  it("preserves body and error code", () => {
    const body = { error: "not_found", message: "no such user" };
    const err = fromResponse({ status: 404, body });
    expect(err.message).toBe("no such user");
    expect(err.error).toBe("not_found");
    expect(err.body).toBe(body);
    expect(err.name).toBe("NotFoundError");
  });

  it("falls back to a sensible message when body is empty", () => {
    const err = fromResponse({ status: 500, body: {} });
    expect(err.message).toBe("HTTP 500");
  });
});
