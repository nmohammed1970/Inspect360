import { useState, useEffect } from "react";
import { nanoid } from "nanoid";
import type { QuickAddAsset, QuickAddMaintenance, QuickUpdateAsset } from "@shared/schema";
import { fileUploadSync } from "./fileUploadSync";

// Discriminated union for different queue entry types
export type QueuedEntry =
  | {
      type: "inspection_entry";
      id: string; // Local queue ID
      offlineId: string; // For server-side dedup
      inspectionId: string;
      sectionRef: string;
      fieldKey: string;
      fieldType: string;
      valueJson: any;
      note?: string;
      photos?: string[];
      timestamp: number;
      synced: boolean;
      attempts: number;
    }
  | {
      type: "asset";
      id: string; // Local queue ID
      offlineId: string; // For server-side dedup
      payload: QuickAddAsset;
      timestamp: number;
      synced: boolean;
      attempts: number;
    }
  | {
      type: "asset_update";
      id: string; // Local queue ID
      assetId: string; // ID of asset being updated
      payload: QuickUpdateAsset;
      timestamp: number;
      synced: boolean;
      attempts: number;
    }
  | {
      type: "maintenance";
      id: string; // Local queue ID
      offlineId: string; // For server-side dedup
      payload: QuickAddMaintenance;
      timestamp: number;
      synced: boolean;
      attempts: number;
    }
  | {
      type: "note_update";
      id: string; // Local queue ID
      entryId: string; // ID of entry to update
      note: string;
      timestamp: number;
      synced: boolean;
      attempts: number;
    }
  | {
      type: "gallery_register";
      id: string;
      inspectionId: string;
      images: Array<{ objectUrl: string }>;
      assign?: { sectionRef: string; fieldKey: string } | null;
      timestamp: number;
      synced: boolean;
      attempts: number;
    };

const QUEUE_KEY = "inspect360_offline_queue";
const MAX_RETRY_ATTEMPTS = 3;

export class OfflineQueue {
  private queue: QueuedEntry[] = [];
  private isSyncing = false;

  constructor() {
    this.loadQueue();
  }

  private loadQueue() {
    try {
      const stored = localStorage.getItem(QUEUE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
      }
    } catch (error) {
      console.error("Failed to load offline queue:", error);
      this.queue = [];
    }
  }

