/**
 * Widen rent_reminder_log.scheduled_for_date for manual reminder keys.
 * Run: npx tsx server/migrations/fixRentReminderLogScheduledDate.ts
 */
import "dotenv/config";
import { pool } from "../db";

async function run() {
  try {
    await pool.query(`
      ALTER TABLE rent_reminder_log
        ALTER COLUMN scheduled_for_date TYPE VARCHAR(40);
    `);
    console.log("Updated rent_reminder_log.scheduled_for_date to VARCHAR(40)");
    await pool.end();
    process.exit(0);
  } catch (e: any) {
    console.error("Migration failed:", e.message);
    process.exit(1);
  }
}

run();
