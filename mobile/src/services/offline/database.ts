import * as SQLite from 'expo-sqlite';

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
  operation: 'create_entry' | 'update_entry' | 'upload_image' | 'delete_entry';
  entityType: 'entry' | 'image';
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

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db && isInitialized) {
    return db;
  }

  // For Expo Go: Check if we need to recreate the database
  // This handles schema changes between versions
  try {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    
    // Check if we need to migrate (simple version check)
    const versionCheck = await db.getFirstAsync<{ version: number }>(
      "SELECT version FROM sqlite_master WHERE type='table' AND name='db_version'"
    ).catch(() => null);

    const currentVersion = versionCheck?.version || 0;
    
    if (currentVersion < DB_VERSION) {
      // Drop all tables and recreate (for development/testing)
      console.log('[Database] Migrating database from version', currentVersion, 'to', DB_VERSION);
      await db.execAsync(`
        DROP TABLE IF EXISTS local_images;
        DROP TABLE IF EXISTS sync_queue;
        DROP TABLE IF EXISTS inspection_entries;
        DROP TABLE IF EXISTS inspections;
        DROP TABLE IF EXISTS db_version;
      `);
    }
    
    // Enable foreign keys
    await db.execAsync('PRAGMA foreign_keys = ON;');
    
    // Create tables
    await createTables(db);
    
    // Store version
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS db_version (
        version INTEGER PRIMARY KEY
      );
      INSERT OR REPLACE INTO db_version (version) VALUES (${DB_VERSION});
    `);
    
    isInitialized = true;
  } catch (error) {
    console.error('[Database] Error initializing database:', error);
    // If there's an error, try to recreate
    try {
      await db?.closeAsync();
    } catch {}
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await createTables(db);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS db_version (
        version INTEGER PRIMARY KEY
      );
      INSERT OR REPLACE INTO db_version (version) VALUES (${DB_VERSION});
    `);
    isInitialized = true;
  }
  
  return db;
}

