import * as FileSystem from 'expo-file-system/legacy';
import { v4 as uuidv4 } from 'uuid';
import {
  saveLocalImage,
  updateLocalImage,
  deleteLocalImage,
  getLocalImage,
  type LocalImageMeta,
  type LocalImagePurpose,
} from './database';

const IMAGES_DIR = `${FileSystem.documentDirectory}offline_images/`;

export type StoreImageOptions = {
  entryId?: string;
  purpose?: LocalImagePurpose;
  meta?: LocalImageMeta;
  /** Stable id used as upload-direct objectId; defaults to new UUID */
  id?: string;
};

// Ensure images directory exists
async function ensureImagesDirectory(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(IMAGES_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(IMAGES_DIR, { intermediates: true });
  }
}

/**
 * Store an image locally and return the local path.
 * Also returns the stable row id via getLocalImage after save when needed.
 */
export async function storeImageLocally(
  imageUri: string,
  inspectionId: string,
  entryIdOrOptions?: string | StoreImageOptions,
): Promise<string> {
  await ensureImagesDirectory();

  const options: StoreImageOptions =
    typeof entryIdOrOptions === 'string' || entryIdOrOptions === undefined
      ? { entryId: entryIdOrOptions }
      : entryIdOrOptions;

  const id = options.id || uuidv4();
  const purpose: LocalImagePurpose = options.purpose || 'field';
  const metaJson = options.meta ? JSON.stringify(options.meta) : null;

  // Prefer jpeg extension for gallery uploads (manipulator normalizes to jpeg)
  const sourceExt = imageUri.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg';
  const extension = purpose === 'gallery' ? 'jpg' : sourceExt;
  const filename = `img_${id.replace(/-/g, '').slice(0, 16)}_${Date.now()}.${extension}`;
  const localPath = `${IMAGES_DIR}${filename}`;

  // Copy file to local storage
  const sourceUri = imageUri.startsWith('file://') ? imageUri : `file://${imageUri}`;
  await FileSystem.copyAsync({
    from: sourceUri,
    to: localPath,
  });

  await saveLocalImage({
    id,
    localPath,
    serverUrl: null,
    entryId: options.entryId || null,
    inspectionId,
    syncStatus: 'pending',
    purpose,
    metaJson,
  });

  return localPath;
}

/**
 * Persist a gallery pick/capture and return { localPath, id }.
 */
export async function storeGalleryImageLocally(
  imageUri: string,
  inspectionId: string,
  meta?: LocalImageMeta,
): Promise<{ localPath: string; id: string }> {
  const id = uuidv4();
  const localPath = await storeImageLocally(imageUri, inspectionId, {
    id,
    purpose: 'gallery',
    meta: {
      fileName: meta?.fileName || `gallery_${Date.now()}.jpg`,
      mimeType: meta?.mimeType || 'image/jpeg',
      captureLatitude: meta?.captureLatitude ?? null,
      captureLongitude: meta?.captureLongitude ?? null,
      pendingAssign: meta?.pendingAssign ?? null,
      deleted: false,
      ...meta,
    },
  });
  return { localPath, id };
}

/**
 * Get a local image file as a data URI or file URI
 */
export async function getLocalImageUri(localPath: string): Promise<string | null> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    if (fileInfo.exists) {
      return fileInfo.uri;
    }
    return null;
  } catch (error) {
    console.error('[OfflineStorage] Error getting local image URI:', error);
    return null;
  }
}

/**
 * Update local image record with server URL after upload
 */
export async function updateImageWithServerUrl(
  localPath: string,
  serverUrl: string
): Promise<void> {
  await updateLocalImage(localPath, {
    serverUrl,
    syncStatus: 'synced',
  });
}

/**
 * Delete a local image file and its database record
 */
export async function deleteLocalImageFile(localPath: string): Promise<void> {
  try {
    // Delete from file system
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
    }

    // Delete from database
    await deleteLocalImage(localPath);
  } catch (error) {
    console.error('[OfflineStorage] Error deleting local image:', error);
    // Continue even if deletion fails
  }
}

/**
 * Clean up old synced images (older than 7 days)
 */
export async function cleanupOldImages(): Promise<number> {
  try {
    await ensureImagesDirectory();
    
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    // Get all synced images from database
    const images = await FileSystem.readDirectoryAsync(IMAGES_DIR);
    
    for (const filename of images) {
      const filePath = `${IMAGES_DIR}${filename}`;
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      
      if (fileInfo.exists && fileInfo.modificationTime) {
        const fileTime = fileInfo.modificationTime * 1000; // Convert to milliseconds
        
        if (fileTime < sevenDaysAgo) {
          const imageRecord = await getLocalImage(filePath);
          
          // Only delete if synced (has server URL)
          if (imageRecord && imageRecord.serverUrl && imageRecord.syncStatus === 'synced') {
            await deleteLocalImageFile(filePath);
            deletedCount++;
          }
        }
      }
    }

    return deletedCount;
  } catch (error) {
    console.error('[OfflineStorage] Error cleaning up old images:', error);
    return 0;
  }
}

/**
 * Get storage usage information
 */
export async function getStorageInfo(): Promise<{
  totalSize: number;
  imageCount: number;
  pendingCount: number;
}> {
  try {
    await ensureImagesDirectory();
    
    const images = await FileSystem.readDirectoryAsync(IMAGES_DIR);
    let totalSize = 0;
    let pendingCount = 0;

    for (const filename of images) {
      const filePath = `${IMAGES_DIR}${filename}`;
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      
      if (fileInfo.exists && fileInfo.size) {
        totalSize += fileInfo.size;
        
        const imageRecord = await getLocalImage(filePath);
        if (imageRecord && imageRecord.syncStatus === 'pending') {
          pendingCount++;
        }
      }
    }

    return {
      totalSize,
      imageCount: images.length,
      pendingCount,
    };
  } catch (error) {
    console.error('[OfflineStorage] Error getting storage info:', error);
    return {
      totalSize: 0,
      imageCount: 0,
      pendingCount: 0,
    };
  }
}

/**
 * Check if a path is a local offline path
 * Handles both iOS and Android path formats
 */
export function isLocalPath(path: string): boolean {
  if (!path) return false;
  
  // Check for offline_images directory (works on both iOS and Android)
  if (path.includes('offline_images')) {
    return true;
  }
  
  // Check if it starts with the images directory
  if (path.startsWith(IMAGES_DIR)) {
    return true;
  }
  
  // Check for file:// URIs that point to offline images
  if (path.startsWith('file://') && path.includes('offline_images')) {
    return true;
  }
  
  // Check for Android content:// URIs (less common but possible)
  if (path.startsWith('content://') && path.includes('offline_images')) {
    return true;
  }
  
  return false;
}

/**
 * Convert local path to a format that can be used in React Native Image component
 * Handles both iOS and Android path formats
 */
export function getImageSource(localPath: string): { uri: string } {
  if (!localPath) {
    return { uri: '' };
  }
  
  // If it's already a file:// URI, use it directly
  if (localPath.startsWith('file://')) {
    return { uri: localPath };
  }
  
  // If it's a content:// URI (Android), use it directly
  if (localPath.startsWith('content://')) {
    return { uri: localPath };
  }
  
  // If it's an absolute path (iOS/Android), add file:// prefix
  if (localPath.startsWith('/')) {
    return { uri: `file://${localPath}` };
  }
  
  // Otherwise, assume it's relative and add file:// prefix
  return { uri: `file://${localPath}` };
}
