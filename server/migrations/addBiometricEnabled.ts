/**
 * Migration: Add biometric_enabled column to users table
 * 
 * This migration adds a column to track if user has enabled biometric authentication
 * for quick login using fingerprint, face ID, or device PIN.
 * 
 * Run with: tsx server/migrations/addBiometricEnabled.ts
 */

import "dotenv/config";
import { pool } from "../db";

async function runMigration() {
  try {
    console.log("Running migration: Add biometric_enabled column...");
    
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS biometric_enabled BOOLEAN NOT NULL DEFAULT false;
    `);
    
    await pool.query(`
      COMMENT ON COLUMN users.biometric_enabled IS 
      'Tracks if user has enabled biometric authentication for quick login';
    `);
    
    console.log("✅ Migration completed successfully!");
    process.exit(0);
  } catch (error: any) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  }
}

runMigration();

