import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db";

async function main() {
  const sqlPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "_combined_from_latest_develop_pull.sql",
  );
  // Local DBs often have no inspect360 role — strip Contabo GRANTs.
  const sql = fs
    .readFileSync(sqlPath, "utf8")
    .split("\n")
    .filter((line) => !/^\s*GRANT\b/i.test(line))
    .join("\n");
  console.log("Applying _combined_from_latest_develop_pull.sql (GRANTs skipped) ...");
  await pool.query(sql);
  const check = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'last_seen_at'`,
  );
  console.log("last_seen_at present:", check.rows.length > 0);
  console.log("Done.");
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
