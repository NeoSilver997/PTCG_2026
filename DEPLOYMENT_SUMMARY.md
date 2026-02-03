# Deployment Configuration Summary for ptcg002.tcghk.trade

## Overview
Successfully configured the PTCG CardDB application for deployment on the domain `ptcg002.tcghk.trade`.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ptcg002.tcghk.trade                       │
│                         (HTTPS)                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                    ┌────▼─────┐
                    │  Nginx   │ (Reverse Proxy + SSL)
                    │  Port 80 │ → Redirect to HTTPS
                    │  Port 443│ → TLS/SSL Termination
                    └────┬─────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   ┌────▼────┐     ┌────▼─────┐    ┌────▼─────┐
   │ Next.js │     │ NestJS   │    │ Static   │
   │  Web    │     │   API    │    │  Assets  │
   │Port 3001│     │Port 4000 │    │  Cache   │
   └────┬────┘     └────┬─────┘    └──────────┘
        │               │
        │          ┌────▼─────┐
        │          │PostgreSQL│
        │          │   DB     │
        │          └──────────┘
        │          ┌──────────┐
        └──────────┤  Redis   │
                   │  Cache   │
                   └──────────┘
```

## Configuration Changes

### 1. Next.js Web App Configuration
**File**: `apps/web/next.config.ts`

```typescript
// Added production domain to image remote patterns
images: {
  remotePatterns: [
    // Localhost (development)
    { protocol: 'http', hostname: 'localhost', port: '4000', ... },
    // Production (HTTPS)
    { protocol: 'https', hostname: 'ptcg002.tcghk.trade', ... },
    // Production (HTTP fallback)
    { protocol: 'http', hostname: 'ptcg002.tcghk.trade', ... },
  ],
}
```

**Environment**: `apps/web/.env.production.example`
```bash
NEXT_PUBLIC_API_URL=https://ptcg002.tcghk.trade/api/v1
```

### 2. NestJS API Configuration
**File**: `apps/api/src/main.ts`

```typescript
// Added production domain to CORS allowed origins
app.enableCors({
  origin: [
    'http://localhost:3001',     // Development
    'https://ptcg002.tcghk.trade', // Production HTTPS
    'http://ptcg002.tcghk.trade',  // Production HTTP
  ],
  credentials: true,
});
```

**Environment**: `apps/api/.env.production.example`
```bash
NODE_ENV=production
PORT=4000
ALLOWED_ORIGINS=https://ptcg002.tcghk.trade
DATABASE_URL=postgresql://ptcg_user:password@localhost:5432/ptcg_carddb
JWT_SECRET=secure-random-string-here
```

### 3. Nginx Reverse Proxy
**File**: `nginx.conf`

Routes traffic:
- `/` → Next.js Web App (port 3001)
- `/api/` → NestJS API (port 4000)
- `/_next/static/` → Static assets (cached 1 year)
- `/_next/image` → Optimized images (cached 7 days)

Features:
- ✅ SSL/TLS termination
- ✅ HTTP → HTTPS redirect
- ✅ Gzip compression
- ✅ Security headers
- ✅ Static asset caching
- ✅ WebSocket support
- ✅ Health check endpoint

### 4. Docker Configuration
**File**: `docker-compose.yml`

Services:
1. **postgres** - PostgreSQL database
2. **redis** - Cache layer
3. **api** - NestJS API server
4. **web** - Next.js web application
5. **nginx** - Reverse proxy
6. **certbot** - SSL certificate management

All services connected via `ptcg-network` bridge network.

### 5. Process Management
**File**: `ecosystem.config.js`

PM2 configuration for manual deployment:
- `ptcg-api` - API server in cluster mode
- `ptcg-web` - Web app in cluster mode
- Auto-restart on failure
- Log rotation
- Memory limits (500MB)

## Deployment Methods

### Method 1: Docker Deployment (Recommended)

```bash
# Quick start
./deploy.sh up          # Start all services
./deploy.sh migrate     # Run database migrations
./deploy.sh ssl         # Setup SSL certificate

# Management
./deploy.sh logs        # View logs
./deploy.sh status      # Check status
./deploy.sh backup      # Backup database
./deploy.sh restart     # Restart services
```

**Advantages**:
- ✅ Isolated environment
- ✅ Easy to deploy and update
- ✅ Consistent across environments
- ✅ Includes all dependencies
- ✅ Automated backups

### Method 2: Manual Deployment with PM2

```bash
# Setup
pnpm install
pnpm build
pm2 start ecosystem.config.js

# Management
pm2 status             # Check status
pm2 logs               # View logs
pm2 restart all        # Restart services
pm2 save               # Save configuration
```

**Advantages**:
- ✅ More control over processes
- ✅ Better for debugging
- ✅ Lower overhead
- ✅ Familiar to Node.js developers

## URL Structure

After deployment, the following URLs will be available:

| URL | Service | Description |
|-----|---------|-------------|
| `https://ptcg002.tcghk.trade` | Web App | Main website |
| `https://ptcg002.tcghk.trade/cards` | Web App | Card browser |
| `https://ptcg002.tcghk.trade/api/v1/cards` | API | Cards endpoint |
| `https://ptcg002.tcghk.trade/api/docs` | API | Swagger documentation |
| `https://ptcg002.tcghk.trade/health` | Nginx | Health check |

