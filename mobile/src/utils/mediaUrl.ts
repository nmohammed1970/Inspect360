import { getAPI_URL } from '../services/api';

/**
 * Map stored `/objects/...` paths to the authenticated API content route.
 * Direct `/objects/*` often fails on physical devices ("Could not connect")
 * while `/api/*` works — keep previews on the API prefix.
 */
export function toAuthenticatedObjectContentUrl(objectPathOrUrl: string, apiBase: string): string {
  const base = apiBase.replace(/\/$/, '');
  let pathname = objectPathOrUrl.trim();
  try {
    if (pathname.startsWith('http://') || pathname.startsWith('https://')) {
      pathname = new URL(pathname).pathname;
    }
  } catch {
    /* keep raw */
  }
  const match = pathname.match(/\/objects\/(.+)$/);
  const id = match?.[1] || pathname.replace(/^\/+/, '').replace(/^objects\//, '');
  return `${base}/api/objects/content/${id}`;
}

/**
 * Turn stored media paths into absolute URIs the RN Image component can load.
 * Handles /objects/..., relative paths, and localhost URLs from web uploads.
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Local offline files — use as-is (do not rewrite to API)
  if (
    trimmed.startsWith('file://') ||
    trimmed.startsWith('content://') ||
    trimmed.includes('offline_images')
  ) {
    if (trimmed.startsWith('/') && !trimmed.startsWith('file://')) {
      return `file://${trimmed}`;
    }
    return trimmed;
  }

  const apiBase = getAPI_URL().replace(/\/$/, '');

  if (trimmed.includes('localhost') || trimmed.includes('127.0.0.1')) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.pathname.startsWith('/objects/')) {
        return toAuthenticatedObjectContentUrl(parsed.pathname, apiBase);
      }
      return `${apiBase}${parsed.pathname}${parsed.search}`;
    } catch {
      const match = trimmed.match(/(localhost|127\.0\.0\.1)[:\d]*(\/.*)/);
      if (match?.[2]) {
        if (match[2].startsWith('/objects/')) {
          return toAuthenticatedObjectContentUrl(match[2], apiBase);
        }
        return `${apiBase}${match[2]}`;
      }
    }
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const source = new URL(trimmed);
      if (source.pathname.startsWith('/objects/')) {
        return toAuthenticatedObjectContentUrl(source.pathname, apiBase);
      }
    } catch {
      // keep original
    }
    return trimmed;
  }

  if (trimmed.startsWith('/objects/') || trimmed.startsWith('objects/')) {
    return toAuthenticatedObjectContentUrl(trimmed, apiBase);
  }

  if (trimmed.startsWith('/')) {
    return `${apiBase}${trimmed}`;
  }

  return `${apiBase}/${trimmed}`;
}
