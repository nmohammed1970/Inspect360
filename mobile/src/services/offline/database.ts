import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

const DB_NAME = 'inspect360_offline.db';
const DB_VERSION = 2; // Increment to force schema recreation

export interface InspectionRecord {
  id: string;
  inspectionId: string; // Server ID
  data: string; // JSON string of inspection data
  syncStatus: 'synced' | 'pending' | 'conflict';
  lastSyncedAt: string | null;
  serverUpdatedAt: string | null;
  localUpdatedAt: string;
  isDeleted: number; // SQLite boolean (0 or 1)
  createdAt: string;
  updatedAt: string;
}

export interface InspectionEntryRecord {
  id: string;
  entryId: string | null; // Server ID (null if not synced yet)
  inspectionId: string;
  sectionRef: string;
  fieldKey: string;
  data: string; // JSON string of entry data
  syncStatus: 'synced' | 'pending' | 'conflict';
  lastSyncedAt: string | null;
  serverUpdatedAt: string | null;
  localUpdatedAt: string;
  isDeleted: number; // SQLite boolean (0 or 1)
  createdAt: string;
  updatedAt: string;
}

export interface SyncQueueRecord {
  id: string;
  operation:
    | 'create_entry'
    | 'update_entry'
    | 'upload_image'
    | 'delete_entry'
    | 'gallery_register'
    | 'gallery_assign';
  entityType: 'entry' | 'image' | 'gallery';
  entityId: string;
  data: string; // JSON string of operation data
  retryCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalImageRecord {
  id: string;
  localPath: string;
  serverUrl: string | null;
  entryId: string | null;
  inspectionId: string;
  syncStatus: 'pending' | 'synced' | 'failed';
  createdAt: string;
  updatedAt: string;
}

let db: SQLite.SQLiteDatabase | null = null;
let isInitialized = false;

let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let isInitializing = false;

// Helper function to retry database operations with exponential backoff
async function retryDatabaseOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 5,
  initialDelay: number = 50
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const errorMessage = error?.message || String(error);
      
      // Check if it's a database locked error
      if (errorMessage.includes('database is locked') || errorMessage.includes('locked')) {
        if (attempt < maxRetries - 1) {
          // Exponential backoff: 50ms, 100ms, 200ms, 400ms, 800ms
          const delay = initialDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      // For other errors or max retries reached, throw
      throw error;
    }
  }
  throw lastError;
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  // If already initialized, return immediately
  if (db && isInitialized) {
    // Verify the database is still valid by checking if it's closed
    try {
      // Try a simple query to verify the connection is still valid
      await retryDatabaseOperation(() => db.getFirstAsync('SELECT 1'), 3, 50);
      return db;
    } catch (error) {
      // Database connection is invalid, reset and reinitialize
      console.warn('[Database] Connection invalid, reinitializing...');
      db = null;
      isInitialized = false;
      initPromise = null;
      isInitializing = false;
    }
  }

  // If initialization is in progress, wait for it
  if (initPromise) {
    return initPromise;
  }

  // Prevent concurrent initialization
  if (isInitializing) {
    // Wait a bit and check again
    await new Promise(resolve => setTimeout(resolve, 100));
    if (initPromise) {
      return initPromise;
    }
  }

