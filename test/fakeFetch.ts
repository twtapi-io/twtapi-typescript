/**
 * Minimal in-process fake fetch for tests.
 *
 * Sidesteps any reliance on MSW / interceptors / global fetch patching —
 * `Transport` already accepts `fetchImpl` so we just pass a stub directly.
 * That keeps the tests fast, deterministic, and runtime-agnostic.
 */

export interface RecordedCall {
  url: string;
  method: string;
  headers: Headers;
  body: string | null;
}

export interface FakeFetchResult {
  fetch: typeof fetch;
  calls: RecordedCall[];
}

export type Responder = (call: RecordedCall) => Response | Promise<Response>;

export function createFakeFetch(responder: Responder): FakeFetchResult {
  const calls: RecordedCall[] = [];
  const impl: typeof fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? init.body : null;
    const call: RecordedCall = { url, method, headers, body };
    calls.push(call);
    return await responder(call);
  };
  return { fetch: impl, calls };
}

export function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const headers = new Headers({ "Content-Type": "application/json", ...(init.headers ?? {}) });
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}
