/**
 * Run: npx tsx mobile/src/components/camera/multiPhotoSession.test.ts
 */
import assert from 'node:assert/strict';
import {
  appendStagedPhoto,
  canCaptureMore,
  confirmLabel,
  galleryCameraSessionMax,
  remainingFieldPhotoSlots,
  removeStagedPhoto,
  shouldIgnoreShutter,
  stagedUris,
  GALLERY_CAMERA_SESSION_MAX,
  SHUTTER_DEBOUNCE_MS,
} from './multiPhotoSession';
import { GALLERY_FIELD_PHOTO_MAX, GALLERY_UPLOAD_SELECT_MAX } from '../../../../shared/inspectionGallery';

assert.equal(remainingFieldPhotoSlots(0), GALLERY_FIELD_PHOTO_MAX);
assert.equal(remainingFieldPhotoSlots(3), GALLERY_FIELD_PHOTO_MAX - 3);
assert.equal(remainingFieldPhotoSlots(GALLERY_FIELD_PHOTO_MAX), 0);
assert.equal(remainingFieldPhotoSlots(GALLERY_FIELD_PHOTO_MAX + 5), 0);
assert.equal(remainingFieldPhotoSlots(-2), GALLERY_FIELD_PHOTO_MAX);

assert.equal(galleryCameraSessionMax(), Math.min(GALLERY_CAMERA_SESSION_MAX, GALLERY_UPLOAD_SELECT_MAX));

assert.equal(canCaptureMore(0, 5), true);
assert.equal(canCaptureMore(5, 5), false);
assert.equal(canCaptureMore(4, 5), true);

assert.equal(
  shouldIgnoreShutter({ capturing: true, lastShutterAt: 0, now: 10_000 }),
  true,
);
assert.equal(
  shouldIgnoreShutter({
    capturing: false,
    lastShutterAt: 1000,
    now: 1000 + SHUTTER_DEBOUNCE_MS - 1,
  }),
  true,
);
assert.equal(
  shouldIgnoreShutter({
    capturing: false,
    lastShutterAt: 1000,
    now: 1000 + SHUTTER_DEBOUNCE_MS + 1,
  }),
  false,
);

const a = { id: '1', uri: 'file://a.jpg' };
const b = { id: '2', uri: 'file://b.jpg' };
let staged = appendStagedPhoto([], a, 2);
assert.deepEqual(stagedUris(staged), ['file://a.jpg']);
staged = appendStagedPhoto(staged, b, 2);
assert.equal(staged.length, 2);
staged = appendStagedPhoto(staged, { id: '3', uri: 'file://c.jpg' }, 2);
assert.equal(staged.length, 2, 'cap should reject third');
staged = appendStagedPhoto(staged, a, 2);
assert.equal(staged.length, 2, 'duplicate id/uri rejected');
staged = removeStagedPhoto(staged, '1');
assert.deepEqual(stagedUris(staged), ['file://b.jpg']);

assert.equal(confirmLabel(0), 'Use Photos');
assert.equal(confirmLabel(1), 'Add 1 Photo');
assert.equal(confirmLabel(5), 'Add 5 Photos');

console.log('multiPhotoSession.test.ts: ok');
