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

  /**
   * Set progress callback
   */
  setProgressCallback(callback: SyncProgressCallback | null) {
    this.progressCallback = callback;
  }

  /**
   * Report progress
   */
  private reportProgress(progress: Partial<SyncProgress>) {
    if (this.progressCallback) {
      // Get current progress or default
      const current = {
        total: 0,
        completed: 0,
        failed: 0,
        ...progress,
      };
      this.progressCallback(current as SyncProgress);
    }
  }

  /**
   * Perform full bidirectional sync
   */
  async syncAll(isOnline: boolean): Promise<{
    success: boolean;
    uploaded: number;
    downloaded: number;
    errors: string[];
  }> {
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
      // Step 1: Upload pending changes (mobile-to-server)
      const uploadResult = await this.syncToServer();
      uploaded = uploadResult.uploaded;
      errors.push(...uploadResult.errors);

      // Step 2: Pull server changes (server-to-mobile)
      const downloadResult = await this.syncFromServer();
      downloaded = downloadResult.downloaded;
      errors.push(...downloadResult.errors);

      return {
        success: errors.length === 0,
        uploaded,
        downloaded,
        errors,
      };
    } finally {
      this.isSyncing = false;
      this.reportProgress({ total: 0, completed: 0, failed: 0 });
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

    const imageUrlMap = new Map<string, string>(); // localPath -> serverUrl

    try {
      // Step 1: Upload pending images first
      const images = await getPendingImages();
      this.reportProgress({
        total: images.length,
        completed: 0,
        failed: 0,
        currentOperation: 'Uploading images',
      });

      for (const image of images) {
        try {
          this.reportProgress({
            currentOperation: `Uploading image ${uploaded + 1}/${images.length}`,
          });

          const serverUrl = await this.uploadImage(image.localPath);
          if (serverUrl) {
            await updateImageWithServerUrl(image.localPath, serverUrl);
            imageUrlMap.set(image.localPath, serverUrl);
            uploaded++;
            this.reportProgress({ completed: uploaded });
          }
        } catch (error: any) {
          console.error('[SyncService] Error uploading image:', error);
          errors.push(`Failed to upload image: ${error.message}`);
          this.reportProgress({ failed: errors.length });
        }
      }

      // Step 2: Upload pending entries
      const entries = await getPendingEntries();
      this.reportProgress({
        total: entries.length,
        completed: uploaded,
        failed: errors.length,
        currentOperation: 'Syncing entries',
      });

      for (const entryRecord of entries) {
        try {
          const entry = JSON.parse(entryRecord.data) as InspectionEntry;
          this.reportProgress({
            currentOperation: `Syncing entry ${uploaded - images.length + 1}/${entries.length}`,
          });

          // Replace local image paths with server URLs before sending
          const entryToSend: InspectionEntry = {
            ...entry,
            photos: entry.photos?.map(photo => {
              // Check if this is a local path that was uploaded
              for (const [localPath, serverUrl] of imageUrlMap.entries()) {
                if (photo === localPath || photo.includes(localPath)) {
                  return serverUrl;
                }
              }
              // If it's a local path but not in map, filter it out (will be uploaded later)
              if (photo.startsWith('file://') || photo.includes('offline_images')) {
                return null;
              }
              return photo;
            }).filter((p): p is string => p !== null) || [],
          };

          if (entryRecord.entryId) {
            // Update existing entry
            const serverEntry = await inspectionsService.updateInspectionEntry(
              entryRecord.entryId,
              entryToSend
            );
            // Update local DB
            await saveInspectionEntry({
              entryId: entryRecord.entryId,
              inspectionId: entry.inspectionId,
              sectionRef: entry.sectionRef,
              fieldKey: entry.fieldKey,
              data: JSON.stringify(serverEntry),
              syncStatus: 'synced',
              lastSyncedAt: new Date().toISOString(),
              serverUpdatedAt: (serverEntry as any).updatedAt || new Date().toISOString(),
              localUpdatedAt: entryRecord.localUpdatedAt,
              isDeleted: false,
            });
          } else {
            // Create new entry
            const serverEntry = await inspectionsService.saveInspectionEntry(entryToSend);
            // Update local DB
            await saveInspectionEntry({
              entryId: serverEntry.id,
              inspectionId: entry.inspectionId,
              sectionRef: entry.sectionRef,
              fieldKey: entry.fieldKey,
              data: JSON.stringify(serverEntry),
              syncStatus: 'synced',
              lastSyncedAt: new Date().toISOString(),
              serverUpdatedAt: (serverEntry as any).updatedAt || new Date().toISOString(),
              localUpdatedAt: entryRecord.localUpdatedAt,
              isDeleted: false,
            });
          }

          uploaded++;
          this.reportProgress({ completed: uploaded });
        } catch (error: any) {
          console.error('[SyncService] Error syncing entry:', error);
          errors.push(`Failed to sync entry: ${error.message}`);
          this.reportProgress({ failed: errors.length });
        }
      }

      // Step 3: Process sync queue
      const queue = await getSyncQueue();
      for (const queueItem of queue) {
        try {
          if (queueItem.retryCount >= 5) {
            // Max retries reached
            errors.push(`Max retries reached for ${queueItem.operation}`);
            await removeFromSyncQueue(queueItem.id);
            continue;
          }

          // Retry the operation
          await this.processQueueItem(queueItem);
          await removeFromSyncQueue(queueItem.id);
          uploaded++;
        } catch (error: any) {
          console.error('[SyncService] Error processing queue item:', error);
          await updateSyncQueueItem(queueItem.id, {
            retryCount: queueItem.retryCount + 1,
            lastError: error.message,
          });
          errors.push(`Queue item failed: ${error.message}`);
        }
      }
    } catch (error: any) {
      console.error('[SyncService] Error in syncToServer:', error);
      errors.push(`Sync error: ${error.message}`);
    }

    return { uploaded, errors };
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

      console.log(`[SyncService] Uploading image: ${localPath} to ${uploadUrl}`);

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
        console.log(`[SyncService] Image uploaded successfully: ${serverUrl}`);
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
          const localRecord = await getLocalInspection(inspection.id);
          const now = new Date().toISOString();

          if (!localRecord) {
            // New inspection - add to local DB
            await saveInspection({
              inspectionId: inspection.id,
              data: JSON.stringify(inspection),
              syncStatus: 'synced',
              lastSyncedAt: now,
              serverUpdatedAt: inspection.updatedAt,
              localUpdatedAt: now,
              isDeleted: false,
            });
            downloaded++;
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

              await saveInspection({
                inspectionId: inspection.id,
                data: JSON.stringify(resolution.data),
                syncStatus: localRecord.syncStatus === 'pending' ? 'pending' : 'synced',
                lastSyncedAt: localRecord.syncStatus === 'synced' ? now : localRecord.lastSyncedAt,
                serverUpdatedAt: inspection.updatedAt,
                localUpdatedAt: localRecord.localUpdatedAt,
                isDeleted: false,
              });
              downloaded++;
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
          const localEntries = await getLocalEntries(inspection.id);

          this.reportProgress({
            currentOperation: `Syncing entries for inspection ${inspection.id}`,
          });

          const serverEntryKeys = new Set(
            serverEntries.map(e => `${e.sectionRef}-${e.fieldKey}`)
          );

          // Add/update entries
          for (const serverEntry of serverEntries) {
            const key = `${serverEntry.sectionRef}-${serverEntry.fieldKey}`;
            const localRecord = localEntries.find(
              e => e.sectionRef === serverEntry.sectionRef && e.fieldKey === serverEntry.fieldKey
            );

            const now = new Date().toISOString();
            const serverUpdatedAt = (serverEntry as any).updatedAt || now;

            if (!localRecord) {
              // New entry - add to local DB
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
                isDeleted: false,
              });
              downloaded++;
            } else {
              // Existing entry - resolve conflict
              const localData = JSON.parse(localRecord.data);
              const resolution = ConflictResolver.resolveEntryConflict(
                serverEntry,
                localData,
                serverUpdatedAt,
                localRecord.localUpdatedAt
              );

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
                isDeleted: false,
              });
              downloaded++;
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

