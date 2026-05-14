# twtapi

Official TypeScript / Node.js client for [**twtapi.io**](https://twtapi.io) —
a JSON HTTP API that exposes 𝕏 (Twitter) data and actions.

- **Zero runtime dependencies.** Uses built-in `fetch`.
- **Node 18+** and the latest Bun. Ships ESM + CJS + full `.d.ts`.
- Async iterators for every paginated endpoint.
- Typed exception hierarchy — `catch (e) { if (e instanceof RateLimitError) ... }`.
- Automatic `ct0` rotation, observable via callback.

📚 Full API reference: <https://twtapi.io/docs>

---

## Install

```bash
npm install twtapi
# or
pnpm add twtapi
# or
bun add twtapi
```

## Quickstart

```ts
import { TwtAPI } from "twtapi";

const client = new TwtAPI({ apiKey: process.env.TWTAPI_KEY! });

const user = await client.users.get("elonmusk");
console.log(user.screen_name, user.followers);
```

Get an API key at <https://twtapi.io/dashboard>.

## Engagement (post, like, follow, ...)

Engagement endpoints act on a specific 𝕏 account. Supply the cookies of
that account once and the SDK attaches them to every subsequent call:

```ts
const client = new TwtAPI({
  apiKey: process.env.TWTAPI_KEY!,
  authToken: process.env.X_AUTH_TOKEN,
  ct0: process.env.X_CT0,
  onCt0Rotated: (newCt0) => persistSomewhere(newCt0),
});

await client.tweets.like("1812256370960879853");
await client.tweets.create("Hello world from twtapi");
```

The server may rotate `ct0` mid-flight via `X-Twitter-New-Ct0`. The SDK
detects the header, updates the held value silently, and fires the optional
`onCt0Rotated` callback so you can persist the new value.

## Login flow

```ts
const result = await client.auth.login("yourhandle", "••••••••");

if (result.status === "ok") {
  client.setCookies({ authToken: result.auth_token, ct0: result.ct0 });
} else if (result.status === "challenge" && result.type === "two_factor") {
  const code = await promptUser();
  const ok = await client.auth.submit2FA(result.state, code);
  if (ok.status === "ok") {
    client.setCookies({ authToken: ok.auth_token, ct0: ok.ct0 });
  }
}
```

## Pagination

Every list endpoint exposes both a one-page method and an async iterator:

```ts
// One page
const page = await client.users.followers("44196397", { count: 200 });
console.log(page.followers, page.cursor_bottom);

// Walk every follower (with caps)
for await (const u of client.users.followersIter("44196397", { maxItems: 1000 })) {
  console.log(u.screen_name);
}
```

For `/community_members`, which uses `next_cursor` and returns members
grouped by role, the iterator flattens roles into a single stream and
tags each user with a `role` field:

```ts
for await (const member of client.communities.membersIter("1493446837214187523")) {
  console.log(member.role, member.screen_name);
}
```

## Errors

Every HTTP error surfaces as a typed subclass of `TwtAPIError`:

```ts
import { TwtAPI, RateLimitError, DuplicateTweetError } from "twtapi";

try {
  await client.tweets.create("hi");
} catch (e) {
  if (e instanceof RateLimitError) {
    console.log(`back off ${e.retryAfter}s (${e.scope})`);
  } else if (e instanceof DuplicateTweetError) {
    console.log("already posted that recently");
  } else {
    throw e;
  }
}
```

| HTTP | Exception |
|---|---|
| 400 | `BadRequestError` |
| 401 | `AuthenticationError` |
| 402 | `BillingError` |
| 403 | `PermissionError` |
| 404 | `NotFoundError` |
| 408 | `RequestTimeoutError` |
| 422 | `ValidationError` · `DuplicateTweetError` · `TweetTooLongError` |
| 429 | `RateLimitError` (with `retryAfter`, `scope`) |
| 500 | `InternalError` |
| 502 | `UpstreamError` |
| 503 | `ServiceUnavailableError` |
| network | `NetworkError` |

## Rate limits

The most recent `X-RateLimit-*` snapshot is on the client:

```ts
console.log(client.lastRateLimit?.remaining);
```

## Retry policy

- `429`: retry once after `retry_after` (cap 60s).
- `408 / 500 / 502 / 503`: retry idempotent calls with exponential backoff,
  capped at 8s, max 2 retries.
- `POST /tweet` and `POST /comment` are **never** retried on 5xx to avoid
  double-posts.
- `400 / 401 / 402 / 403 / 404 / 422`: never retried.
- Disable with `new TwtAPI({ ..., retries: 0 })`.

## Numeric IDs

Every numeric identifier (`user_id`, `tweet_id`, `community_id`,
`media_id`) is a **string** — both in arguments and in responses. JS
loses precision on 64-bit integers, so the SDK never coerces them to
`number`. Match accordingly.

## Examples

Runnable examples live in [`examples/`](./examples):

- [`quickstart.ts`](./examples/quickstart.ts)
- [`walkFollowers.ts`](./examples/walkFollowers.ts)
- [`search.ts`](./examples/search.ts)
- [`loginWith2FA.ts`](./examples/loginWith2FA.ts)
- [`postATweet.ts`](./examples/postATweet.ts)
- [`uploadMediaAndTweet.ts`](./examples/uploadMediaAndTweet.ts)

Run them with `tsx`:

```bash
TWTAPI_KEY=tw_... npx tsx examples/quickstart.ts
```

## License

[MIT](./LICENSE)
