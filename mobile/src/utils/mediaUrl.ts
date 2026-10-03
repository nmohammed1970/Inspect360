import { getAPI_URL } from '../services/api';

/**
 * Turn stored media paths into absolute URIs the RN Image component can load.
 * Handles /objects/..., relative paths, and localhost URLs from web uploads.
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const apiBase = getAPI_URL().replace(/\/$/, '');

  if (trimmed.includes('localhost') || trimmed.includes('127.0.0.1')) {
    try {
      const parsed = new URL(trimmed);
      return `${apiBase}${parsed.pathname}${parsed.search}`;
    } catch {
      const match = trimmed.match(/(localhost|127\.0\.0\.1)[:\d]*(\/.*)/);
      if (match?.[2]) return `${apiBase}${match[2]}`;
    }
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const source = new URL(trimmed);
      const api = new URL(apiBase);
      if (source.pathname.startsWith('/objects/') && source.host !== api.host) {
        return `${api.origin}${source.pathname}${source.search}`;
      }
    } catch {
      // keep original
    }
    return trimmed;
  }

  if (trimmed.startsWith('/')) {
    return `${apiBase}${trimmed}`;
  }

  if (trimmed.startsWith('objects/')) {
    return `${apiBase}/${trimmed}`;
  }

  return `${apiBase}/${trimmed}`;
}
