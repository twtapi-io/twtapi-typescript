import { describe, expect, it } from "vitest";
import { CookieState } from "../src/cookies.js";
import { Account } from "../src/resources/account.js";
import { Auth } from "../src/resources/auth.js";
import { Communities } from "../src/resources/communities.js";
import { Media } from "../src/resources/media.js";
import { createSearch } from "../src/resources/search.js";
import { Tweets } from "../src/resources/tweets.js";
import { Users } from "../src/resources/users.js";
import { Transport } from "../src/transport.js";
import { type Responder, createFakeFetch, jsonResponse } from "./fakeFetch.js";

function buildClient(responder: Responder) {
  const { fetch, calls } = createFakeFetch(responder);
  const cookies = new CookieState({ authToken: "AT", ct0: "CT" });
  const transport = new Transport({
    apiKey: "tw_test",
    retries: 0,
    cookies,
    fetchImpl: fetch,
  });
  const api = {
    users: new Users(transport),
    tweets: new Tweets(transport),
    search: createSearch(transport),
    auth: new Auth(transport),
    media: new Media(transport),
    account: new Account(transport, cookies),
    communities: new Communities(transport),
    cookies,
  };
  return { api, calls };
}

describe("users", () => {
  it("get hits GET /user", async () => {
    const { api, calls } = buildClient(({ url }) =>
      jsonResponse({ username: new URL(url).searchParams.get("username") }),
    );
    const r = await api.users.get("elonmusk");
    expect(r["username"]).toBe("elonmusk");
    expect(new URL(calls[0]?.url ?? "").pathname).toBe("/user");
  });

  it("followersIter walks pages and reads `followers` (not `users`)", async () => {
    const { api } = buildClient(({ url }) => {
      const cursor = new URL(url).searchParams.get("cursor") ?? "";
      if (cursor === "") {
        return jsonResponse({
          followers: [{ user_id: "1" }, { user_id: "2" }],
          cursor_bottom: "c1",
        });
      }
      return jsonResponse({ followers: [{ user_id: "3" }], cursor_bottom: "" });
    });
    const got: string[] = [];
    for await (const u of api.users.followersIter("44196397", { count: 200 })) {
      got.push(u["user_id"] as string);
    }
    expect(got).toEqual(["1", "2", "3"]);
  });

  it("follow sends cookies and posts user_id", async () => {
    const { api, calls } = buildClient(async ({ body }) => {
      const parsed = JSON.parse(body ?? "{}") as Record<string, unknown>;
      return jsonResponse({ status: "ok", user_id: parsed["user_id"] });
    });
    const r = await api.users.follow("44196397");
    expect(calls[0]?.headers.get("X-Twitter-Auth-Token")).toBe("AT");
    expect(r["user_id"]).toBe("44196397");
  });
});

describe("tweets", () => {
  it("commentsIter reads `comments` items field", async () => {
    const { api } = buildClient(({ url }) => {
      const cursor = new URL(url).searchParams.get("cursor") ?? "";
      if (cursor === "") {
        return jsonResponse({ comments: [{ tweet_id: "a" }], cursor_bottom: "c1" });
      }
      return jsonResponse({ comments: [{ tweet_id: "b" }], cursor_bottom: "" });
    });
    const got: string[] = [];
    for await (const t of api.tweets.commentsIter("1")) got.push(t["tweet_id"] as string);
    expect(got).toEqual(["a", "b"]);
  });

  it("retweetsIter reads `users` items field", async () => {
    const { api } = buildClient(() =>
      jsonResponse({ users: [{ user_id: "1" }, { user_id: "2" }], cursor_bottom: "" }),
    );
    const got: string[] = [];
    for await (const u of api.tweets.retweetsIter("1")) got.push(u["user_id"] as string);
    expect(got).toEqual(["1", "2"]);
  });

  it("create accepts mediaIds (array)", async () => {
    let captured: Record<string, unknown> = {};
    const { api } = buildClient(async ({ body }) => {
      captured = JSON.parse(body ?? "{}") as Record<string, unknown>;
      return jsonResponse({ status: "ok", tweet_id: "1" });
    });
    await api.tweets.create("hi", { mediaIds: ["m1", "m2"] });
    expect(captured["text"]).toBe("hi");
    expect(captured["media_ids"]).toEqual(["m1", "m2"]);
  });

  it("create accepts a single mediaId", async () => {
    let captured: Record<string, unknown> = {};
    const { api } = buildClient(async ({ body }) => {
      captured = JSON.parse(body ?? "{}") as Record<string, unknown>;
      return jsonResponse({ status: "ok", tweet_id: "1" });
    });
    await api.tweets.create("hi", { mediaId: "m1" });
    expect(captured["media_id"]).toBe("m1");
    expect(captured["media_ids"]).toBeUndefined();
  });
});

