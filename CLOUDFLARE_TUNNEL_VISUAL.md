# Cloudflare Tunnel - Visual Guide for Local IP Exposure

## 🎯 Your Question: Can I use Cloudflare to connect local IP http://192.168.50.56:3001?

**YES!** Here's how it works:

```
┌─────────────────────────────────────────────────────────────────┐
│                     YOUR LOCAL NETWORK                           │
│                    (192.168.50.0/24)                            │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Your Computer (192.168.50.56)                         │    │
│  │                                                         │    │
│  │  ┌─────────────────┐      ┌─────────────────┐         │    │
│  │  │  Next.js Web    │      │  NestJS API     │         │    │
│  │  │  Port 3001      │      │  Port 4000      │         │    │
│  │  └────────┬────────┘      └────────┬────────┘         │    │
│  │           │                         │                  │    │
│  │           └─────────┬───────────────┘                  │    │
│  │                     │                                  │    │
│  │           ┌─────────▼──────────┐                       │    │
│  │           │  cloudflared       │                       │    │
│  │           │  (Tunnel Client)   │                       │    │
│  │           └─────────┬──────────┘                       │    │
│  │                     │                                  │    │
│  └─────────────────────┼──────────────────────────────────┘    │
│                        │                                       │
│                        │ Secure Outbound Connection            │
│                        │ (No ports opened!)                    │
└────────────────────────┼───────────────────────────────────────┘
                         │
                         │ HTTPS Tunnel
                         │ (Encrypted)
                         ▼
              ┌──────────────────────┐
              │  Cloudflare Network  │
              │  Edge Servers        │
              └──────────┬───────────┘
                         │
                         │ HTTPS
                         │
                         ▼
              ┌──────────────────────┐
              │  Internet Users      │
              │  Browser/Mobile      │
              └──────────────────────┘
                         
         Access via: https://ptcg002.tcghk.trade
```

## 🔥 The Magic: No Port Forwarding!

**Traditional Deployment (Complex):**
```
Internet → Router → Port Forward (3001) → Your Computer
         ↓
    Need public IP
    Configure router
    Open firewall
    Setup SSL certificate
    Expose to internet attacks
```

**Cloudflare Tunnel (Simple):**
```
Your Computer → Outbound Connection → Cloudflare
                                      ↓
                                  Internet
                                  
✅ No router configuration
✅ No port forwarding
✅ No public IP needed
✅ Automatic SSL
✅ DDoS protection
```

## 📋 How It Works: Step by Step

### 1. **Setup (One Time - 5 minutes)**

```bash
# Run the setup script
./setup-cloudflare-tunnel.sh

# What it does:
✅ Checks if cloudflared is installed
✅ Authenticates with your Cloudflare account
✅ Creates a tunnel named "ptcg-tunnel"
✅ Configures DNS (CNAME record)
✅ Creates configuration file
```

### 2. **Configuration File Created**

```yaml
# ~/.cloudflared/config.yml

tunnel: <your-tunnel-id>
credentials-file: ~/.cloudflared/<your-tunnel-id>.json

ingress:
  # Route web traffic to your local web app
  - hostname: ptcg002.tcghk.trade
    path: ^/((?!api).)*$
    service: http://192.168.50.56:3001  # ← Your local web app
    
  # Route API traffic to your local API server
  - hostname: ptcg002.tcghk.trade
    path: /api/*
    service: http://192.168.50.56:4000  # ← Your local API
```

### 3. **Start Tunnel (Every Time)**

```bash
# Just run this command
cloudflared tunnel run ptcg-tunnel

# Output:
# ✓ Connection established
# ✓ Registered tunnel connection
# ✓ Ready to serve traffic
```

### 4. **Access Your Site**

```
Browser → https://ptcg002.tcghk.trade → Cloudflare → Your Local Machine
```

**Your local services are now live on the internet!** 🎉

## 🚀 Quick Start Commands

### First Time Setup:

**Windows:**
```powershell
# 1. Install cloudflared
winget install --id Cloudflare.cloudflared

# 2. Run setup script
.\setup-cloudflare-tunnel.ps1

# 3. Start tunnel
cloudflared tunnel run ptcg-tunnel
```

**Linux/macOS:**
```bash
# 1. Install cloudflared
brew install cloudflared  # macOS
# or download from GitHub for Linux

# 2. Run setup script
./setup-cloudflare-tunnel.sh

# 3. Start tunnel
cloudflared tunnel run ptcg-tunnel
```

### Daily Use:

```bash
# Start your local services
cd apps/web && pnpm dev  # Runs on :3001
cd apps/api && pnpm dev  # Runs on :4000

# Start the tunnel
cloudflared tunnel run ptcg-tunnel

# Done! Visit: https://ptcg002.tcghk.trade
```

## 🔄 Traffic Flow Example

**User visits https://ptcg002.tcghk.trade/cards:**

```
1. Browser → Cloudflare Edge
   GET https://ptcg002.tcghk.trade/cards
   
2. Cloudflare → Your Tunnel
   Path: /cards matches ^/((?!api).)*$
   Route to: http://192.168.50.56:3001
   
3. Your Local Web App responds
   Next.js serves the cards page
   
4. Cloudflare → Browser
   Response with content + SSL
```

**User calls API https://ptcg002.tcghk.trade/api/v1/cards:**

```
1. Browser → Cloudflare Edge
   GET https://ptcg002.tcghk.trade/api/v1/cards
   
2. Cloudflare → Your Tunnel
   Path: /api/v1/cards matches /api/*
   Route to: http://192.168.50.56:4000
   
3. Your Local API responds
   NestJS returns card data
   
4. Cloudflare → Browser
   JSON response + SSL
```

