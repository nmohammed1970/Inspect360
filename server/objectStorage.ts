// Local file system storage implementation
import { Response } from "express";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { join, dirname, basename } from "path";
import { createReadStream, createWriteStream } from "fs";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

function extensionForMimeType(contentType: string | undefined): string {
  if (!contentType) return "";
  const ct = contentType.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "text/plain": ".txt",
  };
  return map[ct] || "";
}

/** First bytes → extension when MIME is missing or generic */
function extensionFromMagicBytes(buffer: Buffer): string {
  if (buffer.length < 4) return "";
  if (buffer.subarray(0, 4).toString() === "%PDF") return ".pdf";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return ".jpg";
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return ".png";
  }
  return "";
}

async function readFilePrefix(filePath: string, len: number): Promise<Buffer> {
  const fh = await fs.open(filePath, "r");
  try {
    const buf = Buffer.alloc(len);
    const { bytesRead } = await fh.read(buf, 0, len, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

// Local file wrapper that mimics GCS File interface
export class LocalFile {
  public name: string;
  private filePath: string;
  private metadataPath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.name = filePath;
    // Store metadata in a separate .meta.json file
    this.metadataPath = `${filePath}.meta.json`;
  }

  async exists(): Promise<[boolean]> {
    try {
      await fs.access(this.filePath);
      return [true];
    } catch {
      return [false];
    }
  }

  async getMetadata(): Promise<[any]> {
    const [exists] = await this.exists();
    if (!exists) {
      throw new Error(`File not found: ${this.filePath}`);
    }

    const stats = await fs.stat(this.filePath);
    let metadata: any = {
      size: stats.size,
      contentType: this.getContentType(this.filePath),
      updated: stats.mtime.toISOString(),
    };

    // Load custom metadata if it exists
    try {
      const metaData = await fs.readFile(this.metadataPath, 'utf-8');
      const customMeta = JSON.parse(metaData);
      metadata = { ...metadata, metadata: customMeta };
    } catch {
      // No custom metadata, that's fine
    }

    return [metadata];
  }

  async setMetadata(metadata: { metadata?: Record<string, string> }): Promise<void> {
    if (metadata.metadata) {
      // Store custom metadata in .meta.json file
      await fs.mkdir(dirname(this.metadataPath), { recursive: true });
      await fs.writeFile(this.metadataPath, JSON.stringify(metadata.metadata, null, 2));
    }
  }

  createReadStream(): NodeJS.ReadableStream {
    return createReadStream(this.filePath);
  }

  createWriteStream(): NodeJS.WritableStream {
    return createWriteStream(this.filePath);
  }

  private getContentType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain',
      'json': 'application/json',
    };
    return contentTypes[ext || ''] || 'application/octet-stream';
  }
}

// Get storage directory from environment or use default
function getStorageDir(): string {
  const storageDir = process.env.LOCAL_STORAGE_DIR || './storage';
  return storageDir;
}

