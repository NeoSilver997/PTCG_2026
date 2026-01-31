# PostgreSQL Setup Script for PTCG CardDB
# Run this script to create the database and configure the environment

Write-Host "`n🗄️  PostgreSQL Setup for PTCG CardDB" -ForegroundColor Cyan
Write-Host "====================================`n" -ForegroundColor Cyan

# Check if PostgreSQL is running
$pgService = Get-Service -Name "postgresql-x64-16" -ErrorAction SilentlyContinue
if ($pgService) {
    if ($pgService.Status -ne 'Running') {
        Write-Host "⚠️  PostgreSQL service is not running. Starting..." -ForegroundColor Yellow
        Start-Service "postgresql-x64-16"
        Start-Sleep -Seconds 2
        Write-Host "✓ PostgreSQL service started" -ForegroundColor Green
    } else {
        Write-Host "✓ PostgreSQL service is running" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  PostgreSQL service not found. Please ensure PostgreSQL is installed." -ForegroundColor Red
    exit 1
}

Write-Host "`n📝 Database Setup" -ForegroundColor Yellow
Write-Host "=================" -ForegroundColor Yellow

# Get database credentials
Write-Host "`nEnter PostgreSQL superuser password (set during installation):" -ForegroundColor Cyan
$password = Read-Host -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
$pgPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

# Set environment variable for psql
$env:PGPASSWORD = $pgPassword

Write-Host "`n1️⃣  Creating database 'ptcg_carddb'..." -ForegroundColor Cyan
$createDbResult = & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE ptcg_carddb;" 2>&1

if ($createDbResult -like "*already exists*") {
    Write-Host "⚠️  Database already exists" -ForegroundColor Yellow
} elseif ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Database created successfully" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to create database" -ForegroundColor Red
    Write-Host $createDbResult
    exit 1
}

Write-Host "`n2️⃣  Creating application user 'ptcg_user'..." -ForegroundColor Cyan
$createUserResult = & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d ptcg_carddb -c "CREATE USER ptcg_user WITH PASSWORD 'ptcg_password';" 2>&1

if ($createUserResult -like "*already exists*") {
    Write-Host "⚠️  User already exists" -ForegroundColor Yellow
} elseif ($LASTEXITCODE -eq 0) {
    Write-Host "✓ User created successfully" -ForegroundColor Green
} else {
    Write-Host "⚠️  User creation issue (may already exist)" -ForegroundColor Yellow
}

Write-Host "`n3️⃣  Granting privileges..." -ForegroundColor Cyan
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d ptcg_carddb -c "GRANT ALL PRIVILEGES ON DATABASE ptcg_carddb TO ptcg_user;" | Out-Null
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d ptcg_carddb -c "GRANT ALL ON SCHEMA public TO ptcg_user;" | Out-Null
Write-Host "✓ Privileges granted" -ForegroundColor Green

# Clear password from environment
$env:PGPASSWORD = $null

Write-Host "`n4️⃣  Creating .env file..." -ForegroundColor Cyan
$envContent = @"
# Database Configuration
DATABASE_URL="postgresql://ptcg_user:ptcg_password@localhost:5432/ptcg_carddb?schema=public"

# API Configuration
PORT=4000
NODE_ENV=development

# Redis (optional)
# REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN=7d
"@

$envPath = Join-Path $PSScriptRoot ".." ".env"
Set-Content -Path $envPath -Value $envContent -Encoding UTF8
Write-Host "✓ Created .env file at: $envPath" -ForegroundColor Green

Write-Host "`n✅ Database Setup Complete!" -ForegroundColor Green
Write-Host "`n📋 Connection Details:" -ForegroundColor Cyan
Write-Host "  Database: ptcg_carddb" -ForegroundColor White
Write-Host "  User:     ptcg_user" -ForegroundColor White
Write-Host "  Password: ptcg_password" -ForegroundColor White
Write-Host "  Host:     localhost:5432" -ForegroundColor White

Write-Host "`n🔒 Security Note:" -ForegroundColor Yellow
Write-Host "  The default password 'ptcg_password' is set for development." -ForegroundColor White
Write-Host "  Change it in production environments!" -ForegroundColor White

Write-Host "`n📚 Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Run Prisma migrations:" -ForegroundColor Yellow
Write-Host "     cd packages\database" -ForegroundColor Gray
Write-Host "     npx prisma generate" -ForegroundColor Gray
Write-Host "     npx prisma migrate deploy" -ForegroundColor Gray
Write-Host "`n  2. Import Japanese cards:" -ForegroundColor Yellow
Write-Host "     cd scrapers" -ForegroundColor Gray
Write-Host "     npx tsx import-cards-direct.ts" -ForegroundColor Gray

Write-Host "`n✨ Setup complete! Ready to import cards." -ForegroundColor Green
