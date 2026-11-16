import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
const sql = `
INSERT INTO billing_platform_config (key, value)
VALUES
  ('trial_inspection_credits', '2'),
  ('trial_sms_credits', '10')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = NOW()
RETURNING key, value;
`;

const { rows } = await pool.query(sql);
console.log(rows);
await pool.end();
