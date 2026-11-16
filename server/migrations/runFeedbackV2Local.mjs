import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "addFeedbackV2.sql");
const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:newpassword@localhost:5432/postgres";

const pool = new pg.Pool({ connectionString });

let sql = fs.readFileSync(sqlPath, "utf8");
// Local DB may not have the inspect360 role used on Contabo
sql = sql
  .split("\n")
  .filter((line) => !/^\s*GRANT\s+/i.test(line))
  .join("\n");

try {
  const before = await pool.query(
    `SELECT to_regclass('public.feedback_requests') AS feedback_requests`,
  );
  console.log("before:", before.rows[0]);

  await pool.query(sql);

  const after = await pool.query(`
    SELECT
      to_regclass('public.feedback_requests') AS feedback_requests,
      to_regclass('public.feedback_messages') AS feedback_messages,
      to_regclass('public.feedback_attachments') AS feedback_attachments,
      to_regclass('public.feature_admin_members') AS feature_admin_members,
      to_regclass('public.feedback_reference_counter') AS feedback_reference_counter
  `);
  console.log("after:", after.rows[0]);
  console.log("Migration OK (GRANTs skipped for local)");
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
