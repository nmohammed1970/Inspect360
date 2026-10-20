/** Max distance (metres) between capture GPS and geocoded property address to count as a match. */
export const GALLERY_ADDRESS_MATCH_RADIUS_M = 150;

export type GalleryAddressMatchStatus = "matched" | "mismatched" | "unavailable";

export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function compareCaptureToProperty(
  captureLat: number | null | undefined,
  captureLng: number | null | undefined,
  propertyLat: number | null | undefined,
  propertyLng: number | null | undefined,
  radiusM: number = GALLERY_ADDRESS_MATCH_RADIUS_M,
): GalleryAddressMatchStatus {
  if (
    captureLat == null ||
    captureLng == null ||
    propertyLat == null ||
    propertyLng == null ||
    !Number.isFinite(captureLat) ||
    !Number.isFinite(captureLng) ||
    !Number.isFinite(propertyLat) ||
    !Number.isFinite(propertyLng)
  ) {
    return "unavailable";
  }
  const distance = haversineDistanceMeters(captureLat, captureLng, propertyLat, propertyLng);
  return distance <= radiusM ? "matched" : "mismatched";
}

export function galleryAddressMatchLabel(status: GalleryAddressMatchStatus | null | undefined): string {
  if (status === "matched") return "Address matched to property";
  if (status === "mismatched") return "Address mismatched to property";
  return "Address match unavailable";
}
