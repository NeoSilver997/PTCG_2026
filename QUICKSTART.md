# Quick Start - Deployment to ptcg002.tcghk.trade

This guide provides quick commands to deploy the PTCG CardDB application to `ptcg002.tcghk.trade`.

## 🚀 Quick Deploy Options

### Option 1: Cloudflare Tunnel (Easiest - Recommended for Local Development)

**Perfect for exposing local server (`http://192.168.50.56:3001`) to the internet!**

```bash
# 1. Run the automated setup script
./setup-cloudflare-tunnel.sh

# 2. Start the tunnel
cloudflared tunnel run ptcg-tunnel

# 3. Visit your site
# https://ptcg002.tcghk.trade
```

See [CLOUDFLARE_TUNNEL.md](./CLOUDFLARE_TUNNEL.md) for detailed instructions.

**Benefits:**
- ✅ No server needed - runs on your local machine
- ✅ Automatic HTTPS/SSL
- ✅ No port forwarding required
- ✅ Free with Cloudflare
- ✅ Perfect for development and testing

---

### Option 2: Docker Deployment (Production)

```bash
# 1. Clone repository
git clone https://github.com/NeoSilver997/PTCG_2026.git
cd PTCG_2026

# 2. Start services
./deploy.sh up

# 3. Run database migrations
./deploy.sh migrate

# 4. Setup SSL certificate
./deploy.sh ssl

# 5. Check status
./deploy.sh status
```

Visit: https://ptcg002.tcghk.trade

## 🔧 Manual Deployment (Alternative)

### Prerequisites
```bash
# Install dependencies
sudo apt-get update
sudo apt-get install -y nodejs npm postgresql nginx redis-server

# Install pnpm and PM2
npm install -g pnpm pm2
```

### Setup
```bash
# 1. Install packages
pnpm install

# 2. Setup database
sudo -u postgres createuser ptcg_user
sudo -u postgres createdb ptcg_carddb -O ptcg_user

# 3. Configure environment
cp apps/api/.env.production.example apps/api/.env
cp apps/web/.env.production.example apps/web/.env.local

# Edit .env files with your credentials

# 4. Run migrations
cd packages/database
pnpm db:migrate
cd ../..

# 5. Build applications
pnpm build

# 6. Configure nginx
sudo cp nginx.conf /etc/nginx/sites-available/ptcg002.tcghk.trade
sudo ln -s /etc/nginx/sites-available/ptcg002.tcghk.trade /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 7. Setup SSL
sudo certbot --nginx -d ptcg002.tcghk.trade

# 8. Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 📝 Configuration Files

### Environment Variables

**API (.env)**
```bash
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://ptcg_user:password@localhost:5432/ptcg_carddb
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secure-secret-here
ALLOWED_ORIGINS=https://ptcg002.tcghk.trade
```

**Web (.env.local)**
```bash
NEXT_PUBLIC_API_URL=https://ptcg002.tcghk.trade/api/v1
```

## 🔍 Common Commands

```bash
# Docker deployment
./deploy.sh up          # Start services
./deploy.sh down        # Stop services
./deploy.sh logs        # View logs
./deploy.sh migrate     # Run migrations
./deploy.sh backup      # Backup database
./deploy.sh ssl         # Setup SSL

# Manual deployment (PM2)
pm2 status              # Check status
pm2 logs                # View logs
pm2 restart all         # Restart services
pm2 stop all            # Stop services
```

## 🆘 Troubleshooting

**Services not starting?**
```bash
# Docker
./deploy.sh logs

# PM2
pm2 logs
```

**Database connection error?**
```bash
# Check PostgreSQL
sudo systemctl status postgresql

# Test connection
psql -U ptcg_user -d ptcg_carddb
```

**Nginx errors?**
```bash
# Check nginx
sudo nginx -t
sudo systemctl status nginx

# View error logs
sudo tail -f /var/log/nginx/error.log
```

## 📚 Full Documentation

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete deployment guide.

## ✅ Post-Deployment Checklist

- [ ] Services running (web + api)
- [ ] Database accessible
- [ ] SSL certificate installed
- [ ] Domain resolves correctly
- [ ] API endpoints responding
- [ ] Website loads properly
- [ ] Environment variables set
- [ ] Firewall configured
- [ ] Backups configured
- [ ] Monitoring enabled

## 🔐 Security

- Change default passwords
- Generate secure JWT_SECRET
- Configure firewall (UFW)
- Keep SSL certificate updated
- Regular security updates
- Monitor logs for issues

## 📊 Monitoring

```bash
# Service status
./deploy.sh status

# Resource usage
docker stats

# Application logs
./deploy.sh logs web
./deploy.sh logs api
```

## 🔄 Updates

```bash
# Pull latest changes
git pull

# Rebuild and restart (Docker)
./deploy.sh build
./deploy.sh restart

# Rebuild and restart (PM2)
pnpm build
pm2 restart all
```
