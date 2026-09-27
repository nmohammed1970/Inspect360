import sharp from "sharp";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const heicConvert = require("heic-convert") as (opts: {
  buffer: Buffer;
  format: "JPEG" | "PNG";
  quality?: number;
}) => Promise<ArrayBuffer>;

const OPENAI_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

/** iPhone photos are often HEIC/HEIF (ISO BMFF with ftyp brand). */
export function isHeicOrHeifBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 12) return false;
  if (buffer.toString("ascii", 4, 8) !== "ftyp") return false;
  const brand = buffer.toString("ascii", 8, 12).toLowerCase();
  return (
    brand.startsWith("hei") ||
    brand.startsWith("hev") ||
    brand === "mif1" ||
    brand === "msf1"
  );
}

function detectSupportedMime(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    (buffer[3] === 0x38 || buffer[3] === 0x39)
  ) {
    return "image/gif";
  }
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  if (isHeicOrHeifBuffer(buffer)) return "image/heic";
  return null;
}

/**
 * Convert any common phone image (incl. iPhone HEIC) to a JPEG data URL
 * OpenAI vision accepts: png, jpeg, gif, webp.
 */
export async function toOpenAIImageDataUrl(photoBuffer: Buffer): Promise<string> {
  let working = photoBuffer;

  if (isHeicOrHeifBuffer(working)) {
    console.log("[toOpenAIImageDataUrl] Converting HEIC/HEIF → JPEG");
    const converted = await heicConvert({
      buffer: working,
      format: "JPEG",
      quality: 0.9,
    });
    working = Buffer.from(converted);
  }

  // Re-encode through sharp when possible (EXIF orient, guaranteed JPEG).
  try {
    const jpeg = await sharp(working).rotate().jpeg({ quality: 85 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch (sharpErr: any) {
    console.warn(
      "[toOpenAIImageDataUrl] sharp re-encode failed, using buffer as-is:",
      sharpErr?.message || sharpErr,
    );
  }

  const mime = detectSupportedMime(working);
  if (mime && OPENAI_IMAGE_MIMES.has(mime)) {
    return `data:${mime};base64,${working.toString("base64")}`;
  }

  return `data:image/jpeg;base64,${working.toString("base64")}`;
}
