/**
 * Geocode a free-text address via Google Geocoding API.
 * Uses GOOGLE_MAPS_API_KEY (same key as the portal maps).
 */

type GeocodeResult = { lat: number; lng: number } | null;

const cache = new Map<string, GeocodeResult>();

export async function geocodeAddress(address: string | null | undefined): Promise<GeocodeResult> {
  const trimmed = (address || "").trim();
  if (!trimmed) return null;

  const cacheKey = trimmed.toLowerCase();
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("[geocodeAddress] GOOGLE_MAPS_API_KEY not set — cannot match gallery GPS to property");
    cache.set(cacheKey, null);
    return null;
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", trimmed);
    url.searchParams.set("key", apiKey);
    const res = await fetch(url.toString());
    if (!res.ok) {
      cache.set(cacheKey, null);
      return null;
    }
    const data = (await res.json()) as {
      status?: string;
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
    };
    if (data.status !== "OK" || !data.results?.[0]?.geometry?.location) {
      cache.set(cacheKey, null);
      return null;
    }
    const loc = data.results[0].geometry.location;
    const lat = Number(loc.lat);
    const lng = Number(loc.lng);
    const result =
      Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    cache.set(cacheKey, result);
    return result;
  } catch (e) {
    console.warn("[geocodeAddress] failed:", e);
    cache.set(cacheKey, null);
    return null;
  }
}
