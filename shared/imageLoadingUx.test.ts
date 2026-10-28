/**
 * Run: npx tsx shared/imageLoadingUx.test.ts
 */
import assert from "node:assert/strict";
import {
  IMAGE_POOR_NETWORK_MESSAGE,
  IMAGE_SLOW_LOAD_MS,
  isImageAlreadyComplete,
  shouldShowPoorNetworkMessage,
} from "./imageLoadingUx";

assert.equal(IMAGE_SLOW_LOAD_MS, 1500);
assert.equal(
  IMAGE_POOR_NETWORK_MESSAGE,
  "Poor network connection detected. Please wait while we load your images.",
);

assert.equal(isImageAlreadyComplete(null), false);
assert.equal(isImageAlreadyComplete({ complete: true, naturalWidth: 0 }), false);
assert.equal(isImageAlreadyComplete({ complete: true, naturalWidth: 120 }), true);
assert.equal(isImageAlreadyComplete({ complete: false, naturalWidth: 120 }), false);

assert.equal(shouldShowPoorNetworkMessage("loading", 0), false);
assert.equal(shouldShowPoorNetworkMessage("loading", 1499), false);
assert.equal(shouldShowPoorNetworkMessage("loading", 1500), true);
assert.equal(shouldShowPoorNetworkMessage("slow-loading", 2000), true);
assert.equal(shouldShowPoorNetworkMessage("retrying", 2000), true);
assert.equal(shouldShowPoorNetworkMessage("loaded", 5000), false);
assert.equal(shouldShowPoorNetworkMessage("error", 5000), false);
assert.equal(shouldShowPoorNetworkMessage("offline", 5000), false);
assert.equal(shouldShowPoorNetworkMessage("idle", 5000), false);

console.log("imageLoadingUx.test.ts: ok");
