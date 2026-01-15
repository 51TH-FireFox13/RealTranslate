#!/bin/bash
################################################################################
# RealTranslate VPS Setup - Part 1: System Setup
# Description: Update system, install base packages, configure firewall
################################################################################

set -e  # Exit on error

echo "=========================================="
echo "RealTranslate VPS Setup - Part 1"
echo "System Update & Base Packages"
echo "=========================================="

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    echo "⚠️  Please run with sudo"
    exit 1
fi

echo ""
echo "📦 Updating system packages..."
apt update
apt upgrade -y

echo ""
echo "📦 Installing essential packages..."
apt install -y \
    curl \
    wget \
    git \
    build-essential \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    ufw \
    fail2ban \
    vim \
    htop \
    unzip

echo ""
echo "🔥 Configuring firewall (UFW)..."
# Reset UFW to default
ufw --force reset

# Default policies
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (IMPORTANT!)
ufw allow 22/tcp comment 'SSH'

# Allow HTTP/HTTPS
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'

# Enable UFW
ufw --force enable

echo ""
echo "🛡️  Configuring fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

echo ""
echo "✅ Part 1 complete!"
echo ""
echo "Firewall status:"
ufw status verbose

echo ""
echo "Next: Run 02-nodejs-setup.sh"
