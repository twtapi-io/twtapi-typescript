import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { TwtAPI } from "../src/index.js";
import { server } from "./setup.js";

const BASE = "https://api.twtapi.io";

function client() {
  return new TwtAPI({ apiKey: "tw_test", retries: 0, authToken: "AT", ct0: "CT" });
}

describe("users", () => {
  it("get hits GET /user", async () => {
    server.use(
      http.get(`${BASE}/user`, ({ request }) => {
        const u = new URL(request.url);
        return HttpResponse.json({ username: u.searchParams.get("username") });
      }),
    );
    const c = client();
    const r = await c.users.get("elonmusk");
    expect(r["username"]).toBe("elonmusk");
  });

  it("followersIter walks pages and reads `followers` (not `users`)", async () => {
    server.use(
      http.get(`${BASE}/followers`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor") ?? "";
        if (cursor === "") {
          return HttpResponse.json({
            followers: [{ user_id: "1" }, { user_id: "2" }],
            cursor_bottom: "c1",
          });
        }
        return HttpResponse.json({ followers: [{ user_id: "3" }], cursor_bottom: "" });
      }),
    );
    const c = client();
    const got: string[] = [];
    for await (const u of c.users.followersIter("44196397", { count: 200 })) {
      got.push(u["user_id"] as string);
    }
    expect(got).toEqual(["1", "2", "3"]);
  });

  it("follow sends cookies and posts user_id", async () => {
    let authHeader: string | null = null;
    server.use(
      http.post(`${BASE}/follow`, async ({ request }) => {
        authHeader = request.headers.get("X-Twitter-Auth-Token");
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ status: "ok", user_id: body["user_id"] });
      }),
    );
    const c = client();
    const r = await c.users.follow("44196397");
    expect(authHeader).toBe("AT");
    expect(r["user_id"]).toBe("44196397");
  });
});

describe("tweets", () => {
  it("commentsIter reads `comments` items field", async () => {
    server.use(
      http.get(`${BASE}/comments`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor") ?? "";
        if (cursor === "") {
          return HttpResponse.json({ comments: [{ tweet_id: "a" }], cursor_bottom: "c1" });
        }
        return HttpResponse.json({ comments: [{ tweet_id: "b" }], cursor_bottom: "" });
      }),
    );
    const c = client();
    const got: string[] = [];
    for await (const t of c.tweets.commentsIter("1")) got.push(t["tweet_id"] as string);
    expect(got).toEqual(["a", "b"]);
  });

  it("retweetsIter reads `users` items field", async () => {
    server.use(
      http.get(`${BASE}/retweets`, () =>
        HttpResponse.json({ users: [{ user_id: "1" }, { user_id: "2" }], cursor_bottom: "" }),
      ),
    );
    const c = client();
    const got: string[] = [];
    for await (const u of c.tweets.retweetsIter("1")) got.push(u["user_id"] as string);
    expect(got).toEqual(["1", "2"]);
  });

  it("create accepts mediaIds (array)", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${BASE}/tweet`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ status: "ok", tweet_id: "1" });
      }),
    );
    const c = client();
    await c.tweets.create("hi", { mediaIds: ["m1", "m2"] });
    expect(body["text"]).toBe("hi");
    expect(body["media_ids"]).toEqual(["m1", "m2"]);
  });

  it("create accepts a single mediaId", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${BASE}/tweet`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ status: "ok", tweet_id: "1" });
      }),
    );
    const c = client();
    await c.tweets.create("hi", { mediaId: "m1" });
    expect(body["media_id"]).toBe("m1");
    expect(body["media_ids"]).toBeUndefined();
  });
});

describe("search", () => {
  it("call hits GET /search with product param", async () => {
    let product: string | null = null;
    server.use(
      http.get(`${BASE}/search`, ({ request }) => {
        product = new URL(request.url).searchParams.get("product");
        return HttpResponse.json({ tweets: [], cursor_bottom: "" });
      }),
    );
    const c = client();
    await c.search("hello", { product: "Latest" });
    expect(product).toBe("Latest");
  });

  it("search.iter yields tweets", async () => {
    server.use(
      http.get(`${BASE}/search`, () =>
        HttpResponse.json({ tweets: [{ tweet_id: "a" }, { tweet_id: "b" }], cursor_bottom: "" }),
      ),
    );
    const c = client();
    const got: string[] = [];
    for await (const t of c.search.iter("hi")) got.push(t["tweet_id"] as string);
    expect(got).toEqual(["a", "b"]);
  });
});

describe("media", () => {
  it("upload posts media_url as JSON body", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${BASE}/upload_media`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ status: "ok", media_id: "9" });
      }),
    );
    const c = client();
    const r = await c.media.upload("https://example.com/a.png");
    expect(body["media_url"]).toBe("https://example.com/a.png");
    expect(r["media_id"]).toBe("9");
  });
});

describe("account", () => {
  it("changePassword auto-rotates auth_token + ct0", async () => {
    server.use(
      http.post(`${BASE}/change_password`, () =>
        HttpResponse.json({
          status: "ok",
          password: "newpw",
          new_auth_token: "AT2",
          new_ct0: "CT2",
        }),
      ),
    );
    const c = client();
    await c.account.changePassword("oldpw", "newpw");
    expect(c.cookies.authToken).toBe("AT2");
    expect(c.cookies.ct0).toBe("CT2");
  });
});

describe("communities", () => {
  it("membersIter flattens members_by_role and tags role", async () => {
    server.use(
      http.get(`${BASE}/community_members`, () =>
        HttpResponse.json({
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
      ),
    );
    const c = client();
    const got: Array<{ id: string; role: string }> = [];
    for await (const u of c.communities.membersIter("1")) {
      got.push({ id: u["user_id"] as string, role: u["role"] as string });
    }
    expect(got).toEqual([
      { id: "1", role: "Admin" },
      { id: "2", role: "Member" },
      { id: "3", role: "Member" },
    ]);
  });

  it("info sends engagement cookies", async () => {
    let auth: string | null = null;
    server.use(
      http.get(`${BASE}/community_info`, ({ request }) => {
        auth = request.headers.get("X-Twitter-Auth-Token");
        return HttpResponse.json({ status: "ok", is_member: false });
      }),
    );
    const c = client();
    await c.communities.info("1");
    expect(auth).toBe("AT");
  });
});

describe("auth", () => {
  it("login returns the discriminated union", async () => {
    server.use(
      http.post(`${BASE}/login/start`, () =>
        HttpResponse.json({ status: "challenge", type: "two_factor", state: "s1" }),
      ),
    );
    const c = client();
    const r = await c.auth.login("u", "p");
    expect(r.status).toBe("challenge");
    if (r.status === "challenge") {
      expect(r.state).toBe("s1");
      expect(r.type).toBe("two_factor");
    }
  });

  it("csrfToken sends only X-Twitter-Auth-Token", async () => {
    let auth: string | null = null;
    let ct0: string | null = null;
    server.use(
      http.get(`${BASE}/csrf_token`, ({ request }) => {
        auth = request.headers.get("X-Twitter-Auth-Token");
        ct0 = request.headers.get("X-Twitter-Ct0");
        return HttpResponse.json({ status: "ok", ct0: "fresh" });
      }),
    );
    const c = client();
    await c.auth.csrfToken("MYAT");
    expect(auth).toBe("MYAT");
    expect(ct0).toBeNull();
  });
});
