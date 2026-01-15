#!/bin/bash
################################################################################
# RealTranslate VPS Setup - Part 2: Node.js Setup
# Description: Install Node.js 20 LTS and npm
################################################################################

set -e

echo "=========================================="
echo "RealTranslate VPS Setup - Part 2"
echo "Node.js 20 LTS Installation"
echo "=========================================="

if [ "$EUID" -ne 0 ]; then
    echo "⚠️  Please run with sudo"
    exit 1
fi

echo ""
echo "📦 Adding NodeSource repository for Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -

echo ""
echo "📦 Installing Node.js and npm..."
apt install -y nodejs

echo ""
echo "✅ Node.js installation complete!"
node --version
npm --version

echo ""
echo "📦 Installing PM2 (Process Manager)..."
npm install -g pm2

echo ""
echo "🔧 Configuring PM2 to start on boot..."
pm2 startup systemd -u $(logname) --hp /home/$(logname)

echo ""
echo "✅ Part 2 complete!"
echo "Next: Run 03-postgresql-setup.sh"
