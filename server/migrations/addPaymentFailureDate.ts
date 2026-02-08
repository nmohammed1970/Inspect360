/**
 * Migration: Add first_payment_failure_date column to instance_subscriptions table
 * 
 * This migration adds a column to track the first payment failure date
 * for implementing a 3-day grace period before deactivation.
 * 
 * Run with: tsx server/migrations/addPaymentFailureDate.ts
 */

import "dotenv/config";
import { pool } from "../db";

async function runMigration() {
  try {
    console.log("Running migration: Add first_payment_failure_date column...");
    
    await pool.query(`
      ALTER TABLE instance_subscriptions 
      ADD COLUMN IF NOT EXISTS first_payment_failure_date TIMESTAMP;
    `);
    
    await pool.query(`
      COMMENT ON COLUMN instance_subscriptions.first_payment_failure_date IS 
      'Tracks the first payment failure date for 3-day grace period before deactivation';
    `);
    
    console.log("✅ Migration completed successfully!");
    process.exit(0);
  } catch (error: any) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  }
}

runMigration();

