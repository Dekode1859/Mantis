#!/bin/bash
# scripts/cleanup-backups.sh
# Removes backups older than retention period (7 days)

set -e

BACKUP_DIR="/root/Mantis/deployments/prod/backups"
RETENTION_DAYS=7

echo "🧹 Cleaning up backups older than $RETENTION_DAYS days..."

# Count backups before cleanup
BEFORE_COUNT=$(find "$BACKUP_DIR" -name "mantis_backup_*.sql.gz" 2>/dev/null | wc -l)

# Delete old backup files
find "$BACKUP_DIR" -name "mantis_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "mantis_backup_*.json" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true

# Count backups after cleanup
AFTER_COUNT=$(find "$BACKUP_DIR" -name "mantis_backup_*.sql.gz" 2>/dev/null | wc -l)
DELETED=$((BEFORE_COUNT - AFTER_COUNT))

echo "✅ Cleanup complete"
echo "📊 Deleted: $DELETED backups | Remaining: $AFTER_COUNT backups"

# List remaining backups
if [ $AFTER_COUNT -gt 0 ]; then
    echo ""
    echo "📁 Remaining backups:"
    ls -lh "$BACKUP_DIR"/mantis_backup_*.sql.gz 2>/dev/null | tail -5 || echo "No backups found"
fi
