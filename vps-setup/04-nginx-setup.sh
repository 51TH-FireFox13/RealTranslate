#!/bin/bash
################################################################################
# RealTranslate VPS Setup - Part 4: Nginx & SSL Setup
# Description: Install Nginx, configure reverse proxy, setup Let's Encrypt SSL
################################################################################

set -e

echo "=========================================="
echo "RealTranslate VPS Setup - Part 4"
echo "Nginx & SSL Configuration"
echo "=========================================="

if [ "$EUID" -ne 0 ]; then
    echo "⚠️  Please run with sudo"
    exit 1
fi

echo ""
echo "📦 Installing Nginx..."
apt install -y nginx

echo ""
echo "🚀 Starting Nginx..."
systemctl start nginx
systemctl enable nginx

echo ""
echo "📦 Installing Certbot for Let's Encrypt SSL..."
apt install -y certbot python3-certbot-nginx

echo ""
echo "⚠️  Before continuing, make sure:"
echo "   1. Your domain DNS points to this server IP: $(curl -s ifconfig.me)"
echo "   2. Ports 80 and 443 are open (we already did this)"
echo ""
read -p "Enter your domain name (e.g., leuca.fr): " DOMAIN

if [ -z "$DOMAIN" ]; then
    echo "❌ Domain name is required!"
    exit 1
fi

echo ""
echo "🔧 Creating Nginx configuration for $DOMAIN..."

cat > /etc/nginx/sites-available/realtranslate <<EOF
# RealTranslate Nginx Configuration
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

    # Redirect to HTTPS (will be handled by certbot)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Increase max body size for audio uploads
    client_max_body_size 10M;
}
EOF

echo ""
echo "🔗 Enabling site..."
ln -sf /etc/nginx/sites-available/realtranslate /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

echo ""
echo "✅ Testing Nginx configuration..."
nginx -t

echo ""
echo "🔄 Reloading Nginx..."
systemctl reload nginx

echo ""
echo "🔐 Setting up SSL certificate..."
echo "⚠️  You'll be asked for an email address"
echo ""

certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --register-unsafely-without-email || {
    echo ""
    echo "❌ SSL setup failed. You can retry manually with:"
    echo "   sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
    echo ""
    echo "Common issues:"
    echo "  - DNS not pointing to server yet (wait a few minutes)"
    echo "  - Domain not accessible from internet"
    echo ""
}

echo ""
echo "✅ Part 4 complete!"
echo ""
echo "Your site should now be accessible at:"
echo "  http://$DOMAIN (redirects to HTTPS)"
echo "  https://$DOMAIN"
echo ""
echo "Next: Run 05-deploy-app.sh"
