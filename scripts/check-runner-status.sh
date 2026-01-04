#!/bin/bash
# scripts/check-runner-status.sh
# Check GitHub Actions runner health and status

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
echo -e "${BLUE}║         GitHub Actions Runner Status Check                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if runner directory exists
if [ ! -d "$RUNNER_DIR" ]; then
    echo -e "${RED}❌ Runner not installed${NC}"
    echo -e "   Directory not found: $RUNNER_DIR"
    echo -e "   Run: ${GREEN}/root/Mantis/scripts/setup-github-runner.sh${NC}"
    exit 1
fi

# Check service status
echo -e "${BLUE}🔍 Service Status:${NC}"
if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo -e "   ${GREEN}✅ Service is running${NC}"
    SERVICE_STATUS="running"
else
    echo -e "   ${RED}❌ Service is not running${NC}"
    SERVICE_STATUS="stopped"
fi

# Get detailed service status
echo ""
echo -e "${BLUE}📊 Detailed Service Status:${NC}"
systemctl status "$SERVICE_NAME" --no-pager | head -15

# Check if runner is enabled on boot
echo ""
echo -e "${BLUE}🔄 Auto-start on Boot:${NC}"
if systemctl is-enabled --quiet "$SERVICE_NAME"; then
    echo -e "   ${GREEN}✅ Enabled${NC}"
else
    echo -e "   ${YELLOW}⚠️  Disabled${NC}"
fi

# Check disk space in work directory
echo ""
echo -e "${BLUE}💾 Disk Space:${NC}"
WORK_DIR="$RUNNER_DIR/_work"
if [ -d "$WORK_DIR" ]; then
    WORK_SIZE=$(du -sh "$WORK_DIR" 2>/dev/null | cut -f1)
    echo -e "   Work directory: ${GREEN}$WORK_SIZE${NC}"
else
    echo -e "   Work directory: ${YELLOW}Not created yet${NC}"
fi

# Overall system disk space
DISK_USAGE=$(df -h / | tail -1 | awk '{print $5}' | sed 's/%//')
DISK_AVAIL=$(df -h / | tail -1 | awk '{print $4}')
if [ "$DISK_USAGE" -gt 80 ]; then
    echo -e "   System disk: ${RED}$DISK_USAGE% used (${DISK_AVAIL} available)${NC}"
    echo -e "   ${YELLOW}⚠️  Warning: Disk usage above 80%${NC}"
else
    echo -e "   System disk: ${GREEN}$DISK_USAGE% used (${DISK_AVAIL} available)${NC}"
fi

# Show recent logs if service is running
if [ "$SERVICE_STATUS" = "running" ]; then
    echo ""
    echo -e "${BLUE}📜 Recent Logs (last 10 lines):${NC}"
    journalctl -u "$SERVICE_NAME" -n 10 --no-pager | sed 's/^/   /'
fi

# Check runner configuration
echo ""
echo -e "${BLUE}⚙️  Runner Configuration:${NC}"
if [ -f "$RUNNER_DIR/.runner" ]; then
    RUNNER_NAME=$(grep -o '"AgentName":"[^"]*"' "$RUNNER_DIR/.runner" | cut -d'"' -f4)
    RUNNER_ID=$(grep -o '"AgentId":[0-9]*' "$RUNNER_DIR/.runner" | cut -d':' -f2)
    echo -e "   Name: ${GREEN}$RUNNER_NAME${NC}"
    echo -e "   ID: ${GREEN}$RUNNER_ID${NC}"
else
    echo -e "   ${YELLOW}Configuration file not found${NC}"
fi

# Summary
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                        Summary                                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$SERVICE_STATUS" = "running" ]; then
    echo -e "${GREEN}✅ Runner is operational${NC}"
    echo ""
    echo -e "${BLUE}Verify in GitHub:${NC}"
    echo -e "   https://github.com/Dekode1859/Mantis/settings/actions/runners"
    echo -e "   Status should show: ${GREEN}Idle${NC} or ${GREEN}Active${NC}"
    echo ""
    echo -e "${BLUE}Useful Commands:${NC}"
    echo -e "   View live logs:    ${GREEN}journalctl -u $SERVICE_NAME -f${NC}"
    echo -e "   Restart service:   ${GREEN}cd $RUNNER_DIR && sudo ./svc.sh restart${NC}"
    echo -e "   Stop service:      ${GREEN}cd $RUNNER_DIR && sudo ./svc.sh stop${NC}"
else
    echo -e "${RED}❌ Runner is not running${NC}"
    echo ""
    echo -e "${YELLOW}To start the runner:${NC}"
    echo -e "   ${GREEN}cd $RUNNER_DIR && sudo ./svc.sh start${NC}"
    echo ""
    echo -e "${YELLOW}To check for errors:${NC}"
    echo -e "   ${GREEN}journalctl -u $SERVICE_NAME -n 50${NC}"
fi

echo ""
