/**
 * Post a tweet, then delete it.
 *
 * Run:
 *   TWTAPI_KEY=tw_... X_AUTH_TOKEN=... X_CT0=... npx tsx examples/postATweet.ts "hello"
 */

import { TwtAPI } from "../src/index.js";

const apiKey = process.env["TWTAPI_KEY"];
const authToken = process.env["X_AUTH_TOKEN"];
const ct0 = process.env["X_CT0"];
if (!apiKey || !authToken || !ct0) {
  console.error("set TWTAPI_KEY, X_AUTH_TOKEN, X_CT0 first");
  process.exit(1);
}

const text = process.argv.slice(2).join(" ") || `hello from twtapi at ${new Date().toISOString()}`;
const client = new TwtAPI({
  apiKey,
  authToken,
  ct0,
  onCt0Rotated: (newCt0) => console.log("ct0 rotated; persist this:", newCt0),
});

const posted = await client.tweets.create(text);
console.log("posted:", posted);

if (typeof posted["tweet_id"] === "string") {
  const deleted = await client.tweets.delete(posted["tweet_id"]);
  console.log("deleted:", deleted);
}