  // Start initialization
  isInitializing = true;
  initPromise = (async () => {
    try {
      // Close existing connection if any
      if (db) {
        try {
          await db.closeAsync();
        } catch (e) {
          // Ignore close errors
        }
        db = null;
      }

      // For Expo Go: Check if we need to recreate the database
      // This handles schema changes between versions
      db = await SQLite.openDatabaseAsync(DB_NAME);
      
      // Set WAL mode for better concurrency (allows multiple readers)
      await retryDatabaseOperation(() => db.execAsync('PRAGMA journal_mode = WAL;'), 3, 50);
      
      // Check if we need to migrate (simple version check)
      let versionCheck: { version: number } | null = null;
      try {
        versionCheck = await retryDatabaseOperation(() => 
          db.getFirstAsync<{ version: number }>(
            "SELECT version FROM sqlite_master WHERE type='table' AND name='db_version'"
          ), 3, 50
        );
      } catch (e) {
        // Table doesn't exist yet, versionCheck remains null
      }

      const currentVersion = versionCheck?.version || 0;
      
      if (currentVersion < DB_VERSION) {
        // Drop all tables and recreate (for development/testing)
        console.log('[Database] Migrating database from version', currentVersion, 'to', DB_VERSION);
        await retryDatabaseOperation(() => db.execAsync(`
          DROP TABLE IF EXISTS local_images;
          DROP TABLE IF EXISTS sync_queue;
          DROP TABLE IF EXISTS inspection_entries;
          DROP TABLE IF EXISTS inspections;
          DROP TABLE IF EXISTS db_version;
        `), 5, 100);
      }
      
      // Enable foreign keys
      await retryDatabaseOperation(() => db.execAsync('PRAGMA foreign_keys = ON;'), 3, 50);
      
      // Create tables
      await createTables(db);
      
      // Store version
      await retryDatabaseOperation(() => db.execAsync(`
        CREATE TABLE IF NOT EXISTS db_version (
          version INTEGER PRIMARY KEY
        );
        INSERT OR REPLACE INTO db_version (version) VALUES (${DB_VERSION});
      `), 3, 50);
      
      isInitialized = true;
      isInitializing = false;
      initPromise = null;
      return db;
    } catch (error) {
      console.error('[Database] Error initializing database:', error);
      isInitializing = false;
      initPromise = null;
      
      // If there's an error, try to recreate with retry
      try {
        if (db) {
          try {
            await db.closeAsync();
          } catch (e) {
            // Ignore close errors
          }
        }
      } catch (e) {
        // Ignore errors
      }
      
      // Retry initialization with exponential backoff
      await new Promise(resolve => setTimeout(resolve, 200));
      
      db = await SQLite.openDatabaseAsync(DB_NAME);
      await retryDatabaseOperation(() => db.execAsync('PRAGMA journal_mode = WAL;'), 3, 50);
      await retryDatabaseOperation(() => db.execAsync('PRAGMA foreign_keys = ON;'), 3, 50);
      await createTables(db);
      await retryDatabaseOperation(() => db.execAsync(`
        CREATE TABLE IF NOT EXISTS db_version (
          version INTEGER PRIMARY KEY
        );
        INSERT OR REPLACE INTO db_version (version) VALUES (${DB_VERSION});
      `), 3, 50);
      isInitialized = true;
      isInitializing = false;
      return db;
    }
  })();

  return initPromise;
}

async function createTables(database: SQLite.SQLiteDatabase): Promise<void> {
  // Inspections table
  await retryDatabaseOperation(() => database.execAsync(`
    CREATE TABLE IF NOT EXISTS inspections (
      id TEXT PRIMARY KEY,
      inspectionId TEXT UNIQUE NOT NULL,
      data TEXT NOT NULL,
      syncStatus TEXT NOT NULL DEFAULT 'pending',
      lastSyncedAt TEXT,
      serverUpdatedAt TEXT,
      localUpdatedAt TEXT NOT NULL,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `), 5, 100);

  // Inspection entries table
  await retryDatabaseOperation(() => database.execAsync(`
    CREATE TABLE IF NOT EXISTS inspection_entries (
      id TEXT PRIMARY KEY,
      entryId TEXT,
      inspectionId TEXT NOT NULL,
      sectionRef TEXT NOT NULL,
      fieldKey TEXT NOT NULL,
      data TEXT NOT NULL,
      syncStatus TEXT NOT NULL DEFAULT 'pending',
      lastSyncedAt TEXT,
      serverUpdatedAt TEXT,
      localUpdatedAt TEXT NOT NULL,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(inspectionId, sectionRef, fieldKey),
      FOREIGN KEY (inspectionId) REFERENCES inspections(inspectionId) ON DELETE CASCADE
    );
  `), 5, 100);

  // Sync queue table
  await retryDatabaseOperation(() => database.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      operation TEXT NOT NULL,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      data TEXT NOT NULL,
      retryCount INTEGER NOT NULL DEFAULT 0,
      lastError TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `), 5, 100);

  // Local images table
  await retryDatabaseOperation(() => database.execAsync(`
    CREATE TABLE IF NOT EXISTS local_images (
      id TEXT PRIMARY KEY,
      localPath TEXT NOT NULL UNIQUE,
      serverUrl TEXT,
      entryId TEXT,
      inspectionId TEXT NOT NULL,
      syncStatus TEXT NOT NULL DEFAULT 'pending',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (inspectionId) REFERENCES inspections(inspectionId) ON DELETE CASCADE
    );
  `), 5, 100);

  // Create indexes for better query performance
  await retryDatabaseOperation(() => database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_inspections_syncStatus ON inspections(syncStatus);
    CREATE INDEX IF NOT EXISTS idx_inspections_isDeleted ON inspections(isDeleted);
    CREATE INDEX IF NOT EXISTS idx_entries_inspectionId ON inspection_entries(inspectionId);
    CREATE INDEX IF NOT EXISTS idx_entries_syncStatus ON inspection_entries(syncStatus);
    CREATE INDEX IF NOT EXISTS idx_entries_isDeleted ON inspection_entries(isDeleted);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_operation ON sync_queue(operation);
    CREATE INDEX IF NOT EXISTS idx_local_images_inspectionId ON local_images(inspectionId);
    CREATE INDEX IF NOT EXISTS idx_local_images_syncStatus ON local_images(syncStatus);
  `), 5, 100);
}

