import { inspectionsService, type InspectionEntry, type InspectionDetail } from '../inspections';
import type { Inspection } from '../../types';
import {
  saveInspection,
  getInspection as getLocalInspection,
  getAllInspections as getAllLocalInspections,
  markInspectionDeleted,
  saveInspectionEntry as saveLocalEntry,
  getInspectionEntries as getLocalEntries,
  getInspectionEntry as getLocalEntry,
  markEntryDeleted,
  getPendingEntries,
  addToSyncQueue,
} from './database';

/**
 * Offline-first wrapper for inspection service
 * Always reads from local DB first, syncs from server when online
 */
export const inspectionsOffline = {
  /**
   * Get user's inspections - reads from local DB first, then syncs from server
   */
  async getMyInspections(isOnline: boolean): Promise<Inspection[]> {
    // Always read from local DB first (fast, works offline)
    const localInspections = await getAllLocalInspections();
    const localData = localInspections.map(record => JSON.parse(record.data) as Inspection);

    // If offline, return local data only
    if (!isOnline) {
      return localData;
    }

    // If online, fetch from server in background and merge
    try {
      const serverInspections = await inspectionsService.getMyInspections();
      
      // Process server inspections
      for (const inspection of serverInspections) {
        const localRecord = localInspections.find(r => r.inspectionId === inspection.id);
        const now = new Date().toISOString();
        const serverUpdatedAt = inspection.updatedAt;

        if (!localRecord) {
          // New inspection from server - add to local DB
          await saveInspection({
            inspectionId: inspection.id,
            data: JSON.stringify(inspection),
            syncStatus: 'synced',
            lastSyncedAt: now,
            serverUpdatedAt,
            localUpdatedAt: now,
            isDeleted: false,
          });
        } else {
          // Existing inspection - check if server is newer
          const localUpdatedAt = localRecord.localUpdatedAt;
          const localServerUpdatedAt = localRecord.serverUpdatedAt;

          if (!localServerUpdatedAt || serverUpdatedAt > localServerUpdatedAt) {
            // Server is newer - update local DB
            await saveInspection({
              inspectionId: inspection.id,
              data: JSON.stringify(inspection),
              syncStatus: localRecord.syncStatus === 'pending' ? 'pending' : 'synced',
              lastSyncedAt: localRecord.syncStatus === 'synced' ? now : localRecord.lastSyncedAt,
              serverUpdatedAt,
              localUpdatedAt: localRecord.localUpdatedAt, // Keep local timestamp
              isDeleted: false,
            });
          }
        }
      }

      // Detect deleted inspections (in local but not in server)
      const serverIds = new Set(serverInspections.map(i => i.id));
      for (const localRecord of localInspections) {
        if (!serverIds.has(localRecord.inspectionId) && localRecord.syncStatus === 'synced') {
          // Inspection was deleted on server
          await markInspectionDeleted(localRecord.inspectionId);
        }
      }

      // Return merged data (server data takes precedence for synced items)
      const updatedLocal = await getAllLocalInspections();
      return updatedLocal
        .filter(r => !r.isDeleted)
        .map(record => JSON.parse(record.data) as Inspection);
    } catch (error) {
      console.error('[InspectionsOffline] Error syncing from server:', error);
      // Return local data if server sync fails
      return localData;
    }
  },

  /**
   * Get inspection by ID - reads from local DB first, then syncs from server
   */
  async getInspection(id: string, isOnline: boolean): Promise<InspectionDetail | null> {
    // Read from local DB first
    const localRecord = await getLocalInspection(id);
    if (localRecord) {
      const localData = JSON.parse(localRecord.data) as InspectionDetail;

      // If offline, return local data
      if (!isOnline) {
        return localData;
      }

      // If online, fetch from server and merge
      try {
        const serverData = await inspectionsService.getInspection(id);
        const serverUpdatedAt = serverData.updatedAt;
        const localServerUpdatedAt = localRecord.serverUpdatedAt;

        // Update if server is newer
        if (!localServerUpdatedAt || serverUpdatedAt > localServerUpdatedAt) {
          await saveInspection({
            inspectionId: id,
            data: JSON.stringify(serverData),
            syncStatus: localRecord.syncStatus === 'pending' ? 'pending' : 'synced',
            lastSyncedAt: localRecord.syncStatus === 'synced' ? new Date().toISOString() : localRecord.lastSyncedAt,
            serverUpdatedAt,
            localUpdatedAt: localRecord.localUpdatedAt,
            isDeleted: false,
          });
          return serverData;
        }

        return localData;
      } catch (error: any) {
        // If inspection was deleted (404), mark as deleted locally
        if (error.status === 404) {
          await markInspectionDeleted(id);
          return null;
        }
        console.error('[InspectionsOffline] Error fetching inspection from server:', error);
        return localData;
      }
    }

    // Not in local DB - fetch from server if online
    if (isOnline) {
      try {
        const serverData = await inspectionsService.getInspection(id);
        const now = new Date().toISOString();
        await saveInspection({
          inspectionId: id,
          data: JSON.stringify(serverData),
          syncStatus: 'synced',
          lastSyncedAt: now,
          serverUpdatedAt: serverData.updatedAt,
          localUpdatedAt: now,
          isDeleted: false,
        });
        return serverData;
      } catch (error) {
        console.error('[InspectionsOffline] Error fetching inspection from server:', error);
        return null;
      }
    }

    return null;
  },

  /**
   * Get inspection entries - merges local and server entries
   */
  async getInspectionEntries(
    inspectionId: string,
    isOnline: boolean,
    updatedAfter?: string
  ): Promise<InspectionEntry[]> {
    // Read from local DB first
    const localEntries = await getLocalEntries(inspectionId);
    const localData = localEntries.map(record => {
      const entryData = JSON.parse(record.data);
      return {
        ...entryData,
        id: record.entryId || record.id,
        syncStatus: record.syncStatus,
      } as InspectionEntry;
    });

    // If offline, return local data only
    if (!isOnline) {
      return localData;
    }

    // If online, fetch from server and merge
    try {
      const serverEntries = await inspectionsService.getInspectionEntries(inspectionId, updatedAfter);
      
      // Process server entries
      for (const serverEntry of serverEntries) {
        const localRecord = await getLocalEntry(
          inspectionId,
          serverEntry.sectionRef,
          serverEntry.fieldKey
        );

        const now = new Date().toISOString();
        const serverUpdatedAt = (serverEntry as any).updatedAt || new Date().toISOString();

        if (!localRecord) {
          // New entry from server - add to local DB
          await saveLocalEntry({
            entryId: serverEntry.id,
            inspectionId,
            sectionRef: serverEntry.sectionRef,
            fieldKey: serverEntry.fieldKey,
            data: JSON.stringify(serverEntry),
            syncStatus: 'synced',
            lastSyncedAt: now,
            serverUpdatedAt,
            localUpdatedAt: now,
            isDeleted: false,
          });
        } else {
          // Existing entry - merge based on timestamps
          const localServerUpdatedAt = localRecord.serverUpdatedAt;
          const localUpdatedAt = localRecord.localUpdatedAt;

          if (!localServerUpdatedAt || serverUpdatedAt > localServerUpdatedAt) {
            // Server is newer - update local DB
            // But preserve local changes if they're newer
            const shouldUseServer = !localUpdatedAt || serverUpdatedAt >= localUpdatedAt;
            
            await saveLocalEntry({
              entryId: serverEntry.id || localRecord.entryId,
              inspectionId,
              sectionRef: serverEntry.sectionRef,
              fieldKey: serverEntry.fieldKey,
              data: JSON.stringify(serverEntry),
              syncStatus: localRecord.syncStatus === 'pending' && localUpdatedAt > serverUpdatedAt 
                ? 'pending' 
                : 'synced',
              lastSyncedAt: localRecord.syncStatus === 'synced' ? now : localRecord.lastSyncedAt,
              serverUpdatedAt,
              localUpdatedAt: localRecord.localUpdatedAt,
              isDeleted: false,
            });
          }
        }
      }

      // Detect deleted entries (in local but not in server)
      const serverEntryKeys = new Set(
        serverEntries.map(e => `${e.sectionRef}-${e.fieldKey}`)
      );
      for (const localRecord of localEntries) {
        const key = `${localRecord.sectionRef}-${localRecord.fieldKey}`;
        if (!serverEntryKeys.has(key) && localRecord.syncStatus === 'synced') {
          // Entry was deleted on server
          await markEntryDeleted(
            inspectionId,
            localRecord.sectionRef,
            localRecord.fieldKey
          );
        }
      }

      // Return merged entries
      const updatedLocal = await getLocalEntries(inspectionId);
      return updatedLocal
        .filter(r => !r.isDeleted)
        .map(record => {
          const entryData = JSON.parse(record.data);
          return {
            ...entryData,
            id: record.entryId || record.id,
            syncStatus: record.syncStatus,
          } as InspectionEntry;
        });
    } catch (error) {
      console.error('[InspectionsOffline] Error syncing entries from server:', error);
      return localData;
    }
  },

  /**
   * Save inspection entry - saves locally immediately, queues for sync
   */
  async saveInspectionEntry(entry: InspectionEntry, isOnline: boolean): Promise<InspectionEntry> {
    const now = new Date().toISOString();
    const entryData = {
      ...entry,
      syncStatus: 'pending' as const,
    };

    // Save to local DB immediately
    await saveLocalEntry({
      entryId: null, // Will be set after server sync
      inspectionId: entry.inspectionId,
      sectionRef: entry.sectionRef,
      fieldKey: entry.fieldKey,
      data: JSON.stringify(entryData),
      syncStatus: 'pending',
      lastSyncedAt: null,
      serverUpdatedAt: null,
      localUpdatedAt: now,
      isDeleted: false,
    });

    // Queue for sync
    await addToSyncQueue({
      operation: 'create_entry',
      entityType: 'entry',
      entityId: `${entry.inspectionId}-${entry.sectionRef}-${entry.fieldKey}`,
      data: JSON.stringify(entry),
      retryCount: 0,
      lastError: null,
    });

    // If online, try to sync immediately
    if (isOnline) {
      try {
        const serverEntry = await inspectionsService.saveInspectionEntry(entry);
        // Update local DB with server response
        await saveLocalEntry({
          entryId: serverEntry.id,
          inspectionId: entry.inspectionId,
          sectionRef: entry.sectionRef,
          fieldKey: entry.fieldKey,
          data: JSON.stringify(serverEntry),
          syncStatus: 'synced',
          lastSyncedAt: now,
          serverUpdatedAt: (serverEntry as any).updatedAt || now,
          localUpdatedAt: now,
          isDeleted: false,
        });
        return serverEntry;
      } catch (error) {
        console.error('[InspectionsOffline] Error saving entry to server:', error);
        // Entry remains in sync queue for retry
      }
    }

    return entryData;
  },

  /**
   * Update inspection entry - updates locally immediately, queues for sync
   */
  async updateInspectionEntry(
    entryId: string,
    updates: Partial<InspectionEntry>,
    isOnline: boolean
  ): Promise<InspectionEntry> {
    // Get existing entry from local DB
    // entryId can be either:
    // 1. A composite key: "inspectionId-sectionRef-fieldKey"
    // 2. A server UUID
    const entryKey = entryId.includes('-') && entryId.split('-').length === 3 ? entryId : undefined;
    let localRecord;
    let inspectionId: string | undefined;
    let sectionRef: string | undefined;
    let fieldKey: string | undefined;
    
    if (entryKey) {
      // Try composite key lookup
      [inspectionId, sectionRef, fieldKey] = entryKey.split('-');
      localRecord = await getLocalEntry(inspectionId, sectionRef, fieldKey);
    } else {
      // Try to find by server ID (UUID)
      // We need to search all entries for this inspection
      // First, try to get inspectionId from updates if available
      if (updates.inspectionId) {
        inspectionId = updates.inspectionId;
        const allEntries = await getLocalEntries(inspectionId);
        localRecord = allEntries.find(e => e.entryId === entryId || e.id === entryId);
        if (localRecord) {
          sectionRef = localRecord.sectionRef;
          fieldKey = localRecord.fieldKey;
        }
      }
    }

    // If not found locally and online, try to fetch from server
    if (!localRecord && isOnline) {
      try {
        // If we have inspectionId, fetch entries for that inspection
        // Otherwise, try to get it from updates
        const targetInspectionId = inspectionId || updates.inspectionId;
        if (targetInspectionId) {
          const serverEntries = await inspectionsService.getInspectionEntries(targetInspectionId);
          const serverEntry = serverEntries.find(
            e => e.id === entryId || 
            (sectionRef && fieldKey && e.sectionRef === sectionRef && e.fieldKey === fieldKey)
          );
          
          if (serverEntry) {
            // Create local record from server entry
            const now = new Date().toISOString();
            const serverUpdatedAt = (serverEntry as any).updatedAt || now;
            await saveLocalEntry({
              entryId: serverEntry.id,
              inspectionId: serverEntry.inspectionId,
              sectionRef: serverEntry.sectionRef,
              fieldKey: serverEntry.fieldKey,
              data: JSON.stringify(serverEntry),
              syncStatus: 'synced',
              lastSyncedAt: now,
              serverUpdatedAt,
              localUpdatedAt: now,
              isDeleted: false,
            });
            // Reload the local record
            localRecord = await getLocalEntry(serverEntry.inspectionId, serverEntry.sectionRef, serverEntry.fieldKey);
            if (localRecord) {
              inspectionId = localRecord.inspectionId;
              sectionRef = localRecord.sectionRef;
              fieldKey = localRecord.fieldKey;
            }
          }
        }
      } catch (error) {
        console.warn('[InspectionsOffline] Could not fetch entry from server:', error);
      }
    }

    // If still not found, we need inspectionId, sectionRef, and fieldKey from updates
    if (!localRecord) {
      if (updates.inspectionId && updates.sectionRef && updates.fieldKey) {
        // Create new entry locally
        inspectionId = updates.inspectionId;
        sectionRef = updates.sectionRef;
        fieldKey = updates.fieldKey;
        const now = new Date().toISOString();
        const newEntry: InspectionEntry = {
          id: entryId,
          inspectionId: updates.inspectionId,
          sectionRef: updates.sectionRef,
          fieldKey: updates.fieldKey,
          fieldType: updates.fieldType || 'text',
          ...updates,
        };
        await saveLocalEntry({
          entryId: entryId,
          inspectionId: updates.inspectionId,
          sectionRef: updates.sectionRef,
          fieldKey: updates.fieldKey,
          data: JSON.stringify(newEntry),
          syncStatus: 'pending',
          lastSyncedAt: null,
          serverUpdatedAt: null,
          localUpdatedAt: now,
          isDeleted: false,
        });
        // Reload the local record
        localRecord = await getLocalEntry(updates.inspectionId, updates.sectionRef, updates.fieldKey);
      } else {
        throw new Error('Entry not found in local database and missing required fields (inspectionId, sectionRef, fieldKey) to create it');
      }
    }

    if (!localRecord || !inspectionId || !sectionRef || !fieldKey) {
      throw new Error('Entry not found in local database');
    }

    const existingEntry = JSON.parse(localRecord.data) as InspectionEntry;
    const updatedEntry = {
      ...existingEntry,
      ...updates,
      id: entryId,
    };
    const now = new Date().toISOString();

    // Update local DB
    await saveLocalEntry({
      entryId: localRecord.entryId || entryId,
      inspectionId: localRecord.inspectionId,
      sectionRef: localRecord.sectionRef,
      fieldKey: localRecord.fieldKey,
      data: JSON.stringify(updatedEntry),
      syncStatus: 'pending',
      lastSyncedAt: localRecord.lastSyncedAt,
      serverUpdatedAt: localRecord.serverUpdatedAt,
      localUpdatedAt: now,
      isDeleted: false,
    });

    // Queue for sync
    await addToSyncQueue({
      operation: 'update_entry',
      entityType: 'entry',
      entityId: entryId,
      data: JSON.stringify(updates),
      retryCount: 0,
      lastError: null,
    });

    // If online and entry has server ID, try to sync immediately
    if (isOnline && localRecord.entryId) {
      try {
        const serverEntry = await inspectionsService.updateInspectionEntry(localRecord.entryId, updates);
        // Update local DB with server response
        await saveLocalEntry({
          entryId: localRecord.entryId,
          inspectionId: localRecord.inspectionId,
          sectionRef: localRecord.sectionRef,
          fieldKey: localRecord.fieldKey,
          data: JSON.stringify(serverEntry),
          syncStatus: 'synced',
          lastSyncedAt: now,
          serverUpdatedAt: (serverEntry as any).updatedAt || now,
          localUpdatedAt: now,
          isDeleted: false,
        });
        return serverEntry;
      } catch (error) {
        console.error('[InspectionsOffline] Error updating entry on server:', error);
        // Entry remains in sync queue for retry
      }
    }

    return updatedEntry;
  },

  /**
   * Get pending entries that need to be synced
   */
  async getPendingEntries(): Promise<InspectionEntry[]> {
    const localEntries = await getPendingEntries();
    return localEntries.map(record => {
      const entryData = JSON.parse(record.data);
      return {
        ...entryData,
        id: record.entryId || record.id,
        syncStatus: record.syncStatus,
      } as InspectionEntry;
    });
  },

  /**
   * Sync from server - pulls all changes from server
   */
  async syncFromServer(): Promise<void> {
    // This will be called by the sync service
    // Implementation is in the sync service
  },
};

