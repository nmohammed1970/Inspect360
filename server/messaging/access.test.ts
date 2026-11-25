import assert from "node:assert/strict";
import { buildDirectKey, httpError, MessagingHttpError } from "./errors";

assert.equal(buildDirectKey(["b", "a"]), "a:b");
assert.equal(buildDirectKey(["a", "a", "b"]), "a:b");
assert.equal(buildDirectKey(["z"]), "z");

const err = httpError("Forbidden", 403);
assert.ok(err instanceof MessagingHttpError);
assert.equal(err.status, 403);
assert.equal(err.message, "Forbidden");

console.log("messaging access tests passed");
