/**
 * Add hmo_compliance_enabled flag on organizations (opt-in, default false).
 * Run: npx tsx server/migrations/addHmoComplianceCompanyModule.ts
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { pool } from "../db";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function run() {
  try {
    const sql = readFileSync(join(__dirname, "addHmoComplianceCompanyModule.sql"), "utf8");
    await pool.query(sql);
    console.log("organizations hmo_compliance_enabled column migration applied");
    await pool.end();
    process.exit(0);
  } catch (e: any) {
    console.error("Migration failed:", e.message);
    await pool.end();
    process.exit(1);
  }
}

run();
