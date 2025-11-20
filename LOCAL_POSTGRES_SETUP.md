# Local PostgreSQL Setup Guide

Your code is now configured to use a standard local PostgreSQL database (not Neon).

## Quick Setup Steps

### 1. Install PostgreSQL (if not already installed)

**Windows:**
- Download from: https://www.postgresql.org/download/windows/
- Or use Chocolatey: `choco install postgresql`
- During installation, remember the password you set for the `postgres` user

### 2. Create the Database

Open a terminal and run:

```powershell
# Connect to PostgreSQL (replace 'postgres' with your password if different)
psql -U postgres

# Create the database
CREATE DATABASE inspect360;

# Exit psql
\q
```

**Alternative using pgAdmin:**
1. Open pgAdmin
2. Connect to your PostgreSQL server
3. Right-click "Databases" → "Create" → "Database"
4. Name it `inspect360`
5. Click "Save"

### 3. Update Your `.env` File

Open `.env` in your project root and update the `DATABASE_URL`:

```
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/inspect360
```

**Replace:**
- `postgres` (first occurrence) - your PostgreSQL username (usually `postgres`)
- `yourpassword` - your PostgreSQL password
- `inspect360` - database name (use what you created in step 2)

**Example:**
```
DATABASE_URL=postgresql://postgres:mypassword@localhost:5432/inspect360
```

### 4. Run Database Migrations

```powershell
npm run db:push
```

This will create all the necessary tables in your database.

### 5. Start the Server

```powershell
npm run dev
```

✅ **Done!** Your local PostgreSQL database is ready.

## Troubleshooting

### Error: "psql: command not found"
- Make sure PostgreSQL is installed
- Add PostgreSQL's `bin` directory to your PATH
- Default location: `C:\Program Files\PostgreSQL\<version>\bin`

### Error: "password authentication failed"
- Double-check your password in the DATABASE_URL
- Try resetting the postgres user password in pgAdmin

### Error: "database does not exist"
- Make sure you created the database (step 2)
- Check the database name in your DATABASE_URL matches what you created

### Error: "connection refused" or "connection timeout"
- Make sure PostgreSQL service is running
- Check if it's running on port 5432 (default)
- Try: `netstat -an | findstr 5432` to verify the port is open

## Using Docker (Alternative)

If you have Docker installed:

```powershell
# Run PostgreSQL container
docker run --name inspect360-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=inspect360 -p 5432:5432 -d postgres:15

# Update .env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/inspect360

# Run migrations
npm run db:push

# Start server
npm run dev
```