describe("search", () => {
  it("call hits GET /search with product param", async () => {
    let product: string | null = null;
    const { api } = buildClient(({ url }) => {
      product = new URL(url).searchParams.get("product");
      return jsonResponse({ tweets: [], cursor_bottom: "" });
    });
    await api.search("hello", { product: "Latest" });
    expect(product).toBe("Latest");
  });

  it("search.iter yields tweets", async () => {
    const { api } = buildClient(() =>
      jsonResponse({ tweets: [{ tweet_id: "a" }, { tweet_id: "b" }], cursor_bottom: "" }),
    );
    const got: string[] = [];
    for await (const t of api.search.iter("hi")) got.push(t["tweet_id"] as string);
    expect(got).toEqual(["a", "b"]);
  });
});

describe("media", () => {
  it("upload posts media_url as JSON body", async () => {
    let captured: Record<string, unknown> = {};
    const { api } = buildClient(async ({ body }) => {
      captured = JSON.parse(body ?? "{}") as Record<string, unknown>;
      return jsonResponse({ status: "ok", media_id: "9" });
    });
    const r = await api.media.upload("https://example.com/a.png");
    expect(captured["media_url"]).toBe("https://example.com/a.png");
    expect(r["media_id"]).toBe("9");
  });
});

describe("account", () => {
  it("changePassword auto-rotates auth_token + ct0", async () => {
    const { api } = buildClient(() =>
      jsonResponse({
        status: "ok",
        password: "newpw",
        new_auth_token: "AT2",
        new_ct0: "CT2",
      }),
    );
    await api.account.changePassword("oldpw", "newpw");
    expect(api.cookies.authToken).toBe("AT2");
    expect(api.cookies.ct0).toBe("CT2");
  });
});

describe("communities", () => {
  it("membersIter flattens members_by_role and tags role", async () => {
    const { api } = buildClient(() =>
      jsonResponse({
        count: 3,
        members_by_role: {
          Admin: [{ user_id: "1", screen_name: "alice" }],
          Member: [
            { user_id: "2", screen_name: "bob" },
            { user_id: "3", screen_name: "carol" },
          ],
        },
        next_cursor: "",
      }),
    );
    const got: Array<{ id: string; role: string }> = [];
    for await (const u of api.communities.membersIter("1")) {
      got.push({ id: u["user_id"] as string, role: u["role"] as string });
    }
    expect(got).toEqual([
      { id: "1", role: "Admin" },
      { id: "2", role: "Member" },
      { id: "3", role: "Member" },
    ]);
  });

  it("info sends engagement cookies", async () => {
    const { api, calls } = buildClient(() => jsonResponse({ status: "ok", is_member: false }));
    await api.communities.info("1");
    expect(calls[0]?.headers.get("X-Twitter-Auth-Token")).toBe("AT");
  });
});

describe("auth", () => {
  it("login returns the discriminated union", async () => {
    const { api } = buildClient(() =>
      jsonResponse({ status: "challenge", type: "two_factor", state: "s1" }),
    );
    const r = await api.auth.login("u", "p");
    expect(r.status).toBe("challenge");
    if (r.status === "challenge") {
      expect(r.state).toBe("s1");
      expect(r.type).toBe("two_factor");
    }
  });

  it("csrfToken sends only X-Twitter-Auth-Token", async () => {
    const { api, calls } = buildClient(() => jsonResponse({ status: "ok", ct0: "fresh" }));
    await api.auth.csrfToken("MYAT");
    expect(calls[0]?.headers.get("X-Twitter-Auth-Token")).toBe("MYAT");
    expect(calls[0]?.headers.get("X-Twitter-Ct0")).toBeNull();
  });
});
