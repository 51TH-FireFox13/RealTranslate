#!/bin/bash
# Script de déploiement RealTranslate v1.0 SQLite
set -e

echo "🚀 Déploiement RealTranslate v1.0 (SQLite)"
echo "=========================================="

# Check .env exists
if [ ! -f backend/.env ]; then
    echo "❌ Fichier .env manquant!"
    echo "   cp backend/.env.template backend/.env"
    echo "   nano backend/.env  # Ajoutez vos clés API"
    exit 1
fi
echo "✅ Configuration trouvée"

# Backup
if [ -f backend/realtranslate.db ]; then
    BACKUP_DIR="backend/backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    cp backend/realtranslate.db "$BACKUP_DIR/"
    echo "✅ Backup: $BACKUP_DIR"
fi

# Stop server
pkill -f "node server.js" 2>/dev/null && echo "✅ Serveur arrêté" || echo "ℹ️  Pas de serveur actif"
sleep 2

# Install deps
cd backend && npm install --production && cd ..
echo "✅ Dépendances installées"

# Start server
cd backend
if command -v pm2 &> /dev/null; then
    pm2 delete realtranslate 2>/dev/null || true
    pm2 start server.js --name realtranslate
    pm2 save
    echo "✅ Démarré avec PM2"
else
    nohup node server.js > /tmp/realtranslate.log 2>&1 &
    echo "✅ Démarré (PID: $!)"
fi

# Verify
sleep 3
curl -s http://localhost:3000/api/health && echo "" && echo "🎉 Déploiement réussi!"
