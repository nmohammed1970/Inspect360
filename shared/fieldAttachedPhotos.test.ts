/**
 * Run: npx tsx shared/fieldAttachedPhotos.test.ts
 */
import assert from "node:assert/strict";
import {
  fieldAllowsMultiplePhotos,
  fieldCanConfigureAttachedPhotos,
} from "./fieldAttachedPhotos";

assert.equal(fieldAllowsMultiplePhotos(undefined), false);
assert.equal(fieldAllowsMultiplePhotos(null), false);
assert.equal(fieldAllowsMultiplePhotos({}), false);
assert.equal(fieldAllowsMultiplePhotos({ type: "boolean" }), false);
assert.equal(
  fieldAllowsMultiplePhotos({ type: "boolean", allowMultiplePhotos: false }),
  false,
);
assert.equal(
  fieldAllowsMultiplePhotos({ type: "boolean", allowMultiplePhotos: true }),
  true,
);
assert.equal(
  fieldAllowsMultiplePhotos({ type: "select", allowMultiplePhotos: true }),
  true,
);
assert.equal(
  fieldAllowsMultiplePhotos({ type: "photo", allowMultiplePhotos: true }),
  false,
);
assert.equal(
  fieldAllowsMultiplePhotos({ type: "photo_array", allowMultiplePhotos: true }),
  false,
);
assert.equal(
  fieldAllowsMultiplePhotos({ type: "video", allowMultiplePhotos: true }),
  false,
);

assert.equal(fieldCanConfigureAttachedPhotos({ type: "boolean" }), true);
assert.equal(fieldCanConfigureAttachedPhotos({ type: "photo" }), false);
assert.equal(fieldCanConfigureAttachedPhotos({ type: "photo_array" }), false);
assert.equal(fieldCanConfigureAttachedPhotos({ type: "video" }), false);

console.log("fieldAttachedPhotos.test.ts: ok");
