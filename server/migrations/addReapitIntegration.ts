/**
 * Reapit Foundations tables and landlord contact type.
 * Run with: npx tsx server/migrations/addReapitIntegration.ts
 */

import "dotenv/config";
import { pool } from "../db";

async function grant(table: string) {
  try {
    await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO inspect360`);
  } catch (error: any) {
    const msg = String(error.message || "");
    if (msg.includes("role") && msg.includes("does not exist")) {
      console.log(`Skipped GRANT on ${table}: no inspect360 role.`);
      return;
    }
    throw error;
  }
}

async function runMigration() {
  try {
    console.log("Running migration: Reapit integration...");
    await pool.query(`
      DO $$ BEGIN
        ALTER TYPE contact_type ADD VALUE IF NOT EXISTS 'landlord';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS landlord_contact_id VARCHAR`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reapit_connections (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id VARCHAR NOT NULL UNIQUE,
        reapit_customer_id VARCHAR,
        status VARCHAR NOT NULL DEFAULT 'disconnected',
        encrypted_tokens TEXT,
        last_error TEXT,
        connected_at TIMESTAMP,
        disconnected_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS reapit_connections_customer_id_idx ON reapit_connections (reapit_customer_id)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reapit_entity_mappings (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id VARCHAR NOT NULL,
        entity_type VARCHAR NOT NULL,
        reapit_id VARCHAR NOT NULL,
        inspect360_table VARCHAR NOT NULL,
        inspect360_id VARCHAR NOT NULL,
        last_synced_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS reapit_entity_mappings_reapit_uidx ON reapit_entity_mappings (organization_id, entity_type, reapit_id)`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS reapit_entity_mappings_local_uidx ON reapit_entity_mappings (organization_id, inspect360_table, inspect360_id, entity_type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS reapit_entity_mappings_org_idx ON reapit_entity_mappings (organization_id)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reapit_sync_runs (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id VARCHAR NOT NULL,
        type VARCHAR NOT NULL,
        status VARCHAR NOT NULL DEFAULT 'queued',
        counters_json JSONB DEFAULT '{}'::jsonb,
        error_message TEXT,
        started_at TIMESTAMP,
        finished_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS reapit_sync_runs_org_idx ON reapit_sync_runs (organization_id)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reapit_webhook_events (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id VARCHAR,
        event_id VARCHAR NOT NULL UNIQUE,
        topic_id VARCHAR NOT NULL,
        reapit_entity_id VARCHAR,
        reapit_customer_id VARCHAR,
        status VARCHAR NOT NULL DEFAULT 'pending',
        payload_json JSONB,
        error_message TEXT,
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS reapit_webhook_events_org_idx ON reapit_webhook_events (organization_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS reapit_webhook_events_status_idx ON reapit_webhook_events (status)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reapit_jobs (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id VARCHAR,
        kind VARCHAR NOT NULL,
        status VARCHAR NOT NULL DEFAULT 'queued',
        run_after TIMESTAMP DEFAULT NOW(),
        attempts INTEGER NOT NULL DEFAULT 0,
        payload_json JSONB DEFAULT '{}'::jsonb,
        error_message TEXT,
        locked_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS reapit_jobs_status_run_after_idx ON reapit_jobs (status, run_after)`);
    await grant("reapit_connections");
    await grant("reapit_entity_mappings");
    await grant("reapit_sync_runs");
    await grant("reapit_webhook_events");
    await grant("reapit_jobs");
    console.log("Migration completed. Reapit tables are ready.");
    await pool.end();
    process.exit(0);
  } catch (error: any) {
    console.error("Migration failed:", error.message);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