// Inspection operations
export async function saveInspection(inspection: Omit<InspectionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const id = inspection.inspectionId; // Use inspectionId as primary key

  await retryDatabaseOperation(() => database.runAsync(
    `INSERT OR REPLACE INTO inspections 
     (id, inspectionId, data, syncStatus, lastSyncedAt, serverUpdatedAt, localUpdatedAt, isDeleted, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      inspection.inspectionId,
      inspection.data,
      inspection.syncStatus,
      inspection.lastSyncedAt,
      inspection.serverUpdatedAt,
      inspection.localUpdatedAt,
      inspection.isDeleted ? 1 : 0,
      now,
      now,
    ]
  ), 5, 50);
}

export async function getInspection(inspectionId: string): Promise<InspectionRecord | null> {
  const database = await getDatabase();
  const result = await retryDatabaseOperation(() => database.getFirstAsync<InspectionRecord>(
    `SELECT * FROM inspections WHERE inspectionId = ? AND isDeleted = 0`,
    [inspectionId]
  ), 5, 50);
  return result || null;
}

export async function getAllInspections(): Promise<InspectionRecord[]> {
  const database = await getDatabase();
  // Sort by serverUpdatedAt DESC first (if available), then localUpdatedAt DESC
  // This ensures newest inspections appear first
  const result = await retryDatabaseOperation(() => database.getAllAsync<InspectionRecord>(
    `SELECT * FROM inspections WHERE isDeleted = 0 ORDER BY COALESCE(serverUpdatedAt, localUpdatedAt) DESC, localUpdatedAt DESC`
  ), 5, 50);
  return result;
}

export async function markInspectionDeleted(inspectionId: string): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await retryDatabaseOperation(() => database.runAsync(
    `UPDATE inspections SET isDeleted = 1, updatedAt = ? WHERE inspectionId = ?`,
    [now, inspectionId]
  ), 5, 50);
}

// Inspection entry operations
export async function saveInspectionEntry(entry: Omit<InspectionEntryRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  // Use inspectionId-sectionRef-fieldKey as unique identifier
  const id = `${entry.inspectionId}-${entry.sectionRef}-${entry.fieldKey}`;

  await retryDatabaseOperation(() => database.runAsync(
    `INSERT OR REPLACE INTO inspection_entries 
     (id, entryId, inspectionId, sectionRef, fieldKey, data, syncStatus, lastSyncedAt, serverUpdatedAt, localUpdatedAt, isDeleted, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      entry.entryId,
      entry.inspectionId,
      entry.sectionRef,
      entry.fieldKey,
      entry.data,
      entry.syncStatus,
      entry.lastSyncedAt,
      entry.serverUpdatedAt,
      entry.localUpdatedAt,
      entry.isDeleted ? 1 : 0,
      now,
      now,
    ]
  ), 5, 50);
}

export async function getInspectionEntries(inspectionId: string): Promise<InspectionEntryRecord[]> {
  const database = await getDatabase();
  const result = await retryDatabaseOperation(() => database.getAllAsync<InspectionEntryRecord>(
    `SELECT * FROM inspection_entries WHERE inspectionId = ? AND isDeleted = 0 ORDER BY localUpdatedAt DESC`,
    [inspectionId]
  ), 5, 50);
  return result;
}

export async function getInspectionEntry(inspectionId: string, sectionRef: string, fieldKey: string): Promise<InspectionEntryRecord | null> {
  const database = await getDatabase();
  const result = await retryDatabaseOperation(() => database.getFirstAsync<InspectionEntryRecord>(
    `SELECT * FROM inspection_entries 
     WHERE inspectionId = ? AND sectionRef = ? AND fieldKey = ? AND isDeleted = 0`,
    [inspectionId, sectionRef, fieldKey]
  ), 5, 50);
  return result || null;
}

