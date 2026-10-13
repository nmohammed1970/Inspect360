/**
 * Add branding_report_palette + branding_palette_meta on organizations.
 * Run: npx tsx server/migrations/addOrganizationReportBrandTheme.ts
 *
 * Contabo (as creativecloud):
 *   docker exec -it postgres psql -U creativecloud -d inspect360_dev
 *   -- or inspect360 for production
 * Then paste addOrganizationReportBrandTheme.sql
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { pool } from "../db";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function run() {
  try {
    const sql = readFileSync(join(__dirname, "addOrganizationReportBrandTheme.sql"), "utf8");
    await pool.query(sql);
    console.log("organization report brand theme migration applied");
    await pool.end();
    process.exit(0);
  } catch (e: any) {
    console.error("Migration failed:", e.message);
    process.exit(1);
  }
}

run();
