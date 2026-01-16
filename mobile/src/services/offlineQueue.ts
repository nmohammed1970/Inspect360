import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { apiRequest } from './api';

const OFFLINE_QUEUE_KEY = 'offline_queue';
const INSPECTION_DRAFTS_KEY = 'inspection_drafts';

export interface OfflineQueueItem {
  id: string;
  type: 'inspection_response' | 'maintenance' | 'photo_upload' | 'maintenance_request';
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
  data?: any;
  timestamp: number;
  retries: number;
  maxRetries?: number;
}

export interface InspectionDraft {
  inspectionId: string;
  responses: any[];
  photos: string[];
  lastSaved: number;
}

class OfflineQueueManager {
  private syncInProgress = false;

  async addToQueue(item: Omit<OfflineQueueItem, 'id' | 'timestamp' | 'retries'>): Promise<void> {
    const queueItem: OfflineQueueItem = {
      ...item,
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      retries: 0,
      maxRetries: item.maxRetries || 3,
    };

    const queue = await this.getQueue();
    queue.push(queueItem);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  }

  async getQueue(): Promise<OfflineQueueItem[]> {
    try {
      const data = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error reading offline queue:', error);
      return [];
    }
  }

  async removeFromQueue(itemId: string): Promise<void> {
    const queue = await this.getQueue();
    const filtered = queue.filter((item) => item.id !== itemId);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(filtered));
  }

  async clearQueue(): Promise<void> {
    await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
  }

  async saveInspectionDraft(inspectionId: string, draft: Partial<InspectionDraft>): Promise<void> {
    const drafts = await this.getInspectionDrafts();
    drafts[inspectionId] = {
      ...drafts[inspectionId],
      ...draft,
      inspectionId,
      lastSaved: Date.now(),
    };
    await AsyncStorage.setItem(INSPECTION_DRAFTS_KEY, JSON.stringify(drafts));
  }

  async getInspectionDraft(inspectionId: string): Promise<InspectionDraft | null> {
    const drafts = await this.getInspectionDrafts();
    return drafts[inspectionId] || null;
  }

  async getInspectionDrafts(): Promise<Record<string, InspectionDraft>> {
    try {
      const data = await AsyncStorage.getItem(INSPECTION_DRAFTS_KEY);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Error reading inspection drafts:', error);
      return {};
    }
  }

  async clearInspectionDraft(inspectionId: string): Promise<void> {
    const drafts = await this.getInspectionDrafts();
    delete drafts[inspectionId];
    await AsyncStorage.setItem(INSPECTION_DRAFTS_KEY, JSON.stringify(drafts));
  }

  async syncQueue(): Promise<{ success: number; failed: number }> {
    if (this.syncInProgress) {
      return { success: 0, failed: 0 };
    }

    const networkState = await Network.getNetworkStateAsync();
    if (!networkState.isConnected) {
      return { success: 0, failed: 0 };
    }

    this.syncInProgress = true;
    const queue = await this.getQueue();
    let success = 0;
    let failed = 0;

    for (const item of queue) {
      try {
        await apiRequest(item.method, item.url, item.data);
        await this.removeFromQueue(item.id);
        success++;
      } catch (error) {
        console.error(`Failed to sync queue item ${item.id}:`, error);
        
        // Increment retries
        item.retries++;
        if (item.retries >= (item.maxRetries || 3)) {
          // Remove item if max retries reached
          await this.removeFromQueue(item.id);
          failed++;
        } else {
          // Update queue with incremented retries
          const updatedQueue = await this.getQueue();
          const index = updatedQueue.findIndex((q) => q.id === item.id);
          if (index !== -1) {
            updatedQueue[index] = item;
            await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(updatedQueue));
          }
        }
      }
    }

    this.syncInProgress = false;
    return { success, failed };
  }

  async isOnline(): Promise<boolean> {
    const networkState = await Network.getNetworkStateAsync();
    return networkState.isConnected || false;
  }

  async getQueueSize(): Promise<number> {
    const queue = await this.getQueue();
    return queue.length;
  }
}

export const offlineQueue = new OfflineQueueManager();

