import { inspectionsService, type InspectionEntry } from '../inspections';
import { inspectionsOffline } from './inspectionsOffline';
import {
  getSyncQueue,
  removeFromSyncQueue,
  updateSyncQueueItem,
  getPendingEntries,
  getPendingImages,
  saveInspectionEntry,
  saveInspection,
  getInspectionEntries as getLocalEntries,
  getInspection as getLocalInspection,
  markInspectionDeleted,
  markEntryDeleted,
  getAllInspections,
} from './database';
import {
  updateImageWithServerUrl,
  deleteLocalImageFile,
  getLocalImage,
} from './storage';
import { ConflictResolver } from './conflictResolver';
import { getAPI_URL } from '../api';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export interface SyncProgress {
  total: number;
  completed: number;
  failed: number;
  currentOperation?: string;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

export class SyncService {
  private isSyncing = false;
  private progressCallback: SyncProgressCallback | null = null;
  private progressListeners: SyncProgressCallback[] = [];
  private currentProgress: SyncProgress = {
    total: 0,
    completed: 0,
    failed: 0,
  };

  /**
   * Set progress callback (legacy method)
   */
  setProgressCallback(callback: SyncProgressCallback | null) {
    this.progressCallback = callback;
  }

  /**
   * Add progress listener (returns unsubscribe function)
   */
  addProgressListener(listener: SyncProgressCallback): () => void {
    this.progressListeners.push(listener);
    // Immediately call with current progress
    listener(this.currentProgress);
    // Return unsubscribe function
    return () => {
      this.progressListeners = this.progressListeners.filter(l => l !== listener);
    };
  }

  /**
   * Check if sync is in progress
   */
  isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  /**
   * Report progress
   */
  private reportProgress(progress: Partial<SyncProgress>) {
    // Update current progress
    this.currentProgress = {
      ...this.currentProgress,
      ...progress,
    };

    // Notify legacy callback
    if (this.progressCallback) {
      this.progressCallback(this.currentProgress);
    }

    // Notify all listeners
    this.progressListeners.forEach(listener => {
      try {
        listener(this.currentProgress);
      } catch (error) {
        console.error('[SyncService] Error in progress listener:', error);
      }
    });
  }

  /**
   * Perform full bidirectional sync
   */
  async syncAll(isOnline?: boolean): Promise<{
    success: boolean;
    uploaded: number;
    downloaded: number;
    errors: string[];
  }> {
    // Check network state if not provided
    if (isOnline === undefined) {
      const Network = await import('expo-network');
      const networkState = await Network.getNetworkStateAsync();
      isOnline = networkState.isConnected || false;
    }

    if (!isOnline) {
      return {
        success: false,
        uploaded: 0,
        downloaded: 0,
        errors: ['Not online'],
      };
    }

    if (this.isSyncing) {
      return {
        success: false,
        uploaded: 0,
        downloaded: 0,
        errors: ['Sync already in progress'],
      };
    }

    this.isSyncing = true;
    const errors: string[] = [];
    let uploaded = 0;
    let downloaded = 0;

    try {
      // Report sync start
      this.reportProgress({
        total: 0,
        completed: 0,
        failed: 0,
        currentOperation: 'Starting sync...',
      });

      // Step 1: Upload pending changes (mobile-to-server)
      const uploadResult = await this.syncToServer();
      uploaded = uploadResult.uploaded;
      errors.push(...uploadResult.errors);

      // Step 2: Pull server changes (server-to-mobile)
      const downloadResult = await this.syncFromServer();
      downloaded = downloadResult.downloaded;
      errors.push(...downloadResult.errors);

      // Check for actual pending items to determine real failure count
      // This ensures we only count items that are truly still pending, not errors that were resolved
      const stillPendingImages = await getPendingImages();
      const stillPendingEntries = await getPendingEntries();
      const stillPendingQueue = await getSyncQueue();
      const actualFailures = stillPendingImages.length + stillPendingEntries.filter(e => e.syncStatus === 'pending').length + stillPendingQueue.length;
      
      // Report completion with actual failure count (items still pending)
      this.reportProgress({
        currentOperation: actualFailures > 0 
          ? `Sync complete (${actualFailures} item${actualFailures > 1 ? 's' : ''} pending retry)` 
          : 'Sync complete',
        failed: actualFailures,
      });

      // Return summary - all data is preserved locally, failed items will retry on next sync
      return {
        success: actualFailures === 0,
        uploaded,
        downloaded,
        errors: actualFailures > 0 
          ? [`${actualFailures} item${actualFailures > 1 ? 's' : ''} will be retried on next sync. All data is safely stored locally.`]
          : [],
      };
    } catch (error: any) {
      console.error('[SyncService] Critical sync error:', error);
      // Even if sync fails completely, all data is preserved locally
      // User can retry sync later - no data is lost
      this.reportProgress({
        currentOperation: 'Sync error (data preserved locally)',
        failed: 0, // Don't show failures - data is safe
      });
      return {
        success: false,
        uploaded,
        downloaded,
        errors: ['Sync encountered an error, but all your data is safely stored locally. Please try syncing again.'],
      };
    } finally {
      this.isSyncing = false;
      // Reset progress after a delay to show completion
      setTimeout(() => {
        this.reportProgress({
          total: 0,
          completed: 0,
          failed: 0,
          currentOperation: undefined,
        });
      }, 3000);
    }
  }

  /**
   * Sync local changes to server (mobile-to-server)
   */
  private async syncToServer(): Promise<{
    uploaded: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let uploaded = 0;
    let failedCount = 0; // Track actual failures (not just errors logged)

    const imageUrlMap = new Map<string, string>(); // localPath -> serverUrl

    try {
      // Step 1: Upload pending images first
      const images = await getPendingImages();
      const entries = await getPendingEntries();
      const queue = await getSyncQueue();
      const totalItems = images.length + entries.length + queue.length;
      
      this.reportProgress({
        total: totalItems,
        completed: 0,
        failed: 0,
        currentOperation: 'Uploading images',
      });

      for (const image of images) {
        let uploadSuccess = false;
        let lastError: any = null;
        
        // Retry logic for each image (up to 3 attempts)
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            if (attempt > 0) {
              // Wait before retry with exponential backoff
              const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 1s, 2s, 4s (max 5s)
              await new Promise(resolve => setTimeout(resolve, delay));
              console.log(`[SyncService] Retrying image upload (attempt ${attempt + 1}/3): ${image.localPath}`);
            }

            this.reportProgress({
              currentOperation: attempt === 0 
                ? `Uploading image ${uploaded + failedCount + 1}/${images.length}`
                : `Retrying image ${uploaded + failedCount + 1}/${images.length} (attempt ${attempt + 1}/3)`,
            });

            // Verify file exists before attempting upload
            const fileInfo = await FileSystem.getInfoAsync(image.localPath);
            if (!fileInfo.exists) {
              console.error(`[SyncService] Image file not found: ${image.localPath}`);
              // File doesn't exist - mark as failed and skip
              lastError = new Error('Image file not found');
              break; // Don't retry if file doesn't exist
            }

            const serverUrl = await this.uploadImage(image.localPath);
            if (serverUrl) {
              await updateImageWithServerUrl(image.localPath, serverUrl);
              imageUrlMap.set(image.localPath, serverUrl);
              uploaded++;
              uploadSuccess = true;
              this.reportProgress({ completed: uploaded });
              break; // Success - exit retry loop
            } else {
              throw new Error('Upload returned no URL');
            }
          } catch (error: any) {
            lastError = error;
            // Check if error is retryable
            const isRetryable = this.isRetryableError(error);
            if (!isRetryable || attempt === 2) {
              // Non-retryable error or max retries reached
              break;
            }
            // Will retry on next iteration
          }
        }

        // If upload failed after all retries, mark as failed but continue
        if (!uploadSuccess) {
          console.error('[SyncService] Image upload failed after retries:', {
            localPath: image.localPath,
            entryId: image.entryId,
            inspectionId: image.inspectionId,
            error: lastError?.message,
          });
          // Image remains pending for next sync attempt
          // Don't increment failedCount here - it will be counted at the end
          // Don't block other images from uploading
        }
      }

      // Step 2: Upload pending entries
      this.reportProgress({
        total: totalItems,
        completed: uploaded,
        failed: failedCount,
        currentOperation: 'Syncing entries',
      });

      for (const entryRecord of entries) {
        let syncSuccess = false;
        let lastError: any = null;
        
        // Retry logic for each entry (up to 3 attempts)
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            if (attempt > 0) {
              // Wait before retry with exponential backoff
              const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 1s, 2s, 4s (max 5s)
              await new Promise(resolve => setTimeout(resolve, delay));
              console.log(`[SyncService] Retrying entry sync (attempt ${attempt + 1}/3): ${entryRecord.entryId}`);
            }

            const entry = JSON.parse(entryRecord.data) as InspectionEntry;
            this.reportProgress({
              currentOperation: attempt === 0
                ? `Syncing entry ${uploaded + failedCount + 1}/${totalItems}`
                : `Retrying entry ${uploaded + failedCount + 1}/${totalItems} (attempt ${attempt + 1}/3)`,
            });

            // Replace local image paths with server URLs before sending
            // Keep local paths if they haven't been uploaded yet (for retry)
            const photosToSend: string[] = [];
            const photosToKeep: string[] = [];
            
            entry.photos?.forEach(photo => {
              // Check if this is a local path that was uploaded
              let found = false;
              for (const [localPath, serverUrl] of imageUrlMap.entries()) {
                if (photo === localPath || photo.includes(localPath) || localPath.includes(photo)) {
                  photosToSend.push(serverUrl);
                  found = true;
                  break;
                }
              }
              
              if (!found) {
                // If it's a local path, keep it for retry (don't send to server yet)
                if (photo.startsWith('file://') || photo.includes('offline_images')) {
                  photosToKeep.push(photo);
                } else {
                  // It's already a server URL, include it
                  photosToSend.push(photo);
                }
              }
            });

            // Filter out local paths before sending to server (server can't handle file:// paths)
            // But we'll update the local entry to keep both server URLs and local paths for retry
            const entryToSend: InspectionEntry = {
              ...entry,
              photos: photosToSend, // Only send server URLs to server
            };

            if (entryRecord.entryId) {
              // Update existing entry
              const serverEntry = await inspectionsService.updateInspectionEntry(
                entryRecord.entryId,
                entryToSend
              );
              // Merge server response with local paths for failed images
              const mergedEntry: InspectionEntry = {
                ...serverEntry,
                photos: photosToKeep.length > 0 
                  ? [...(serverEntry.photos || []), ...photosToKeep] // Add local paths back for retry
                  : serverEntry.photos,
              };
              // Update local DB with merged entry (includes local paths for retry)
              // ALWAYS preserve local data - even if sync partially fails
              await saveInspectionEntry({
                entryId: entryRecord.entryId,
                inspectionId: entry.inspectionId,
                sectionRef: entry.sectionRef,
                fieldKey: entry.fieldKey,
                data: JSON.stringify(mergedEntry),
                syncStatus: photosToKeep.length > 0 ? 'pending' : 'synced', // Keep pending if images failed
                lastSyncedAt: photosToKeep.length > 0 ? entryRecord.lastSyncedAt : new Date().toISOString(),
                serverUpdatedAt: (serverEntry as any).updatedAt || new Date().toISOString(),
                localUpdatedAt: entryRecord.localUpdatedAt,
                isDeleted: 0, // SQLite boolean (0 or 1)
              });
            } else {
              // Create new entry
              const serverEntry = await inspectionsService.saveInspectionEntry(entryToSend);
              // Merge server response with local paths for failed images
              const mergedEntry: InspectionEntry = {
                ...serverEntry,
                photos: photosToKeep.length > 0 
                  ? [...(serverEntry.photos || []), ...photosToKeep] // Add local paths back for retry
                  : serverEntry.photos,
              };
              // Update local DB with merged entry (includes local paths for retry)
              // ALWAYS preserve local data - even if sync partially fails
              await saveInspectionEntry({
                entryId: serverEntry.id,
                inspectionId: entry.inspectionId,
                sectionRef: entry.sectionRef,
                fieldKey: entry.fieldKey,
                data: JSON.stringify(mergedEntry),
                syncStatus: photosToKeep.length > 0 ? 'pending' : 'synced', // Keep pending if images failed
                lastSyncedAt: photosToKeep.length > 0 ? null : new Date().toISOString(),
                serverUpdatedAt: (serverEntry as any).updatedAt || new Date().toISOString(),
                localUpdatedAt: entryRecord.localUpdatedAt,
                isDeleted: 0, // SQLite boolean (0 or 1)
              });
            }

            uploaded++;
            syncSuccess = true;
            this.reportProgress({ completed: uploaded });
            break; // Success - exit retry loop
          } catch (error: any) {
            lastError = error;
            // Check if error is retryable
            const isRetryable = this.isRetryableError(error);
            if (!isRetryable || attempt === 2) {
              // Non-retryable error or max retries reached
              break;
            }
            // Will retry on next iteration
          }
        }

        // If sync failed after all retries, preserve data locally and continue
        if (!syncSuccess) {
          console.error('[SyncService] Entry sync failed after retries:', {
            entryId: entryRecord.entryId,
            inspectionId: entryRecord.inspectionId,
            error: lastError?.message,
          });
          
          // CRITICAL: Ensure data is preserved locally even if sync fails
          // The entry remains in local DB with 'pending' status for next sync
          // Don't lose user data!
          
          // Don't increment failedCount here - it will be counted at the end
          // Don't block other entries from syncing
        }
      }

      // Step 3: Process sync queue
      this.reportProgress({
        total: totalItems,
        completed: uploaded,
        failed: failedCount,
        currentOperation: 'Processing queue',
      });
      
      for (const queueItem of queue) {
        try {
          if (queueItem.retryCount >= 5) {
            // Max retries reached - this is a real failure
            failedCount++;
            errors.push(`Max retries reached for ${queueItem.operation}`);
            await removeFromSyncQueue(queueItem.id);
            this.reportProgress({ failed: failedCount });
            continue;
          }

          // Retry the operation
          await this.processQueueItem(queueItem);
          await removeFromSyncQueue(queueItem.id);
          uploaded++;
          this.reportProgress({ 
            completed: uploaded,
            currentOperation: `Processing queue item ${uploaded - images.length - entries.length + 1}/${queue.length}`,
          });
        } catch (error: any) {
          console.error('[SyncService] Error processing queue item:', error);
          // Only count as failure if max retries reached, otherwise it will be retried
          if (queueItem.retryCount + 1 >= 5) {
            failedCount++;
            errors.push(`Queue item failed after max retries: ${error.message}`);
            this.reportProgress({ failed: failedCount });
          } else {
            // Will be retried - just log the error
            errors.push(`Queue item error (will retry): ${error.message}`);
          }
          await updateSyncQueueItem(queueItem.id, {
            retryCount: queueItem.retryCount + 1,
            lastError: error.message,
          });
        }
      }
    } catch (error: any) {
      console.error('[SyncService] Error in syncToServer:', error);
      errors.push(`Sync error: ${error.message}`);
    }

    return { uploaded, errors };
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    const errorMessage = error?.message || String(error) || '';
    const errorString = errorMessage.toLowerCase();
    
    // Retryable errors (network issues, timeouts, server errors)
    const retryablePatterns = [
      'network',
      'timeout',
      'connection',
      'failed to fetch',
      'network request failed',
      'econnrefused',
      'etimedout',
      '500',
      '502',
      '503',
      '504',
      'database is locked',
      'locked',
    ];
    
    // Non-retryable errors (client errors, validation errors)
    const nonRetryablePatterns = [
      '400',
      '401',
      '403',
      '404',
      'validation',
      'invalid',
      'unauthorized',
      'forbidden',
      'not found',
      'file not found',
    ];
    
    // Check for non-retryable first
    for (const pattern of nonRetryablePatterns) {
      if (errorString.includes(pattern)) {
        return false;
      }
    }
    
    // Check for retryable
    for (const pattern of retryablePatterns) {
      if (errorString.includes(pattern)) {
        return true;
      }
    }
    
    // Default: retry unknown errors (better to retry than lose data)
    return true;
  }

  /**
   * Upload a single image
   */
  private async uploadImage(localPath: string): Promise<string | null> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(localPath);
      if (!fileInfo.exists) {
        console.error(`[SyncService] Image file not found at: ${localPath}`);
        throw new Error('Image file not found');
      }

      const extension = localPath.split('.').pop() || 'jpg';
      const mimeType = `image/${extension === 'jpg' || extension === 'jpeg' ? 'jpeg' : extension}`;

      // Create FormData
      const formData = new FormData();
      // Ensure file:// prefix for React Native
      const fileUri = localPath.startsWith('file://') ? localPath : `file://${localPath}`;
      
      formData.append('file', {
        uri: fileUri,
        type: mimeType,
        name: `photo_${Date.now()}.${extension}`,
      } as any);

      const apiUrl = getAPI_URL();
      if (!apiUrl || !apiUrl.startsWith('http')) {
        throw new Error(`Invalid API URL: ${apiUrl}`);
      }

      const uploadUrl = `${apiUrl}/api/objects/upload-direct`;

      // Removed upload start logging to reduce console noise

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

      try {
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            // DO NOT set 'Content-Type' - React Native sets it automatically
          },
          body: formData,
          credentials: 'include',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = `Upload failed: ${response.status} ${response.statusText}`;
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch {
            errorMessage = errorText || errorMessage;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        const serverUrl = data.url || data.uploadURL || data.path || data.objectUrl || `/objects/${data.objectId}`;
        // Removed successful upload logging to reduce console noise
        return serverUrl;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('Upload timeout: The server took too long to respond.');
        }
        throw fetchError;
      }
    } catch (error: any) {
      console.error('[SyncService] Error uploading image:', error);
      throw error;
    }
  }

  /**
   * Process a sync queue item
   */
  private async processQueueItem(item: any): Promise<void> {
    const data = JSON.parse(item.data);
    
    switch (item.operation) {
      case 'create_entry':
      case 'update_entry':
        // Already handled in syncToServer
        break;
      case 'upload_image':
        // Already handled in syncToServer
        break;
      default:
        console.warn('[SyncService] Unknown queue operation:', item.operation);
    }
  }

  /**
   * Sync from server (server-to-mobile)
   */
  private async syncFromServer(): Promise<{
    downloaded: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let downloaded = 0;

    try {
      // Step 1: Sync inspections list
      const serverInspections = await inspectionsService.getMyInspections();
      const localInspectionsRecords = await getAllInspections();
      
      this.reportProgress({
        total: serverInspections.length,
        completed: 0,
        failed: 0,
        currentOperation: 'Syncing inspections',
      });

      const serverIds = new Set(serverInspections.map(i => i.id));
      
      // Add/update inspections
      for (const inspection of serverInspections) {
        try {
          // Ensure database connection is valid before querying
          let localRecord;
          try {
            localRecord = await getLocalInspection(inspection.id);
          } catch (dbError: any) {
            console.error('[SyncService] Error getting local inspection, retrying:', dbError);
            // Retry once after a short delay
            await new Promise(resolve => setTimeout(resolve, 100));
            localRecord = await getLocalInspection(inspection.id);
          }
          
          const now = new Date().toISOString();

          if (!localRecord) {
            // New inspection - add to local DB
            try {
              await saveInspection({
                inspectionId: inspection.id,
                data: JSON.stringify(inspection),
                syncStatus: 'synced',
                lastSyncedAt: now,
                serverUpdatedAt: inspection.updatedAt,
                localUpdatedAt: now,
                isDeleted: 0, // SQLite boolean (0 or 1)
              });
              downloaded++;
            } catch (saveError: any) {
              console.error('[SyncService] Error saving inspection, retrying:', saveError);
              // Retry once after a short delay
              await new Promise(resolve => setTimeout(resolve, 100));
              await saveInspection({
                inspectionId: inspection.id,
                data: JSON.stringify(inspection),
                syncStatus: 'synced',
                lastSyncedAt: now,
                serverUpdatedAt: inspection.updatedAt,
                localUpdatedAt: now,
                isDeleted: 0, // SQLite boolean (0 or 1)
              });
              downloaded++;
            }
          } else {
            // Existing inspection - check if server is newer
            if (!localRecord.serverUpdatedAt || inspection.updatedAt > localRecord.serverUpdatedAt) {
              // Resolve conflict if needed
              const localData = JSON.parse(localRecord.data);
              const resolution = ConflictResolver.resolveInspectionConflict(
                inspection,
                localData,
                inspection.updatedAt,
                localRecord.localUpdatedAt
              );

              try {
                await saveInspection({
                  inspectionId: inspection.id,
                  data: JSON.stringify(resolution.data),
                  syncStatus: localRecord.syncStatus === 'pending' ? 'pending' : 'synced',
                  lastSyncedAt: localRecord.syncStatus === 'synced' ? now : localRecord.lastSyncedAt,
                  serverUpdatedAt: inspection.updatedAt,
                  localUpdatedAt: localRecord.localUpdatedAt,
                  isDeleted: 0, // SQLite boolean (0 or 1)
                });
                downloaded++;
              } catch (saveError: any) {
                console.error('[SyncService] Error updating inspection, retrying:', saveError);
                // Retry once after a short delay
                await new Promise(resolve => setTimeout(resolve, 100));
                await saveInspection({
                  inspectionId: inspection.id,
                  data: JSON.stringify(resolution.data),
                  syncStatus: localRecord.syncStatus === 'pending' ? 'pending' : 'synced',
                  lastSyncedAt: localRecord.syncStatus === 'synced' ? now : localRecord.lastSyncedAt,
                  serverUpdatedAt: inspection.updatedAt,
                  localUpdatedAt: localRecord.localUpdatedAt,
                  isDeleted: 0, // SQLite boolean (0 or 1)
                });
                downloaded++;
              }
            }
          }

          this.reportProgress({ completed: downloaded });
        } catch (error: any) {
          console.error('[SyncService] Error syncing inspection:', error);
          errors.push(`Failed to sync inspection ${inspection.id}: ${error.message}`);
        }
      }

      // Detect deleted inspections
      for (const localRecord of localInspectionsRecords) {
        if (!serverIds.has(localRecord.inspectionId) && localRecord.syncStatus === 'synced') {
          await markInspectionDeleted(localRecord.inspectionId);
          downloaded++;
        }
      }

      // Step 2: Sync entries for each inspection
      for (const inspection of serverInspections) {
        try {
          const serverEntries = await inspectionsService.getInspectionEntries(inspection.id);
          
          // Ensure database connection is valid before querying
          let localEntries;
          try {
            localEntries = await getLocalEntries(inspection.id);
          } catch (dbError: any) {
            console.error('[SyncService] Error getting local entries, retrying:', dbError);
            // Retry once after a short delay
            await new Promise(resolve => setTimeout(resolve, 100));
            localEntries = await getLocalEntries(inspection.id);
          }

          this.reportProgress({
            currentOperation: `Syncing entries for inspection ${inspection.id}`,
          });

          const serverEntryKeys = new Set(
            serverEntries.map(e => `${e.sectionRef}-${e.fieldKey}`)
          );

          // Add/update entries
          for (const serverEntry of serverEntries) {
            try {
              const key = `${serverEntry.sectionRef}-${serverEntry.fieldKey}`;
              const localRecord = localEntries.find(
                e => e.sectionRef === serverEntry.sectionRef && e.fieldKey === serverEntry.fieldKey
              );

              const now = new Date().toISOString();
              const serverUpdatedAt = (serverEntry as any).updatedAt || now;

              if (!localRecord) {
                // New entry - add to local DB
                try {
                  await saveInspectionEntry({
                    entryId: serverEntry.id,
                    inspectionId: inspection.id,
                    sectionRef: serverEntry.sectionRef,
                    fieldKey: serverEntry.fieldKey,
                    data: JSON.stringify(serverEntry),
                    syncStatus: 'synced',
                    lastSyncedAt: now,
                    serverUpdatedAt,
                    localUpdatedAt: now,
                    isDeleted: 0, // SQLite boolean (0 or 1)
                  });
                  downloaded++;
                } catch (saveError: any) {
                  console.error('[SyncService] Error saving entry, retrying:', saveError);
                  // Retry once after a short delay
                  await new Promise(resolve => setTimeout(resolve, 100));
                  await saveInspectionEntry({
                    entryId: serverEntry.id,
                    inspectionId: inspection.id,
                    sectionRef: serverEntry.sectionRef,
                    fieldKey: serverEntry.fieldKey,
                    data: JSON.stringify(serverEntry),
                    syncStatus: 'synced',
                    lastSyncedAt: now,
                    serverUpdatedAt,
                    localUpdatedAt: now,
                    isDeleted: 0, // SQLite boolean (0 or 1)
                  });
                  downloaded++;
                }
              } else {
                // Existing entry - resolve conflict
                const localData = JSON.parse(localRecord.data);
                const resolution = ConflictResolver.resolveEntryConflict(
                  serverEntry,
                  localData,
                  serverUpdatedAt,
                  localRecord.localUpdatedAt
                );

                try {
                  await saveInspectionEntry({
                    entryId: serverEntry.id || localRecord.entryId,
                    inspectionId: inspection.id,
                    sectionRef: serverEntry.sectionRef,
                    fieldKey: serverEntry.fieldKey,
                    data: JSON.stringify(resolution.data),
                    syncStatus: localRecord.syncStatus === 'pending' && 
                      localRecord.localUpdatedAt > serverUpdatedAt 
                      ? 'pending' 
                      : 'synced',
                    lastSyncedAt: localRecord.syncStatus === 'synced' ? now : localRecord.lastSyncedAt,
                    serverUpdatedAt,
                    localUpdatedAt: localRecord.localUpdatedAt,
                    isDeleted: 0, // SQLite boolean (0 or 1)
                  });
                  downloaded++;
                } catch (saveError: any) {
                  console.error('[SyncService] Error updating entry, retrying:', saveError);
                  // Retry once after a short delay
                  await new Promise(resolve => setTimeout(resolve, 100));
                  await saveInspectionEntry({
                    entryId: serverEntry.id || localRecord.entryId,
                    inspectionId: inspection.id,
                    sectionRef: serverEntry.sectionRef,
                    fieldKey: serverEntry.fieldKey,
                    data: JSON.stringify(resolution.data),
                    syncStatus: localRecord.syncStatus === 'pending' && 
                      localRecord.localUpdatedAt > serverUpdatedAt 
                      ? 'pending' 
                      : 'synced',
                    lastSyncedAt: localRecord.syncStatus === 'synced' ? now : localRecord.lastSyncedAt,
                    serverUpdatedAt,
                    localUpdatedAt: localRecord.localUpdatedAt,
                    isDeleted: 0, // SQLite boolean (0 or 1)
                  });
                  downloaded++;
                }
              }
            } catch (entryError: any) {
              console.error('[SyncService] Error processing entry:', entryError);
              errors.push(`Failed to sync entry ${serverEntry.id}: ${entryError.message}`);
            }
          }

          // Detect deleted entries
          for (const localRecord of localEntries) {
            const key = `${localRecord.sectionRef}-${localRecord.fieldKey}`;
            if (!serverEntryKeys.has(key) && localRecord.syncStatus === 'synced') {
              await markEntryDeleted(
                inspection.id,
                localRecord.sectionRef,
                localRecord.fieldKey
              );
              downloaded++;
            }
          }
        } catch (error: any) {
          console.error('[SyncService] Error syncing entries:', error);
          errors.push(`Failed to sync entries for ${inspection.id}: ${error.message}`);
        }
      }
    } catch (error: any) {
      console.error('[SyncService] Error in syncFromServer:', error);
      errors.push(`Sync error: ${error.message}`);
    }

    return { downloaded, errors };
  }

  /**
   * Check if sync is in progress
   */
  isSyncInProgress(): boolean {
    return this.isSyncing;
  }
}

// Export singleton instance
export const syncService = new SyncService();

