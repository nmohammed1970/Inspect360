/**
 * Run: npx tsx server/ssrfGuard.test.ts
 */
import assert from "node:assert/strict";
import { isBlockedIp, normalizeWebsiteUrl, SsrfError } from "./ssrfGuard";

assert.equal(isBlockedIp("127.0.0.1"), true);
assert.equal(isBlockedIp("10.0.0.5"), true);
assert.equal(isBlockedIp("192.168.1.1"), true);
assert.equal(isBlockedIp("169.254.169.254"), true);
assert.equal(isBlockedIp("8.8.8.8"), false);
assert.equal(isBlockedIp("::1"), true);

assert.throws(() => normalizeWebsiteUrl("file:///etc/passwd"), (e: any) => e instanceof SsrfError);
assert.throws(() => normalizeWebsiteUrl("http://localhost/"), (e: any) => e instanceof SsrfError);
assert.throws(() => normalizeWebsiteUrl("http://127.0.0.1/"), (e: any) => e instanceof SsrfError);

const u = normalizeWebsiteUrl("example.com");
assert.equal(u.protocol, "https:");
assert.equal(u.hostname, "example.com");

console.log("ssrfGuard.test.ts: all assertions passed");
