/**
 * Add trial enforcement columns and entitlement audit table.
 *
 * Existing organizations keep trial_enforced = false (column default).
 * Their credit batches are not modified, so null expires_at grants stay valid.
 *
 * Run with: npx tsx server/migrations/addTrialEntitlement.ts
 */

import "dotenv/config";
import { pool } from "../db";

async function runMigration() {
  try {
    console.log("Running migration: trial entitlement...");

    await pool.query(`
      ALTER TABLE organizations
      ADD COLUMN IF NOT EXISTS trial_enforced BOOLEAN NOT NULL DEFAULT false;
    `);

    await pool.query(`
      ALTER TABLE organizations
      ADD COLUMN IF NOT EXISTS trial_start_at TIMESTAMP;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_organizations_trial_end
      ON organizations (trial_end_at);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS entitlement_events (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id VARCHAR NOT NULL,
        event_type VARCHAR(40) NOT NULL,
        actor_user_id VARCHAR,
        previous_trial_end TIMESTAMP,
        new_trial_end TIMESTAMP,
        additional_days INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_entitlement_events_org
      ON entitlement_events (organization_id, created_at);
    `);

    console.log("Migration completed. Existing organizations remain trial_enforced = false.");
    process.exit(0);
  } catch (error: any) {
    console.error("Migration failed:", error.message);
    process.exit(1);
  }
}

runMigration();
