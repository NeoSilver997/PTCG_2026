# Quick Database Setup - Manual Steps

Write-Host "`n🗄️  PostgreSQL Manual Setup Guide" -ForegroundColor Cyan
Write-Host "==================================`n" -ForegroundColor Cyan

Write-Host "Since automated setup requires the postgres password," -ForegroundColor Yellow
Write-Host "here are the manual steps to set up the database:`n" -ForegroundColor Yellow

Write-Host "📍 Step 1: Find PostgreSQL Installation" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
$pgPath = "C:\Program Files\PostgreSQL\16"
if (Test-Path $pgPath) {
    Write-Host "✓ PostgreSQL found at: $pgPath" -ForegroundColor Green
} else {
    Write-Host "⚠️  PostgreSQL not found at default location" -ForegroundColor Yellow
}

Write-Host "`n📍 Step 2: Use pgAdmin (GUI Tool)" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host "1. Open pgAdmin from Start Menu" -ForegroundColor White
Write-Host "2. Click on 'PostgreSQL 16' server" -ForegroundColor White
Write-Host "3. Enter your postgres password (set during installation)" -ForegroundColor White
Write-Host "4. Right-click 'Databases' → Create → Database" -ForegroundColor White
Write-Host "5. Database name: ptcg_carddb" -ForegroundColor White
Write-Host "6. Click Save" -ForegroundColor White

Write-Host "`n📍 Step 3: Create .env File" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host "Use your postgres credentials:" -ForegroundColor White

$envContent = @"
# Database Configuration (UPDATE WITH YOUR POSTGRES PASSWORD)
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD_HERE@localhost:5432/ptcg_carddb?schema=public"

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
Write-Host "✓ Created template .env file at: $envPath" -ForegroundColor Green
Write-Host "`n⚠️  IMPORTANT: Edit .env and replace YOUR_PASSWORD_HERE with your actual postgres password!" -ForegroundColor Yellow

Write-Host "`n📍 Step 4: Run Prisma Migrations" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host "After creating the database and updating .env:" -ForegroundColor White
Write-Host "  cd packages\database" -ForegroundColor Gray
Write-Host "  npx prisma generate" -ForegroundColor Gray
Write-Host "  npx prisma migrate deploy" -ForegroundColor Gray

Write-Host "`n📍 Step 5: Import Cards" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host "  cd scrapers" -ForegroundColor Gray
Write-Host "  npx tsx import-cards-direct.ts" -ForegroundColor Gray

Write-Host "`n💡 Quick Test Connection:" -ForegroundColor Cyan
Write-Host "After updating .env, test the connection:" -ForegroundColor White
Write-Host '  $env:DATABASE_URL = "postgresql://postgres:YOUR_PASSWORD@localhost:5432/ptcg_carddb"' -ForegroundColor Gray
Write-Host '  & "C:\Program Files\PostgreSQL\16\bin\psql.exe" $env:DATABASE_URL -c "SELECT version();"' -ForegroundColor Gray

Write-Host "`n✨ Need Help?" -ForegroundColor Cyan
Write-Host "If you forgot your postgres password, you can reset it by:" -ForegroundColor White
Write-Host "1. Edit: C:\Program Files\PostgreSQL\16\data\pg_hba.conf" -ForegroundColor Gray
Write-Host "2. Change 'md5' to 'trust' for localhost connections" -ForegroundColor Gray
Write-Host "3. Restart PostgreSQL service" -ForegroundColor Gray
Write-Host "4. Run: ALTER USER postgres WITH PASSWORD 'newpassword';" -ForegroundColor Gray
Write-Host "5. Change 'trust' back to 'md5' in pg_hba.conf" -ForegroundColor Gray
Write-Host "6. Restart PostgreSQL service again" -ForegroundColor Gray

Write-Host "`n📧 .env file created. Remember to update YOUR_PASSWORD_HERE!" -ForegroundColor Yellow
