/**
 * Run: npx tsx server/stt/repairIosM4a.test.ts
 */
import assert from "node:assert/strict";
import { repairIosM4aBuffer } from "./repairIosM4a";

// Minimal fake ftyp + moov-ish payload containing a chnl box
const ftyp = Buffer.alloc(16);
ftyp.writeUInt32BE(16, 0);
ftyp.write("ftyp", 4);
ftyp.write("M4A ", 8);

const chnl = Buffer.alloc(20);
chnl.writeUInt32BE(20, 0);
chnl.write("chnl", 4);
chnl.writeUInt32BE(0x01000000, 8); // version 1

const input = Buffer.concat([ftyp, chnl, Buffer.from("tail-data-xxxx")]);
const { buffer, repaired } = repairIosM4aBuffer(input);
assert.equal(repaired, true);
assert.equal(buffer.slice(20, 24).toString("ascii"), "free");
assert.equal(buffer.length, input.length);

const nonMp4 = Buffer.from("OggS..............");
const skip = repairIosM4aBuffer(nonMp4);
assert.equal(skip.repaired, false);

console.log("repairIosM4a.test.ts: ok");