export async function markEntryDeleted(inspectionId: string, sectionRef: string, fieldKey: string): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await retryDatabaseOperation(() => database.runAsync(
    `UPDATE inspection_entries SET isDeleted = 1, updatedAt = ? 
     WHERE inspectionId = ? AND sectionRef = ? AND fieldKey = ?`,
    [now, inspectionId, sectionRef, fieldKey]
  ), 5, 50);
}

export async function getPendingEntries(): Promise<InspectionEntryRecord[]> {
  const database = await getDatabase();
  const result = await retryDatabaseOperation(() => database.getAllAsync<InspectionEntryRecord>(
    `SELECT * FROM inspection_entries WHERE syncStatus = 'pending' AND isDeleted = 0`
  ), 5, 50);
  return result;
}

// Sync queue operations
export async function addToSyncQueue(item: Omit<SyncQueueRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  
  // Generate unique ID using UUID to prevent collisions
  const id = uuidv4();

  // Check if an item with the same operation and entityId already exists
  // If it does, update it instead of creating a duplicate
  const existing = await retryDatabaseOperation(() => database.getFirstAsync<SyncQueueRecord>(
    `SELECT * FROM sync_queue WHERE operation = ? AND entityType = ? AND entityId = ?`,
    [item.operation, item.entityType, item.entityId]
  ), 5, 50);

  if (existing) {
    // Update existing item instead of creating duplicate
    await retryDatabaseOperation(() => database.runAsync(
      `UPDATE sync_queue SET data = ?, retryCount = ?, lastError = ?, updatedAt = ? WHERE id = ?`,
      [item.data, item.retryCount, item.lastError, now, existing.id]
    ), 5, 50);
    return existing.id;
  }

  // Insert new item with error handling for UNIQUE constraint
  try {
    await retryDatabaseOperation(() => database.runAsync(
      `INSERT INTO sync_queue (id, operation, entityType, entityId, data, retryCount, lastError, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        item.operation,
        item.entityType,
        item.entityId,
        item.data,
        item.retryCount,
        item.lastError,
        now,
        now,
      ]
    ), 5, 50);
    return id;
  } catch (error: any) {
    // If UNIQUE constraint fails (shouldn't happen with UUID, but handle it anyway)
    if (error.message?.includes('UNIQUE constraint') || error.message?.includes('UNIQUE')) {
      console.warn('[Database] UNIQUE constraint error, checking for existing item:', error.message);
      // Try to find and update existing item
      const existing = await retryDatabaseOperation(() => database.getFirstAsync<SyncQueueRecord>(
        `SELECT * FROM sync_queue WHERE operation = ? AND entityType = ? AND entityId = ?`,
        [item.operation, item.entityType, item.entityId]
      ), 5, 50);
      if (existing) {
        await retryDatabaseOperation(() => database.runAsync(
          `UPDATE sync_queue SET data = ?, retryCount = ?, lastError = ?, updatedAt = ? WHERE id = ?`,
          [item.data, item.retryCount, item.lastError, now, existing.id]
        ), 5, 50);
        return existing.id;
      }
      // If still not found, generate new UUID and retry once
      const newId = uuidv4();
      await retryDatabaseOperation(() => database.runAsync(
        `INSERT INTO sync_queue (id, operation, entityType, entityId, data, retryCount, lastError, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId,
          item.operation,
          item.entityType,
          item.entityId,
          item.data,
          item.retryCount,
          item.lastError,
          now,
          now,
        ]
      ), 5, 50);
      return newId;
    }
    throw error;
  }
}

export async function getSyncQueue(): Promise<SyncQueueRecord[]> {
  const database = await getDatabase();
  const result = await retryDatabaseOperation(() => database.getAllAsync<SyncQueueRecord>(
    `SELECT * FROM sync_queue ORDER BY createdAt ASC`
  ), 5, 50);
  return result;
}

export async function removeFromSyncQueue(queueId: string): Promise<void> {
  const database = await getDatabase();
  await retryDatabaseOperation(() => database.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [queueId]), 5, 50);
}

export async function updateSyncQueueItem(queueId: string, updates: Partial<SyncQueueRecord>): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.retryCount !== undefined) {
    fields.push('retryCount = ?');
    values.push(updates.retryCount);
  }
  if (updates.lastError !== undefined) {
    fields.push('lastError = ?');
    values.push(updates.lastError);
  }
  
  // Always update updatedAt
  fields.push('updatedAt = ?');
  values.push(now);
  
  // Add queueId to values for WHERE clause
  values.push(queueId);

  // Ensure we have at least one field to update
  if (fields.length === 0) {
    console.warn('[Database] updateSyncQueueItem called with no updates');
    return;
  }

  await retryDatabaseOperation(() => database.runAsync(
    `UPDATE sync_queue SET ${fields.join(', ')} WHERE id = ?`,
    values
  ), 5, 50);
}

