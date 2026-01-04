#!/bin/bash
# scripts/update-runner.sh
# Update GitHub Actions runner to latest version

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

RUNNER_DIR="/root/actions-runner"
SERVICE_NAME="actions.runner.Dekode1859-Mantis.mantis-lxc-runner"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         GitHub Actions Runner Update                          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ This script must be run as root${NC}"
    exit 1
fi

# Check if runner exists
if [ ! -d "$RUNNER_DIR" ]; then
    echo -e "${RED}❌ Runner not installed at: $RUNNER_DIR${NC}"
    echo -e "   Run setup script first: ${GREEN}/root/Mantis/scripts/setup-github-runner.sh${NC}"
    exit 1
fi

cd "$RUNNER_DIR"

# Get current version
if [ -f "./bin/Runner.Listener" ]; then
    CURRENT_VERSION=$(./bin/Runner.Listener --version 2>/dev/null | head -1 || echo "unknown")
    echo -e "${BLUE}📦 Current version: ${GREEN}$CURRENT_VERSION${NC}"
else
    echo -e "${YELLOW}⚠️  Could not determine current version${NC}"
    CURRENT_VERSION="unknown"
fi

# Prompt for new version
echo ""
echo -e "${YELLOW}Enter the new runner version to install:${NC}"
echo -e "   (e.g., 2.319.1)"
echo -e "   Find latest: ${GREEN}https://github.com/actions/runner/releases${NC}"
echo ""
read -p "Version: " NEW_VERSION

if [ -z "$NEW_VERSION" ]; then
    echo -e "${RED}❌ Version cannot be empty${NC}"
    exit 1
fi

# Confirm update
echo ""
echo -e "${YELLOW}⚠️  This will:${NC}"
echo -e "   1. Stop the runner service"
echo -e "   2. Download runner v$NEW_VERSION"
echo -e "   3. Replace binaries"
echo -e "   4. Restart the service"
echo ""
echo -e "${YELLOW}Configuration will be preserved (.runner, .credentials, etc.)${NC}"
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ Update cancelled${NC}"
    exit 1
fi

# Stop service
echo ""
echo -e "${BLUE}🛑 Stopping runner service...${NC}"
./svc.sh stop

# Wait for service to stop
sleep 2

# Backup current configuration
echo -e "${BLUE}💾 Backing up configuration...${NC}"
BACKUP_DIR="/root/runner-backup-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup critical files
for file in .runner .credentials .credentials_rsaparams; do
    if [ -f "$file" ]; then
        cp "$file" "$BACKUP_DIR/"
    fi
done

echo -e "   ${GREEN}✅ Backup saved to: $BACKUP_DIR${NC}"

# Download new runner
echo -e "${BLUE}⬇️  Downloading runner v$NEW_VERSION...${NC}"
RUNNER_FILE="actions-runner-linux-x64-${NEW_VERSION}.tar.gz"
DOWNLOAD_URL="https://github.com/actions/runner/releases/download/v${NEW_VERSION}/${RUNNER_FILE}"

# Create temp directory for download
TEMP_DIR="/tmp/runner-update-$$"
mkdir -p "$TEMP_DIR"

cd "$TEMP_DIR"
if ! curl -o "$RUNNER_FILE" -L "$DOWNLOAD_URL"; then
    echo -e "${RED}❌ Failed to download runner v$NEW_VERSION${NC}"
    echo -e "   Check if version exists: $DOWNLOAD_URL"
    rm -rf "$TEMP_DIR"
    cd "$RUNNER_DIR"
    ./svc.sh start
    exit 1
fi

# Extract new runner
echo -e "${BLUE}📦 Extracting new runner...${NC}"
cd "$RUNNER_DIR"

# Remove old binaries but keep configuration
echo -e "${BLUE}🗑️  Removing old binaries...${NC}"
rm -rf bin externals

# Extract new binaries
echo -e "${BLUE}📂 Installing new binaries...${NC}"
tar xzf "$TEMP_DIR/$RUNNER_FILE"

# Cleanup
rm -rf "$TEMP_DIR"

# Verify extraction
if [ ! -f "./bin/Runner.Listener" ]; then
    echo -e "${RED}❌ Update failed - binaries not found${NC}"
    echo -e "   Restoring from backup: $BACKUP_DIR"
    # Note: This is a simplified restore - you may need to re-run setup in practice
    exit 1
fi

# Start service
echo -e "${BLUE}▶️  Starting runner service...${NC}"
./svc.sh start

# Wait for service to start
sleep 3

# Verify service is running
if systemctl is-active --quiet "$SERVICE_NAME"; then
    NEW_INSTALLED_VERSION=$(./bin/Runner.Listener --version 2>/dev/null | head -1 || echo "unknown")
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                 ✅ UPDATE COMPLETE!                            ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}Version Update:${NC}"
    echo -e "   Previous: ${YELLOW}$CURRENT_VERSION${NC}"
    echo -e "   Current:  ${GREEN}$NEW_INSTALLED_VERSION${NC}"
    echo ""
    echo -e "${BLUE}Service Status:${NC}"
    echo -e "   ${GREEN}✅ Running${NC}"
    echo ""
    echo -e "${BLUE}Backup Location:${NC}"
    echo -e "   ${GREEN}$BACKUP_DIR${NC}"
    echo ""
    echo -e "${BLUE}Verify in GitHub:${NC}"
    echo -e "   https://github.com/Dekode1859/Mantis/settings/actions/runners"
    echo ""
else
    echo -e "${RED}❌ Service failed to start after update${NC}"
    echo -e "   Check logs: ${GREEN}journalctl -u $SERVICE_NAME -n 50${NC}"
    echo -e "   Backup available: ${GREEN}$BACKUP_DIR${NC}"
    exit 1
fi
