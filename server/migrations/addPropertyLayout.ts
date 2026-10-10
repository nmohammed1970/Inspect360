/**
 * Add property layout room counts + floor plan columns; inspection room-count snapshot.
 * Run: npx tsx server/migrations/addPropertyLayout.ts
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { pool } from "../db";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function run() {
  try {
    const sql = readFileSync(join(__dirname, "addPropertyLayout.sql"), "utf8");
    await pool.query(sql);
    console.log("property layout migration applied");
    await pool.end();
    process.exit(0);
  } catch (e: any) {
    console.error("Migration failed:", e.message);
    process.exit(1);
  }
}

run();