  private saveQueue() {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error("Failed to save offline queue:", error);
    }
  }

  // Enqueue inspection entry
  enqueueInspectionEntry(
    entry: Omit<Extract<QueuedEntry, { type: "inspection_entry" }>, "id" | "offlineId" | "timestamp" | "synced" | "attempts" | "type">
  ) {
    const queuedEntry: QueuedEntry = {
      type: "inspection_entry",
      id: nanoid(),
      offlineId: nanoid(16),
      ...entry,
      timestamp: Date.now(),
      synced: false,
      attempts: 0,
    };

    this.queue.push(queuedEntry);
    this.saveQueue();
    return queuedEntry;
  }

  // Enqueue asset
  enqueueAsset(payload: QuickAddAsset) {
    const queuedEntry: QueuedEntry = {
      type: "asset",
      id: nanoid(),
      offlineId: nanoid(16),
      payload,
      timestamp: Date.now(),
      synced: false,
      attempts: 0,
    };

    this.queue.push(queuedEntry);
    this.saveQueue();
    return queuedEntry;
  }

  // Enqueue asset update
  enqueueAssetUpdate(assetId: string, payload: QuickUpdateAsset) {
    const queuedEntry: QueuedEntry = {
      type: "asset_update",
      id: nanoid(),
      assetId,
      payload: {
        ...payload,
        offlineId: nanoid(16), // Add offlineId for deduplication
      },
      timestamp: Date.now(),
      synced: false,
      attempts: 0,
    };

    this.queue.push(queuedEntry);
    this.saveQueue();
    return queuedEntry;
  }

  // Enqueue maintenance request
  enqueueMaintenance(payload: QuickAddMaintenance) {
    const queuedEntry: QueuedEntry = {
      type: "maintenance",
      id: nanoid(),
      offlineId: nanoid(16),
      payload,
      timestamp: Date.now(),
      synced: false,
      attempts: 0,
    };

    this.queue.push(queuedEntry);
    this.saveQueue();
    return queuedEntry;
  }

  // Enqueue note update
  enqueueNoteUpdate(entryId: string, note: string) {
    const queuedEntry: QueuedEntry = {
      type: "note_update",
      id: nanoid(),
      entryId,
      note,
      timestamp: Date.now(),
      synced: false,
      attempts: 0,
    };

    this.queue.push(queuedEntry);
    this.saveQueue();
    return queuedEntry;
  }

  /** Queue gallery register+assign for retry (online failure or after offline upload). */
  enqueueGalleryRegister(entry: {
    inspectionId: string;
    images: Array<{ objectUrl: string }>;
    assign?: { sectionRef: string; fieldKey: string } | null;
  }) {
    const objectUrls = entry.images
      .map((i) => String(i.objectUrl || "").trim())
      .filter(Boolean)
      .sort()
      .join(",");
    const assignKey = entry.assign
      ? `${entry.assign.sectionRef}::${entry.assign.fieldKey}`
      : "";
    // Dedupe pending identical register jobs
    const existing = this.queue.find(
      (q) =>
        q.type === "gallery_register" &&
        !q.synced &&
        q.inspectionId === entry.inspectionId &&
        q.images
          .map((i) => i.objectUrl)
          .sort()
          .join(",") === objectUrls &&
        (q.assign
          ? `${q.assign.sectionRef}::${q.assign.fieldKey}`
          : "") === assignKey,
    );
    if (existing) return existing;

    const queuedEntry: QueuedEntry = {
      type: "gallery_register",
      id: nanoid(),
      inspectionId: entry.inspectionId,
      images: entry.images,
      assign: entry.assign || null,
      timestamp: Date.now(),
      synced: false,
      attempts: 0,
    };
    this.queue.push(queuedEntry);
    this.saveQueue();
    return queuedEntry;
  }

  // Legacy method for backward compatibility
  enqueue(entry: Omit<Extract<QueuedEntry, { type: "inspection_entry" }>, "id" | "offlineId" | "timestamp" | "synced" | "attempts" | "type">) {
    return this.enqueueInspectionEntry(entry);
  }

  getQueue(): QueuedEntry[] {
    return [...this.queue];
  }

  getPendingCount(): number {
    return this.queue.filter((e) => !e.synced).length;
  }

  getPendingCountByType(
    type: "inspection_entry" | "asset" | "asset_update" | "maintenance" | "note_update" | "gallery_register",
  ): number {
    return this.queue.filter((e) => e.type === type && !e.synced).length;
  }

  markAsSynced(id: string) {
    const index = this.queue.findIndex((e) => e.id === id);
    if (index !== -1) {
      this.queue[index].synced = true;
      this.saveQueue();
    }
  }

  markAsFailed(id: string) {
    const index = this.queue.findIndex((e) => e.id === id);
    if (index !== -1) {
      this.queue[index].attempts += 1;
      if (this.queue[index].attempts >= MAX_RETRY_ATTEMPTS) {
        // Keep failed entries for manual review
        this.saveQueue();
      }
    }
  }

  clearSynced() {
    this.queue = this.queue.filter((e) => !e.synced);
    this.saveQueue();
  }

  async syncAll(apiRequest: (method: string, url: string, body?: any) => Promise<any>): Promise<{
    success: number;
    failed: number;
    details: {
      inspectionEntries: number;
      assets: number;
      assetUpdates: number;
      maintenance: number;
      noteUpdates: number;
      galleryRegisters: number;
    };
  }> {
    if (this.isSyncing) {
      return {
        success: 0,
        failed: 0,
        details: {
          inspectionEntries: 0,
          assets: 0,
          assetUpdates: 0,
          maintenance: 0,
          noteUpdates: 0,
          galleryRegisters: 0,
        },
      };
    }

    this.isSyncing = true;
    const pending = this.queue.filter((e) => !e.synced && e.attempts < MAX_RETRY_ATTEMPTS);

    let successCount = 0;
    let failedCount = 0;
    const details = {
      inspectionEntries: 0,
      assets: 0,
      assetUpdates: 0,
      maintenance: 0,
      noteUpdates: 0,
      galleryRegisters: 0,
    };

    for (const entry of pending) {
      try {
        if (entry.type === "inspection_entry") {
          // Handle offline photo URLs - upload them first if needed
          let photos = entry.photos || [];
          if (photos.length > 0) {
            const updatedPhotos: string[] = [];
            for (const photoUrl of photos) {
              // Check if this is an offline file (blob URL or offline:// URL)
              if (photoUrl.startsWith('blob:') || photoUrl.startsWith('offline://')) {
                // Find the file in IndexedDB and upload it
                try {
                  let fileId: string | null = null;
                  
                  if (photoUrl.startsWith('offline://')) {
                    fileId = photoUrl.replace('offline://', '');
                  } else {
                    // For blob URLs, we need to find the file by matching the blob URL
                    // This is tricky - we'll need to store a mapping or search by metadata
                    // For now, skip blob URLs that aren't in our system
                    console.warn('[OfflineQueue] Cannot sync blob URL without file ID:', photoUrl);
                    continue;
                  }
                  
                  // Get file from storage
                  const { offlineStorage } = await import('./offlineStorage');
                  const fileRecord = await offlineStorage.getFile(fileId);
                  
                  if (fileRecord) {
                    // Upload the file
                    const file = new File([fileRecord.file], fileRecord.fileName, {
                      type: fileRecord.mimeType,
                    });
                    
                    const uploadResult = await fileUploadSync.uploadFile(
                      file,
                      '/api/objects/upload-file',
                      true // Force online upload
                    );
                    
                    if (uploadResult.success && uploadResult.url && !uploadResult.url.startsWith('offline://')) {
                      updatedPhotos.push(uploadResult.url);
                    } else {
                      console.warn('[OfflineQueue] Failed to upload offline photo:', fileId);
                    }
                  } else {
                    console.warn('[OfflineQueue] File not found in storage:', fileId);
                  }
                } catch (error) {
                  console.error('[OfflineQueue] Error uploading offline photo:', error);
                  // Continue with other photos
                }
              } else {
                // Regular URL - use as is
                updatedPhotos.push(photoUrl);
              }
            }
            photos = updatedPhotos;
          }
          
          await apiRequest("POST", "/api/inspection-entries", {
            inspectionId: entry.inspectionId,
            sectionRef: entry.sectionRef,
            fieldKey: entry.fieldKey,
            fieldType: entry.fieldType,
            valueJson: entry.valueJson,
            note: entry.note,
            photos: photos,
            offlineId: entry.offlineId,
          });

          // Mirror mobile: after offline photos land on /objects/…, register+assign
          // into the gallery so recovery does not depend solely on listGallery backfill.
          const galleryUrls = photos
            .map((u) => {
              if (!u || typeof u !== "string") return null;
              if (u.startsWith("/objects/")) return u.split("?")[0];
              if (u.includes("/objects/")) {
                try {
                  if (u.startsWith("http://") || u.startsWith("https://")) {
                    return new URL(u).pathname.split("?")[0];
                  }
                } catch {
                  /* fall through */
                }
                return `/objects/${u.split("/objects/")[1]?.split("?")[0] || ""}`;
              }
              return null;
            })
            .filter((u): u is string => !!u && u.startsWith("/objects/"));
          if (galleryUrls.length && entry.sectionRef && entry.fieldKey) {
            try {
              await apiRequest(
                "POST",
                `/api/inspections/${entry.inspectionId}/gallery/register`,
                {
                  images: galleryUrls.map((objectUrl) => ({ objectUrl })),
                  assign: {
                    sectionRef: entry.sectionRef,
                    fieldKey: entry.fieldKey,
                  },
                },
              );
            } catch (galleryErr) {
              console.warn(
                "[OfflineQueue] Gallery register/assign after entry sync failed, queueing:",
                galleryErr,
              );
              this.enqueueGalleryRegister({
                inspectionId: entry.inspectionId,
                images: galleryUrls.map((objectUrl) => ({ objectUrl })),
                assign: {
                  sectionRef: entry.sectionRef,
                  fieldKey: entry.fieldKey,
                },
              });
            }
          }

          details.inspectionEntries++;
        } else if (entry.type === "gallery_register") {
          await apiRequest(
            "POST",
            `/api/inspections/${entry.inspectionId}/gallery/register`,
            {
              images: entry.images,
              assign: entry.assign || null,
            },
          );
          details.galleryRegisters++;
        } else if (entry.type === "asset") {
          await apiRequest("POST", "/api/asset-inventory/quick", {
            ...entry.payload,
            offlineId: entry.offlineId,
          });
          details.assets++;
        } else if (entry.type === "asset_update") {
          await apiRequest("PATCH", `/api/asset-inventory/${entry.assetId}/quick`, entry.payload);
          details.assetUpdates++;
        } else if (entry.type === "maintenance") {
          // Handle offline photo URLs - upload them first if needed
          let payload = { ...entry.payload };
          if (payload.photoUrls && payload.photoUrls.length > 0) {
            const updatedPhotoUrls: string[] = [];
            for (const photoUrl of payload.photoUrls) {
              // Check if this is an offline file (blob URL or offline:// URL)
              if (photoUrl.startsWith('blob:') || photoUrl.startsWith('offline://')) {
                // Find the file in IndexedDB and upload it
                try {
                  let fileId: string | null = null;
                  
                  if (photoUrl.startsWith('offline://')) {
                    fileId = photoUrl.replace('offline://', '');
                  } else {
                    // For blob URLs, we need to find the file by matching the blob URL
                    // This is tricky - we'll need to store a mapping or search by metadata
                    // For now, skip blob URLs that aren't in our system
                    console.warn('[OfflineQueue] Cannot sync blob URL without file ID:', photoUrl);
                    continue;
                  }
                  
                  // Get file from storage
                  const { offlineStorage } = await import('./offlineStorage');
                  const fileRecord = await offlineStorage.getFile(fileId);
                  
                  if (fileRecord) {
                    // Upload the file
                    const file = new File([fileRecord.file], fileRecord.fileName, {
                      type: fileRecord.mimeType,
                    });
                    
                    const uploadResult = await fileUploadSync.uploadFile(
                      file,
                      '/api/objects/upload-file',
                      true // Force online upload
                    );
                    
                    if (uploadResult.success && uploadResult.url && !uploadResult.url.startsWith('offline://')) {
                      updatedPhotoUrls.push(uploadResult.url);
                    } else {
                      console.warn('[OfflineQueue] Failed to upload offline photo:', fileId);
                    }
                  } else {
                    console.warn('[OfflineQueue] File not found in storage:', fileId);
                  }
                } catch (error) {
                  console.error('[OfflineQueue] Error uploading offline photo:', error);
                  // Continue with other photos
                }
              } else {
                // Regular URL - use as is
                updatedPhotoUrls.push(photoUrl);
              }
            }
            payload.photoUrls = updatedPhotoUrls;
          }
          
          await apiRequest("POST", "/api/maintenance/quick", {
            ...payload,
            offlineId: entry.offlineId,
          });
          details.maintenance++;
        } else if (entry.type === "note_update") {
          await apiRequest("PATCH", `/api/inspection-entries/${entry.entryId}`, {
            note: entry.note,
          });
          details.noteUpdates++;
        }

        this.markAsSynced(entry.id);
        successCount++;
      } catch (error) {
        console.error(`Failed to sync ${entry.type} entry ${entry.id}:`, error);
        this.markAsFailed(entry.id);
        failedCount++;
      }
    }

    this.isSyncing = false;
    return { success: successCount, failed: failedCount, details };
  }

  getIsSyncing(): boolean {
    return this.isSyncing;
  }
}

// Singleton instance
export const offlineQueue = new OfflineQueue();

// Online/offline detection
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
