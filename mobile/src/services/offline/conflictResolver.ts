import type { InspectionEntry } from '../inspections';
import type { Inspection } from '../../types';

export interface ConflictResolution {
  resolved: boolean;
  data: any;
  strategy: 'server' | 'local' | 'merge';
}

/**
 * Resolve conflicts between server and local data
 */
export class ConflictResolver {
  /**
   * Resolve inspection conflict
   */
  static resolveInspectionConflict(
    serverInspection: Inspection,
    localInspection: Inspection,
    serverUpdatedAt: string,
    localUpdatedAt: string
  ): ConflictResolution {
    // Completed inspections: Server always wins (read-only)
    if (serverInspection.status === 'completed' || localInspection.status === 'completed') {
      return {
        resolved: true,
        data: serverInspection,
        strategy: 'server',
      };
    }

    // Compare timestamps
    if (serverUpdatedAt > localUpdatedAt) {
      // Server is newer
      return {
        resolved: true,
        data: serverInspection,
        strategy: 'server',
      };
    } else if (localUpdatedAt > serverUpdatedAt) {
      // Local is newer
      return {
        resolved: true,
        data: localInspection,
        strategy: 'local',
      };
    } else {
      // Equal timestamps - server wins (single source of truth)
      return {
        resolved: true,
        data: serverInspection,
        strategy: 'server',
      };
    }
  }

  /**
   * Resolve entry conflict
   */
  static resolveEntryConflict(
    serverEntry: InspectionEntry,
    localEntry: InspectionEntry,
    serverUpdatedAt: string,
    localUpdatedAt: string
  ): ConflictResolution {
    // Compare timestamps
    if (serverUpdatedAt > localUpdatedAt) {
      // Server is newer - use server data
      return {
        resolved: true,
        data: serverEntry,
        strategy: 'server',
      };
    } else if (localUpdatedAt > serverUpdatedAt) {
      // Local is newer - use local data
      return {
        resolved: true,
        data: localEntry,
        strategy: 'local',
      };
    } else {
      // Equal timestamps - merge strategy
      return this.mergeEntries(serverEntry, localEntry);
    }
  }

  /**
   * Merge two entries (photos, notes, values)
   */
  static mergeEntries(
    serverEntry: InspectionEntry,
    localEntry: InspectionEntry
  ): ConflictResolution {
    // Merge photos - combine arrays, remove duplicates
    const serverPhotos = serverEntry.photos || [];
    const localPhotos = localEntry.photos || [];
    const mergedPhotos = Array.from(
      new Set([...serverPhotos, ...localPhotos])
    ).filter(photo => {
      // Filter out local file paths if we have server URLs
      if (photo.startsWith('file://') || photo.includes('offline_images')) {
        // Check if there's a server URL for this local path
        const hasServerUrl = serverPhotos.some(p => 
          !p.startsWith('file://') && !p.includes('offline_images')
        );
        return !hasServerUrl; // Keep local path only if no server URL exists
      }
      return true;
    });

    // Merge notes
    let mergedNote = localEntry.note || serverEntry.note || '';
    if (serverEntry.note && localEntry.note && serverEntry.note !== localEntry.note) {
      // Both exist and differ - append local note
      mergedNote = `${serverEntry.note}\n\n--- Local Note ---\n${localEntry.note}`;
    }

    // Merge valueJson
    let mergedValueJson = localEntry.valueJson || serverEntry.valueJson;
    if (serverEntry.valueJson && localEntry.valueJson) {
      // If both have valueJson, prefer local if it's an object merge
      if (typeof localEntry.valueJson === 'object' && typeof serverEntry.valueJson === 'object') {
        mergedValueJson = {
          ...serverEntry.valueJson,
          ...localEntry.valueJson,
          // Merge condition and cleanliness if they exist
          condition: localEntry.valueJson.condition || serverEntry.valueJson.condition,
          cleanliness: localEntry.valueJson.cleanliness || serverEntry.valueJson.cleanliness,
        };
      } else {
        mergedValueJson = localEntry.valueJson;
      }
    }

    // Merge other fields
    const mergedEntry: InspectionEntry = {
      ...serverEntry,
      ...localEntry,
      id: serverEntry.id || localEntry.id,
      photos: mergedPhotos,
      note: mergedNote,
      valueJson: mergedValueJson,
      // Keep local flags
      maintenanceFlag: localEntry.maintenanceFlag || serverEntry.maintenanceFlag,
      markedForReview: localEntry.markedForReview || serverEntry.markedForReview,
    };

    return {
      resolved: true,
      data: mergedEntry,
      strategy: 'merge',
    };
  }

  /**
   * Merge photo arrays from server and local
   */
  static mergePhotos(serverPhotos: string[], localPhotos: string[]): string[] {
    const allPhotos = [...serverPhotos, ...localPhotos];
    const uniquePhotos: string[] = [];
    const seenUrls = new Set<string>();

    for (const photo of allPhotos) {
      // Normalize URL for comparison
      const normalized = photo.replace(/^file:\/\//, '').replace(/^https?:\/\//, '');
      
      if (!seenUrls.has(normalized)) {
        seenUrls.add(normalized);
        uniquePhotos.push(photo);
      }
    }

    // Prioritize server URLs over local paths
    return uniquePhotos.sort((a, b) => {
      const aIsLocal = a.startsWith('file://') || a.includes('offline_images');
      const bIsLocal = b.startsWith('file://') || b.includes('offline_images');
      
      if (aIsLocal && !bIsLocal) return 1;
      if (!aIsLocal && bIsLocal) return -1;
      return 0;
    });
  }

  /**
   * Detect if entry has conflicts
   */
  static hasConflict(
    serverEntry: InspectionEntry,
    localEntry: InspectionEntry,
    serverUpdatedAt: string,
    localUpdatedAt: string
  ): boolean {
    // If timestamps are equal or very close, there might be a conflict
    if (serverUpdatedAt === localUpdatedAt) {
      return true;
    }

    // If both have been modified recently, check for differences
    const timeDiff = Math.abs(
      new Date(serverUpdatedAt).getTime() - new Date(localUpdatedAt).getTime()
    );
    
    // If modified within 1 second of each other, consider it a conflict
    if (timeDiff < 1000) {
      // Check if data differs
      return (
        JSON.stringify(serverEntry.photos) !== JSON.stringify(localEntry.photos) ||
        serverEntry.note !== localEntry.note ||
        JSON.stringify(serverEntry.valueJson) !== JSON.stringify(localEntry.valueJson)
      );
    }

    return false;
  }
}

