# Inspect360 Database Setup Script
Write-Host "=== Inspect360 Database Setup ===" -ForegroundColor Cyan
Write-Host ""

# Check if .env file exists
if (-not (Test-Path .env)) {
    Write-Host "Creating .env file from .env.example..." -ForegroundColor Yellow
    Copy-Item .env.example .env
    Write-Host "✓ .env file created" -ForegroundColor Green
}

# Read current DATABASE_URL
$envContent = Get-Content .env -Raw
$currentDbUrl = if ($envContent -match 'DATABASE_URL=(.+)') { $matches[1].Trim() } else { "" }

# Check if it's a placeholder
if ($currentDbUrl -match "user:password@host" -or $currentDbUrl -eq "postgresql://user:password@host:port/database?sslmode=require") {
    Write-Host "⚠️  DATABASE_URL is set to a placeholder value." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Quick Setup Options:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Neon (Recommended - Free, 2 minutes)" -ForegroundColor Green
    Write-Host "   → Visit: https://neon.tech" -ForegroundColor White
    Write-Host "   → Sign up (free)" -ForegroundColor White
    Write-Host "   → Create project" -ForegroundColor White
    Write-Host "   → Copy connection string" -ForegroundColor White
    Write-Host "   → Paste it into .env as DATABASE_URL" -ForegroundColor White
    Write-Host ""
    Write-Host "2. Install PostgreSQL locally" -ForegroundColor Yellow
    Write-Host "   → Download: https://www.postgresql.org/download/windows/" -ForegroundColor White
    Write-Host "   → Or use: choco install postgresql" -ForegroundColor White
    Write-Host "   → Then set: DATABASE_URL=postgresql://postgres:password@localhost:5432/inspect360" -ForegroundColor White
    Write-Host ""
    Write-Host "3. Install Docker and run PostgreSQL" -ForegroundColor Yellow
    Write-Host "   → Install Docker Desktop: https://www.docker.com/products/docker-desktop" -ForegroundColor White
    Write-Host "   → Run: docker run --name inspect360-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=inspect360 -p 5432:5432 -d postgres:15" -ForegroundColor White
    Write-Host "   → Then set: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/inspect360" -ForegroundColor White
    Write-Host ""
    
    $choice = Read-Host "Have you set up a database? (y/n)"
    if ($choice -eq "y" -or $choice -eq "Y") {
        Write-Host ""
        Write-Host "Please enter your DATABASE_URL:" -ForegroundColor Cyan
        Write-Host "(Format: postgresql://user:password@host:port/database?sslmode=require)" -ForegroundColor Gray
        $newDbUrl = Read-Host "DATABASE_URL"
        
        if ($newDbUrl -and -not ($newDbUrl -match "user:password@host")) {
            # Update .env file
            $envContent = $envContent -replace 'DATABASE_URL=.*', "DATABASE_URL=$newDbUrl"
            Set-Content .env $envContent
            Write-Host ""
            Write-Host "✓ DATABASE_URL updated in .env file" -ForegroundColor Green
            Write-Host ""
            Write-Host "Next steps:" -ForegroundColor Cyan
            Write-Host "1. Run: npm run db:push" -ForegroundColor White
            Write-Host "2. Run: npm run dev" -ForegroundColor White
        } else {
            Write-Host "⚠️  Invalid DATABASE_URL. Please update .env manually." -ForegroundColor Red
        }
    } else {
        Write-Host ""
        Write-Host "📖 See DATABASE_SETUP.md for detailed instructions" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Quickest option: Use Neon (free, 2 minutes)" -ForegroundColor Green
        Write-Host "→ https://neon.tech" -ForegroundColor White
    }
} else {
    Write-Host "✓ DATABASE_URL appears to be configured" -ForegroundColor Green
    Write-Host ""
    Write-Host "Current DATABASE_URL: $($currentDbUrl.Substring(0, [Math]::Min(50, $currentDbUrl.Length)))..." -ForegroundColor Gray
    Write-Host ""
    Write-Host "To verify your database connection:" -ForegroundColor Cyan
    Write-Host "1. Run: npm run db:push" -ForegroundColor White
    Write-Host "2. Run: npm run dev" -ForegroundColor White
}

Write-Host ""

