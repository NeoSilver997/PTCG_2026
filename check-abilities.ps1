# Stop API server and check abilities data
$connections = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -ne 0 }
if ($connections) { 
    Stop-Process -Id $connections.OwningProcess -Force 
    Start-Sleep -Seconds 2
}

Set-Location c:\AI_Server\Coding\PTCG_2026\packages\database
node check-abilities-sql.mjs
