# Cloudflare Tunnel Setup Guide

This guide explains how to expose your local PTCG CardDB application (running on `http://192.168.50.56:3001`) to the internet using Cloudflare Tunnel and the domain `ptcg002.tcghk.trade`.

## What is Cloudflare Tunnel?

Cloudflare Tunnel (formerly Argo Tunnel) creates a secure, outbound-only connection from your local machine to Cloudflare's network. This allows you to:

✅ Expose local services without a public IP  
✅ No need for port forwarding or firewall rules  
✅ Automatic HTTPS/SSL encryption  
✅ DDoS protection from Cloudflare  
✅ Perfect for development and testing  

## Architecture

```
Local Machine (192.168.50.56)
├── Web App (port 3001)
└── API Server (port 4000)
        │
        │ Cloudflare Tunnel (outbound connection)
        ▼
Cloudflare Network
        │
        │ HTTPS
        ▼
Internet Users → https://ptcg002.tcghk.trade
```

## Prerequisites

1. **Cloudflare Account** with `ptcg002.tcghk.trade` domain added
2. **Local services running**:
   - Web App on `http://192.168.50.56:3001`
   - API Server on `http://192.168.50.56:4000`

## Step-by-Step Setup

### Step 1: Install Cloudflared

**Windows:**
```powershell
# Download from https://github.com/cloudflare/cloudflared/releases
# Or use winget
winget install --id Cloudflare.cloudflared
```

**macOS:**
```bash
brew install cloudflared
```

**Linux:**
```bash
# Debian/Ubuntu
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Or using package manager
curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-archive-keyring.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-archive-keyring.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install cloudflared
```

Verify installation:
```bash
cloudflared --version
```

### Step 2: Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

This will:
1. Open a browser window
2. Ask you to select your domain (`ptcg002.tcghk.trade`)
3. Create a certificate in `~/.cloudflared/cert.pem`

### Step 3: Create a Tunnel

```bash
# Create a named tunnel
cloudflared tunnel create ptcg-tunnel

# Note the Tunnel ID displayed (e.g., 12345678-1234-1234-1234-123456789abc)
# This creates a credentials file at ~/.cloudflared/<TUNNEL_ID>.json
```

**Important:** Save the Tunnel ID - you'll need it for configuration.

### Step 4: Configure the Tunnel

Copy the provided configuration file and update it:

```bash
# Copy the template
cp cloudflared-config.yml ~/.cloudflared/config.yml

# Edit the configuration
nano ~/.cloudflared/config.yml
```

Update these values in `config.yml`:
```yaml
tunnel: <YOUR_TUNNEL_ID>  # Replace with your actual tunnel ID
credentials-file: /root/.cloudflared/<YOUR_TUNNEL_ID>.json  # Update path
```

**Example config.yml:**
```yaml
tunnel: 12345678-1234-1234-1234-123456789abc
credentials-file: /root/.cloudflared/12345678-1234-1234-1234-123456789abc.json

ingress:
  # Web App (Next.js)
  - hostname: ptcg002.tcghk.trade
    path: ^/((?!api).)*$
    service: http://192.168.50.56:3001
    
  # API Server (NestJS)
  - hostname: ptcg002.tcghk.trade
    path: /api/*
    service: http://192.168.50.56:4000
    
  # Catch-all
  - service: http_status:404
```

### Step 5: Configure DNS

Create a CNAME record in Cloudflare Dashboard:

```
Type: CNAME
Name: ptcg002
Content: <TUNNEL_ID>.cfargotunnel.com
Proxy: Yes (Orange cloud)
TTL: Auto
```

**Or use CLI:**
```bash
cloudflared tunnel route dns ptcg-tunnel ptcg002.tcghk.trade
```

This automatically creates the CNAME record.

### Step 6: Start the Tunnel

**Test run (foreground):**
```bash
cloudflared tunnel run ptcg-tunnel
```

**Run as background service:**

**Linux/macOS:**
```bash
cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

**Windows:**
```powershell
cloudflared service install
sc start cloudflared
sc config cloudflared start=auto
```

### Step 7: Verify Connection

1. Check tunnel status:
   ```bash
   cloudflared tunnel info ptcg-tunnel
   ```

2. Visit your domain:
   ```
   https://ptcg002.tcghk.trade
   ```

3. Check API endpoint:
   ```
   https://ptcg002.tcghk.trade/api/v1/cards?take=1
   ```

## Configuration for Both Services

The configuration routes traffic based on path:

| Path | Target Service | Local URL |
|------|---------------|-----------|
| `/` | Next.js Web App | `http://192.168.50.56:3001` |
| `/cards` | Next.js Web App | `http://192.168.50.56:3001` |
| `/api/*` | NestJS API | `http://192.168.50.56:4000` |
| `/api/v1/*` | NestJS API | `http://192.168.50.56:4000` |

## Environment Variables

Update your application environment variables:

**Web App (apps/web/.env.local):**
```bash
NEXT_PUBLIC_API_URL=https://ptcg002.tcghk.trade/api/v1
```

**API Server (apps/api/.env):**
```bash
NODE_ENV=production
PORT=4000
ALLOWED_ORIGINS=https://ptcg002.tcghk.trade
```

The API will need to allow the production domain in CORS (already configured if you followed the deployment setup).

## Managing the Tunnel

### View all tunnels:
```bash
cloudflared tunnel list
```

### View tunnel info:
```bash
cloudflared tunnel info ptcg-tunnel
```

