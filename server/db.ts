import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import pkg from "pg";
const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Parse connection string manually for better error handling
const dbUrl = (process.env.DATABASE_URL || '').trim();
console.log('Database URL:', dbUrl);

// Create pool with explicit configuration
export const pool = new Pool({ 
  connectionString: dbUrl,
  connectionTimeoutMillis: 5000,
  // Explicit SSL configuration (disable for local development)
  ssl: false,
  // Set explicit host to avoid parsing issues
  host: 'localhost',
  port: 5432,
  database: 'Inspect360', // Use lowercase
  user: 'postgres',
  password: 'sjadmin',
});

// Test connection on startup
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Test connection immediately
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
	console.log(pool);
  } else {
    console.log('Database connected successfully:', res.rows[0]);
  }
});

export const db = drizzle(pool, { schema });