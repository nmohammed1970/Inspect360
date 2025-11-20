# Quick Start - Database Setup

## ⚡ Fastest Solution: Neon (2 minutes, FREE)

1. **Go to https://neon.tech** and sign up (free account)

2. **Create a new project:**
   - Click "Create Project"
   - Name it "inspect360" 
   - Choose a region
   - Click "Create Project"

3. **Copy your connection string:**
   - After creating, you'll see a connection string like:
     ```
     postgresql://username:password@ep-xxxx-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
     ```
   - Click the "Copy" button

4. **Update your `.env` file:**
   - Open `.env` in the project root
   - Find the line: `DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require`
   - Replace it with your Neon connection string:
     ```
     DATABASE_URL=postgresql://username:password@ep-xxxx-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
     ```
   - Save the file

5. **Run migrations:**
   ```powershell
   npm run db:push
   ```

6. **Start the server:**
   ```powershell
   npm run dev
   ```

✅ **Done!** Your database is ready.

---

## Alternative: Local PostgreSQL

If you prefer local setup:

1. **Install PostgreSQL:**
   - Download: https://www.postgresql.org/download/windows/
   - Or use Chocolatey: `choco install postgresql`

2. **Create database:**
   ```powershell
   # After installation, open psql and run:
   CREATE DATABASE inspect360;
   ```

3. **Update `.env`:**
   ```
   DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/inspect360
   ```

4. **Run migrations and start:**
   ```powershell
   npm run db:push
   npm run dev
   ```

