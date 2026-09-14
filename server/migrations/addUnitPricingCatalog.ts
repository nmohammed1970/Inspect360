/**
 * Migration: Create unit_pricing_catalog table for eco-admin price sheet
 *
 * Run with: tsx server/migrations/addUnitPricingCatalog.ts
 */

import "dotenv/config";
import { pool } from "../db";

async function runMigration() {
  try {
    console.log("Running migration: Create unit_pricing_catalog...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS unit_pricing_catalog (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        price_per_unit_monthly NUMERIC(12, 2) NOT NULL DEFAULT 0,
        price_per_unit_annual NUMERIC(12, 2) NOT NULL DEFAULT 0,
        currency_code VARCHAR(3) NOT NULL DEFAULT 'GBP',
        features_included TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("✅ Migration completed successfully!");
    process.exit(0);
  } catch (error: any) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  }
}

runMigration();
