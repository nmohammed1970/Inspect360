import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, "add_auto_room_count_field_types.sql"), "utf8");
const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:newpassword@localhost:5432/postgres";

const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query(sql);
  const { rows } = await client.query(`
    SELECT enumlabel
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'field_type' AND enumlabel LIKE 'auto_%'
    ORDER BY enumlabel
  `);
  console.log("field_type auto_* values:", rows.map((r) => r.enumlabel));
} finally {
  await client.end();
}
