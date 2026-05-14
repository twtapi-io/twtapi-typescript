import { describe, expect, it, vi } from "vitest";
import { RateLimitError, TwtAPIError } from "../src/errors.js";
import { Transport, type TransportOptions } from "../src/transport.js";
import { createFakeFetch, jsonResponse } from "./fakeFetch.js";

function makeTransport(
  fetchImpl: typeof fetch,
  overrides: Partial<TransportOptions> = {},
): Transport {
  return new Transport({ apiKey: "tw_test", retries: 0, fetchImpl, ...overrides });
}

describe("Transport — happy path", () => {
  it("sends X-API-Key header", async () => {
    const { fetch, calls } = createFakeFetch(() =>
      jsonResponse({ user_id: "1", screen_name: "x" }),
    );
    const t = makeTransport(fetch);
    await t.request("GET", "/user", { params: { username: "x" } });
    expect(calls[0]?.headers.get("X-API-Key")).toBe("tw_test");
  });

  it("forwards X-Proxy when set", async () => {
    const { fetch, calls } = createFakeFetch(() => jsonResponse({}));
    const t = makeTransport(fetch, { proxy: "http://u:p@h:1" });
    await t.request("GET", "/user");
    expect(calls[0]?.headers.get("X-Proxy")).toBe("http://u:p@h:1");
  });

  it("attaches engagement cookies when sendCookies is true", async () => {
    const { fetch, calls } = createFakeFetch(() => jsonResponse({ status: "ok" }));
    const t = makeTransport(fetch);
    t.cookies.set("AT", "CT");
    await t.request("POST", "/like", { json: { tweet_id: "1" }, sendCookies: true });
    expect(calls[0]?.headers.get("X-Twitter-Auth-Token")).toBe("AT");
    expect(calls[0]?.headers.get("X-Twitter-Ct0")).toBe("CT");
  });

  it("builds query string from params and drops null/undefined", async () => {
    const { fetch, calls } = createFakeFetch(() => jsonResponse({}));
    const t = makeTransport(fetch);
    await t.request("GET", "/followers", {
      params: { user_id: "1", count: 20, cursor: undefined, foo: null },
    });
    const url = new URL(calls[0]?.url ?? "");
    expect(url.searchParams.get("user_id")).toBe("1");
    expect(url.searchParams.get("count")).toBe("20");
    expect(url.searchParams.has("cursor")).toBe(false);
    expect(url.searchParams.has("foo")).toBe(false);
  });
});

describe("Transport — error mapping", () => {
  it("throws TwtAPIError subclass on non-2xx", async () => {
    const { fetch } = createFakeFetch(() =>
      jsonResponse({ error: "not_found", message: "no" }, { status: 404 }),
    );
    const t = makeTransport(fetch);
    await expect(t.request("GET", "/user")).rejects.toMatchObject({
      status: 404,
      error: "not_found",
      message: "no",
    });
  });

  it("throws RateLimitError on 429 with retryAfter + scope", async () => {
    const { fetch } = createFakeFetch(() =>
      jsonResponse(
        { error: "rate_limited", message: "slow", retry_after: 5, scope: "plan" },
        { status: 429 },
      ),
    );
    const t = makeTransport(fetch);
    try {
      await t.request("GET", "/search");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      const err = e as RateLimitError;
      expect(err.retryAfter).toBe(5);
      expect(err.scope).toBe("plan");
    }
  });
});

describe("Transport — ct0 rotation", () => {
  it("captures X-Twitter-New-Ct0 and updates the held value", async () => {
    const { fetch } = createFakeFetch(() =>
      jsonResponse({ status: "ok" }, { headers: { "X-Twitter-New-Ct0": "rotated" } }),
    );
    const onRotated = vi.fn();
    const t = makeTransport(fetch);
    t.cookies.setOnRotated(onRotated);
    t.cookies.set("AT", "old");
    await t.request("POST", "/like", { json: { tweet_id: "1" }, sendCookies: true });
    expect(t.cookies.ct0).toBe("rotated");
    expect(onRotated).toHaveBeenCalledWith("rotated");
  });
});

describe("Transport — rate-limit capture", () => {
  it("snapshots X-RateLimit-Remaining on success", async () => {
    const { fetch } = createFakeFetch(() =>
      jsonResponse({}, { headers: { "X-RateLimit-Remaining": "42" } }),
    );
    const t = makeTransport(fetch);
    await t.request("GET", "/user");
    expect(t.lastRateLimit?.remaining).toBe(42);
    expect(t.lastRateLimit?.limit).toBeNull();
  });
});

describe("Transport — retry policy", () => {
  it("retries idempotent calls on 500 and eventually succeeds", async () => {
    let n = 0;
    const { fetch } = createFakeFetch(() => {
      n += 1;
      if (n < 2) return jsonResponse({ error: "internal" }, { status: 500 });
      return jsonResponse({ user_id: "1" });
    });
    const t = makeTransport(fetch, { retries: 2 });
    const out = await t.request("GET", "/user");
    expect(out["user_id"]).toBe("1");
    expect(n).toBe(2);
  });

  it("never retries POST /tweet on 5xx", async () => {
    const { fetch, calls } = createFakeFetch(() =>
      jsonResponse({ error: "internal" }, { status: 500 }),
    );
    const t = makeTransport(fetch, { retries: 5 });
    await expect(
      t.request("POST", "/tweet", { json: { text: "hi" }, sendCookies: true }),
    ).rejects.toBeInstanceOf(TwtAPIError);
    expect(calls.length).toBe(1);
  });

  it("never retries POST /comment on 5xx", async () => {
    const { fetch, calls } = createFakeFetch(() =>
      jsonResponse({ error: "internal" }, { status: 500 }),
    );
    const t = makeTransport(fetch, { retries: 5 });
    await expect(
      t.request("POST", "/comment", { json: { tweet_id: "1", text: "x" }, sendCookies: true }),
    ).rejects.toBeInstanceOf(TwtAPIError);
    expect(calls.length).toBe(1);
  });

  it("does not retry 4xx", async () => {
    const { fetch, calls } = createFakeFetch(() =>
      jsonResponse({ error: "not_found" }, { status: 404 }),
    );
    const t = makeTransport(fetch, { retries: 5 });
    await expect(t.request("GET", "/user")).rejects.toMatchObject({ status: 404 });
    expect(calls.length).toBe(1);
  });
});
