import { createHash } from "crypto";

export const FEEDBACK_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const FEEDBACK_MAX_IMAGES = 3;
export const FEEDBACK_ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function validateFeedbackImage(buf: Buffer, declaredMime?: string | null): {
  ok: true;
  mime: string;
} | {
  ok: false;
  message: string;
} {
  if (!buf?.length) return { ok: false, message: "Empty file" };
  if (buf.length > FEEDBACK_MAX_IMAGE_BYTES) {
    return { ok: false, message: "Image must be 10 MB or smaller" };
  }
  const sniffed = sniffMime(buf);
  if (!sniffed || !FEEDBACK_ALLOWED_MIMES.has(sniffed)) {
    return { ok: false, message: "Only PNG, JPEG and WebP images are allowed" };
  }
  if (declaredMime && declaredMime !== sniffed && !declaredMime.startsWith(sniffed.split("/")[0]!)) {
    // Allow browser quirks (e.g. image/jpg) if sniff matches jpeg
    if (!(declaredMime === "image/jpg" && sniffed === "image/jpeg")) {
      // Still accept if sniffed is valid — trust magic bytes
    }
  }
  return { ok: true, mime: sniffed };
}

/** Object id only — ObjectStorageService.saveUploadedFile appends the mime extension. */
export function feedbackStorageObjectName(_originalFilename?: string | null): string {
  const hash = createHash("sha256").update(`${Date.now()}-${Math.random()}`).digest("hex").slice(0, 24);
  return `feedback-${hash}`;
}
