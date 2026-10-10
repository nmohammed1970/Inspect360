import type { PagedResponse } from "./types";
import { getAccessTokenForOrg } from "./auth";
import { nextPageNumber } from "./pagination";

const API_URL = () => (process.env.REAPIT_API_URL || "https://platform.reapit.cloud").replace(/\/$/, "");

export class ReapitApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public retryable = false,
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ReapitApiError";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function reapitGet<T>(
  organizationId: string,
  path: string,
  query?: Record<string, string | number | undefined>,
  attempt = 1,
): Promise<T> {
  const { accessToken, customerId } = await getAccessTokenForOrg(organizationId);
  const url = new URL(`${API_URL()}${path.startsWith("/") ? path : `/${path}`}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "reapit-customer": customerId,
      "api-version": "2020-01-31",
      Accept: "application/json",
    },
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) throw new ReapitApiError(`Reapit ${res.status}`, res.status, true);
    const retryAfter = Number(res.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** (attempt - 1);
    await sleep(Math.min(delay, 30000));
    return reapitGet<T>(organizationId, path, query, attempt + 1);
  }
  if (res.status === 404) throw new ReapitApiError("Not found", 404, false);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ReapitApiError(`Reapit ${res.status}: ${body.slice(0, 180)}`, res.status, false);
  }
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

export async function* paginate<T>(
  organizationId: string,
  path: string,
  extraQuery: Record<string, string | number | undefined> = {},
): AsyncGenerator<T> {
  let pageNumber = 1;
  const pageSize = 100;
  while (true) {
    const page = await reapitGet<PagedResponse<T>>(organizationId, path, {
      ...extraQuery,
      pageNumber,
      pageSize,
    });
    const items = page._embedded || [];
    for (const item of items) yield item;
    const next = nextPageNumber(pageNumber, pageSize, items.length, page.totalPageCount ?? page.pageCount);
    if (next == null) break;
    pageNumber = next;
  }
}

export async function getSigningPublicKey(keyId: string): Promise<string> {
  const url = `${API_URL()}/webhooks/signing/${encodeURIComponent(keyId)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new ReapitApiError(`Signing key ${res.status}`, res.status, res.status >= 500);
  const json = await res.json();
  return json.publicKey || json.key || json;
}
