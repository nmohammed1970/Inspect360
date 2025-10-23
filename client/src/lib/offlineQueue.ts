import { useState, useEffect } from "react";
import { nanoid } from "nanoid";

export interface QueuedEntry {
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

  enqueue(entry: Omit<QueuedEntry, "id" | "offlineId" | "timestamp" | "synced" | "attempts">) {
    const queuedEntry: QueuedEntry = {
      id: nanoid(),
      offlineId: nanoid(16), // Unique offline ID for server deduplication
      ...entry,
      timestamp: Date.now(),
      synced: false,
      attempts: 0,
    };

    this.queue.push(queuedEntry);
    this.saveQueue();
    return queuedEntry;
  }

  getQueue(): QueuedEntry[] {
    return [...this.queue];
  }

  getPendingCount(): number {
    return this.queue.filter((e) => !e.synced).length;
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
  }> {
    if (this.isSyncing) {
      return { success: 0, failed: 0 };
    }

    this.isSyncing = true;
    const pending = this.queue.filter((e) => !e.synced && e.attempts < MAX_RETRY_ATTEMPTS);
    
    let successCount = 0;
    let failedCount = 0;

    for (const entry of pending) {
      try {
        await apiRequest("POST", "/api/inspection-entries", {
          inspectionId: entry.inspectionId,
          sectionRef: entry.sectionRef,
          fieldKey: entry.fieldKey,
          fieldType: entry.fieldType,
          valueJson: entry.valueJson,
          note: entry.note,
          photos: entry.photos,
          offlineId: entry.offlineId, // For server-side deduplication
        });
        
        this.markAsSynced(entry.id);
        successCount++;
      } catch (error) {
        console.error(`Failed to sync entry ${entry.id}:`, error);
        this.markAsFailed(entry.id);
        failedCount++;
      }
    }

    this.isSyncing = false;
    return { success: successCount, failed: failedCount };
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
