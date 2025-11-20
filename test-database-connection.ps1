# Test PostgreSQL Database Connection
Write-Host "=== PostgreSQL Connection Test ===" -ForegroundColor Cyan
Write-Host ""

# Check if .env file exists
if (-not (Test-Path .env)) {
    Write-Host "Error: .env file not found!" -ForegroundColor Red
    Write-Host "Please create a .env file with DATABASE_URL" -ForegroundColor Yellow
    exit 1
}

# Read DATABASE_URL from .env
$envContent = Get-Content .env -Raw
$dbUrlMatch = if ($envContent -match 'DATABASE_URL=(.+)') { $matches[1].Trim() } else { "" }

if (-not $dbUrlMatch) {
    Write-Host "Error: DATABASE_URL not found in .env file" -ForegroundColor Red
    exit 1
}

Write-Host "Found DATABASE_URL in .env file" -ForegroundColor Green
Write-Host ""

# Parse connection string to show components (hide password)
try {
    $url = [System.Uri]::new($dbUrlMatch)
    Write-Host "Connection Details:" -ForegroundColor Cyan
    Write-Host "  Host: $($url.Host)" -ForegroundColor White
    Write-Host "  Port: $($url.Port)" -ForegroundColor White
    Write-Host "  Database: $($url.AbsolutePath.TrimStart('/'))" -ForegroundColor White
    Write-Host "  Username: $($url.UserInfo.Split(':')[0])" -ForegroundColor White
    $passwordLength = if ($url.UserInfo.Contains(':')) { 
        $url.UserInfo.Split(':')[1].Length 
    } else { 
        0 
    }
    Write-Host "  Password: $('*' * $passwordLength) ($passwordLength characters)" -ForegroundColor White
} catch {
    Write-Host "Warning: Could not parse connection string format" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Testing connection..." -ForegroundColor Cyan

# Check if psql is available
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    Write-Host ""
    Write-Host "psql not found. Cannot test connection directly." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Manual test options:" -ForegroundColor Cyan
    Write-Host "1. Start your server: npm run dev" -ForegroundColor White
    Write-Host "   - If connection works, server will start" -ForegroundColor Gray
    Write-Host "   - If password is wrong, you'll see authentication error" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Install PostgreSQL client tools" -ForegroundColor White
    Write-Host "   - Download: https://www.postgresql.org/download/windows/" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. Test with Node.js script" -ForegroundColor White
    Write-Host "   - Run: node -e `"const {Pool}=require('pg');new Pool({connectionString:process.env.DATABASE_URL}).connect().then(()=>console.log('Connected!')).catch(e=>console.error(e));`"" -ForegroundColor Gray
} else {
    # Test connection
    try {
        $testResult = & psql $dbUrlMatch -c "SELECT version();" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Connection successful!" -ForegroundColor Green
            Write-Host ""
            Write-Host "PostgreSQL version:" -ForegroundColor Cyan
            $testResult | Select-Object -Last 3
        } else {
            Write-Host "✗ Connection failed!" -ForegroundColor Red
            Write-Host ""
            Write-Host "Error details:" -ForegroundColor Yellow
            $testResult | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
            Write-Host ""
            Write-Host "Common fixes:" -ForegroundColor Cyan
            Write-Host "1. Check if password is correct" -ForegroundColor White
            Write-Host "2. URL-encode special characters in password" -ForegroundColor White
            Write-Host "3. Verify PostgreSQL is running" -ForegroundColor White
            Write-Host "4. See fix-database-password.md for reset instructions" -ForegroundColor White
        }
    } catch {
        Write-Host "✗ Connection test failed: $_" -ForegroundColor Red
    }
}

Write-Host ""

