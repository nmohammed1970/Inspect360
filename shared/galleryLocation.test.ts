import assert from "node:assert/strict";
import {
  compareCaptureToProperty,
  galleryAddressMatchLabel,
  haversineDistanceMeters,
} from "./galleryLocation";

const near = haversineDistanceMeters(51.5074, -0.1278, 51.5075, -0.1279);
assert.ok(near < 50, `expected nearby points under 50m, got ${near}`);

assert.equal(
  compareCaptureToProperty(51.5074, -0.1278, 51.5074, -0.1278),
  "matched",
);
assert.equal(
  compareCaptureToProperty(51.5074, -0.1278, 51.52, -0.14),
  "mismatched",
);
assert.equal(compareCaptureToProperty(null, null, 51.5, -0.1), "unavailable");
assert.equal(galleryAddressMatchLabel("matched"), "Address matched to property");
assert.equal(galleryAddressMatchLabel("mismatched"), "Address mismatched to property");

console.log("galleryLocation.test.ts: ok");
