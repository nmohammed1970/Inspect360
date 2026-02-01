import * as FileSystem from 'expo-file-system/legacy';
import { saveLocalImage, updateLocalImage, deleteLocalImage, getLocalImage } from './database';

const IMAGES_DIR = `${FileSystem.documentDirectory}offline_images/`;

// Ensure images directory exists
async function ensureImagesDirectory(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(IMAGES_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(IMAGES_DIR, { intermediates: true });
  }
}

/**
 * Store an image locally and return the local path
 */
export async function storeImageLocally(
  imageUri: string,
  inspectionId: string,
  entryId?: string
): Promise<string> {
  await ensureImagesDirectory();

  // Generate unique filename
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  const extension = imageUri.split('.').pop() || 'jpg';
  const filename = `img_${timestamp}_${random}.${extension}`;
  const localPath = `${IMAGES_DIR}${filename}`;

  // Copy file to local storage
  // Handle both file:// URIs and regular paths
  const sourceUri = imageUri.startsWith('file://') ? imageUri : `file://${imageUri}`;
  await FileSystem.copyAsync({
    from: sourceUri,
    to: localPath,
  });

  // Save to database
  await saveLocalImage({
    localPath,
    serverUrl: null,
    entryId: entryId || null,
    inspectionId,
    syncStatus: 'pending',
  });

  return localPath;
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
 */
export function isLocalPath(path: string): boolean {
  return path.startsWith(IMAGES_DIR) || path.startsWith('file://') && path.includes('offline_images');
}

/**
 * Convert local path to a format that can be used in React Native Image component
 */
export function getImageSource(localPath: string): { uri: string } {
  // If it's already a file:// URI, use it directly
  if (localPath.startsWith('file://')) {
    return { uri: localPath };
  }
  // Otherwise, add file:// prefix
  return { uri: `file://${localPath}` };
}