## 💡 Path Routing Explained

The configuration uses **path-based routing**:

```yaml
# Rule 1: Non-API paths → Web App
- hostname: ptcg002.tcghk.trade
  path: ^/((?!api).)*$          # Regex: matches anything except /api/*
  service: http://192.168.50.56:3001

Examples that match:
  ✅ /
  ✅ /cards
  ✅ /deck-builder
  ✅ /tournaments
  ❌ /api/v1/cards (goes to rule 2)

# Rule 2: API paths → API Server
- hostname: ptcg002.tcghk.trade
  path: /api/*                  # Matches all /api/* paths
  service: http://192.168.50.56:4000

Examples that match:
  ✅ /api/v1/cards
  ✅ /api/v1/decks
  ✅ /api/docs
  ❌ /cards (goes to rule 1)
```

## 🛡️ Security Features

### What You Get For Free:

✅ **SSL/TLS Encryption**
- Automatic HTTPS certificate
- No Let's Encrypt setup needed
- Auto-renewal

✅ **DDoS Protection**
- Cloudflare's network absorbs attacks
- Your local machine is protected

✅ **No Exposed Ports**
- Only outbound connection
- No incoming ports opened
- Firewall stays closed

✅ **Access Logs**
- See who's accessing your site
- Cloudflare Analytics dashboard

### Optional Enhancements:

🔒 **Cloudflare Access** (Add Authentication)
```
Require login before accessing your site
- Email verification
- Google/GitHub OAuth
- Corporate SSO
```

🔥 **Web Application Firewall (WAF)**
```
Block malicious traffic
- SQL injection protection
- XSS prevention
- Bot detection
```

## ⚡ Performance

**Response Time:**
```
Local Network:     ~5ms
Cloudflare Tunnel: ~50-100ms (depending on location)
Traditional Host:  ~100-200ms

Extra latency: ~45-95ms (acceptable for development)
```

**Caching:**
- Static assets cached at Cloudflare edge
- API responses can be cached with headers
- Faster for repeat visitors

## 🆚 Comparison: Cloudflare Tunnel vs Traditional

| Aspect | Cloudflare Tunnel | Traditional Server |
|--------|------------------|-------------------|
| **Cost** | FREE | $5-50/month |
| **Setup Time** | 5 minutes | 1-2 hours |
| **SSL Certificate** | Automatic | Manual (Let's Encrypt) |
| **Maintenance** | None | Updates, patches |
| **DDoS Protection** | Included | Extra cost |
| **Port Forwarding** | Not needed | Required |
| **Public IP** | Not needed | Required |
| **Firewall Config** | Not needed | Required |
| **Updates** | Restart tunnel | Full deployment |
| **Downtime** | Instant restart | Can take minutes |
| **Location** | Your local machine | Remote server |
| **Debugging** | Full local access | SSH/Remote access |
| **Best For** | Dev/Testing | Production |

## 📊 Use Cases

### ✅ Perfect For:

1. **Development Testing**
   - Share work-in-progress with team
   - Test on real domain with HTTPS
   - Mobile device testing

2. **Client Demos**
   - Show features before deployment
   - Get feedback on real domain
   - No need to deploy to staging

3. **Webhook Testing**
   - Test GitHub webhooks
   - OAuth callback URLs
   - Payment gateway integrations

4. **Remote Work**
   - Access your local dev environment from anywhere
   - Work on your home PC from office
   - Consistent development URL

### ⚠️ Not Ideal For:

1. **Production Traffic**
   - Depends on your local machine being on
   - Limited by your internet upload speed
   - Use traditional deployment for production

2. **High Traffic Sites**
   - Limited by your bandwidth
   - Better to use dedicated hosting

3. **24/7 Availability**
   - Tunnel needs to stay running
   - Your computer must be on
   - Use cloud hosting for always-on services

## 🔧 Troubleshooting

### "Connection Refused to 192.168.50.56:3001"

**Cause:** Local service not running or IP is wrong

**Fix:**
```bash
# Test local access first
curl http://192.168.50.56:3001
curl http://192.168.50.56:4000/api/v1/cards?take=1

# If fails, check IP address
ipconfig /all  # Windows
ifconfig       # Linux/macOS

# Update config.yml with correct IP
```

### "Tunnel Not Found"

**Cause:** Tunnel hasn't been created

**Fix:**
```bash
# Create the tunnel
cloudflared tunnel create ptcg-tunnel

# List all tunnels
cloudflared tunnel list
```

### "DNS Not Resolving"

**Cause:** DNS not configured or propagating

**Fix:**
```bash
# Configure DNS automatically
cloudflared tunnel route dns ptcg-tunnel ptcg002.tcghk.trade

# Or manually in Cloudflare Dashboard:
# Type: CNAME
# Name: ptcg002
# Content: <tunnel-id>.cfargotunnel.com
```

## 📚 Resources

- **Full Guide:** [CLOUDFLARE_TUNNEL.md](./CLOUDFLARE_TUNNEL.md)
- **Setup Scripts:**
  - Linux/macOS: `setup-cloudflare-tunnel.sh`
  - Windows: `setup-cloudflare-tunnel.ps1`
- **Config Template:** `cloudflared-config.yml`
- **Cloudflare Docs:** https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/

## 🎉 Summary

**YES, you can use Cloudflare to connect your local IP!**

```bash
# Three simple steps:
1. ./setup-cloudflare-tunnel.sh       # One-time setup
2. cloudflared tunnel run ptcg-tunnel # Start tunnel
3. Visit https://ptcg002.tcghk.trade  # Your site is live!
```

**Your local server at `192.168.50.56:3001` is now accessible worldwide at `https://ptcg002.tcghk.trade`** 🚀
