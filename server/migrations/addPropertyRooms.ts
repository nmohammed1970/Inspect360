/**
 * Add organization_room_categories + property_rooms + inspection rooms snapshot.
 * Run: npx tsx server/migrations/addPropertyRooms.ts
 *
 * Contabo: apply SQL as creativecloud, then:
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON organization_room_categories TO inspect360;
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON property_rooms TO inspect360;
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { pool } from "../db";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function run() {
  try {
    const sql = readFileSync(join(__dirname, "addPropertyRooms.sql"), "utf8");
    await pool.query(sql);
    console.log("property rooms migration applied");
    await pool.end();
    process.exit(0);
  } catch (e: any) {
    console.error("Migration failed:", e.message);
    process.exit(1);
  }
}

run();