/**
 * Cursor-based pagination helpers.
 *
 * Most read endpoints return:
 *
 *     { count, cursor_top?, cursor_bottom, <itemsField>: T[] }
 *
 * `iterPages` walks pages by calling a fetcher with the cursor; `iterItems`
 * flattens them into individual items. Both honour `maxPages` and `maxItems`
 * caps so callers can bound long walks.
 *
 * `/community_members` uses `next_cursor` instead of `cursor_bottom` — pass
 * `cursorField: "next_cursor"` there.
 */

export type PageFetcher = (cursor: string | undefined) => Promise<Record<string, unknown>>;

export interface IterOptions {
  cursorField?: string;
  maxPages?: number;
  maxItems?: number;
}

export interface ItemIterOptions extends IterOptions {
  itemsField: string;
}

export async function* iterPages(
  fetch: PageFetcher,
  options: IterOptions = {},
): AsyncIterableIterator<Record<string, unknown>> {
  const cursorField = options.cursorField ?? "cursor_bottom";
  const maxPages = options.maxPages;
  let cursor: string | undefined;
  let seen = 0;
  while (true) {
    const page = await fetch(cursor);
    yield page;
    seen += 1;
    if (maxPages !== undefined && seen >= maxPages) return;
    const next = page[cursorField];
    if (typeof next !== "string" || next.length === 0 || next === cursor) return;
    cursor = next;
  }
}

export async function* iterItems<T = unknown>(
  fetch: PageFetcher,
  options: ItemIterOptions,
): AsyncIterableIterator<T> {
  const { itemsField, maxItems } = options;
  let yielded = 0;
  for await (const page of iterPages(fetch, options)) {
    const raw = page[itemsField];
    if (!Array.isArray(raw)) continue;
    for (const item of raw) {
      yield item as T;
      yielded += 1;
      if (maxItems !== undefined && yielded >= maxItems) return;
    }
  }
}
