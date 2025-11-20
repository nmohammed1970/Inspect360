# Fix PostgreSQL Password Authentication Error

## Error: "password authentication failed for user 'postgres'"

This error means the password in your `DATABASE_URL` doesn't match your PostgreSQL `postgres` user password.

## Solutions

### Option 1: Update DATABASE_URL with Correct Password

1. **Find out your PostgreSQL password:**
   - Remember what password you set during PostgreSQL installation
   - Or check if you're using the default (often empty or "postgres")

2. **Update your `.env` file:**
   ```env
   DATABASE_URL=postgresql://postgres:YOUR_ACTUAL_PASSWORD@localhost:5432/inspect360
   ```
   Replace `YOUR_ACTUAL_PASSWORD` with your actual PostgreSQL password.

3. **If password has special characters, URL-encode them:**
   - `@` → `%40`
   - `:` → `%3A`
   - `/` → `%2F`

### Option 2: Reset PostgreSQL Password

If you forgot your password, reset it:

**Step 1: Edit PostgreSQL configuration to allow local connections without password**

1. Find your PostgreSQL data directory (usually `C:\Program Files\PostgreSQL\<version>\data`)
2. Edit `pg_hba.conf` file
3. Find the line:
   ```
   host    all             all             127.0.0.1/32            scram-sha-256
   ```
4. Temporarily change it to:
   ```
   host    all             all             127.0.0.1/32            trust
   ```
5. Restart PostgreSQL service

**Step 2: Connect and reset password**

```powershell
# Connect without password (now possible due to 'trust' setting)
psql -U postgres

# Reset password
ALTER USER postgres PASSWORD 'newpassword';

# Exit
\q
```

**Step 3: Restore security**

1. Edit `pg_hba.conf` again
2. Change back to:
   ```
   host    all             all             127.0.0.1/32            scram-sha-256
   ```
3. Restart PostgreSQL service

**Step 4: Update DATABASE_URL**

```env
DATABASE_URL=postgresql://postgres:newpassword@localhost:5432/inspect360
```

### Option 3: Use pgAdmin to Reset Password

1. Open **pgAdmin**
2. Connect to your PostgreSQL server
3. Right-click on `postgres` user → Properties
4. Go to "Definition" tab
5. Enter new password → Save
6. Update your `.env` file with the new password

### Option 4: Create a New User (Recommended for Development)

Instead of using the `postgres` superuser, create a dedicated user:

```powershell
# Connect as postgres user
psql -U postgres

# Create new user and database
CREATE USER inspect360_user WITH PASSWORD 'inspect360_pass';
CREATE DATABASE inspect360 OWNER inspect360_user;
GRANT ALL PRIVILEGES ON DATABASE inspect360 TO inspect360_user;

# Exit
\q
```

Then update your `.env`:
```env
DATABASE_URL=postgresql://inspect360_user:inspect360_pass@localhost:5432/inspect360
```

### Quick Test

Test your connection string:

```powershell
# Replace with your actual connection string
psql "postgresql://postgres:yourpassword@localhost:5432/inspect360"
```

If it connects without errors, the password is correct!

