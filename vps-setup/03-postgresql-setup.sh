#!/bin/bash
################################################################################
# RealTranslate VPS Setup - Part 3: PostgreSQL Setup
# Description: Install PostgreSQL 16 and create database
################################################################################

set -e

echo "=========================================="
echo "RealTranslate VPS Setup - Part 3"
echo "PostgreSQL 16 Installation"
echo "=========================================="

if [ "$EUID" -ne 0 ]; then
    echo "⚠️  Please run with sudo"
    exit 1
fi

echo ""
echo "📦 Adding PostgreSQL official repository..."
sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -

echo ""
echo "📦 Updating package list..."
apt update

echo ""
echo "📦 Installing PostgreSQL 16..."
apt install -y postgresql-16 postgresql-contrib-16

echo ""
echo "🚀 Starting PostgreSQL..."
systemctl start postgresql
systemctl enable postgresql

echo ""
echo "🔧 Creating database and user..."

# Generate random password
DB_PASSWORD=$(openssl rand -base64 16)

# Create database and user
sudo -u postgres psql <<EOF
-- Create user
CREATE USER realtranslate_user WITH PASSWORD '$DB_PASSWORD';

-- Create database
CREATE DATABASE realtranslate OWNER realtranslate_user;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE realtranslate TO realtranslate_user;

-- Show result
\l
EOF

echo ""
echo "✅ PostgreSQL setup complete!"
echo ""
echo "📝 Database credentials (SAVE THIS!):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Database: realtranslate"
echo "User: realtranslate_user"
echo "Password: $DB_PASSWORD"
echo "Connection string:"
echo "postgresql://realtranslate_user:$DB_PASSWORD@localhost:5432/realtranslate"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  Save this password! You'll need it for .env file"
echo ""

# Save to file for reference
echo "$DB_PASSWORD" > /tmp/realtranslate_db_password.txt
chmod 600 /tmp/realtranslate_db_password.txt
echo "Password also saved to: /tmp/realtranslate_db_password.txt"

echo ""
echo "Next: Run 04-nginx-setup.sh"