// Local images operations
export async function saveLocalImage(image: Omit<LocalImageRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const id = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  await retryDatabaseOperation(() => database.runAsync(
    `INSERT INTO local_images (id, localPath, serverUrl, entryId, inspectionId, syncStatus, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      image.localPath,
      image.serverUrl,
      image.entryId,
      image.inspectionId,
      image.syncStatus,
      now,
      now,
    ]
  ), 5, 50);
  return id;
}

export async function getLocalImage(localPath: string): Promise<LocalImageRecord | null> {
  const database = await getDatabase();
  const result = await retryDatabaseOperation(() => database.getFirstAsync<LocalImageRecord>(
    `SELECT * FROM local_images WHERE localPath = ?`,
    [localPath]
  ), 5, 50);
  return result || null;
}

export async function getPendingImages(): Promise<LocalImageRecord[]> {
  const database = await getDatabase();
  const result = await retryDatabaseOperation(() => database.getAllAsync<LocalImageRecord>(
    `SELECT * FROM local_images WHERE syncStatus = 'pending'`
  ), 5, 50);
  return result;
}

export async function updateLocalImage(localPath: string, updates: Partial<LocalImageRecord>): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.id !== undefined) {
    fields.push('id = ?');
    values.push(updates.id);
  }
  if (updates.serverUrl !== undefined) {
    fields.push('serverUrl = ?');
    values.push(updates.serverUrl);
  }
  if (updates.syncStatus !== undefined) {
    fields.push('syncStatus = ?');
    values.push(updates.syncStatus);
  }
  if (updates.entryId !== undefined) {
    fields.push('entryId = ?');
    values.push(updates.entryId);
  }
  
  // Always update updatedAt
  fields.push('updatedAt = ?');
  values.push(now);
  
  // Add localPath to values for WHERE clause
  values.push(localPath);

  // Ensure we have at least one field to update
  if (fields.length === 0) {
    console.warn('[Database] updateLocalImage called with no updates');
    return;
  }

  await retryDatabaseOperation(() => database.runAsync(
    `UPDATE local_images SET ${fields.join(', ')} WHERE localPath = ?`,
    values
  ), 5, 50);
}

export async function deleteLocalImage(localPath: string): Promise<void> {
  const database = await getDatabase();
  await retryDatabaseOperation(() => database.runAsync(`DELETE FROM local_images WHERE localPath = ?`, [localPath]), 5, 50);
}

// Utility functions
export async function clearDatabase(): Promise<void> {
  const database = await getDatabase();
  await retryDatabaseOperation(() => database.execAsync(`
    DELETE FROM sync_queue;
    DELETE FROM local_images;
    DELETE FROM inspection_entries;
    DELETE FROM inspections;
  `), 5, 100);
}

export async function getSyncStats(): Promise<{
  pendingInspections: number;
  pendingEntries: number;
  pendingImages: number;
  queuedOperations: number;
}> {
  try {
    const database = await getDatabase();
    
    // Use try-catch for each query to prevent one failure from breaking all stats
    let pendingInspections = 0;
    try {
      const result = await database.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM inspections WHERE syncStatus = 'pending' AND isDeleted = 0`
      );
      pendingInspections = result?.count || 0;
    } catch (e) {
      console.warn('[Database] Error getting pending inspections count:', e);
    }

    let pendingEntries = 0;
    try {
      const result = await database.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM inspection_entries WHERE syncStatus = 'pending' AND isDeleted = 0`
      );
      pendingEntries = result?.count || 0;
    } catch (e) {
      console.warn('[Database] Error getting pending entries count:', e);
    }

    let pendingImages = 0;
    try {
      const result = await database.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM local_images WHERE syncStatus = 'pending'`
      );
      pendingImages = result?.count || 0;
    } catch (e) {
      console.warn('[Database] Error getting pending images count:', e);
    }

    let queuedOperations = 0;
    try {
      const result = await database.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM sync_queue`
      );
      queuedOperations = result?.count || 0;
    } catch (e) {
      console.warn('[Database] Error getting queued operations count:', e);
    }

    return {
      pendingInspections,
      pendingEntries,
      pendingImages,
      queuedOperations,
    };
  } catch (error) {
    console.error('[Database] Error getting sync stats:', error);
    // Return default values on error
    return {
      pendingInspections: 0,
      pendingEntries: 0,
      pendingImages: 0,
      queuedOperations: 0,
    };
  }
}

