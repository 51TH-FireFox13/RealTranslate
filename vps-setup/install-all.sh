#!/bin/bash
################################################################################
# RealTranslate VPS Setup - Master Installer
# Description: Run all setup scripts in sequence
################################################################################

set -e

echo "=========================================="
echo "    RealTranslate VPS Complete Setup"
echo "=========================================="
echo ""
echo "This script will install everything needed:"
echo "  ✓ System updates & security (UFW, fail2ban)"
echo "  ✓ Node.js 20 LTS"
echo "  ✓ PostgreSQL 16"
echo "  ✓ Nginx with SSL"
echo "  ✓ Application deployment"
echo ""
echo "⚠️  IMPORTANT:"
echo "  - This must be run on a fresh Ubuntu 22.04/24.04 VPS"
echo "  - Make sure your domain DNS points to this server"
echo "  - Have your API keys ready (OpenAI, DeepSeek)"
echo ""
read -p "Continue? (y/n): " confirm

if [ "$confirm" != "y" ]; then
    echo "Aborted."
    exit 0
fi

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run with sudo"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "🚀 Starting installation..."
echo ""

# Make all scripts executable
chmod +x *.sh

# Step 1: System setup
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 1/5: System Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
./01-system-setup.sh

# Step 2: Node.js
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 2/5: Node.js Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
./02-nodejs-setup.sh

# Step 3: PostgreSQL
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 3/5: PostgreSQL Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
./03-postgresql-setup.sh

# Save DB password for later
DB_PASSWORD=$(cat /tmp/realtranslate_db_password.txt)

# Step 4: Nginx & SSL
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 4/5: Nginx & SSL Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
./04-nginx-setup.sh

# Step 5: Deploy app (as regular user)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 5/5: Application Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  The next step will ask for your API keys"
echo "    Database password: $DB_PASSWORD"
echo ""
read -p "Press Enter to continue..."

# Get the original user (who ran sudo)
ORIGINAL_USER=${SUDO_USER:-$USER}

# Run deploy script as original user
su - $ORIGINAL_USER -c "cd $SCRIPT_DIR && ./05-deploy-app.sh"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ INSTALLATION COMPLETE! 🎉"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Next steps:"
echo "  1. Check app status: pm2 status"
echo "  2. View logs: pm2 logs realtranslate"
echo "  3. Access your site: https://your-domain.com"
echo ""
echo "📚 Useful commands:"
echo "  pm2 status          - Check app status"
echo "  pm2 logs            - View logs"
echo "  pm2 restart all     - Restart app"
echo "  sudo systemctl status nginx - Check Nginx"
echo ""
echo "🔐 Security notes:"
echo "  - Database password saved in: /tmp/realtranslate_db_password.txt"
echo "  - API keys in: /home/$ORIGINAL_USER/realtranslate/backend/.env"
echo "  - Delete temporary password file: rm /tmp/realtranslate_db_password.txt"
echo ""
echo "Happy translating! 🌍"
