# Interactive PostgreSQL Database Setup

Write-Host "`n🗄️  PostgreSQL Database Setup" -ForegroundColor Cyan
Write-Host "============================`n" -ForegroundColor Cyan

# Get PostgreSQL password
Write-Host "Enter your PostgreSQL 'postgres' user password:" -ForegroundColor Yellow
Write-Host "(This was set when you installed PostgreSQL)" -ForegroundColor Gray
$securePassword = Read-Host -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$pgPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

# Set environment variable for psql
$env:PGPASSWORD = $pgPassword

Write-Host "`n1️⃣  Testing connection..." -ForegroundColor Cyan
$testResult = & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "SELECT version();" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Connected successfully!" -ForegroundColor Green
    
    Write-Host "`n2️⃣  Creating database 'ptcg_carddb'..." -ForegroundColor Cyan
    $createDbResult = & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE ptcg_carddb;" 2>&1
    
    if ($createDbResult -like "*already exists*") {
        Write-Host "✓ Database already exists" -ForegroundColor Yellow
    } elseif ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Database created successfully" -ForegroundColor Green
    } else {
        Write-Host "✗ Error creating database:" -ForegroundColor Red
        Write-Host $createDbResult
        exit 1
    }
    
    Write-Host "`n3️⃣  Updating .env file..." -ForegroundColor Cyan
    $envContent = @"
# Database Configuration
DATABASE_URL="postgresql://postgres:$pgPassword@localhost:5432/ptcg_carddb?schema=public"

# API Configuration
PORT=4000
NODE_ENV=development

# JWT
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN=7d
"@
    
    $envPath = Join-Path $PSScriptRoot ".env"
    Set-Content -Path $envPath -Value $envContent -Encoding UTF8
    Write-Host "✓ Updated .env file" -ForegroundColor Green
    
    Write-Host "`n4️⃣  Running Prisma setup..." -ForegroundColor Cyan
    Write-Host "Generating Prisma client..." -ForegroundColor Gray
    
    Push-Location (Join-Path $PSScriptRoot "packages\database")
    
    # Generate Prisma client
    pnpm db:generate
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Prisma client generated" -ForegroundColor Green
        
        Write-Host "`nRunning database migrations..." -ForegroundColor Gray
        pnpm db:migrate
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Database migrations completed" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Migration had issues, but database is created" -ForegroundColor Yellow
        }
    } else {
        Write-Host "⚠️  Prisma generation had issues" -ForegroundColor Yellow
    }
    
    Pop-Location
    
    Write-Host "`n✅ Database Setup Complete!" -ForegroundColor Green
    Write-Host "`n📋 Database Details:" -ForegroundColor Cyan
    Write-Host "  Database: ptcg_carddb" -ForegroundColor White
    Write-Host "  User:     postgres" -ForegroundColor White
    Write-Host "  Host:     localhost:5432" -ForegroundColor White
    
    Write-Host "`n📚 Next Steps:" -ForegroundColor Cyan
    Write-Host "  1. Start the API server:" -ForegroundColor Yellow
    Write-Host "     cd apps\api" -ForegroundColor Gray
    Write-Host "     npm run dev" -ForegroundColor Gray
    Write-Host "`n  2. Import cards:" -ForegroundColor Yellow
    Write-Host "     cd scrapers" -ForegroundColor Gray
    Write-Host "     python import_cards_to_api.py" -ForegroundColor Gray
    
} else {
    Write-Host "✗ Connection failed!" -ForegroundColor Red
    Write-Host "`nPossible issues:" -ForegroundColor Yellow
    Write-Host "  - Incorrect password" -ForegroundColor White
    Write-Host "  - PostgreSQL not running (but service shows it is)" -ForegroundColor White
    Write-Host "`nTry these:" -ForegroundColor Yellow
    Write-Host "  1. Open pgAdmin and verify your password" -ForegroundColor White
    Write-Host "  2. Check if you can login to pgAdmin with this password" -ForegroundColor White
    Write-Host "  3. If forgotten, you may need to reset the password" -ForegroundColor White
    exit 1
}

# Clear password
$env:PGPASSWORD = $null
