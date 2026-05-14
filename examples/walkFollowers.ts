/**
 * Walk every follower of a user, capped at 500 items.
 *
 * Run:
 *   TWTAPI_KEY=tw_... npx tsx examples/walkFollowers.ts 44196397
 */

import { TwtAPI } from "../src/index.js";

const apiKey = process.env["TWTAPI_KEY"];
if (!apiKey) {
  console.error("set TWTAPI_KEY first");
  process.exit(1);
}

const userId = process.argv[2] ?? "44196397";
const client = new TwtAPI({ apiKey });

let seen = 0;
for await (const u of client.users.followersIter(userId, { count: 200, maxItems: 500 })) {
  seen += 1;
  console.log(`${seen}. @${u["screen_name"]} (${u["followers_count"] ?? "?"} followers)`);
}
console.log(`\nWalked ${seen} followers.`);
