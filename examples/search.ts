/**
 * Search the latest tweets matching a query.
 *
 * Run:
 *   TWTAPI_KEY=tw_... npx tsx examples/search.ts "openai gpt"
 */

import { TwtAPI } from "../src/index.js";

const apiKey = process.env["TWTAPI_KEY"];
if (!apiKey) {
  console.error("set TWTAPI_KEY first");
  process.exit(1);
}

const query = process.argv.slice(2).join(" ") || "twtapi";
const client = new TwtAPI({ apiKey });

let count = 0;
for await (const tweet of client.search.iter(query, { product: "Latest", maxItems: 25 })) {
  count += 1;
  console.log(`[@${tweet["username"]}] ${String(tweet["text"]).slice(0, 100)}`);
}
console.log(`\nFound ${count} matches for "${query}".`);