### Stop the tunnel:
```bash
# If running as service
sudo systemctl stop cloudflared  # Linux/macOS
sc stop cloudflared              # Windows

# If running in foreground
Ctrl+C
```

### View logs:
```bash
# Linux/macOS
sudo journalctl -u cloudflared -f

# Windows
# Check Event Viewer > Windows Logs > Application
```

### Delete tunnel (if needed):
```bash
# First, remove DNS route
cloudflared tunnel route dns delete ptcg002.tcghk.trade

# Then delete the tunnel
cloudflared tunnel delete ptcg-tunnel
```

## Troubleshooting

### Issue: "tunnel credentials file not found"
**Solution:**
```bash
# Find your credentials file
ls ~/.cloudflared/
# Update config.yml with correct path
```

### Issue: "connection refused to 192.168.50.56:3001"
**Solution:**
```bash
# Ensure your local services are running
# Check if you can access locally first
curl http://192.168.50.56:3001
curl http://192.168.50.56:4000/api/v1/cards?take=1

# Check firewall isn't blocking local connections
```

### Issue: "404 not found"
**Solution:**
- Verify DNS is configured correctly
- Wait a few minutes for DNS propagation
- Check `cloudflared tunnel info ptcg-tunnel`

### Issue: "CORS errors in browser"
**Solution:**
Update API CORS settings in `apps/api/src/main.ts`:
```typescript
app.enableCors({
  origin: ['https://ptcg002.tcghk.trade'],
  credentials: true,
});
```

### Issue: API routes not working
**Solution:**
Check the path matching in `config.yml`. The regex must match your API paths:
```yaml
- hostname: ptcg002.tcghk.trade
  path: /api/*  # Matches /api/v1/cards, etc.
  service: http://192.168.50.56:4000
```

## Advanced Configuration

### Custom Port for Local Services

If your services run on different ports:

```yaml
ingress:
  - hostname: ptcg002.tcghk.trade
    service: http://192.168.50.56:3001  # Change port as needed
```

### Enable Metrics Dashboard

Access tunnel metrics at `http://localhost:9090/metrics`:

```yaml
metrics: 0.0.0.0:9090
```

### Multiple Hostnames/Subdomains

```yaml
ingress:
  - hostname: ptcg002.tcghk.trade
    service: http://192.168.50.56:3001
    
  - hostname: api.ptcg002.tcghk.trade
    service: http://192.168.50.56:4000
    
  - service: http_status:404
```

### Load Balancing (Multiple Origins)

```yaml
ingress:
  - hostname: ptcg002.tcghk.trade
    service: http://192.168.50.56:3001
    originRequest:
      # Connection pooling
      keepAliveConnections: 10
      keepAliveTimeout: 90s
```

## Security Considerations

✅ **Automatic HTTPS** - Cloudflare provides SSL/TLS encryption  
✅ **No open ports** - Outbound-only connection from your network  
✅ **DDoS Protection** - Built-in from Cloudflare  
✅ **Access Control** - Can add Cloudflare Access for authentication  

### Optional: Add Cloudflare Access

Protect your tunnel with authentication:

```bash
# In Cloudflare Dashboard:
# Zero Trust > Access > Applications > Add an application
# Configure authentication (email, Google, GitHub, etc.)
```

## Performance Tips

1. **Enable HTTP/2**: Already enabled by Cloudflare
2. **Connection Pooling**: Configured in `originRequest`
3. **Local Caching**: Use Redis for API responses
4. **Cloudflare Caching**: Configure cache rules in Cloudflare dashboard

## Comparison with Traditional Deployment

| Feature | Cloudflare Tunnel | Traditional Server |
|---------|------------------|-------------------|
| **Setup Time** | 5-10 minutes | 1-2 hours |
| **Cost** | Free (Cloudflare Free tier) | Server hosting fees |
| **SSL Certificate** | Automatic | Manual setup/renewal |
| **DDoS Protection** | Included | Extra cost |
| **Port Forwarding** | Not needed | Required |
| **Public IP** | Not needed | Required |
| **Updates** | Instant (restart tunnel) | Server deployment |
| **Best For** | Development, Testing | Production |

## Quick Start Script

Save this as `start-tunnel.sh`:

```bash
#!/bin/bash
# Start Cloudflare Tunnel for PTCG CardDB

echo "Starting PTCG CardDB Cloudflare Tunnel..."

# Check if services are running
if ! curl -s http://192.168.50.56:3001 > /dev/null; then
    echo "❌ Web app not running on port 3001"
    exit 1
fi

if ! curl -s http://192.168.50.56:4000/api/v1/cards?take=1 > /dev/null; then
    echo "❌ API server not running on port 4000"
    exit 1
fi

echo "✅ Local services are running"
echo "🚀 Starting Cloudflare Tunnel..."

cloudflared tunnel run ptcg-tunnel
```

Make it executable:
```bash
chmod +x start-tunnel.sh
./start-tunnel.sh
```

## Next Steps

1. ✅ Install cloudflared
2. ✅ Authenticate and create tunnel
3. ✅ Configure tunnel with your local IPs
4. ✅ Set up DNS
5. ✅ Start the tunnel
6. ✅ Visit https://ptcg002.tcghk.trade

## Support

For issues:
- Check [Cloudflare Tunnel Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- View logs: `cloudflared tunnel info ptcg-tunnel`
- Cloudflare Community: https://community.cloudflare.com/

---

**You're all set!** Your local development server at `192.168.50.56:3001` is now accessible via `https://ptcg002.tcghk.trade` 🎉
