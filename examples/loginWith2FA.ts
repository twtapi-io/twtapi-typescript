/**
 * Log in with a 2FA-enabled account. Reads username, password, and the 2FA
 * code from stdin.
 *
 * Run:
 *   TWTAPI_KEY=tw_... npx tsx examples/loginWith2FA.ts
 */

import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { TwtAPI } from "../src/index.js";

const apiKey = process.env["TWTAPI_KEY"];
if (!apiKey) {
  console.error("set TWTAPI_KEY first");
  process.exit(1);
}

const rl = createInterface({ input: stdin, output: stdout });
const username = await rl.question("X username: ");
const password = await rl.question("Password: ");

const client = new TwtAPI({ apiKey });
const start = await client.auth.login(username, password);

if (start.status === "ok") {
  console.log("Logged in. Save these:");
  console.log("  auth_token:", start.auth_token);
  console.log("  ct0:       ", start.ct0);
} else if (start.status === "challenge" && start.type === "two_factor") {
  const code = await rl.question("2FA code: ");
  const result = await client.auth.submit2FA(start.state, code);
  if (result.status === "ok") {
    console.log("Logged in. Save these:");
    console.log("  auth_token:", result.auth_token);
    console.log("  ct0:       ", result.ct0);
  } else {
    console.error("Challenge failed:", result);
  }
} else if (start.status === "challenge" && start.type === "email_code") {
  const code = await rl.question("Email code: ");
  const result = await client.auth.submitEmailCode(start.state, code);
  console.log(result);
} else {
  console.error("Login failed:", start);
}

rl.close();
