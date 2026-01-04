#!/bin/bash
# scripts/setup-github-runner.sh
# Setup GitHub Actions self-hosted runner on LXC container
# Runner will be installed at: /root/actions-runner (outside Mantis directory)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
RUNNER_VERSION="2.319.1"
RUNNER_DIR="/root/actions-runner"
REPO_URL="https://github.com/Dekode1859/Mantis"
RUNNER_NAME="mantis-lxc-runner"
RUNNER_LABELS="self-hosted,linux,x64,mantis"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         GitHub Actions Self-Hosted Runner Setup               ║${NC}"
echo -e "${BLUE}║                    For Mantis Project                         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root - we'll need to use a workaround
RUNNING_AS_ROOT=false
if [ "$EUID" -eq 0 ]; then
    RUNNING_AS_ROOT=true
    echo -e "${YELLOW}⚠️  Running as root detected${NC}"
    echo -e "${YELLOW}   GitHub runner config cannot run as root for security${NC}"
    echo -e "${YELLOW}   Script will use RUNNER_ALLOW_RUNASROOT=1 workaround${NC}"
    echo ""
fi

# Check if runner already exists
if [ -d "$RUNNER_DIR" ]; then
    echo -e "${YELLOW}⚠️  Runner directory already exists: $RUNNER_DIR${NC}"
    read -p "Do you want to remove it and reinstall? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}🗑️  Removing existing runner...${NC}"
        cd "$RUNNER_DIR"
        # Stop and remove service if it exists
        if [ -f "svc.sh" ]; then
            if [ "$EUID" -eq 0 ]; then
                ./svc.sh stop 2>/dev/null || true
                ./svc.sh uninstall 2>/dev/null || true
            else
                sudo ./svc.sh stop 2>/dev/null || true
                sudo ./svc.sh uninstall 2>/dev/null || true
            fi
        fi
        cd /root
        if [ "$EUID" -eq 0 ]; then
            rm -rf "$RUNNER_DIR"
        else
            sudo rm -rf "$RUNNER_DIR"
        fi
    else
        echo -e "${RED}❌ Installation cancelled${NC}"
        exit 1
    fi
fi

# Create runner directory
echo -e "${BLUE}📁 Creating runner directory: $RUNNER_DIR${NC}"
if [ "$RUNNING_AS_ROOT" = true ]; then
    mkdir -p "$RUNNER_DIR"
else
    sudo mkdir -p "$RUNNER_DIR"
    sudo chown $USER:$USER "$RUNNER_DIR"
fi
cd "$RUNNER_DIR"

# Download runner
echo -e "${BLUE}⬇️  Downloading GitHub Actions Runner v${RUNNER_VERSION}...${NC}"
RUNNER_FILE="actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
DOWNLOAD_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_FILE}"

curl -o "$RUNNER_FILE" -L "$DOWNLOAD_URL"

if [ ! -f "$RUNNER_FILE" ]; then
    echo -e "${RED}❌ Failed to download runner${NC}"
    exit 1
fi

# Extract runner
echo -e "${BLUE}📦 Extracting runner...${NC}"
tar xzf "$RUNNER_FILE"

# Cleanup downloaded archive
rm "$RUNNER_FILE"

echo ""
echo -e "${GREEN}✅ Runner downloaded and extracted${NC}"
echo ""

# Get registration token from user
echo -e "${YELLOW}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║                    REGISTRATION TOKEN REQUIRED                 ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}To get your registration token:${NC}"
echo -e "1. Open: ${GREEN}https://github.com/Dekode1859/Mantis/settings/actions/runners/new${NC}"
echo -e "2. Select: ${GREEN}Linux${NC} and ${GREEN}x64${NC}"
echo -e "3. Copy the token from the ${GREEN}Configure${NC} section"
echo -e "   (It starts with 'A' and is very long)"
echo ""
echo -e "${YELLOW}Note: Token expires in 1 hour. Generate a new one if expired.${NC}"
echo ""

read -p "Enter your registration token: " REGISTRATION_TOKEN

if [ -z "$REGISTRATION_TOKEN" ]; then
    echo -e "${RED}❌ Registration token cannot be empty${NC}"
    exit 1
fi

# Configure runner
echo ""
echo -e "${BLUE}⚙️  Configuring runner...${NC}"
echo ""

# If running as root, set environment variable to allow it
if [ "$RUNNING_AS_ROOT" = true ]; then
    export RUNNER_ALLOW_RUNASROOT=1
fi

./config.sh \
    --url "$REPO_URL" \
    --token "$REGISTRATION_TOKEN" \
    --name "$RUNNER_NAME" \
    --labels "$RUNNER_LABELS" \
    --work _work \
    --unattended \
    --replace

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Runner configuration failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Runner configured successfully${NC}"
echo ""

# Install as service (requires root)
echo -e "${BLUE}🔧 Installing runner as systemd service...${NC}"

if [ "$RUNNING_AS_ROOT" = true ]; then
    ./svc.sh install
else
    sudo ./svc.sh install
fi

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Service installation failed${NC}"
    exit 1
fi

# Start service (requires root)
echo -e "${BLUE}▶️  Starting runner service...${NC}"

if [ "$RUNNING_AS_ROOT" = true ]; then
    ./svc.sh start
else
    sudo ./svc.sh start
fi

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Service start failed${NC}"
    exit 1
fi

# Wait a moment for service to start
sleep 3

# Check service status
echo ""
echo -e "${BLUE}🏥 Checking service status...${NC}"
./svc.sh status

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                 ✅ INSTALLATION COMPLETE!                      ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Runner Details:${NC}"
echo -e "  📍 Location: ${GREEN}$RUNNER_DIR${NC}"
echo -e "  🏷️  Name: ${GREEN}$RUNNER_NAME${NC}"
echo -e "  🏷️  Labels: ${GREEN}$RUNNER_LABELS${NC}"
echo -e "  📦 Repository: ${GREEN}$REPO_URL${NC}"
echo ""
echo -e "${BLUE}Service Management:${NC}"
echo -e "  Status:  ${GREEN}sudo systemctl status actions.runner.Dekode1859-Mantis.mantis-lxc-runner${NC}"
echo -e "  Stop:    ${GREEN}cd $RUNNER_DIR && ./svc.sh stop${NC}"
echo -e "  Start:   ${GREEN}cd $RUNNER_DIR && ./svc.sh start${NC}"
echo -e "  Restart: ${GREEN}cd $RUNNER_DIR && ./svc.sh restart${NC}"
echo ""
echo -e "${BLUE}Verify in GitHub:${NC}"
echo -e "  Go to: ${GREEN}https://github.com/Dekode1859/Mantis/settings/actions/runners${NC}"
echo -e "  You should see: ${GREEN}mantis-lxc-runner${NC} with status ${GREEN}Idle${NC}"
echo ""
echo -e "${BLUE}Check Runner Status:${NC}"
echo -e "  Run: ${GREEN}/root/Mantis/scripts/check-runner-status.sh${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "  1. Verify runner appears in GitHub (link above)"
echo -e "  2. Test by creating a PR to the 'develop' branch"
echo -e "  3. Watch the workflow run on your self-hosted runner!"
echo ""
