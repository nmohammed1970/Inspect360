/**
 * Migration: Create organization_unit_pricing for per-instance eco-admin price sheets.
 *
 * Run with: npx tsx server/migrations/addOrganizationUnitPricing.ts
 */

import "dotenv/config";
import { pool } from "../db";

async function runMigration() {
  try {
    console.log("Running migration: Create organization_unit_pricing...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS organization_unit_pricing (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id VARCHAR NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
        price_per_unit_monthly NUMERIC(12, 2) NOT NULL DEFAULT 0,
        price_per_unit_annual NUMERIC(12, 2) NOT NULL DEFAULT 0,
        currency_code VARCHAR(3) NOT NULL DEFAULT 'GBP',
        features_included TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_organization_unit_pricing_org
        ON organization_unit_pricing (organization_id);
    `);

    try {
      await pool.query(`
        GRANT SELECT, INSERT, UPDATE, DELETE ON organization_unit_pricing TO inspect360;
      `);
    } catch (error: any) {
      if (error?.message?.includes("role \"inspect360\" does not exist")) {
        console.log("Skipping GRANT — role inspect360 does not exist in this database.");
      } else {
        throw error;
      }
    }

    console.log("✅ Migration completed successfully!");
    process.exit(0);
  } catch (error: any) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  }
}

runMigration();
