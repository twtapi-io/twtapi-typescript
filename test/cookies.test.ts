import { describe, expect, it, vi } from "vitest";
import { CookieState } from "../src/cookies.js";

describe("CookieState", () => {
  it("stores and exposes auth_token + ct0", () => {
    const c = new CookieState({ authToken: "a", ct0: "b" });
    expect(c.authToken).toBe("a");
    expect(c.ct0).toBe("b");
  });

  it("rotateCt0 updates the value and returns true on change", () => {
    const c = new CookieState({ ct0: "old" });
    expect(c.rotateCt0("new")).toBe(true);
    expect(c.ct0).toBe("new");
  });

  it("rotateCt0 returns false when value is unchanged", () => {
    const c = new CookieState({ ct0: "same" });
    expect(c.rotateCt0("same")).toBe(false);
  });

  it("rotateCt0 fires the registered callback", () => {
    const cb = vi.fn();
    const c = new CookieState({ ct0: "old", onCt0Rotated: cb });
    c.rotateCt0("fresh");
    expect(cb).toHaveBeenCalledWith("fresh");
  });

  it("does not break the SDK if the user callback throws", () => {
    const c = new CookieState({
      ct0: "old",
      onCt0Rotated: () => {
        throw new Error("user code blew up");
      },
    });
    expect(() => c.rotateCt0("fresh")).not.toThrow();
    expect(c.ct0).toBe("fresh");
  });

  it("setOnRotated swaps the callback", () => {
    const c = new CookieState();
    const cb = vi.fn();
    c.setOnRotated(cb);
    c.set("a", "b");
    c.rotateCt0("c");
    expect(cb).toHaveBeenCalledWith("c");
  });

  it("snapshot returns both values", () => {
    const c = new CookieState({ authToken: "a", ct0: "b" });
    expect(c.snapshot()).toEqual({ authToken: "a", ct0: "b" });
  });
});
