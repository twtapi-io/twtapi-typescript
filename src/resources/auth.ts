/**
 * Login flow + cookie helpers.
 *
 * `login` returns one of:
 *   - `{ status: "ok", auth_token, ct0 }` — login succeeded.
 *   - `{ status: "challenge", type, state }` — pass the `state` to
 *     `submit2FA` or `submitEmailCode` along with the user-supplied code.
 *   - `{ status: "error", message }` — terminal failure.
 *
 * The discriminated union below documents this shape — at runtime the
 * server may add fields the union doesn't enumerate; treat them as
 * passthrough.
 */

import type { Transport } from "../transport.js";
import type { JsonObject } from "../types.js";

export type LoginResult =
  | { status: "ok"; auth_token: string; ct0: string }
  | { status: "challenge"; type: "two_factor" | "email_code" | string; state: string }
  | { status: "error"; message: string };

export interface LoginOptions {
  /** Optional outbound proxy for the upstream login call. */
  proxy?: string;
}

export interface EmailCodeOptions {
  /** Alternative identifier required by some flows. Usually empty. */
  alternateId?: string;
}

export class Auth {
  constructor(private readonly transport: Transport) {}

  /**
   * Start a login. `POST /login/start`
   *
   * Returns either a finished session (with `auth_token` + `ct0`) or an
   * encrypted `state` token to continue at `submit2FA` / `submitEmailCode`.
   */
  async login(
    username: string,
    password: string,
    options: LoginOptions = {},
  ): Promise<LoginResult> {
    const payload: Record<string, unknown> = { username, password };
    if (options.proxy) payload["proxy"] = options.proxy;
    const body = (await this.transport.request("POST", "/login/start", {
      json: payload,
    })) as JsonObject;
    return body as unknown as LoginResult;
  }

  /**
   * Submit a TOTP / authenticator code to continue a login. `POST /login/2fa`
   */
  async submit2FA(challengeToken: string, code: string): Promise<LoginResult> {
    const body = await this.transport.request("POST", "/login/2fa", {
      json: { state: challengeToken, code },
    });
    return body as unknown as LoginResult;
  }

  /**
   * Submit an email / SMS verification code to continue a login.
   * `POST /login/email_code`
   */
  async submitEmailCode(
    challengeToken: string,
    code: string,
    options: EmailCodeOptions = {},
  ): Promise<LoginResult> {
    const payload: Record<string, unknown> = { state: challengeToken, code };
    if (options.alternateId !== undefined) payload["alternate_id"] = options.alternateId;
    const body = await this.transport.request("POST", "/login/email_code", { json: payload });
    return body as unknown as LoginResult;
  }

  /**
   * Mint a fresh `ct0` from an `auth_token`. `GET /csrf_token`.
   * Only `X-Twitter-Auth-Token` is sent — `ct0` is the response.
   */
  csrfToken(authToken: string): Promise<JsonObject> {
    return this.transport.request("GET", "/csrf_token", {
      extraHeaders: { "X-Twitter-Auth-Token": authToken },
    });
  }

  /**
   * Return the screen name behind a cookie pair. `GET /screen_name_from_token`
   */
  whoAmI(authToken: string, ct0: string): Promise<JsonObject> {
    return this.transport.request("GET", "/screen_name_from_token", {
      extraHeaders: {
        "X-Twitter-Auth-Token": authToken,
        "X-Twitter-Ct0": ct0,
      },
    });
  }
}
