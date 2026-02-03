#!/bin/bash

# Cloudflare Tunnel Quick Setup for PTCG CardDB
# This script helps set up Cloudflare Tunnel to expose local services

set -e

TUNNEL_NAME="ptcg-tunnel"
DOMAIN="ptcg002.tcghk.trade"
WEB_SERVICE="http://192.168.50.56:3001"
API_SERVICE="http://192.168.50.56:4000"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   Cloudflare Tunnel Setup for PTCG CardDB                   ║"
echo "║   Domain: $DOMAIN                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if service is running
check_service() {
    local url=$1
    local name=$2
    
    if curl -s --max-time 5 "$url" > /dev/null 2>&1; then
        echo "✅ $name is running at $url"
        return 0
    else
        echo "❌ $name is NOT running at $url"
        return 1
    fi
}

# Step 1: Check if cloudflared is installed
echo "Step 1: Checking cloudflared installation..."
if ! command_exists cloudflared; then
    echo "❌ cloudflared is not installed"
    echo ""
    echo "Please install cloudflared first:"
    echo ""
    echo "Windows:"
    echo "  winget install --id Cloudflare.cloudflared"
    echo ""
    echo "macOS:"
    echo "  brew install cloudflared"
    echo ""
    echo "Linux (Debian/Ubuntu):"
    echo "  wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb"
    echo "  sudo dpkg -i cloudflared-linux-amd64.deb"
    echo ""
    exit 1
fi

CLOUDFLARED_VERSION=$(cloudflared --version | head -n 1)
echo "✅ cloudflared is installed: $CLOUDFLARED_VERSION"
echo ""

# Step 2: Check if local services are running
echo "Step 2: Checking local services..."
WEB_OK=false
API_OK=false

if check_service "$WEB_SERVICE" "Web App (Next.js)"; then
    WEB_OK=true
fi

if check_service "$API_SERVICE/api/v1/cards?take=1" "API Server (NestJS)"; then
    API_OK=true
fi

if [ "$WEB_OK" = false ] || [ "$API_OK" = false ]; then
    echo ""
    echo "⚠️  Warning: Some services are not running"
    echo "Please start your services first:"
    echo "  cd apps/web && pnpm dev"
    echo "  cd apps/api && pnpm dev"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi
echo ""

# Step 3: Check authentication
echo "Step 3: Checking Cloudflare authentication..."
if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
    echo "❌ Not authenticated with Cloudflare"
    echo ""
    echo "Please run: cloudflared tunnel login"
    echo "This will open a browser to authenticate with Cloudflare"
    echo ""
    exit 1
fi
echo "✅ Authenticated with Cloudflare"
echo ""

# Step 4: Check if tunnel exists
echo "Step 4: Checking tunnel status..."
if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
    echo "✅ Tunnel '$TUNNEL_NAME' already exists"
    TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
    echo "   Tunnel ID: $TUNNEL_ID"
else
    echo "❌ Tunnel '$TUNNEL_NAME' does not exist"
    echo ""
    read -p "Create tunnel now? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Creating tunnel..."
        cloudflared tunnel create "$TUNNEL_NAME"
        TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
        echo "✅ Tunnel created with ID: $TUNNEL_ID"
    else
        echo "Please create tunnel manually: cloudflared tunnel create $TUNNEL_NAME"
        exit 1
    fi
fi
echo ""

# Step 5: Check DNS configuration
echo "Step 5: Checking DNS configuration..."
if cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN" 2>&1 | grep -q "already exists"; then
    echo "✅ DNS already configured for $DOMAIN"
elif cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN"; then
    echo "✅ DNS configured successfully"
else
    echo "⚠️  DNS configuration may need manual setup"
    echo "   Please configure CNAME record in Cloudflare Dashboard:"
    echo "   Type: CNAME"
    echo "   Name: ptcg002"
    echo "   Content: $TUNNEL_ID.cfargotunnel.com"
fi
echo ""

# Step 6: Create/update config file
echo "Step 6: Setting up configuration..."
CONFIG_DIR="$HOME/.cloudflared"
CONFIG_FILE="$CONFIG_DIR/config.yml"

mkdir -p "$CONFIG_DIR"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Creating configuration file..."
    cat > "$CONFIG_FILE" << EOF
tunnel: $TUNNEL_ID
credentials-file: $CONFIG_DIR/$TUNNEL_ID.json

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
EOF
    echo "✅ Configuration file created at $CONFIG_FILE"
else
    echo "✅ Configuration file already exists at $CONFIG_FILE"
    echo "   (Not overwriting - edit manually if needed)"
fi
echo ""

# Step 7: Summary and next steps
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    Setup Complete!                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "To start the tunnel:"
echo "  cloudflared tunnel run $TUNNEL_NAME"
echo ""
echo "Or install as a service:"
echo "  cloudflared service install"
echo "  sudo systemctl start cloudflared  (Linux/macOS)"
echo "  sc start cloudflared               (Windows)"
echo ""
echo "Your services will be available at:"
echo "  🌐 Website: https://$DOMAIN"
echo "  🔌 API:     https://$DOMAIN/api/v1"
echo ""
echo "View tunnel info:"
echo "  cloudflared tunnel info $TUNNEL_NAME"
echo ""
echo "View logs:"
echo "  sudo journalctl -u cloudflared -f  (Linux/macOS)"
echo ""
echo "For detailed instructions, see: CLOUDFLARE_TUNNEL.md"
echo ""
