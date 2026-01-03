#!/bin/bash
# scripts/deploy-prod.sh
# Deploy to production with automatic backup

set -e

echo "🚀 Deploying to Production Environment..."

# Check if .env.prod exists
if [ ! -f .env.prod ]; then
    echo "❌ Error: .env.prod not found"
    exit 1
fi

# Load environment variables
export $(cat .env.prod | grep -v '^#' | xargs)

# Create pre-deployment backup
echo "💾 Creating pre-deployment backup..."
./scripts/backup-prod.sh

# Build new containers
echo "🔨 Building production containers..."
docker compose -p mantis-prod -f docker-compose.prod.yml build

# Deploy with zero downtime
echo "🔄 Deploying new containers..."
docker compose -p mantis-prod -f docker-compose.prod.yml --env-file .env.prod up -d

# Wait for services to initialize
echo "⏳ Waiting for services to initialize..."
sleep 15

# Health check
echo "🏥 Running health checks..."
if curl -f http://localhost:8001/health > /dev/null 2>&1; then
    echo "✅ Backend health check passed"
else
    echo "❌ Backend health check failed"
    echo "🔄 Attempting rollback..."
    docker compose -p mantis-prod -f docker-compose.prod.yml down
    exit 1
fi

# Verify database
if docker exec mantis-prod-db psql -U mantis_user -d mantis_production -c "\dt" > /dev/null 2>&1; then
    echo "✅ Database connectivity verified"
else
    echo "❌ Database connectivity failed"
    exit 1
fi

# Verify tunnel
if docker ps | grep -q mantis-prod-tunnel; then
    echo "✅ Cloudflare tunnel running"
else
    echo "⚠️ Warning: Cloudflare tunnel not running"
fi

# Cleanup old images
echo "🧹 Cleaning up old Docker images..."
docker image prune -f

echo ""
echo "✅ Production deployment successful!"
echo "🌐 Live at: https://mantis.dekode.live"
echo ""
echo "📊 Running containers:"
docker ps --filter "name=mantis-prod-" --format "table {{.Names}}\t{{.Status}}"
