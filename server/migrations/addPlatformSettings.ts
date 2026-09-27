/**
 * Platform setting for the default trial length.
 * Run with: npx tsx server/migrations/addPlatformSettings.ts
 */

import "dotenv/config";
import { pool } from "../db";

async function runMigration() {
  try {
    console.log("Running migration: platform settings...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        key VARCHAR(80) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      INSERT INTO platform_settings (key, value)
      VALUES ('default_trial_days', '7')
      ON CONFLICT (key) DO NOTHING;
    `);
    console.log("Migration completed. Default trial length is 7 days until an admin changes it.");
    process.exit(0);
  } catch (error: any) {
    console.error("Migration failed:", error.message);
    process.exit(1);
  }
}

runMigration();