async function createTables(database: SQLite.SQLiteDatabase): Promise<void> {
  // Inspections table
  await database.execAsync(`
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
  `);

  // Inspection entries table
  await database.execAsync(`
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
  `);

  // Sync queue table
  await database.execAsync(`
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
  `);

  // Local images table
  await database.execAsync(`
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
  `);

  // Create indexes for better query performance
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_inspections_syncStatus ON inspections(syncStatus);
    CREATE INDEX IF NOT EXISTS idx_inspections_isDeleted ON inspections(isDeleted);
    CREATE INDEX IF NOT EXISTS idx_entries_inspectionId ON inspection_entries(inspectionId);
    CREATE INDEX IF NOT EXISTS idx_entries_syncStatus ON inspection_entries(syncStatus);
    CREATE INDEX IF NOT EXISTS idx_entries_isDeleted ON inspection_entries(isDeleted);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_operation ON sync_queue(operation);
    CREATE INDEX IF NOT EXISTS idx_local_images_inspectionId ON local_images(inspectionId);
    CREATE INDEX IF NOT EXISTS idx_local_images_syncStatus ON local_images(syncStatus);
  `);
}

// Inspection operations
export async function saveInspection(inspection: Omit<InspectionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const id = inspection.inspectionId; // Use inspectionId as primary key

  await database.runAsync(
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
  );
}

export async function getInspection(inspectionId: string): Promise<InspectionRecord | null> {
  const database = await getDatabase();
  const result = await database.getFirstAsync<InspectionRecord>(
    `SELECT * FROM inspections WHERE inspectionId = ? AND isDeleted = 0`,
    [inspectionId]
  );
  return result || null;
}

export async function getAllInspections(): Promise<InspectionRecord[]> {
  const database = await getDatabase();
  const result = await database.getAllAsync<InspectionRecord>(
    `SELECT * FROM inspections WHERE isDeleted = 0 ORDER BY localUpdatedAt DESC`
  );
  return result;
}

export async function markInspectionDeleted(inspectionId: string): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    `UPDATE inspections SET isDeleted = 1, updatedAt = ? WHERE inspectionId = ?`,
    [now, inspectionId]
  );
}

// Inspection entry operations
export async function saveInspectionEntry(entry: Omit<InspectionEntryRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  // Use inspectionId-sectionRef-fieldKey as unique identifier
  const id = `${entry.inspectionId}-${entry.sectionRef}-${entry.fieldKey}`;

  await database.runAsync(
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
  );
}

export async function getInspectionEntries(inspectionId: string): Promise<InspectionEntryRecord[]> {
  const database = await getDatabase();
  const result = await database.getAllAsync<InspectionEntryRecord>(
    `SELECT * FROM inspection_entries WHERE inspectionId = ? AND isDeleted = 0 ORDER BY localUpdatedAt DESC`,
    [inspectionId]
  );
  return result;
}

export async function getInspectionEntry(inspectionId: string, sectionRef: string, fieldKey: string): Promise<InspectionEntryRecord | null> {
  const database = await getDatabase();
  const result = await database.getFirstAsync<InspectionEntryRecord>(
    `SELECT * FROM inspection_entries 
     WHERE inspectionId = ? AND sectionRef = ? AND fieldKey = ? AND isDeleted = 0`,
    [inspectionId, sectionRef, fieldKey]
  );
  return result || null;
}

export async function markEntryDeleted(inspectionId: string, sectionRef: string, fieldKey: string): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    `UPDATE inspection_entries SET isDeleted = 1, updatedAt = ? 
     WHERE inspectionId = ? AND sectionRef = ? AND fieldKey = ?`,
    [now, inspectionId, sectionRef, fieldKey]
  );
}

export async function getPendingEntries(): Promise<InspectionEntryRecord[]> {
  const database = await getDatabase();
  const result = await database.getAllAsync<InspectionEntryRecord>(
    `SELECT * FROM inspection_entries WHERE syncStatus = 'pending' AND isDeleted = 0`
  );
  return result;
}

// Sync queue operations
export async function addToSyncQueue(item: Omit<SyncQueueRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const id = `${item.operation}-${item.entityId}-${Date.now()}`;

  await database.runAsync(
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
  );
  return id;
}

export async function getSyncQueue(): Promise<SyncQueueRecord[]> {
  const database = await getDatabase();
  const result = await database.getAllAsync<SyncQueueRecord>(
    `SELECT * FROM sync_queue ORDER BY createdAt ASC`
  );
  return result;
}

export async function removeFromSyncQueue(queueId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [queueId]);
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
  fields.push('updatedAt = ?');
  values.push(now);
  values.push(queueId);

  await database.runAsync(
    `UPDATE sync_queue SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

// Local images operations
export async function saveLocalImage(image: Omit<LocalImageRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const id = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  await database.runAsync(
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
  );
  return id;
}

export async function getLocalImage(localPath: string): Promise<LocalImageRecord | null> {
  const database = await getDatabase();
  const result = await database.getFirstAsync<LocalImageRecord>(
    `SELECT * FROM local_images WHERE localPath = ?`,
    [localPath]
  );
  return result || null;
}

export async function getPendingImages(): Promise<LocalImageRecord[]> {
  const database = await getDatabase();
  const result = await database.getAllAsync<LocalImageRecord>(
    `SELECT * FROM local_images WHERE syncStatus = 'pending'`
  );
  return result;
}

export async function updateLocalImage(localPath: string, updates: Partial<LocalImageRecord>): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.serverUrl !== undefined) {
    fields.push('serverUrl = ?');
    values.push(updates.serverUrl);
  }
  if (updates.syncStatus !== undefined) {
    fields.push('syncStatus = ?');
    values.push(updates.syncStatus);
  }
  fields.push('updatedAt = ?');
  values.push(now);
  values.push(localPath);

  await database.runAsync(
    `UPDATE local_images SET ${fields.join(', ')} WHERE localPath = ?`,
    values
  );
}

export async function deleteLocalImage(localPath: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(`DELETE FROM local_images WHERE localPath = ?`, [localPath]);
}

// Utility functions
export async function clearDatabase(): Promise<void> {
  const database = await getDatabase();
  await database.execAsync(`
    DELETE FROM sync_queue;
    DELETE FROM local_images;
    DELETE FROM inspection_entries;
    DELETE FROM inspections;
  `);
}

export async function getSyncStats(): Promise<{
  pendingInspections: number;
  pendingEntries: number;
  pendingImages: number;
  queuedOperations: number;
}> {
  const database = await getDatabase();
  
  const pendingInspectionsResult = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM inspections WHERE syncStatus = 'pending' AND isDeleted = 0`
  );
  const pendingInspections = pendingInspectionsResult?.count || 0;
  
  const pendingEntriesResult = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM inspection_entries WHERE syncStatus = 'pending' AND isDeleted = 0`
  );
  const pendingEntries = pendingEntriesResult?.count || 0;
  
  const pendingImagesResult = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM local_images WHERE syncStatus = 'pending'`
  );
  const pendingImages = pendingImagesResult?.count || 0;
  
  const queuedOperationsResult = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM sync_queue`
  );
  const queuedOperations = queuedOperationsResult?.count || 0;

  return {
    pendingInspections,
    pendingEntries,
    pendingImages,
    queuedOperations,
  };
}

