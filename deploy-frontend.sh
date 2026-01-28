#!/bin/bash
# Script de déploiement Frontend RealTranslate
# Ce script met à jour les fichiers HTML/CSS/JS et redémarre le serveur

set -e

echo "🚀 Déploiement Frontend RealTranslate"
echo "======================================"

# Couleurs pour les messages
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Récupérer la branche actuelle
CURRENT_BRANCH=$(git branch --show-current)
echo -e "${BLUE}📌 Branche actuelle: ${CURRENT_BRANCH}${NC}"

# Git pull
echo "📥 Récupération des dernières modifications..."
git pull origin ${CURRENT_BRANCH}
echo -e "${GREEN}✅ Code mis à jour${NC}"

# Vérifier si PM2 est installé
if command -v pm2 &> /dev/null; then
    echo "🔄 Redémarrage du serveur avec PM2..."
    pm2 restart realtranslate
    echo -e "${GREEN}✅ Serveur redémarré${NC}"
else
    echo -e "${RED}⚠️  PM2 non trouvé, tentative d'arrêt/redémarrage manuel...${NC}"
    pkill -f "node server.js" 2>/dev/null && echo "Serveur arrêté" || echo "Pas de serveur actif"
    sleep 2
    cd backend
    nohup node server.js > /tmp/realtranslate.log 2>&1 &
    echo -e "${GREEN}✅ Serveur redémarré (PID: $!)${NC}"
fi

# Attendre que le serveur soit prêt
echo "⏳ Vérification du serveur..."
sleep 3

# Test de santé
if curl -s http://localhost:3000/api/health > /dev/null; then
    echo -e "${GREEN}✅ Serveur opérationnel!${NC}"
else
    echo -e "${RED}⚠️  Le serveur ne répond pas. Vérifiez les logs:${NC}"
    echo "   pm2 logs realtranslate"
    echo "   ou tail -f /tmp/realtranslate.log"
fi

# Instructions pour vider le cache navigateur
echo ""
echo "📝 IMPORTANT:"
echo "   Si les modifications ne s'affichent toujours pas:"
echo "   1. Videz le cache de votre navigateur (Ctrl+Shift+R ou Cmd+Shift+R)"
echo "   2. Ou ouvrez en navigation privée pour tester"
echo ""
echo -e "${GREEN}🎉 Déploiement terminé!${NC}"
echo "   Site: https://ia.leuca.fr"
