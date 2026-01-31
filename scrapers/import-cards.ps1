# Import Japanese Cards to Database
# This script uses ts-node to run the TypeScript importer directly

Write-Host "`n🎯 PTCG Japanese Card Import" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

# Check DATABASE_URL
if (-not $env:DATABASE_URL) {
    Write-Host "⚠️  DATABASE_URL environment variable not set!" -ForegroundColor Yellow
    Write-Host "Please set it in your environment or .env file`n" -ForegroundColor Yellow
    Write-Host "Example:" -ForegroundColor White
    Write-Host '  $env:DATABASE_URL="postgresql://user:password@localhost:5432/ptcg_carddb"' -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host "✓ Database URL configured" -ForegroundColor Green
Write-Host "✓ Starting import process...`n" -ForegroundColor Green

# Run TypeScript import script with ts-node
Write-Host "📦 Running importer..." -ForegroundColor Cyan
npx tsx import-cards-direct.ts

Write-Host "`n✅ Import complete!" -ForegroundColor Green
