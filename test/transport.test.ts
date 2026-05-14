import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { RateLimitError, TwtAPIError } from "../src/errors.js";
import { Transport } from "../src/transport.js";
import { server } from "./setup.js";

const BASE = "https://api.twtapi.io";

function makeTransport(overrides: Partial<ConstructorParameters<typeof Transport>[0]> = {}) {
  return new Transport({ apiKey: "tw_test", retries: 0, ...overrides });
}

describe("Transport — happy path", () => {
  it("sends X-API-Key header", async () => {
    let seenKey: string | null = null;
    server.use(
      http.get(`${BASE}/user`, ({ request }) => {
        seenKey = request.headers.get("X-API-Key");
        return HttpResponse.json({ user_id: "1", screen_name: "x" });
      }),
    );
    const t = makeTransport();
    await t.request("GET", "/user", { params: { username: "x" } });
    expect(seenKey).toBe("tw_test");
  });

  it("forwards X-Proxy when set", async () => {
    let seenProxy: string | null = null;
    server.use(
      http.get(`${BASE}/user`, ({ request }) => {
        seenProxy = request.headers.get("X-Proxy");
        return HttpResponse.json({});
      }),
    );
    const t = makeTransport({ proxy: "http://u:p@h:1" });
    await t.request("GET", "/user");
    expect(seenProxy).toBe("http://u:p@h:1");
  });

  it("attaches engagement cookies when sendCookies is true", async () => {
    let authToken: string | null = null;
    let ct0: string | null = null;
    server.use(
      http.post(`${BASE}/like`, ({ request }) => {
        authToken = request.headers.get("X-Twitter-Auth-Token");
        ct0 = request.headers.get("X-Twitter-Ct0");
        return HttpResponse.json({ status: "ok" });
      }),
    );
    const t = makeTransport();
    t.cookies.set("AT", "CT");
    await t.request("POST", "/like", { json: { tweet_id: "1" }, sendCookies: true });
    expect(authToken).toBe("AT");
    expect(ct0).toBe("CT");
  });
});

describe("Transport — error mapping", () => {
  it("throws TwtAPIError subclass on non-2xx", async () => {
    server.use(
      http.get(`${BASE}/user`, () =>
        HttpResponse.json({ error: "not_found", message: "no" }, { status: 404 }),
      ),
    );
    const t = makeTransport();
    await expect(t.request("GET", "/user")).rejects.toMatchObject({
      status: 404,
      error: "not_found",
      message: "no",
    });
  });

  it("throws RateLimitError on 429 with retryAfter + scope", async () => {
    server.use(
      http.get(`${BASE}/search`, () =>
        HttpResponse.json(
          { error: "rate_limited", message: "slow", retry_after: 5, scope: "plan" },
          { status: 429 },
        ),
      ),
    );
    const t = makeTransport();
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
    server.use(
      http.post(`${BASE}/like`, () =>
        HttpResponse.json({ status: "ok" }, { headers: { "X-Twitter-New-Ct0": "rotated" } }),
      ),
    );
    const onRotated = vi.fn();
    const t = makeTransport();
    t.cookies.setOnRotated(onRotated);
    t.cookies.set("AT", "old");
    await t.request("POST", "/like", { json: { tweet_id: "1" }, sendCookies: true });
    expect(t.cookies.ct0).toBe("rotated");
    expect(onRotated).toHaveBeenCalledWith("rotated");
  });
});

describe("Transport — rate-limit capture", () => {
  it("snapshots X-RateLimit-Remaining on success", async () => {
    server.use(
      http.get(`${BASE}/user`, () =>
        HttpResponse.json({}, { headers: { "X-RateLimit-Remaining": "42" } }),
      ),
    );
    const t = makeTransport();
    await t.request("GET", "/user");
    expect(t.lastRateLimit?.remaining).toBe(42);
    expect(t.lastRateLimit?.limit).toBeNull();
  });
});

describe("Transport — retry policy", () => {
  it("retries idempotent calls on 500 and eventually succeeds", async () => {
    let n = 0;
    server.use(
      http.get(`${BASE}/user`, () => {
        n += 1;
        if (n < 2) return HttpResponse.json({ error: "internal" }, { status: 500 });
        return HttpResponse.json({ user_id: "1" });
      }),
    );
    const t = makeTransport({ retries: 2 });
    const out = await t.request("GET", "/user");
    expect(out["user_id"]).toBe("1");
    expect(n).toBe(2);
  });

  it("never retries POST /tweet on 5xx", async () => {
    let n = 0;
    server.use(
      http.post(`${BASE}/tweet`, () => {
        n += 1;
        return HttpResponse.json({ error: "internal" }, { status: 500 });
      }),
    );
    const t = makeTransport({ retries: 5 });
    await expect(
      t.request("POST", "/tweet", { json: { text: "hi" }, sendCookies: true }),
    ).rejects.toBeInstanceOf(TwtAPIError);
    expect(n).toBe(1);
  });

  it("never retries POST /comment on 5xx", async () => {
    let n = 0;
    server.use(
      http.post(`${BASE}/comment`, () => {
        n += 1;
        return HttpResponse.json({ error: "internal" }, { status: 500 });
      }),
    );
    const t = makeTransport({ retries: 5 });
    await expect(
      t.request("POST", "/comment", { json: { tweet_id: "1", text: "x" }, sendCookies: true }),
    ).rejects.toBeInstanceOf(TwtAPIError);
    expect(n).toBe(1);
  });

  it("does not retry 4xx", async () => {
    let n = 0;
    server.use(
      http.get(`${BASE}/user`, () => {
        n += 1;
        return HttpResponse.json({ error: "not_found" }, { status: 404 });
      }),
    );
    const t = makeTransport({ retries: 5 });
    await expect(t.request("GET", "/user")).rejects.toMatchObject({ status: 404 });
    expect(n).toBe(1);
  });
});
