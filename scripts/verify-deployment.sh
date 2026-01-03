#!/bin/bash
# scripts/verify-deployment.sh
# Verify deployment health

set -e

ENV=${1:-prod}  # prod or dev

if [ "$ENV" = "prod" ]; then
    PREFIX="mantis-prod"
    BACKEND_PORT=8001
    FRONTEND_PORT=3000
    DB_NAME="mantis_production"
else
    PREFIX="mantis-dev"
    BACKEND_PORT=8002
    FRONTEND_PORT=3001
    DB_NAME="mantis_dev"
fi

echo "🏥 Verifying $ENV environment..."

# Check containers running
CONTAINERS=("${PREFIX}-db" "${PREFIX}-redis" "${PREFIX}-backend" "${PREFIX}-frontend")
for container in "${CONTAINERS[@]}"; do
    if docker ps | grep -q "$container"; then
        echo "✅ $container is running"
    else
        echo "❌ $container is not running"
        exit 1
    fi
done

# Check backend health
if curl -f http://localhost:$BACKEND_PORT/health > /dev/null 2>&1; then
    echo "✅ Backend health check passed"
else
    echo "❌ Backend health check failed"
    exit 1
fi

# Check database
if docker exec ${PREFIX}-db psql -U mantis_user -d $DB_NAME -c "SELECT 1" > /dev/null 2>&1; then
    echo "✅ Database connectivity verified"
else
    echo "❌ Database connectivity failed"
    exit 1
fi

# Check Redis
if docker exec ${PREFIX}-redis redis-cli ping | grep -q "PONG"; then
    echo "✅ Redis connectivity verified"
else
    echo "❌ Redis connectivity failed"
    exit 1
fi

echo ""
echo "✅ All $ENV environment checks passed!"