## Security Features

### 1. SSL/TLS Encryption
- Automatic SSL certificate via Let's Encrypt
- HTTP to HTTPS redirect
- TLS 1.2+ only
- Strong cipher suites

### 2. CORS Protection
- Whitelist of allowed origins
- Credentials support enabled
- Automatic preflight handling

### 3. Security Headers
```nginx
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

### 4. Environment Security
- Secrets in environment variables
- .env files excluded from git
- Production example files provided
- JWT secret required for authentication

### 5. Database Security
- Dedicated database user
- Password-protected connection
- Network isolation (Docker network)
- Regular backup support

## Performance Optimizations

### 1. Caching Strategy
- Static assets: 1 year cache
- Optimized images: 7 days cache
- API responses: No cache (dynamic)
- Redis for application caching

### 2. Compression
- Gzip compression enabled
- Minimum size: 1KB
- Covers: HTML, CSS, JS, JSON, XML

### 3. Connection Pooling
- Nginx keepalive: 64 connections
- PostgreSQL connection pooling
- Redis connection pooling

### 4. Process Management
- Cluster mode for better CPU utilization
- Auto-restart on failures
- Memory limits to prevent leaks
- Health checks for reliability

## Monitoring & Logs

### Application Logs
```bash
# Docker
./deploy.sh logs web    # Web app logs
./deploy.sh logs api    # API logs

# PM2
pm2 logs ptcg-web      # Web app logs
pm2 logs ptcg-api      # API logs
```

### Nginx Logs
```bash
# Access logs
tail -f /var/log/nginx/ptcg002.access.log

# Error logs
tail -f /var/log/nginx/ptcg002.error.log
```

### Database Logs
```bash
# PostgreSQL logs
tail -f /var/log/postgresql/postgresql-15-main.log
```

## Backup Strategy

### Automated Backups
```bash
# Create backup
./deploy.sh backup

# Restore from backup
./deploy.sh restore backup_20260203_120000.sql
```

### Manual Database Backup
```bash
# Backup
pg_dump -U ptcg_user ptcg_carddb > backup.sql

# Restore
psql -U ptcg_user ptcg_carddb < backup.sql
```

## Troubleshooting Guide

### Issue: Services won't start
**Solution**:
```bash
./deploy.sh logs        # Check logs for errors
./deploy.sh status      # Check service status
```

### Issue: Database connection failed
**Solution**:
```bash
# Check PostgreSQL is running
docker-compose ps postgres
# or
sudo systemctl status postgresql

# Verify DATABASE_URL in .env
cat apps/api/.env | grep DATABASE_URL
```

### Issue: 502 Bad Gateway
**Solution**:
```bash
# Check API is running
curl http://localhost:4000/api/v1/cards?take=1

# Check nginx configuration
sudo nginx -t

# Restart services
./deploy.sh restart
```

### Issue: SSL certificate expired
**Solution**:
```bash
# Renew certificate
sudo certbot renew

# Or with Docker
./deploy.sh ssl
```

## Post-Deployment Checklist

- [ ] DNS configured to point to server IP
- [ ] Firewall allows ports 80 and 443
- [ ] SSL certificate installed and valid
- [ ] Environment variables configured
- [ ] Database migrations completed
- [ ] Services are running
- [ ] Website accessible via HTTPS
- [ ] API endpoints responding
- [ ] Database backups configured
- [ ] Monitoring/logging enabled
- [ ] Error pages tested
- [ ] Performance tested
- [ ] Security scan completed

## Documentation Files

| File | Description |
|------|-------------|
| `DEPLOYMENT.md` | Comprehensive deployment guide |
| `QUICKSTART.md` | Quick reference for common tasks |
| `nginx.conf` | Nginx reverse proxy configuration |
| `docker-compose.yml` | Docker orchestration |
| `ecosystem.config.js` | PM2 process management |
| `deploy.sh` | Automated deployment script |
| `.env.production.example` | Production environment template |

## Support & Maintenance

### Regular Tasks
- Update SSL certificate (automatic with certbot)
- Database backups (automated with deploy.sh)
- Security updates (monthly)
- Log rotation (automatic)
- Performance monitoring (pm2 or docker stats)

### Update Deployment
```bash
# Pull latest code
git pull

# Rebuild and restart
./deploy.sh build
./deploy.sh restart
```

### Health Monitoring
```bash
# Check service health
./deploy.sh status

# Resource usage
docker stats
# or
pm2 monit
```

## Conclusion

The PTCG CardDB application is now fully configured for deployment on `ptcg002.tcghk.trade` with:

✅ Production-ready configuration
✅ SSL/TLS encryption
✅ Reverse proxy setup
✅ Docker deployment option
✅ PM2 deployment option
✅ Automated deployment scripts
✅ Comprehensive documentation
✅ Security best practices
✅ Performance optimizations
✅ Backup strategies
✅ Monitoring solutions

Ready to deploy! 🚀
