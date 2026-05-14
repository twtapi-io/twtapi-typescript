/**
 * Account-level mutations (currently: password change).
 *
 * Password change invalidates the previous session. The SDK auto-rotates
 * the held `auth_token` + `ct0` pair so subsequent calls keep working.
 */

import type { CookieState } from "../cookies.js";
import type { Transport } from "../transport.js";
import type { JsonObject } from "../types.js";

export class Account {
  constructor(
    private readonly transport: Transport,
    private readonly cookies: CookieState,
  ) {}

  /**
   * Change the cookie owner's account password. `POST /change_password`.
   * Requires engagement cookies.
   *
   * Pass `newPassword: undefined` (or omit) to have a 16-char password
   * generated server-side. The response carries `new_auth_token` +
   * `new_ct0` — the SDK auto-rotates the held cookies.
   */
  async changePassword(current: string, newPassword?: string): Promise<JsonObject> {
    const payload: Record<string, unknown> = { current_password: current };
    if (newPassword) payload["password"] = newPassword;
    const response = await this.transport.request("POST", "/change_password", {
      json: payload,
      sendCookies: true,
    });
    const newAuth = response["new_auth_token"];
    const newCt0 = response["new_ct0"];
    if (typeof newAuth === "string" && typeof newCt0 === "string" && newAuth && newCt0) {
      this.cookies.set(newAuth, newCt0);
    }
    return response;
  }
}
