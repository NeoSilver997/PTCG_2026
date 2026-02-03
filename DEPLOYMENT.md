# Deployment Guide for ptcg002.tcghk.trade

This guide explains how to deploy the PTCG CardDB application to the domain `ptcg002.tcghk.trade`.

## Architecture Overview

The application consists of:
- **Web App (Next.js)**: Frontend running on port 3001
- **API Server (NestJS)**: Backend REST API running on port 4000
- **Database (PostgreSQL)**: Database server
- **Redis**: Caching layer

## Deployment Options

### Option 1: Cloudflare Tunnel (Recommended for Local Development)

**Perfect for exposing your local server at `192.168.50.56:3001` to the internet!**

Use Cloudflare Tunnel to create a secure connection from your local machine to Cloudflare's network. No need for a public server, port forwarding, or complex networking.

**Quick Start:**
```bash
./setup-cloudflare-tunnel.sh  # Linux/macOS
./setup-cloudflare-tunnel.ps1 # Windows
```

**See [CLOUDFLARE_TUNNEL.md](./CLOUDFLARE_TUNNEL.md) for complete guide.**

**Benefits:**
- ✅ Runs on your local machine (no server needed)
- ✅ Automatic HTTPS/SSL encryption
- ✅ No port forwarding required
- ✅ Free with Cloudflare
- ✅ DDoS protection included
- ✅ Perfect for development and testing

---

### Option 2: Reverse Proxy (Traditional Server Deployment)

Use Nginx or Caddy to serve both applications under the same domain:
- `https://ptcg002.tcghk.trade/` → Web App (port 3001)
- `https://ptcg002.tcghk.trade/api/` → API Server (port 4000)

See `nginx.conf` for a complete configuration example.

### Option 3: Separate Subdomains

- `https://ptcg002.tcghk.trade` → Web App
- `https://api.ptcg002.tcghk.trade` → API Server

## Step-by-Step Deployment

### 1. Server Prerequisites

```bash
# Install Node.js (v20+)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
npm install -g pnpm

# Install PostgreSQL
sudo apt-get install postgresql postgresql-contrib

# Install Redis
sudo apt-get install redis-server

# Install Nginx
sudo apt-get install nginx

# Install PM2 for process management
npm install -g pm2
```

### 2. Clone and Setup Repository

```bash
# Clone the repository
cd /var/www
git clone https://github.com/NeoSilver997/PTCG_2026.git
cd PTCG_2026

# Install dependencies
pnpm install

# Generate Prisma client
cd packages/database
pnpm db:generate
cd ../..
```

### 3. Configure Database

```bash
# Create database and user
sudo -u postgres psql
```

```sql
CREATE USER ptcg_user WITH PASSWORD 'secure_password_here';
CREATE DATABASE ptcg_carddb OWNER ptcg_user;
GRANT ALL PRIVILEGES ON DATABASE ptcg_carddb TO ptcg_user;
\q
```

```bash
# Run migrations
cd packages/database
DATABASE_URL="postgresql://ptcg_user:secure_password_here@localhost:5432/ptcg_carddb?schema=public" pnpm db:migrate
```

### 4. Configure Environment Variables

#### API Server (.env)
```bash
cd apps/api
cp .env.production.example .env

# Edit the .env file with your production values:
# - Set NODE_ENV=production
# - Update DATABASE_URL with actual credentials
# - Generate secure JWT_SECRET (at least 32 random characters)
# - Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
# - Update ALLOWED_ORIGINS to include your domain
```

#### Web App (.env.local)
```bash
cd apps/web
cp .env.production.example .env.local

# Edit the .env.local file:
# - Set NEXT_PUBLIC_API_URL=https://ptcg002.tcghk.trade/api/v1
```

### 5. Build Applications

```bash
# Build all applications
cd /var/www/PTCG_2026
pnpm build
```

### 6. Configure Nginx

```bash
# Copy the nginx configuration
sudo cp nginx.conf /etc/nginx/sites-available/ptcg002.tcghk.trade
sudo ln -s /etc/nginx/sites-available/ptcg002.tcghk.trade /etc/nginx/sites-enabled/

# Test nginx configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### 7. Setup SSL with Let's Encrypt

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d ptcg002.tcghk.trade

# Certbot will automatically configure SSL in nginx
```

### 8. Start Services with PM2

```bash
cd /var/www/PTCG_2026

# Start API server
cd apps/api
pm2 start npm --name "ptcg-api" -- run start:prod

# Start Web app
cd ../web
pm2 start npm --name "ptcg-web" -- run start

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions provided by the command above
```

### 9. Configure Firewall

```bash
# Allow HTTP, HTTPS, and SSH
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 10. Verify Deployment

Visit `https://ptcg002.tcghk.trade` and verify:
- ✅ Website loads correctly
- ✅ API endpoints work (check Network tab)
- ✅ SSL certificate is valid
- ✅ All assets load properly

## Monitoring and Maintenance

### Check Service Status
```bash
pm2 status
pm2 logs ptcg-api
pm2 logs ptcg-web
```

### Update Deployment
```bash
cd /var/www/PTCG_2026
git pull
pnpm install
pnpm build
pm2 restart all
```

### Database Backups
```bash
# Create backup
pg_dump -U ptcg_user ptcg_carddb > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
psql -U ptcg_user ptcg_carddb < backup_20260203_120000.sql
```

### Log Rotation
PM2 automatically handles log rotation. Nginx logs are in `/var/log/nginx/`.

## Troubleshooting

### API Returns 502 Bad Gateway
- Check if API is running: `pm2 status`
- Check API logs: `pm2 logs ptcg-api`
- Verify port 4000 is accessible: `curl http://localhost:4000/api/v1/cards`

### Database Connection Errors
- Verify PostgreSQL is running: `sudo systemctl status postgresql`
- Check DATABASE_URL in `.env` file
- Verify database credentials

### SSL Certificate Issues
- Renew certificate: `sudo certbot renew`
- Check certificate: `sudo certbot certificates`

### High Memory Usage
- Restart services: `pm2 restart all`
- Check logs for errors: `pm2 logs`

## Security Checklist

- [ ] Strong JWT_SECRET generated (32+ random characters)
- [ ] Database password changed from default
- [ ] Firewall configured (UFW)
- [ ] SSL certificate installed
- [ ] ALLOWED_ORIGINS configured correctly
- [ ] NODE_ENV=production set
- [ ] Redis password configured (if using remote Redis)
- [ ] Regular database backups scheduled
- [ ] PM2 process monitoring enabled
- [ ] Log files are being rotated

## Performance Optimization

### Enable Caching in Nginx
Already configured in the provided `nginx.conf`:
- Static assets cached for 1 year
- API responses cached for 5 minutes

### Enable Redis Caching
Configure Redis in the API `.env`:
```
REDIS_URL="redis://localhost:6379"
```

### Database Optimization
```sql
-- Create indexes for frequently queried fields
CREATE INDEX idx_cards_supertype ON "Card"("supertype");
CREATE INDEX idx_cards_language ON "Card"("language");
CREATE INDEX idx_cards_rarity ON "Card"("rarity");
```

## Support

For issues or questions:
1. Check logs: `pm2 logs`
2. Review nginx error logs: `sudo tail -f /var/log/nginx/error.log`
3. Check application status: `pm2 status`
