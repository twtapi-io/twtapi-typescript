/**
 * Engagement cookie state holder.
 *
 * Holds `authToken` + `ct0`, exposes them to every engagement call, and
 * auto-rotates `ct0` when the server returns a fresh value in the
 * `X-Twitter-New-Ct0` response header.
 */

export type Ct0RotatedCallback = (newCt0: string) => void;

export interface CookieInit {
  authToken?: string;
  ct0?: string;
  onCt0Rotated?: Ct0RotatedCallback;
}

export class CookieState {
  private _authToken: string | undefined;
  private _ct0: string | undefined;
  private _onRotated: Ct0RotatedCallback | undefined;

  constructor(init: CookieInit = {}) {
    this._authToken = init.authToken;
    this._ct0 = init.ct0;
    this._onRotated = init.onCt0Rotated;
  }

  get authToken(): string | undefined {
    return this._authToken;
  }

  get ct0(): string | undefined {
    return this._ct0;
  }

  set(authToken: string | undefined, ct0: string | undefined): void {
    this._authToken = authToken;
    this._ct0 = ct0;
  }

  setOnRotated(callback: Ct0RotatedCallback | undefined): void {
    this._onRotated = callback;
  }

  snapshot(): { authToken: string | undefined; ct0: string | undefined } {
    return { authToken: this._authToken, ct0: this._ct0 };
  }

  /**
   * Update ct0 in-place and fire the optional callback.
   * Returns true if the value actually changed.
   */
  rotateCt0(newCt0: string): boolean {
    if (!newCt0 || newCt0 === this._ct0) return false;
    this._ct0 = newCt0;
    const cb = this._onRotated;
    if (cb) {
      try {
        cb(newCt0);
      } catch {
        // User callback must not break the SDK.
      }
    }
    return true;
  }
}
