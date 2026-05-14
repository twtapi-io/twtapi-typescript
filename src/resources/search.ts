/**
 * Search endpoint — `GET /search`.
 *
 * Exposed as a callable on the client: `client.search(query, ...)`. The
 * `iter` method returns an async iterator over result tweets.
 */

import { iterItems } from "../pagination.js";
import type { Transport } from "../transport.js";
import type { JsonObject, PaginationOptions } from "../types.js";

export type SearchProduct = "Top" | "Latest" | "People" | "Photos" | "Videos";

export interface SearchPageOptions {
  product?: SearchProduct;
  count?: number;
  cursor?: string;
}

export interface SearchIterOptions extends PaginationOptions {
  product?: SearchProduct;
}

export interface SearchCallable {
  (query: string, options?: SearchPageOptions): Promise<JsonObject>;
  iter(query: string, options?: SearchIterOptions): AsyncIterableIterator<JsonObject>;
}

export function createSearch(transport: Transport): SearchCallable {
  const search = ((query: string, options: SearchPageOptions = {}): Promise<JsonObject> => {
    return transport.request("GET", "/search", {
      params: {
        q: query,
        product: options.product,
        count: options.count,
        cursor: options.cursor,
      },
    });
  }) as SearchCallable;

  search.iter = (
    query: string,
    options: SearchIterOptions = {},
  ): AsyncIterableIterator<JsonObject> => {
    return iterItems<JsonObject>(
      (cursor) => search(query, { product: options.product, count: options.count, cursor }),
      { itemsField: "tweets", maxPages: options.maxPages, maxItems: options.maxItems },
    );
  };

  return search;
}
