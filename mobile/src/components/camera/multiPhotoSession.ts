/**
 * Pure helpers for multi-photo camera sessions (no React / native deps).
 */

import { GALLERY_FIELD_PHOTO_MAX, GALLERY_UPLOAD_SELECT_MAX } from '../../../../shared/inspectionGallery';

/** Soft cap for one in-app camera session (gallery). Library pick may still use GALLERY_UPLOAD_SELECT_MAX. */
export const GALLERY_CAMERA_SESSION_MAX = 50;

/** Minimum ms between shutter presses to avoid double-capture. */
export const SHUTTER_DEBOUNCE_MS = 650;

export type StagedPhoto = {
  id: string;
  uri: string;
};

export function remainingFieldPhotoSlots(currentPhotoCount: number): number {
  const n = Number.isFinite(currentPhotoCount) ? Math.max(0, Math.floor(currentPhotoCount)) : 0;
  return Math.max(0, GALLERY_FIELD_PHOTO_MAX - n);
}

export function galleryCameraSessionMax(): number {
  return Math.min(GALLERY_CAMERA_SESSION_MAX, GALLERY_UPLOAD_SELECT_MAX);
}

export function canCaptureMore(stagedCount: number, maxPhotos: number): boolean {
  const max = Math.max(0, Math.floor(maxPhotos));
  const staged = Math.max(0, Math.floor(stagedCount));
  return staged < max;
}

export function shouldIgnoreShutter(opts: {
  capturing: boolean;
  lastShutterAt: number;
  now: number;
  debounceMs?: number;
}): boolean {
  if (opts.capturing) return true;
  const debounce = opts.debounceMs ?? SHUTTER_DEBOUNCE_MS;
  return opts.now - opts.lastShutterAt < debounce;
}

export function appendStagedPhoto(
  staged: StagedPhoto[],
  photo: StagedPhoto,
  maxPhotos: number,
): StagedPhoto[] {
  if (!canCaptureMore(staged.length, maxPhotos)) return staged;
  if (staged.some((p) => p.id === photo.id || p.uri === photo.uri)) return staged;
  return [...staged, photo];
}

export function removeStagedPhoto(staged: StagedPhoto[], id: string): StagedPhoto[] {
  return staged.filter((p) => p.id !== id);
}

export function stagedUris(staged: StagedPhoto[]): string[] {
  return staged.map((p) => p.uri);
}

export function confirmLabel(count: number): string {
  if (count <= 0) return 'Use Photos';
  if (count === 1) return 'Add 1 Photo';
  return `Add ${count} Photos`;
}

export function newStagedId(): string {
  return `cap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
