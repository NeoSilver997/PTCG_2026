# Cloudflare Tunnel Quick Setup for PTCG CardDB (Windows)
# This script helps set up Cloudflare Tunnel to expose local services

$ErrorActionPreference = "Stop"

$TUNNEL_NAME = "ptcg-tunnel"
$DOMAIN = "ptcg002.tcghk.trade"
$WEB_SERVICE = "http://192.168.50.56:3001"
$API_SERVICE = "http://192.168.50.56:4000"

Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Cloudflare Tunnel Setup for PTCG CardDB                   ║" -ForegroundColor Cyan
Write-Host "║   Domain: $DOMAIN                              ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Function to check if service is running
function Test-ServiceRunning {
    param(
        [string]$Url,
        [string]$Name
    )
    
    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec 5 -UseBasicParsing -ErrorAction SilentlyContinue
        Write-Host "✅ $Name is running at $Url" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "❌ $Name is NOT running at $Url" -ForegroundColor Red
        return $false
    }
}

# Step 1: Check if cloudflared is installed
Write-Host "Step 1: Checking cloudflared installation..." -ForegroundColor Yellow
try {
    $version = cloudflared --version 2>&1 | Select-Object -First 1
    Write-Host "✅ cloudflared is installed: $version" -ForegroundColor Green
}
catch {
    Write-Host "❌ cloudflared is not installed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install cloudflared first:"
    Write-Host "  winget install --id Cloudflare.cloudflared"
    Write-Host ""
    Write-Host "Or download from: https://github.com/cloudflare/cloudflared/releases"
    exit 1
}
Write-Host ""

# Step 2: Check if local services are running
Write-Host "Step 2: Checking local services..." -ForegroundColor Yellow
$webOk = Test-ServiceRunning -Url $WEB_SERVICE -Name "Web App (Next.js)"
$apiOk = Test-ServiceRunning -Url "$API_SERVICE/api/v1/cards?take=1" -Name "API Server (NestJS)"

if (-not $webOk -or -not $apiOk) {
    Write-Host ""
    Write-Host "⚠️  Warning: Some services are not running" -ForegroundColor Yellow
    Write-Host "Please start your services first:"
    Write-Host "  cd apps\web && pnpm dev"
    Write-Host "  cd apps\api && pnpm dev"
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        exit 1
    }
}
Write-Host ""

# Step 3: Check authentication
Write-Host "Step 3: Checking Cloudflare authentication..." -ForegroundColor Yellow
$certPath = "$env:USERPROFILE\.cloudflared\cert.pem"
if (-not (Test-Path $certPath)) {
    Write-Host "❌ Not authenticated with Cloudflare" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please run: cloudflared tunnel login"
    Write-Host "This will open a browser to authenticate with Cloudflare"
    Write-Host ""
    exit 1
}
Write-Host "✅ Authenticated with Cloudflare" -ForegroundColor Green
Write-Host ""

# Step 4: Check if tunnel exists
Write-Host "Step 4: Checking tunnel status..." -ForegroundColor Yellow
$tunnelList = cloudflared tunnel list 2>&1 | Out-String
if ($tunnelList -match $TUNNEL_NAME) {
    Write-Host "✅ Tunnel '$TUNNEL_NAME' already exists" -ForegroundColor Green
    # Extract tunnel ID (this is a simplified extraction, may need adjustment)
    $tunnelId = ($tunnelList -split "`n" | Where-Object { $_ -match $TUNNEL_NAME })[0] -split '\s+' | Select-Object -First 1
    Write-Host "   Tunnel ID: $tunnelId" -ForegroundColor Gray
}
else {
    Write-Host "❌ Tunnel '$TUNNEL_NAME' does not exist" -ForegroundColor Red
    Write-Host ""
    $create = Read-Host "Create tunnel now? (y/N)"
    if ($create -eq "y" -or $create -eq "Y") {
        Write-Host "Creating tunnel..." -ForegroundColor Yellow
        cloudflared tunnel create $TUNNEL_NAME
        $tunnelList = cloudflared tunnel list 2>&1 | Out-String
        $tunnelId = ($tunnelList -split "`n" | Where-Object { $_ -match $TUNNEL_NAME })[0] -split '\s+' | Select-Object -First 1
        Write-Host "✅ Tunnel created with ID: $tunnelId" -ForegroundColor Green
    }
    else {
        Write-Host "Please create tunnel manually: cloudflared tunnel create $TUNNEL_NAME"
        exit 1
    }
}
Write-Host ""

# Step 5: Configure DNS
Write-Host "Step 5: Configuring DNS..." -ForegroundColor Yellow
try {
    $dnsResult = cloudflared tunnel route dns $TUNNEL_NAME $DOMAIN 2>&1 | Out-String
    if ($dnsResult -match "already exists") {
        Write-Host "✅ DNS already configured for $DOMAIN" -ForegroundColor Green
    }
    else {
        Write-Host "✅ DNS configured successfully" -ForegroundColor Green
    }
}
catch {
    Write-Host "⚠️  DNS configuration may need manual setup" -ForegroundColor Yellow
    Write-Host "   Please configure CNAME record in Cloudflare Dashboard:"
    Write-Host "   Type: CNAME"
    Write-Host "   Name: ptcg002"
    Write-Host "   Content: $tunnelId.cfargotunnel.com"
}
Write-Host ""

# Step 6: Create/update config file
Write-Host "Step 6: Setting up configuration..." -ForegroundColor Yellow
$configDir = "$env:USERPROFILE\.cloudflared"
$configFile = "$configDir\config.yml"

if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

if (-not (Test-Path $configFile)) {
    Write-Host "Creating configuration file..." -ForegroundColor Yellow
    
    $configContent = @"
tunnel: $tunnelId
credentials-file: $configDir\$tunnelId.json

ingress:
  - hostname: $DOMAIN
    path: ^/((?!api).)*$
    service: $WEB_SERVICE
    originRequest:
      noTLSVerify: true
      
  - hostname: $DOMAIN
    path: /api/*
    service: $API_SERVICE
    originRequest:
      noTLSVerify: true
      
  - service: http_status:404

loglevel: info
metrics: 0.0.0.0:9090
"@
    
    Set-Content -Path $configFile -Value $configContent
    Write-Host "✅ Configuration file created at $configFile" -ForegroundColor Green
}
else {
    Write-Host "✅ Configuration file already exists at $configFile" -ForegroundColor Green
    Write-Host "   (Not overwriting - edit manually if needed)" -ForegroundColor Gray
}
Write-Host ""

# Step 7: Summary
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                    Setup Complete!                           ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start the tunnel:" -ForegroundColor Yellow
Write-Host "  cloudflared tunnel run $TUNNEL_NAME" -ForegroundColor White
Write-Host ""
Write-Host "Or install as a Windows service:" -ForegroundColor Yellow
Write-Host "  cloudflared service install" -ForegroundColor White
Write-Host "  sc start cloudflared" -ForegroundColor White
Write-Host "  sc config cloudflared start=auto" -ForegroundColor White
Write-Host ""
Write-Host "Your services will be available at:" -ForegroundColor Yellow
Write-Host "  🌐 Website: https://$DOMAIN" -ForegroundColor Cyan
Write-Host "  🔌 API:     https://$DOMAIN/api/v1" -ForegroundColor Cyan
Write-Host ""
Write-Host "View tunnel info:" -ForegroundColor Yellow
Write-Host "  cloudflared tunnel info $TUNNEL_NAME" -ForegroundColor White
Write-Host ""
Write-Host "For detailed instructions, see: CLOUDFLARE_TUNNEL.md" -ForegroundColor Yellow
Write-Host ""
