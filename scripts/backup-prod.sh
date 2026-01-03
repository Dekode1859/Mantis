#!/bin/bash
# scripts/backup-prod.sh
# Creates timestamped backup of production database

set -e

BACKUP_DIR="/root/Mantis/deployments/prod/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="mantis_backup_${TIMESTAMP}.sql"
METADATA_FILE="mantis_backup_${TIMESTAMP}.json"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "🔄 Creating production database backup..."

# Check if production database is running
if ! docker ps | grep -q mantis-prod-db; then
    echo "❌ Error: Production database is not running"
    exit 1
fi

# Backup database using pg_dump
docker exec mantis-prod-db pg_dump \
  -U mantis_user \
  -d mantis_production \
  --no-owner --no-acl \
  > "$BACKUP_DIR/$BACKUP_FILE"

# Compress backup to save space
gzip "$BACKUP_DIR/$BACKUP_FILE"
BACKUP_FILE="${BACKUP_FILE}.gz"

# Get metadata
USER_COUNT=$(docker exec mantis-prod-db psql -U mantis_user -d mantis_production -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | xargs || echo "0")
PRODUCT_COUNT=$(docker exec mantis-prod-db psql -U mantis_user -d mantis_production -t -c "SELECT COUNT(*) FROM products;" 2>/dev/null | xargs || echo "0")
DB_SIZE=$(docker exec mantis-prod-db psql -U mantis_user -d mantis_production -t -c "SELECT pg_size_pretty(pg_database_size('mantis_production'));" 2>/dev/null | xargs || echo "unknown")
GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

# Create metadata file
cat > "$BACKUP_DIR/$METADATA_FILE" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "backup_file": "$BACKUP_FILE",
  "user_count": $USER_COUNT,
  "product_count": $PRODUCT_COUNT,
  "database_size": "$DB_SIZE",
  "git_commit": "$GIT_COMMIT",
  "git_branch": "$GIT_BRANCH"
}
EOF

echo "✅ Backup created: $BACKUP_FILE"
echo "📊 Users: $USER_COUNT | Products: $PRODUCT_COUNT | Size: $DB_SIZE"
echo "📁 Location: $BACKUP_DIR/$BACKUP_FILE"
