/**
 * Ledger for trial and credit expiry emails.
 * Run with: npx tsx server/migrations/addEntitlementNotifications.ts
 *
 * Existing organizations are not backfilled. Historical expiries are not emailed.
 */

import "dotenv/config";
import { pool } from "../db";

async function runMigration() {
  try {
    console.log("Running migration: entitlement notification log...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS entitlement_notification_log (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id VARCHAR NOT NULL,
        notification_type VARCHAR(40) NOT NULL,
        event_key VARCHAR(40) NOT NULL,
        recipient_email VARCHAR,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS entitlement_notification_log_event_uidx
      ON entitlement_notification_log (organization_id, notification_type, event_key);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_entitlement_notification_log_status
      ON entitlement_notification_log (status, updated_at);
    `);

    console.log("Migration completed.");
    process.exit(0);
  } catch (error: any) {
    console.error("Migration failed:", error.message);
    process.exit(1);
  }
}

runMigration();
