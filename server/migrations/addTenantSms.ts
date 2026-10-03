/**
 * Tenant SMS via TextMagic + delivery log / org templates.
 * Run: npx tsx server/migrations/addTenantSms.ts
 */

import "dotenv/config";
import { pool } from "../db";

async function runMigration() {
  try {
    console.log("Running migration: tenant SMS (TextMagic)...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS organization_sms_templates (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id VARCHAR NOT NULL UNIQUE,
        rent_pre_due_1_body TEXT,
        rent_pre_due_2_body TEXT,
        rent_pre_due_3_body TEXT,
        rent_overdue_body TEXT,
        comparison_report_body TEXT,
        check_in_inspection_body TEXT,
        check_out_inspection_body TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sms_delivery_log (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id VARCHAR NOT NULL,
        tenant_user_id VARCHAR,
        event_type VARCHAR(60) NOT NULL,
        event_key VARCHAR(200) NOT NULL,
        recipient_phone VARCHAR(40),
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        last_error TEXT,
        provider_message_id VARCHAR(100),
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS sms_delivery_log_claim_uidx
        ON sms_delivery_log (organization_id, event_type, event_key);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_delivery_log_org
        ON sms_delivery_log (organization_id, created_at);
    `);

    for (const table of ["organization_sms_templates", "sms_delivery_log"]) {
      try {
        await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO inspect360;`);
      } catch (error: any) {
        if (
          !String(error.message || "").includes("role") ||
          !String(error.message || "").includes("does not exist")
        ) {
          throw error;
        }
        console.log(`Skipped GRANT on ${table}: no inspect360 role.`);
      }
    }

    console.log("Migration completed. Tenant SMS tables are ready.");
    await pool.end();
    process.exit(0);
  } catch (error: any) {
    console.error("Migration failed:", error.message);
    process.exit(1);
  }
}

runMigration();
