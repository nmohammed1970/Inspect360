import { prepareImageForUpload, isImageFile } from "@/lib/compressImage";
import { extractFileUrlFromUploadResponse } from "@/lib/utils";
import { isAllowedGalleryMime, normalizeObjectUrl } from "@shared/inspectionGallery";
import type { UploadJob } from "./types";

export async function uploadOneGalleryFile(file: File): Promise<{
  objectUrl: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
}> {
  if (!isImageFile(file) && !isAllowedGalleryMime(file.type)) {
    throw new Error(`${file.name} is not a supported image format.`);
  }

  const prepared = await prepareImageForUpload(file);
  const paramsRes = await fetch("/api/objects/upload", {
    method: "POST",
    credentials: "include",
  });
  if (!paramsRes.ok) throw new Error("Failed to get upload URL");
  const { uploadURL } = await paramsRes.json();

  const putRes = await fetch(uploadURL, {
    method: "PUT",
    body: prepared,
    headers: {
      "Content-Type": prepared.type || "application/octet-stream",
    },
    credentials: "include",
  });
  if (!putRes.ok) throw new Error(`Upload failed for ${file.name}`);

  let objectUrl: string | null = null;
  try {
    const json = await putRes.json();
    objectUrl = extractFileUrlFromUploadResponse({ uploadURL, name: prepared.name }, json);
  } catch {
    objectUrl = normalizeObjectUrl(uploadURL);
  }
  objectUrl = normalizeObjectUrl(objectUrl);
  if (!objectUrl) throw new Error(`Could not resolve URL for ${file.name}`);

  try {
    // Server expects `photoUrl` (same contract as FieldWidget).
    const photoUrl = objectUrl.startsWith("http")
      ? objectUrl
      : `${window.location.origin}${objectUrl.startsWith("/") ? "" : "/"}${objectUrl}`;
    await fetch("/api/objects/set-acl", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoUrl }),
    });
  } catch {
    /* ACL optional */
  }

  return {
    objectUrl,
    fileName: prepared.name || file.name,
    mimeType: prepared.type || file.type || "image/jpeg",
    byteSize: prepared.size || file.size,
  };
}

export async function runGalleryUploads(
  files: File[],
  onProgress: (jobs: UploadJob[]) => void,
): Promise<{
  jobs: UploadJob[];
  successful: Array<{ objectUrl: string; fileName: string; mimeType: string; byteSize: number }>;
}> {
  const jobs: UploadJob[] = files.map((f, i) => ({
    id: `${Date.now()}-${i}-${f.name}`,
    fileName: f.name,
    status: "pending",
  }));
  onProgress([...jobs]);

  const successful: Array<{
    objectUrl: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
  }> = [];

  for (let i = 0; i < files.length; i++) {
    jobs[i] = { ...jobs[i], status: "uploading" };
    onProgress([...jobs]);
    try {
      const uploaded = await uploadOneGalleryFile(files[i]);
      jobs[i] = { ...jobs[i], status: "done", objectUrl: uploaded.objectUrl };
      successful.push(uploaded);
    } catch (e: any) {
      jobs[i] = {
        ...jobs[i],
        status: "failed",
        error: e?.message || "Upload failed",
      };
    }
    onProgress([...jobs]);
  }

  return { jobs, successful };
}
