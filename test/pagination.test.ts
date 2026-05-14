import { describe, expect, it, vi } from "vitest";
import { iterItems, iterPages } from "../src/pagination.js";

describe("iterPages", () => {
  it("walks until the cursor is empty", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ items: [1, 2], cursor_bottom: "c1" })
      .mockResolvedValueOnce({ items: [3, 4], cursor_bottom: "c2" })
      .mockResolvedValueOnce({ items: [5], cursor_bottom: "" });
    const pages: Record<string, unknown>[] = [];
    for await (const p of iterPages(fetch)) pages.push(p);
    expect(pages.length).toBe(3);
    expect(fetch).toHaveBeenNthCalledWith(1, undefined);
    expect(fetch).toHaveBeenNthCalledWith(2, "c1");
    expect(fetch).toHaveBeenNthCalledWith(3, "c2");
  });

  it("respects maxPages", async () => {
    const fetch = vi.fn().mockResolvedValue({ items: [1], cursor_bottom: "more" });
    const pages: Record<string, unknown>[] = [];
    for await (const p of iterPages(fetch, { maxPages: 2 })) pages.push(p);
    expect(pages.length).toBe(2);
  });

  it("supports custom cursor field (community_members → next_cursor)", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ items: [1], next_cursor: "n1" })
      .mockResolvedValueOnce({ items: [2], next_cursor: "" });
    const pages: Record<string, unknown>[] = [];
    for await (const p of iterPages(fetch, { cursorField: "next_cursor" })) pages.push(p);
    expect(pages.length).toBe(2);
  });

  it("stops if the cursor is missing entirely", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ items: [1] });
    const pages: Record<string, unknown>[] = [];
    for await (const p of iterPages(fetch)) pages.push(p);
    expect(pages.length).toBe(1);
  });
});

describe("iterItems", () => {
  it("flattens items across pages", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ items: [1, 2], cursor_bottom: "c1" })
      .mockResolvedValueOnce({ items: [3, 4], cursor_bottom: "" });
    const got: number[] = [];
    for await (const x of iterItems<number>(fetch, { itemsField: "items" })) got.push(x);
    expect(got).toEqual([1, 2, 3, 4]);
  });

  it("respects maxItems mid-page", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ items: [1, 2, 3], cursor_bottom: "c1" })
      .mockResolvedValueOnce({ items: [4, 5], cursor_bottom: "" });
    const got: number[] = [];
    for await (const x of iterItems<number>(fetch, { itemsField: "items", maxItems: 4 })) {
      got.push(x);
    }
    expect(got).toEqual([1, 2, 3, 4]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
