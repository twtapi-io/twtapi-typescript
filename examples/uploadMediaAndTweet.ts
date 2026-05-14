/**
 * Upload an image from a public URL, then post a tweet that attaches it.
 *
 * Run:
 *   TWTAPI_KEY=tw_... X_AUTH_TOKEN=... X_CT0=... \
 *     npx tsx examples/uploadMediaAndTweet.ts https://placehold.co/600x400/png
 */

import { TwtAPI } from "../src/index.js";

const apiKey = process.env["TWTAPI_KEY"];
const authToken = process.env["X_AUTH_TOKEN"];
const ct0 = process.env["X_CT0"];
if (!apiKey || !authToken || !ct0) {
  console.error("set TWTAPI_KEY, X_AUTH_TOKEN, X_CT0 first");
  process.exit(1);
}

const mediaUrl = process.argv[2] ?? "https://placehold.co/600x400/png";
const client = new TwtAPI({ apiKey, authToken, ct0 });

const upload = await client.media.upload(mediaUrl);
console.log("upload:", upload);

if (typeof upload["media_id"] !== "string") {
  console.error("upload did not return a media_id");
  process.exit(1);
}

const posted = await client.tweets.create("with an image attached", {
  mediaId: upload["media_id"],
});
console.log("posted:", posted);
