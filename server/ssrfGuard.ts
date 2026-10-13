/**
 * SSRF protections for outbound fetches of user-supplied website URLs.
 */

import dns from "dns/promises";
import net from "net";
import { URL } from "url";

export class SsrfError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "SsrfError";
    this.status = status;
  }
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
  "instance-data",
]);

/** True if IPv4/IPv6 is private, loopback, link-local, CGNAT, or cloud metadata. */
export function isBlockedIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  if (!normalized) return true;

  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
  if (normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  // IPv4-mapped IPv6
  if (normalized.startsWith("::ffff:")) {
    return isBlockedIp(normalized.slice(7));
  }

  if (net.isIP(normalized) !== 4) {
    // Non-IPv4: block unspecified and unique-local already handled; allow global unicast cautiously
    if (normalized === "::" || normalized.startsWith("::")) return true;
    return false;
  }

  const parts = normalized.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];

  // 0.0.0.0/8, 127.0.0.0/8
  if (a === 0 || a === 127) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 link-local + AWS metadata 169.254.169.254
  if (a === 169 && b === 254) return true;
  // 100.64.0.0/10 CGNAT
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 192.0.0.0/24, 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 docs
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 51 || b === 18)) return true;
  if (a === 203 && b === 0) return true;
  // Multicast / reserved
  if (a >= 224) return true;

  return false;
}

export function normalizeWebsiteUrl(input: string): URL {
  let raw = (input || "").trim();
  if (!raw) throw new SsrfError("Website URL is required");
  // Reject explicit non-http(s) schemes before we normalize host-only inputs
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) && !/^https?:\/\//i.test(raw)) {
    throw new SsrfError("Only HTTP and HTTPS URLs are allowed");
  }
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError("Invalid website URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError("Only HTTP and HTTPS URLs are allowed");
  }
  if (url.username || url.password) {
    throw new SsrfError("URLs with credentials are not allowed");
  }
  const host = url.hostname.toLowerCase();
  if (!host || BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new SsrfError("That hostname is not allowed");
  }
  // Literal IP in hostname
  if (net.isIP(host) && isBlockedIp(host)) {
    throw new SsrfError("That IP address is not allowed");
  }
  return url;
}

export async function assertUrlSafeForFetch(url: URL): Promise<void> {
  const host = url.hostname;
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new SsrfError("That IP address is not allowed");
    return;
  }
  let records: string[];
  try {
    const result = await dns.lookup(host, { all: true, verbatim: true });
    records = result.map((r) => r.address);
  } catch {
    throw new SsrfError("Could not resolve website hostname", 422);
  }
  if (!records.length) throw new SsrfError("Could not resolve website hostname", 422);
  for (const addr of records) {
    if (isBlockedIp(addr)) {
      throw new SsrfError("Website resolves to a private or blocked address", 422);
    }
  }
}

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  acceptContentTypes?: string[];
  method?: "GET" | "HEAD";
};

const DEFAULT_ACCEPT = [
  "text/html",
  "text/css",
  "text/plain",
  "application/xhtml+xml",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];

/**
 * Fetch a URL with SSRF checks on the initial URL and every redirect hop.
 */
export async function safeFetch(
  inputUrl: string | URL,
  options: SafeFetchOptions = {},
): Promise<{ url: string; contentType: string; body: Buffer }> {
  const timeoutMs = options.timeoutMs ?? 12_000;
  const maxBytes = options.maxBytes ?? 2_000_000;
  const maxRedirects = options.maxRedirects ?? 5;
  const accept = options.acceptContentTypes ?? DEFAULT_ACCEPT;

  let current =
    typeof inputUrl === "string" ? normalizeWebsiteUrl(inputUrl) : new URL(inputUrl.toString());

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertUrlSafeForFetch(current);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(current.toString(), {
        method: options.method || "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "Inspect360BrandExtractor/1.0 (+https://inspect360.app)",
          Accept: accept.join(", "),
        },
      });
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name === "AbortError") throw new SsrfError("Website request timed out", 422);
      throw new SsrfError("Failed to reach website", 422);
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) throw new SsrfError("Redirect without Location header", 422);
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        throw new SsrfError("Invalid redirect URL", 422);
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        throw new SsrfError("Unsafe redirect protocol", 422);
      }
      current = normalizeWebsiteUrl(next.toString());
      continue;
    }

    if (!res.ok) {
      throw new SsrfError(`Website returned HTTP ${res.status}`, 422);
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase().split(";")[0]!.trim();
    if (contentType && !accept.some((a) => contentType.includes(a.split("/")[1]!) || contentType === a || contentType.startsWith(a))) {
      // Soft check: allow if any accept token substring matches
      const ok = accept.some((a) => contentType === a || contentType.startsWith(a.split(";")[0]!));
      if (!ok && contentType) {
        throw new SsrfError(`Unsupported content type: ${contentType}`, 422);
      }
    }

    const reader = res.body?.getReader();
    if (!reader) {
      const ab = await res.arrayBuffer();
      if (ab.byteLength > maxBytes) throw new SsrfError("Response too large", 422);
      return { url: current.toString(), contentType, body: Buffer.from(ab) };
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          throw new SsrfError("Response too large", 422);
        }
        chunks.push(value);
      }
    }
    return { url: current.toString(), contentType, body: Buffer.concat(chunks.map((c) => Buffer.from(c))) };
  }

  throw new SsrfError("Too many redirects", 422);
}
