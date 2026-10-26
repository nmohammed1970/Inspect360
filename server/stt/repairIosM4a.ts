/**
 * Newer iOS (17+/18) writes M4A with a `chnl` (channel layout) box version 1 that
 * older ffmpeg builds reject: Unsupported 'chnl' box with version 1.
 *
 * Renaming those atoms to `free` keeps container sizes valid and lets ffmpeg / Whisper read the file.
 */
export function repairIosM4aBuffer(input: Buffer): { buffer: Buffer; repaired: boolean } {
  if (!input?.length || input.length < 16) {
    return { buffer: input, repaired: false };
  }
  // Need ftyp (ISO BMFF) — skip non-MP4
  if (!(input[4] === 0x66 && input[5] === 0x74 && input[6] === 0x79 && input[7] === 0x70)) {
    return { buffer: input, repaired: false };
  }

  const out = Buffer.from(input);
  let repaired = false;

  for (let i = 0; i + 8 <= out.length; i++) {
    // type == 'chnl'
    if (
      out[i + 4] === 0x63 &&
      out[i + 5] === 0x68 &&
      out[i + 6] === 0x6e &&
      out[i + 7] === 0x6c
    ) {
      const size = out.readUInt32BE(i);
      // Channel-layout boxes are small; reject absurd sizes (avoid matching media payload).
      if (size >= 8 && size <= 256 && i + size <= out.length) {
        out.write("free", i + 4, 4, "ascii");
        repaired = true;
        i += size - 1;
      }
    }
  }

  return { buffer: out, repaired };
}
