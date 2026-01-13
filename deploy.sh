#!/bin/bash

# Script de déploiement automatique RealTranslate
# Permet de mettre à jour l'application depuis GitHub et de la redémarrer

set -e  # Arrêter le script en cas d'erreur

echo "🚀 RealTranslate - Déploiement Automatique"
echo "==========================================="
echo ""

# Définir les variables
APP_DIR="/home/user/RealTranslate"
BACKEND_DIR="$APP_DIR/backend"
LOG_DIR="$APP_DIR/logs"
BACKUP_DIR="$APP_DIR/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Créer les répertoires nécessaires
mkdir -p "$LOG_DIR"
mkdir -p "$BACKUP_DIR"

# Fonction de logging
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_DIR/deploy.log"
}

log "🔍 Début du déploiement..."

# 1. Vérifier que Git est installé
if ! command -v git &> /dev/null; then
    log "❌ Git n'est pas installé. Installation requise."
    exit 1
fi

# 2. Sauvegarder la version actuelle
log "💾 Sauvegarde de la version actuelle..."
if [ -d "$BACKUP_DIR/backup_$TIMESTAMP" ]; then
    rm -rf "$BACKUP_DIR/backup_$TIMESTAMP"
fi
mkdir -p "$BACKUP_DIR/backup_$TIMESTAMP"
cp -r "$APP_DIR"/* "$BACKUP_DIR/backup_$TIMESTAMP/" 2>/dev/null || true
log "✅ Sauvegarde créée dans $BACKUP_DIR/backup_$TIMESTAMP"

# 3. Sauvegarder le fichier .env s'il existe
if [ -f "$BACKEND_DIR/.env" ]; then
    log "🔐 Sauvegarde du fichier .env..."
    cp "$BACKEND_DIR/.env" "/tmp/realtranslate_env_$TIMESTAMP"
fi

# 4. Récupérer la branche actuelle
cd "$APP_DIR"
CURRENT_BRANCH=$(git branch --show-current)
log "📍 Branche actuelle: $CURRENT_BRANCH"

# 5. Arrêter le serveur s'il tourne (PM2 ou processus Node)
log "⏸️  Arrêt du serveur..."
if command -v pm2 &> /dev/null; then
    pm2 stop realtranslate 2>/dev/null || true
    pm2 delete realtranslate 2>/dev/null || true
    log "✅ Serveur PM2 arrêté"
else
    # Tuer les processus Node.js qui pourraient tourner
    pkill -f "node.*server.js" || true
    log "✅ Processus Node arrêtés"
fi

# 6. Mettre à jour depuis GitHub
log "📥 Récupération des dernières modifications depuis GitHub..."
git fetch origin "$CURRENT_BRANCH"

# Vérifier s'il y a des modifications locales
if [[ -n $(git status -s) ]]; then
    log "⚠️  Modifications locales détectées. Stash des modifications..."
    git stash push -m "Auto-stash avant déploiement $TIMESTAMP"
fi

# Pull les dernières modifications
git pull origin "$CURRENT_BRANCH"
log "✅ Code mis à jour depuis GitHub"

# 7. Restaurer le fichier .env
if [ -f "/tmp/realtranslate_env_$TIMESTAMP" ]; then
    log "🔐 Restauration du fichier .env..."
    cp "/tmp/realtranslate_env_$TIMESTAMP" "$BACKEND_DIR/.env"
    rm "/tmp/realtranslate_env_$TIMESTAMP"
fi

# 8. Installer les dépendances si package.json a changé
cd "$BACKEND_DIR"
if [ -f "package.json" ]; then
    log "📦 Installation des dépendances..."
    npm install --production
    log "✅ Dépendances installées"
fi

# 9. Redémarrer le serveur avec PM2 ou Node
log "🚀 Redémarrage du serveur..."
cd "$BACKEND_DIR"

if command -v pm2 &> /dev/null; then
    # Utiliser PM2 si disponible
    pm2 start server.js --name realtranslate --time
    pm2 save
    log "✅ Serveur démarré avec PM2"
else
    # Sinon, démarrer en arrière-plan
    nohup node server.js > "$LOG_DIR/server.log" 2>&1 &
    SERVER_PID=$!
    log "✅ Serveur démarré (PID: $SERVER_PID)"
    echo $SERVER_PID > "$APP_DIR/server.pid"
fi

# 10. Vérifier que le serveur répond
log "🔍 Vérification du serveur..."
sleep 3
if curl -f http://localhost:3000/api/health &> /dev/null; then
    log "✅ Serveur opérationnel !"
else
    log "⚠️  Le serveur ne répond pas encore. Vérifiez les logs."
fi

# 11. Nettoyer les vieilles sauvegardes (garder seulement les 5 dernières)
log "🧹 Nettoyage des anciennes sauvegardes..."
cd "$BACKUP_DIR"
ls -t | tail -n +6 | xargs -r rm -rf
log "✅ Anciennes sauvegardes supprimées"

log "✨ Déploiement terminé avec succès !"
log "==========================================="
echo ""
echo "📊 Résumé:"
echo "   - Branche: $CURRENT_BRANCH"
echo "   - Logs: $LOG_DIR/deploy.log"
echo "   - Sauvegarde: $BACKUP_DIR/backup_$TIMESTAMP"
echo ""
echo "🌐 Application accessible sur: http://localhost:3000"
echo ""
