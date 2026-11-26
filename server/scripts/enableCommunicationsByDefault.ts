import "dotenv/config";
import { pool } from "../db";
import { seedCommunicationCategories } from "../communications/categories";

async function main() {
  await pool.query(
    `ALTER TABLE organizations ALTER COLUMN communications_enabled SET DEFAULT true`,
  );
  const updated = await pool.query(
    `UPDATE organizations
     SET communications_enabled = true
     WHERE communications_enabled IS DISTINCT FROM true
     RETURNING id`,
  );
  console.log("Enabled communications on orgs:", updated.rowCount);

  const orgs = await pool.query(`SELECT id FROM organizations`);
  for (const row of orgs.rows) {
    await seedCommunicationCategories(row.id);
  }
  console.log("Seeded categories for", orgs.rowCount, "org(s)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
