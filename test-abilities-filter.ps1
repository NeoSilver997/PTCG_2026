# Test hasAbilities filter
Write-Host "Testing hasAbilities filter..." -ForegroundColor Cyan

try {
    $withAbilities = Invoke-RestMethod 'http://localhost:4000/api/v1/cards?supertype=POKEMON&hasAbilities=true&take=1'
    $withoutAbilities = Invoke-RestMethod 'http://localhost:4000/api/v1/cards?supertype=POKEMON&hasAbilities=false&take=1'
    
    Write-Host "`n有特性 (With abilities):" -ForegroundColor Green
    Write-Host "  Total: $($withAbilities.pagination.total)"
    if ($withAbilities.data.Count -gt 0) {
        Write-Host "  Sample: $($withAbilities.data[0].webCardId) - $($withAbilities.data[0].name)"
    }
    
    Write-Host "`n無特性 (Without abilities):" -ForegroundColor Yellow
    Write-Host "  Total: $($withoutAbilities.pagination.total)"
    if ($withoutAbilities.data.Count -gt 0) {
        Write-Host "  Sample: $($withoutAbilities.data[0].webCardId) - $($withoutAbilities.data[0].name)"
    }
    
    Write-Host "`nExpected:" -ForegroundColor Magenta
    Write-Host "  With abilities: ~3,062"
    Write-Host "  Without abilities: ~11,069"
    Write-Host "  Total: ~14,131"
    
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}