// Ensure storage directory exists
async function ensureStorageDir(): Promise<string> {
  const storageDir = getStorageDir();
  await fs.mkdir(storageDir, { recursive: true });
  
  // Ensure subdirectories exist
  const privateDir = join(storageDir, process.env.PRIVATE_OBJECT_DIR || 'private');
  await fs.mkdir(privateDir, { recursive: true });
  
  const publicPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || 'public').split(',');
  for (const path of publicPaths) {
    const publicDir = join(storageDir, path.trim());
    await fs.mkdir(publicDir, { recursive: true });
  }
  
  return storageDir;
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      // Default to public directory in storage
      return ['public'];
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "private";
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<LocalFile | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = join(getStorageDir(), searchPath, filePath);
      const file = new LocalFile(fullPath);
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }
    return null;
  }

  async downloadObject(file: LocalFile, res: Response, cacheTtlSec: number = 3600) {
    try {
      const [metadata] = await file.getMetadata();
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";

      let contentType = metadata.contentType || "application/octet-stream";
      let filename = basename(file.name);

      if (!filename.includes(".")) {
        let magicExt = "";
        try {
          magicExt = extensionFromMagicBytes(await readFilePrefix(file.name, 16));
        } catch {
          /* ignore */
        }
        if (magicExt === ".pdf") contentType = "application/pdf";
        else if (magicExt === ".jpg") contentType = "image/jpeg";
        else if (magicExt === ".png") contentType = "image/png";

        const ext = extensionForMimeType(contentType) || magicExt;
        if (ext) filename = `${filename}${ext}`;
      }

      const safeAscii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "_") || "download";
      const disposition = `inline; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;

      res.set({
        "Content-Type": contentType,
        "Content-Length": metadata.size,
        "Content-Disposition": disposition,
        "Cache-Control": `${
          isPublic ? "public" : "private"
        }, max-age=${cacheTtlSec}`,
      });

      const stream = file.createReadStream();

      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  async getObjectEntityUploadURL(): Promise<string> {
    // Return a direct upload endpoint URL instead of signed URL
    // The client will POST to this endpoint with the file
    const objectId = randomUUID();
    // Return full URL path that the client can use
    return `/api/objects/upload-direct?objectId=${objectId}`;
  }

  private getEntityIdCandidates(entityId: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (s: string) => {
      if (!seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    };
    push(entityId);
    if (!entityId.includes(".")) {
      push(`${entityId}.pdf`);
      push(`${entityId}.jpg`);
      push(`${entityId}.jpeg`);
      push(`${entityId}.png`);
      push(`${entityId}.webp`);
      push(`${entityId}.gif`);
    }
    return out;
  }

  async getObjectEntityFile(objectPath: string): Promise<LocalFile> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    const privateObjectDir = this.getPrivateObjectDir();
    const baseDir = join(getStorageDir(), privateObjectDir);

    for (const name of this.getEntityIdCandidates(entityId)) {
      const fullPath = join(baseDir, name);
      const file = new LocalFile(fullPath);
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    throw new ObjectNotFoundError();
  }

  normalizeObjectEntityPath(rawPath: string): string {
    // If it's already a normalized path, return it
    if (rawPath.startsWith("/objects/")) {
      return rawPath;
    }

    // If it's a local file path, convert it
    if (rawPath.startsWith(getStorageDir())) {
      const relativePath = rawPath.replace(getStorageDir(), '').replace(/^[\/\\]/, '');
      const privateObjectDir = this.getPrivateObjectDir();
      
      if (relativePath.startsWith(privateObjectDir + '/')) {
        const entityId = relativePath.slice(privateObjectDir.length + 1);
        return `/objects/${entityId}`;
      }
    }

    // If it's a URL, try to extract the path
    try {
      const url = new URL(rawPath);
      if (url.pathname.startsWith('/objects/')) {
        return url.pathname;
      }
    } catch {
      // Not a valid URL, continue
    }

    return rawPath;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/objects/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: LocalFile;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }

  // Helper method to save uploaded file
  async saveUploadedFile(objectId: string, fileBuffer: Buffer, contentType?: string): Promise<string> {
    await ensureStorageDir();
    const privateObjectDir = this.getPrivateObjectDir();
    const ext =
      extensionForMimeType(contentType) || extensionFromMagicBytes(fileBuffer.subarray(0, Math.min(16, fileBuffer.length)));
    const fileName = ext ? `${objectId}${ext}` : objectId;
    const fullPath = join(getStorageDir(), privateObjectDir, fileName);

    // Ensure directory exists
    await fs.mkdir(dirname(fullPath), { recursive: true });

    // Write file
    await fs.writeFile(fullPath, fileBuffer);

    // Return normalized path
    return `/objects/${fileName}`;
  }

  // Delete an object entity file
  async deleteObjectEntity(objectPath: string): Promise<void> {
    try {
      const normalizedPath = this.normalizeObjectEntityPath(objectPath);
      if (!normalizedPath.startsWith("/objects/")) {
        // If it's not a valid object path, try to delete it directly
        const fullPath = join(getStorageDir(), objectPath.replace(/^\/+/, ''));
        await fs.unlink(fullPath).catch(() => {
          // File might not exist, that's okay
        });
        // Also try to delete metadata file
        await fs.unlink(`${fullPath}.meta.json`).catch(() => {
          // Metadata file might not exist, that's okay
        });
        return;
      }

      // Try to get the file, but handle the case where it doesn't exist
      let objectFile: LocalFile;
      try {
        objectFile = await this.getObjectEntityFile(normalizedPath);
      } catch (error) {
        // File doesn't exist, that's okay - just return
        if (error instanceof ObjectNotFoundError) {
          console.warn(`File not found for deletion: ${normalizedPath}`);
          return;
        }
        throw error; // Re-throw if it's a different error
      }

      const [exists] = await objectFile.exists();
      if (exists) {
        // Delete the file
        const parts = normalizedPath.slice(1).split("/");
        if (parts.length >= 2) {
          const entityId = parts.slice(1).join("/");
          const privateObjectDir = this.getPrivateObjectDir();
          const fullPath = join(getStorageDir(), privateObjectDir, entityId);
          await fs.unlink(fullPath).catch(() => {
            // File might not exist, that's okay
          });
          // Also try to delete metadata file
          await fs.unlink(`${fullPath}.meta.json`).catch(() => {
            // Metadata file might not exist, that's okay
          });
        }
      }
    } catch (error) {
      // If file doesn't exist or can't be deleted, log but don't throw
      // This allows the database record to be deleted even if file deletion fails
      console.warn(`Failed to delete object file ${objectPath}:`, error);
    }
  }
}
