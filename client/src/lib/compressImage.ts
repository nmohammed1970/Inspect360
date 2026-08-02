/** Target size for uploaded images after client-side compression. */
export const IMAGE_UPLOAD_TARGET_BYTES = 2 * 1024 * 1024; // ~2MB

/** Soft ceiling for non-image documents (PDFs, etc.). Images are not size-rejected. */
export const NON_IMAGE_MAX_BYTES = 100 * 1024 * 1024; // 100MB

const SKIP_COMPRESS_UNDER_BYTES = 200 * 1024; // already small JPEGs

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(file.name);
}

/**
 * Re-encode an image via canvas (JPEG). Maintains aspect ratio within max dimensions.
 */
export function compressImage(
  file: File,
  maxWidth = 1920,
  maxHeight = 1920,
  quality = 0.72,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to compress image"));
              return;
            }
            const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
            resolve(
              new File([blob], `${baseName}.jpg`, {
                type: "image/jpeg",
                lastModified: Date.now(),
              }),
            );
          },
          "image/jpeg",
          quality,
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Prepare any selected/captured image for upload: always compress large photos,
 * lightly compress mid-size ones, skip tiny JPEGs. Non-images are returned unchanged.
 * On failure, returns the original file so upload can still proceed.
 */
export async function prepareImageForUpload(
  file: File,
  targetBytes: number = IMAGE_UPLOAD_TARGET_BYTES,
): Promise<File> {
  if (!isImageFile(file)) return file;

  if (file.size <= SKIP_COMPRESS_UNDER_BYTES && file.type === "image/jpeg") {
    return file;
  }

  const originalSize = file.size;
  try {
    let result = await compressImage(file, 1920, 1920, 0.72);
    let quality = 0.62;
    let maxDim = 1600;

    for (let attempt = 0; attempt < 6 && result.size > targetBytes; attempt++) {
      result = await compressImage(result, maxDim, maxDim, quality);
      quality = Math.max(0.35, quality - 0.08);
      maxDim = Math.max(1024, Math.floor(maxDim * 0.85));
    }

    if (typeof console !== "undefined" && originalSize !== result.size) {
      console.log(
        `[compressImage] ${file.name}: ${(originalSize / 1048576).toFixed(2)}MB → ${(result.size / 1048576).toFixed(2)}MB`,
      );
    }
    return result;
  } catch (err) {
    console.warn("[compressImage] Compression failed, using original:", err);
    return file;
  }
}

/** @deprecated Prefer prepareImageForUpload — kept for call-site compatibility. */
export async function compressImageIfOverLimit(
  file: File,
  maxBytes: number = IMAGE_UPLOAD_TARGET_BYTES,
): Promise<File> {
  if (!isImageFile(file) || file.size <= maxBytes) return file;
  return prepareImageForUpload(file, maxBytes);
}
