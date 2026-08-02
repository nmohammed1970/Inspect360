// File upload sync utility for offline file uploads

import { offlineStorage } from './offlineStorage';
import { prepareImageForUpload } from './compressImage';

const MAX_UPLOAD_RETRY_ATTEMPTS = 3;

export interface FileUploadResult {
  success: boolean;
  url?: string;
  error?: string;
  uploadId?: string;
}

export class FileUploadSync {
  private isSyncing = false;

  /**
   * Upload a file - works both online and offline
   * When offline, stores the file in IndexedDB and queues it for upload
   * When online, uploads immediately
   */
  async uploadFile(
    file: File,
    endpoint: string = '/api/objects/upload-file',
    isOnline: boolean = navigator.onLine
  ): Promise<FileUploadResult> {
    // Compress images before store/upload so large phone photos never hit size walls
    const prepared = await prepareImageForUpload(file);

    if (!isOnline) {
      // Store file offline and queue for upload
      try {
        const fileId = await offlineStorage.storeFile(prepared, {
          endpoint,
          originalName: prepared.name,
        });

        const uploadId = await offlineStorage.queueFileUpload(fileId, endpoint, 'POST', {
          originalName: prepared.name,
        });

        console.log('[FileUploadSync] File queued for offline upload:', uploadId);
        return {
          success: true,
          url: `offline://${fileId}`, // Temporary offline URL
          uploadId,
        };
      } catch (error: any) {
        console.error('[FileUploadSync] Failed to queue file:', error);
        return {
          success: false,
          error: error.message || 'Failed to queue file for upload',
        };
      }
    }

    // Online - upload immediately
    try {
      const formData = new FormData();
      formData.append('file', prepared);

      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} ${errorText.substring(0, 100)}`);
      }

      const data = await response.json();
      const photoUrl = data.url || data.path;

      if (!photoUrl) {
        throw new Error('Upload response missing URL');
      }

      return {
        success: true,
        url: photoUrl,
      };
    } catch (error: any) {
      console.error('[FileUploadSync] Upload error:', error);
      // If upload fails and we're online, try to queue it for retry
      try {
        const fileId = await offlineStorage.storeFile(prepared, {
          endpoint,
          originalName: prepared.name,
        });

        const uploadId = await offlineStorage.queueFileUpload(fileId, endpoint, 'POST', {
          originalName: prepared.name,
        });

        return {
          success: false,
          error: error.message || 'Upload failed',
          uploadId,
        };
      } catch (queueError: any) {
        return {
          success: false,
          error: error.message || 'Upload failed',
        };
      }
    }
  }

  /**
   * Sync all queued file uploads
   */
  async syncAll(): Promise<{ success: number; failed: number }> {
    if (this.isSyncing) {
      return { success: 0, failed: 0 };
    }

    if (!navigator.onLine) {
      console.log('[FileUploadSync] Cannot sync - offline');
      return { success: 0, failed: 0 };
    }

    this.isSyncing = true;
    const queue = await offlineStorage.getUploadQueue();

    let successCount = 0;
    let failedCount = 0;

    for (const item of queue) {
      try {
        // Get the file from storage
        const fileRecord = await offlineStorage.getFile(item.fileId);
        if (!fileRecord) {
          console.warn('[FileUploadSync] File not found:', item.fileId);
          await offlineStorage.deleteUploadQueueItem(item.id);
          failedCount++;
          continue;
        }

        // Convert blob to File
        const file = new File([fileRecord.file], fileRecord.fileName, {
          type: fileRecord.mimeType,
        });

        // Upload the file
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(item.endpoint, {
          method: item.method,
          credentials: 'include',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.status}`);
        }

        const data = await response.json();
        const photoUrl = data.url || data.path;

        if (!photoUrl) {
          throw new Error('Upload response missing URL');
        }

        // Mark as synced
        await offlineStorage.markUploadAsSynced(item.id);

        // Optionally delete the file from storage (to save space)
        // Or keep it for a while in case we need to retry
        // await offlineStorage.deleteFile(item.fileId);

        successCount++;
        console.log('[FileUploadSync] File uploaded successfully:', item.id);
      } catch (error: any) {
        console.error('[FileUploadSync] Failed to upload file:', item.id, error);

        // Increment attempts
        await offlineStorage.incrementUploadAttempts(item.id);

        // Get updated item to check attempts
        const updatedQueue = await offlineStorage.getUploadQueue();
        const updatedItem = updatedQueue.find((q) => q.id === item.id);

        if (updatedItem && updatedItem.attempts >= MAX_UPLOAD_RETRY_ATTEMPTS) {
          // Max attempts reached - keep in queue for manual review
          console.warn('[FileUploadSync] Max attempts reached for:', item.id);
        }

        failedCount++;
      }
    }

    this.isSyncing = false;
    return { success: successCount, failed: failedCount };
  }

  /**
   * Get pending upload count
   */
  async getPendingCount(): Promise<number> {
    const queue = await offlineStorage.getUploadQueue();
    return queue.length;
  }

  /**
   * Get a file URL - handles both online URLs and offline file IDs
   */
  async getFileUrl(urlOrFileId: string): Promise<string | null> {
    // If it's an offline file ID
    if (urlOrFileId.startsWith('offline://')) {
      const fileId = urlOrFileId.replace('offline://', '');
      const fileRecord = await offlineStorage.getFile(fileId);

      if (!fileRecord) {
        return null;
      }

      // Create a blob URL for display
      return URL.createObjectURL(fileRecord.file);
    }

    // Regular URL
    return urlOrFileId;
  }

  /**
   * Revoke a blob URL (cleanup)
   */
  revokeFileUrl(url: string): void {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }

  getIsSyncing(): boolean {
    return this.isSyncing;
  }
}

// Singleton instance
export const fileUploadSync = new FileUploadSync();

