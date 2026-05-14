/**
 * Community lookup, membership checks, and join / leave actions.
 *
 * Every community endpoint is viewer-scoped — it reflects the caller's
 * relationship with the community, not a global truth. `info`,
 * `checkMember`, and the three write actions require engagement cookies;
 * `members` does not.
 *
 * `members` paginates with `next_cursor` (not `cursor_bottom`) and returns
 * members grouped by role under `members_by_role` (e.g. `Admin`, `Member`).
 * The `membersIter` helper flattens this into a single stream of users,
 * each annotated with a `role` field reflecting which bucket it came from.
 */

import { iterPages } from "../pagination.js";
import type { Transport } from "../transport.js";
import type { JsonObject } from "../types.js";

export interface MembersIterOptions {
  maxPages?: number;
  maxItems?: number;
}

export interface RequestJoinOptions {
  /** Optional free-text answer to the community's join question. */
  answer?: string;
}

export class Communities {
  constructor(private readonly transport: Transport) {}

  // -------------------------------------------------------------- reads

  /**
   * Viewer-scoped community info. `GET /community_info`. Requires cookies.
   */
  info(communityId: string): Promise<JsonObject> {
    return this.transport.request("GET", "/community_info", {
      params: { community_id: communityId },
      sendCookies: true,
    });
  }

  /**
   * Tight wrapper around `info` — just the membership-state fields.
   * `GET /community_check_member`. Requires cookies.
   */
  checkMember(communityId: string): Promise<JsonObject> {
    return this.transport.request("GET", "/community_check_member", {
      params: { community_id: communityId },
      sendCookies: true,
    });
  }

  /**
   * One page of community members. `GET /community_members`.
   *
   * Pagination uses `next_cursor`, not `cursor_bottom`. The page payload
   * is `{ count, members_by_role: { Admin: [...], Member: [...] }, next_cursor }`.
   */
  members(communityId: string, options: { cursor?: string } = {}): Promise<JsonObject> {
    return this.transport.request("GET", "/community_members", {
      params: { community_id: communityId, cursor: options.cursor },
    });
  }

  /**
   * Flat stream of members across all pages and roles.
   *
   * Each yielded user dict carries an extra `role` key (e.g. `Admin`,
   * `Member`) reflecting which bucket of `members_by_role` it came from.
   */
  async *membersIter(
    communityId: string,
    options: MembersIterOptions = {},
  ): AsyncIterableIterator<JsonObject> {
    let yielded = 0;
    const { maxPages, maxItems } = options;
    for await (const page of iterPages((cursor) => this.members(communityId, { cursor }), {
      cursorField: "next_cursor",
      maxPages,
    })) {
      for (const user of flattenMembers(page)) {
        yield user;
        yielded += 1;
        if (maxItems !== undefined && yielded >= maxItems) return;
      }
    }
  }

  // ------------------------------------------------------------- writes

  /**
   * Join a community. `POST /community_join`. Idempotent.
   *
   * For approval-gated communities the server returns HTTP 409, which the
   * SDK surfaces as a `TwtAPIError` — branch to `requestJoin` then.
   */
  join(communityId: string): Promise<JsonObject> {
    return this.transport.request("POST", "/community_join", {
      json: { community_id: communityId },
      sendCookies: true,
    });
  }

  /**
   * Leave a community. `POST /community_leave`. Idempotent.
   */
  leave(communityId: string): Promise<JsonObject> {
    return this.transport.request("POST", "/community_leave", {
      json: { community_id: communityId },
      sendCookies: true,
    });
  }

  /**
   * Submit a pending join request to an approval-gated community.
   * `POST /community_request_join`.
   */
  requestJoin(communityId: string, options: RequestJoinOptions = {}): Promise<JsonObject> {
    const payload: Record<string, unknown> = { community_id: communityId };
    if (options.answer !== undefined) payload["answer"] = options.answer;
    return this.transport.request("POST", "/community_request_join", {
      json: payload,
      sendCookies: true,
    });
  }
}

function* flattenMembers(page: Record<string, unknown>): IterableIterator<JsonObject> {
  const byRole = page["members_by_role"];
  if (!isPlainObject(byRole)) return;
  for (const [role, users] of Object.entries(byRole)) {
    if (!Array.isArray(users)) continue;
    for (const user of users) {
      if (isPlainObject(user)) yield { ...user, role };
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
