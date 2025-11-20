# Database Setup Guide

## ⚠️ Current Issue
Your `DATABASE_URL` is set to a placeholder value. You need to set up a real PostgreSQL database.

## Quick Setup Options

### Option 1: Neon (Recommended - Free & Easy) ⭐

**Neon is a serverless PostgreSQL that's perfect for development. It's free and takes 2 minutes to set up.**

1. **Sign up at [https://neon.tech](https://neon.tech)**
   - Click "Sign Up" (you can use GitHub, Google, or email)
   - It's completely free for development

2. **Create a new project**
   - Click "Create Project"
   - Choose a name (e.g., "inspect360")
   - Select a region close to you
   - Click "Create Project"

3. **Get your connection string**
   - After creating the project, you'll see a connection string like:
     ```
     postgresql://username:password@ep-xxxx-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
     ```
   - Click "Copy" to copy the connection string

4. **Update your `.env` file**
   - Open `.env` in your project root
   - Replace the placeholder `DATABASE_URL` with your Neon connection string:
     ```
     DATABASE_URL=postgresql://username:password@ep-xxxx-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
     ```

5. **Run migrations**
   ```bash
   npm run db:push
   ```

6. **Start the server**
   ```bash
   npm run dev
   ```

✅ **Done!** Your database is now set up.

---

### Option 2: Local PostgreSQL

If you prefer to run PostgreSQL locally:

1. **Install PostgreSQL**
   - Windows: Download from [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/)
   - Or use Chocolatey: `choco install postgresql`
   - Or use Docker: `docker run --name postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres`

2. **Create a database**
   ```bash
   # Using psql command line
   psql -U postgres
   CREATE DATABASE inspect360;
   \q
   ```

3. **Update your `.env` file**
   ```
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/inspect360
   ```
   *(Replace `postgres:postgres` with your actual PostgreSQL username and password)*

4. **Run migrations**
   ```bash
   npm run db:push
   ```

5. **Start the server**
   ```bash
   npm run dev
   ```

---

### Option 3: Docker PostgreSQL (Quick Local Setup)

If you have Docker installed:

1. **Run PostgreSQL container**
   ```bash
   docker run --name inspect360-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=inspect360 -p 5432:5432 -d postgres:15
   ```

2. **Update your `.env` file**
   ```
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/inspect360
   ```

3. **Run migrations**
   ```bash
   npm run db:push
   ```

4. **Start the server**
   ```bash
   npm run dev
   ```

---

## Verification

After setting up your database, verify it works:

1. Check that your `.env` file has a real `DATABASE_URL` (not the placeholder)
2. Run `npm run db:push` - this should complete without errors
3. Run `npm run dev` - the server should start without database connection errors

## Troubleshooting

### Error: "Invalid URL"
- Make sure your `DATABASE_URL` doesn't have the placeholder values
- Check for extra spaces or quotes in the `.env` file
- Ensure the connection string starts with `postgresql://`

### Error: "Connection refused" or "Connection timeout"
- **Neon**: Check that your IP is allowed (Neon allows all IPs by default)
- **Local**: Make sure PostgreSQL is running (`pg_isready` or check services)
- **Docker**: Make sure the container is running (`docker ps`)

### Error: "Database does not exist"
- For local PostgreSQL, make sure you created the database first
- For Neon, the database is created automatically with your project

### Error: "Password authentication failed"
- Double-check your username and password in the connection string
- For Neon, make sure you copied the full connection string including the password

## Need Help?

- **Neon Documentation**: [https://neon.tech/docs](https://neon.tech/docs)
- **PostgreSQL Documentation**: [https://www.postgresql.org/docs/](https://www.postgresql.org/docs/)

