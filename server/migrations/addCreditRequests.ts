/**
 * Credit purchase requests.
 * Run with: npx tsx server/migrations/addCreditRequests.ts
 */

import "dotenv/config";
import { pool } from "../db";

async function runMigration() {
  try {
    console.log("Running migration: credit requests...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS credit_requests (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id VARCHAR NOT NULL,
        requested_by_user_id VARCHAR NOT NULL,
        requester_name VARCHAR NOT NULL,
        requester_email VARCHAR NOT NULL,
        organization_name VARCHAR NOT NULL,
        credits_requested INTEGER NOT NULL CHECK (credits_requested >= 6 AND credits_requested <= 100000),
        message TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'GRANTED')),
        email_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed')),
        email_error TEXT,
        granted_at TIMESTAMP,
        granted_by VARCHAR,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_credit_requests_org
        ON credit_requests (organization_id, created_at);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_credit_requests_user
        ON credit_requests (requested_by_user_id, created_at);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_credit_requests_status
        ON credit_requests (status, created_at);
    `);
    try {
      await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON credit_requests TO inspect360;`);
    } catch (error: any) {
      if (!String(error.message || "").includes("role") || !String(error.message || "").includes("does not exist")) {
        throw error;
      }
      console.log("Skipped GRANT: this database has no inspect360 role. The connecting user owns the table.");
    }
    console.log("Migration completed. credit_requests is ready.");
    await pool.end();
    process.exit(0);
  } catch (error: any) {
    console.error("Migration failed:", error.message);
    process.exit(1);
  }
}

runMigration();
