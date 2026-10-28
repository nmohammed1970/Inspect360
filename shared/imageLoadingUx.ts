/**
 * Shared image-loading UX constants for web + mobile.
 * Slow-load warning is informational — it must not abort the request.
 */

export const IMAGE_SLOW_LOAD_MS = 1500;

export const IMAGE_POOR_NETWORK_MESSAGE =
  "Poor network connection detected. Please wait while we load your images.";

export const IMAGE_LOAD_ERROR_MESSAGE = "Unable to load image.";

export const IMAGE_OFFLINE_MESSAGE =
  "This image is unavailable offline. Reconnect to load it.";

export type ImageLoadPhase =
  | "idle"
  | "loading"
  | "slow-loading"
  | "loaded"
  | "error"
  | "offline"
  | "retrying";

/** True when an HTMLImageElement (or compatible) is already decoded from cache. */
export function isImageAlreadyComplete(img: {
  complete?: boolean;
  naturalWidth?: number;
} | null | undefined): boolean {
  return !!(img && img.complete && (img.naturalWidth ?? 0) > 0);
}

/**
 * Whether the poor-network message should show given elapsed ms and phase.
 * Never shows for loaded/error/offline/idle.
 */
export function shouldShowPoorNetworkMessage(
  phase: ImageLoadPhase,
  elapsedMs: number,
  thresholdMs: number = IMAGE_SLOW_LOAD_MS,
): boolean {
  if (phase !== "loading" && phase !== "slow-loading" && phase !== "retrying") {
    return false;
  }
  return elapsedMs >= thresholdMs;
}
