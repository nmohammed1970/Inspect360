# Database Connection Troubleshooting

## Error: "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string"

This error means PostgreSQL is not receiving a valid password string. Common causes:

### 1. Password Contains Special Characters

If your PostgreSQL password contains special characters like `@`, `:`, `/`, `#`, `%`, you need to **URL-encode** them in the connection string.

**Special Characters and Their URL Encoding:**
- `@` → `%40`
- `:` → `%3A`
- `/` → `%2F`
- `#` → `%23`
- `%` → `%25`
- `&` → `%26`
- `?` → `%3F`
- `=` → `%3D`
- ` ` (space) → `%20`

**Example:**
If your password is `my@pass:word`, use:
```
DATABASE_URL=postgresql://postgres:my%40pass%3Aword@localhost:5432/inspect360
```

### 2. Check Your .env File Format

Make sure your `.env` file has the correct format (no quotes needed):

```env
DATABASE_URL=postgresql://username:password@host:port/database
```

**Common Mistakes:**
- ❌ `DATABASE_URL="postgresql://..."` (quotes can cause issues)
- ❌ `DATABASE_URL= postgresql://...` (leading space)
- ❌ `DATABASE_URL=postgresql://... ` (trailing space)
- ✅ `DATABASE_URL=postgresql://username:password@localhost:5432/inspect360`

### 3. Verify Connection String Format

Your connection string should follow this format:
```
postgresql://[username]:[password]@[host]:[port]/[database]
```

**Local PostgreSQL Example:**
```
postgresql://postgres:mypassword@localhost:5432/inspect360
```

### 4. Test Your Connection String

You can test your connection string using `psql`:

```powershell
# Test the connection
psql "postgresql://postgres:password@localhost:5432/inspect360"
```

### 5. Check PostgreSQL is Running

Make sure PostgreSQL is running:

**Windows:**
```powershell
Get-Service -Name "*postgres*"
```

**Or check if the port is listening:**
```powershell
netstat -an | findstr 5432
```

### 6. Password Reset (If Needed)

If you forgot your PostgreSQL password:

```powershell
# Connect to PostgreSQL as superuser
psql -U postgres

# Change password
ALTER USER postgres PASSWORD 'newpassword';

# Exit
\q
```

### 7. URL Encode Your Password Online

If your password has special characters, use an online URL encoder:
- Go to https://www.urlencoder.org/
- Enter your password
- Copy the encoded version
- Replace the password in your DATABASE_URL

### Quick Fix Steps

1. **Check your `.env` file:**
   - Open `.env` in your project root
   - Find the `DATABASE_URL` line
   - Ensure no quotes, no extra spaces
   - Verify the format: `postgresql://user:pass@host:port/db`

2. **URL-encode special characters:**
   - If password has `@`, `:`, `/`, etc., encode them

3. **Restart your server:**
   ```powershell
   npm run dev
   ```

4. **Test connection:**
   - The server should connect on startup
   - If errors persist, check the exact error message

### Example Connection Strings

**Simple password (no special chars):**
```
DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/inspect360
```

**Password with special characters (encoded):**
```
DATABASE_URL=postgresql://postgres:p%40ssw%3Aord@localhost:5432/inspect360
```

**With SSL:**
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/inspect360?sslmode=require
```

