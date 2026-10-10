/**
 * Add inspection gallery images + assignment tables.
 * Run: npx tsx server/migrations/addInspectionGallery.ts
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { pool } from "../db";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function run() {
  try {
    const sql = readFileSync(join(__dirname, "addInspectionGallery.sql"), "utf8");
    await pool.query(sql);
    console.log("inspection gallery migration applied");
    await pool.end();
    process.exit(0);
  } catch (e: any) {
    console.error("Migration failed:", e.message);
    process.exit(1);
  }
}

run();
