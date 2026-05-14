/**
 * Quickstart — resolve a handle, then fetch the first page of their tweets.
 *
 * Run:
 *   TWTAPI_KEY=tw_... npx tsx examples/quickstart.ts
 */

import { TwtAPI } from "../src/index.js";

const apiKey = process.env["TWTAPI_KEY"];
if (!apiKey) {
  console.error("set TWTAPI_KEY first");
  process.exit(1);
}

const client = new TwtAPI({ apiKey });

const user = await client.users.get("elonmusk");
console.log(`@${user["screen_name"]} — ${user["followers"]} followers`);

const page = await client.users.tweets(user["user_id"] as string, { count: 5 });
const tweets = (page["tweets"] ?? []) as Array<Record<string, unknown>>;
for (const t of tweets) {
  console.log(`  [${t["tweet_id"]}] ${String(t["text"]).slice(0, 80)}`);
}

console.log("rate limit:", client.lastRateLimit);
