#!/bin/bash
################################################################################
# RealTranslate VPS Setup - Part 5: Deploy Application
# Description: Clone repo, setup Node.js app, configure environment
################################################################################

set -e

echo "=========================================="
echo "RealTranslate VPS Setup - Part 5"
echo "Application Deployment"
echo "=========================================="

# Don't need root for this
if [ "$EUID" -eq 0 ]; then
    echo "⚠️  Please run as regular user (NOT sudo)"
    exit 1
fi

APP_DIR="/home/$(whoami)/realtranslate"

echo ""
echo "📂 Creating application directory..."
mkdir -p $APP_DIR
cd $APP_DIR

echo ""
echo "📥 Cloning repository from GitHub..."
read -p "Enter GitHub repo URL (e.g., https://github.com/51TH-FireFox13/RealTranslate.git): " REPO_URL

if [ -z "$REPO_URL" ]; then
    echo "❌ Repository URL is required!"
    exit 1
fi

git clone $REPO_URL .

echo ""
echo "📝 Setting up backend..."
cd backend

echo ""
echo "📦 Installing Node.js dependencies..."
npm install

echo ""
echo "🔧 Creating .env file..."
echo "Please provide the following information:"
echo ""

read -p "OpenAI API Key: " OPENAI_KEY
read -p "DeepSeek API Key: " DEEPSEEK_KEY
read -p "Database password (from step 3): " DB_PASSWORD
JWT_SECRET=$(openssl rand -base64 32)

cat > .env <<EOF
# OpenAI & DeepSeek API Keys
OPENAI_API_KEY=$OPENAI_KEY
DEEPSEEK_API_KEY=$DEEPSEEK_KEY

# Database
DATABASE_URL=postgresql://realtranslate_user:$DB_PASSWORD@localhost:5432/realtranslate

# JWT Secret
JWT_SECRET=$JWT_SECRET

# Server
PORT=3000
NODE_ENV=production

# CORS
ALLOWED_ORIGINS=https://leuca.fr,https://www.leuca.fr
EOF

chmod 600 .env

echo ""
echo "✅ Environment file created!"

echo ""
echo "🗄️  Running database migrations..."
npm run migrate || echo "⚠️  Migration script not found. You'll need to set up the database manually."

echo ""
echo "🚀 Starting application with PM2..."
pm2 start npm --name "realtranslate" -- start
pm2 save

echo ""
echo "✅ Application deployed!"
echo ""
echo "📊 Application status:"
pm2 status

echo ""
echo "📝 Useful PM2 commands:"
echo "  pm2 status          - Check app status"
echo "  pm2 logs            - View logs"
echo "  pm2 restart all     - Restart app"
echo "  pm2 stop all        - Stop app"
echo "  pm2 monit           - Monitor resources"
echo ""
echo "✅ Setup complete! 🎉"
