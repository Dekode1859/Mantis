#!/bin/bash
# scripts/deploy-dev.sh
# Deploy to development environment

set -e

echo "🚀 Deploying to Development Environment..."

# Check if .env.dev exists
if [ ! -f .env.dev ]; then
    echo "❌ Error: .env.dev not found"
    echo "Create .env.dev from .env.example"
    exit 1
fi

# Load environment variables
export $(cat .env.dev | grep -v '^#' | xargs)

# Stop existing containers
echo "🛑 Stopping existing dev containers..."
docker compose -p mantis-dev -f docker-compose.dev.yml down || true

# Build and start new containers
echo "🔨 Building and starting dev containers..."
docker compose -p mantis-dev -f docker-compose.dev.yml --env-file .env.dev up -d --build

# Wait for services to start
echo "⏳ Waiting for services to initialize..."
sleep 10

# Health check
echo "🏥 Running health checks..."
if curl -f http://localhost:8002/health > /dev/null 2>&1; then
    echo "✅ Backend health check passed"
else
    echo "❌ Backend health check failed"
    exit 1
fi

# Verify database
if docker exec mantis-dev-db psql -U mantis_user -d mantis_dev -c "SELECT 1" > /dev/null 2>&1; then
    echo "✅ Database connectivity verified"
else
    echo "❌ Database connectivity failed"
    exit 1
fi

echo ""
echo "✅ Development deployment successful!"
echo "🌐 Frontend: http://192.168.1.51:3001"
echo "🔧 Backend: http://192.168.1.51:8002"
echo ""
echo "📊 Running containers:"
docker ps --filter "name=mantis-dev-" --format "table {{.Names}}\t{{.Status}}"
