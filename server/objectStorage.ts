// Local file system storage implementation
import { Response } from "express";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { join, dirname } from "path";
import { createReadStream, createWriteStream } from "fs";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

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
      
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
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
    const fullPath = join(getStorageDir(), privateObjectDir, entityId);
    const file = new LocalFile(fullPath);
    
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return file;
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
    const fileName = `${objectId}`;
    const fullPath = join(getStorageDir(), privateObjectDir, fileName);
    
    // Ensure directory exists
    await fs.mkdir(dirname(fullPath), { recursive: true });
    
    // Write file
    await fs.writeFile(fullPath, fileBuffer);
    
    // Return normalized path
    return `/objects/${fileName}`;
  }
}
