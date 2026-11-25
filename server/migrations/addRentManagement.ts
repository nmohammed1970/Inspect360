/**
 * Rent Management Phase 1 tables.
 * Run with: npx tsx server/migrations/addRentManagement.ts
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { pool } from "../db";

async function runMigration() {
  const sqlPath = join(dirname(fileURLToPath(import.meta.url)), "addRentManagement.sql");
  let sql = readFileSync(sqlPath, "utf8");
  // Local/dev: strip Contabo GRANT block if present (role may not exist — SQL already guards with DO $$)
  console.log("Running migration: rent management...");
  await pool.query(sql);
  console.log("✅ Rent management migration complete");
  await pool.end();
}

runMigration().catch(async (err) => {
  console.error("❌ Migration failed:", err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
