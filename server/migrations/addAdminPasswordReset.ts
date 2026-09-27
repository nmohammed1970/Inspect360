/**
 * Add reset_token / reset_token_expiry to admin_users for self-serve password reset.
 * Run: npx tsx server/migrations/addAdminPasswordReset.ts
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { pool } from "../db";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function run() {
  try {
    const sql = readFileSync(join(__dirname, "addAdminPasswordReset.sql"), "utf8");
    await pool.query(sql);
    console.log("admin_users password reset columns migration applied");
    await pool.end();
    process.exit(0);
  } catch (e: any) {
    console.error("Migration failed:", e.message);
    process.exit(1);
  }
}

run();
