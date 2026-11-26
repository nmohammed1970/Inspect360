import "dotenv/config";
import { pool } from "../db";

async function main() {
  const r = await pool.query(
    `UPDATE organizations
     SET communications_default_landing = false
     WHERE communications_default_landing = true
     RETURNING id`,
  );
  console.log("Cleared communications_default_landing on", r.rowCount, "org(s)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
