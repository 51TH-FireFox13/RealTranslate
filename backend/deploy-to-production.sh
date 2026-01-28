#!/bin/bash
# Script de déploiement vers /root/RealTranslate
# À exécuter avec: bash deploy-to-production.sh

set -e

SOURCE_DIR="/home/user/RealTranslate/backend"
TARGET_DIR="/root/RealTranslate/backend"

echo "🚀 Déploiement du code modularisé..."

# Vérifier que le répertoire source existe
if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ Erreur: $SOURCE_DIR n'existe pas"
    exit 1
fi

# Vérifier que le répertoire cible existe
if [ ! -d "$TARGET_DIR" ]; then
    echo "❌ Erreur: $TARGET_DIR n'existe pas"
    exit 1
fi

echo "📁 Copie du dossier src/..."
cp -r "$SOURCE_DIR/src" "$TARGET_DIR/"

echo "✅ Fichiers copiés avec succès"
echo ""
echo "📋 Fichiers mis à jour:"
echo "  - src/utils/logger.js (nouveau)"
echo "  - src/auth-sqlite.js (déplacé)"
echo "  - src/database.js (déplacé)"
echo "  - src/csrf-protection.js (déplacé)"
echo "  - src/payment-security.js (déplacé)"
echo "  - src/stripe-payment.js (déplacé)"
echo "  - src/db-helpers.js (déplacé)"
echo "  - src/db-proxy.js (déplacé)"
echo "  - Tous les imports de logger corrigés (16 fichiers)"
echo ""
echo "🔄 Redémarrage de PM2..."
pm2 restart realtranslate

echo ""
echo "⏳ Attente du démarrage (5 secondes)..."
sleep 5

echo ""
echo "📊 Statut PM2:"
pm2 list

echo ""
echo "📝 Derniers logs:"
pm2 logs realtranslate --lines 20 --nostream

echo ""
echo "✅ Déploiement terminé!"
echo "🌐 Vérifiez le site: https://ia.leuca.fr"
