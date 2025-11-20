import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Validate that DATABASE_URL is not a placeholder
const dbUrl = (process.env.DATABASE_URL || '').trim(); // Remove any whitespace

if (
  dbUrl.includes("user:password@host:port") ||
  dbUrl.includes("user:password@host") ||
  dbUrl === "postgresql://user:password@host:port/database?sslmode=require" ||
  !dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')
) {
  throw new Error(
    `DATABASE_URL is set to a placeholder value or invalid format. Please update your .env file with a real database connection string.\n\n` +
    `Format: postgresql://username:password@host:port/database\n\n` +
    `Quick setup options:\n` +
    `1. Local PostgreSQL: Install PostgreSQL and create a database\n` +
    `   - Install: https://www.postgresql.org/download/windows/\n` +
    `   - Create database: CREATE DATABASE inspect360;\n` +
    `   - Connection string: postgresql://postgres:password@localhost:5432/inspect360\n` +
    `2. Docker: docker run --name inspect360-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=inspect360 -p 5432:5432 -d postgres:15\n` +
    `   - Connection string: postgresql://postgres:postgres@localhost:5432/inspect360\n\n` +
    `Note: If your password contains special characters (@, :, /, #, %), you must URL-encode them in the connection string.\n\n` +
    `See DATABASE_SETUP.md for detailed instructions.`
  );
}

// Create pool with connection string
// The pg library will handle parsing the connection string
export const pool = new Pool({ 
  connectionString: dbUrl,
  // Add connection error handling
  connectionTimeoutMillis: 5000,
});

// Test connection on startup
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export const db = drizzle(pool, { schema });
