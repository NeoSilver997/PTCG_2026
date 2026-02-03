#!/bin/bash

# PTCG CardDB - Docker Deployment Script for ptcg002.tcghk.trade
# This script helps deploy the application using Docker Compose

set -e

echo "======================================"
echo "PTCG CardDB - Deployment Script"
echo "Domain: ptcg002.tcghk.trade"
echo "======================================"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from template..."
    cat > .env << EOF
# Database
DB_PASSWORD=$(openssl rand -base64 32)

# JWT Secret (change this!)
JWT_SECRET=$(openssl rand -base64 32)

# Domain
DOMAIN=ptcg002.tcghk.trade

# API URL
NEXT_PUBLIC_API_URL=https://ptcg002.tcghk.trade/api/v1
EOF
    echo "✅ .env file created with random passwords"
    echo "⚠️  Please review and update .env file with your settings"
    echo ""
fi

# Parse command line arguments
ACTION=${1:-up}

case $ACTION in
    up|start)
        echo "🚀 Starting services..."
        docker-compose up -d
        echo ""
        echo "✅ Services started!"
        echo ""
        echo "Services running:"
        docker-compose ps
        echo ""
        echo "📝 Next steps:"
        echo "1. Run database migrations: docker-compose exec api pnpm db:migrate"
        echo "2. Configure SSL: ./deploy-ssl.sh"
        echo "3. Visit: https://ptcg002.tcghk.trade"
        ;;
    
    down|stop)
        echo "🛑 Stopping services..."
        docker-compose down
        echo "✅ Services stopped"
        ;;
    
    restart)
        echo "🔄 Restarting services..."
        docker-compose restart
        echo "✅ Services restarted"
        ;;
    
    logs)
        docker-compose logs -f ${2:-}
        ;;
    
    build)
        echo "🔨 Building images..."
        docker-compose build --no-cache
        echo "✅ Build complete"
        ;;
    
    migrate)
        echo "📊 Running database migrations..."
        docker-compose exec api sh -c "cd /app/packages/database && pnpm db:migrate"
        echo "✅ Migrations complete"
        ;;
    
    seed)
        echo "🌱 Seeding database..."
        docker-compose exec api sh -c "cd /app/packages/database && pnpm db:seed"
        echo "✅ Seeding complete"
        ;;
    
    backup)
        echo "💾 Creating database backup..."
        BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
        docker-compose exec -T postgres pg_dump -U ptcg_user ptcg_carddb > "$BACKUP_FILE"
        echo "✅ Backup created: $BACKUP_FILE"
        ;;
    
    restore)
        if [ -z "$2" ]; then
            echo "❌ Error: Please specify backup file"
            echo "Usage: ./deploy.sh restore backup_20260203_120000.sql"
            exit 1
        fi
        echo "📥 Restoring database from $2..."
        docker-compose exec -T postgres psql -U ptcg_user ptcg_carddb < "$2"
        echo "✅ Restore complete"
        ;;
    
    ssl)
        echo "🔒 Setting up SSL certificate..."
        docker-compose run --rm certbot certonly --webroot \
            --webroot-path=/var/www/certbot \
            --email admin@tcghk.trade \
            --agree-tos \
            --no-eff-email \
            -d ptcg002.tcghk.trade
        
        echo "✅ SSL certificate obtained"
        echo "🔄 Reloading nginx..."
        docker-compose exec nginx nginx -s reload
        ;;
    
    status)
        echo "📊 Service Status:"
        docker-compose ps
        echo ""
        echo "📈 Resource Usage:"
        docker stats --no-stream $(docker-compose ps -q)
        ;;
    
    clean)
        echo "🧹 Cleaning up..."
        docker-compose down -v
        docker system prune -f
        echo "✅ Cleanup complete"
        ;;
    
    *)
        echo "Usage: ./deploy.sh [command]"
        echo ""
        echo "Commands:"
        echo "  up, start     - Start all services"
        echo "  down, stop    - Stop all services"
        echo "  restart       - Restart all services"
        echo "  logs [service]- View logs (optionally for specific service)"
        echo "  build         - Rebuild all images"
        echo "  migrate       - Run database migrations"
        echo "  seed          - Seed database with sample data"
        echo "  backup        - Create database backup"
        echo "  restore <file>- Restore database from backup"
        echo "  ssl           - Setup SSL certificate with Let's Encrypt"
        echo "  status        - Show service status and resource usage"
        echo "  clean         - Stop services and clean up volumes"
        ;;
esac
