# Guide de déploiement - RealTranslate v1.0 SQLite

## 🎯 Résumé

Migration de JSON vers SQLite + corrections de bugs + tests complets.

## ⚡ Déploiement rapide (5 minutes)

### 1. Configurer les clés API

```bash
cd /home/user/RealTranslate
cp backend/.env.template backend/.env
nano backend/.env  # ou vim, vi, etc.
```

**Clés obligatoires à remplir:**
- `JWT_SECRET` - Générer une longue chaîne aléatoire
- `JWT_REFRESH_SECRET` - Générer une autre longue chaîne aléatoire  
- `OPENAI_API_KEY` - Votre clé OpenAI (commence par sk-)

**Clés optionnelles:**
- `DEEPSEEK_API_KEY` - Si vous voulez supporter les users en Chine
- `STRIPE_*` - Si vous voulez activer les paiements

### 2. Lancer le déploiement

```bash
cd /home/user/RealTranslate
./deploy.sh
```

Le script va:
- ✅ Vérifier la config
- ✅ Faire un backup de la base actuelle
- ✅ Arrêter l'ancien serveur
- ✅ Installer les dépendances
- ✅ Démarrer le nouveau serveur
- ✅ Vérifier que tout fonctionne

### 3. Tester

```bash
# Test local
curl http://localhost:3000/api/health

# Test public
curl https://ia.leuca.fr/api/health

# Test login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@realtranslate.com","password":"admin123"}'
```

## 📊 État du déploiement

### ✅ Terminé
- Migration SQLite (8 tables avec indexes)
- Tests: 27/27 passent
- Bugs critiques corrigés:
  - User deletion (mauvaise clé)
  - Message deletion (non persisté)
  - Reactions (perdues au restart)
  - Group members (non sauvegardés)
- Documentation alignée
- Méthodes manquantes ajoutées (listUsers, authenticate)

### 📦 Contenu du déploiement
- **Backend**: SQLite + Proxies + Auth refactorisé
- **Frontend**: Inchangé (compatible)
- **Tests**: Suite complète Jest
- **Docs**: README + MIGRATION-SQLITE.md + NIGHT-WORK-SUMMARY.md

## 🔐 Comptes disponibles

Après déploiement:
- `admin@realtranslate.com` / `admin123` (admin)
- `julien@leuca.fr` / `admin123` (user)
- `test@example.com` / `test123` (user)
- `demo@example.com` / `demo123` (user)

**Important**: Changez ces mots de passe en production!

## 📝 Gestion post-déploiement

### Voir les logs

```bash
# Si PM2 est installé
pm2 logs realtranslate
pm2 monit

# Sinon
tail -f /tmp/realtranslate.log
```

### Redémarrer

```bash
# Avec PM2
pm2 restart realtranslate

# Sans PM2
./deploy.sh
```

### Créer de nouveaux utilisateurs

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"nouveau@example.com","password":"motdepasse123","displayName":"Nom Utilisateur"}'
```

### Backup manuel

```bash
# Créer un backup
cp backend/realtranslate.db backend/backups/manual-$(date +%Y%m%d_%H%M%S).db

# Backup automatique (cron)
echo "0 2 * * * cp backend/realtranslate.db backend/backups/auto-\$(date +\%Y\%m\%d).db" | crontab -
```

## 🔄 Rollback (si problème)

```bash
# 1. Arrêter le serveur
pm2 stop realtranslate  # ou pkill -f "node server.js"

# 2. Restaurer le backup
cd /home/user/RealTranslate/backend
ls -la backups/  # Trouver le bon backup
cp backups/YYYYMMDD_HHMMSS/realtranslate.db .

# 3. Redémarrer
cd /home/user/RealTranslate
./deploy.sh
```

## 🆘 Dépannage

### Le serveur ne démarre pas

```bash
# Vérifier les logs
tail -100 /tmp/realtranslate.log

# Vérifier le .env
cat backend/.env | grep -v "^#"

# Vérifier les ports
lsof -i :3000
```

### Erreur "Utilisateur introuvable"

Les utilisateurs doivent être créés (voir section "Créer de nouveaux utilisateurs")

### nginx ne redirige pas

Vérifier la config nginx:
```bash
cat /etc/nginx/sites-enabled/ia.leuca.fr
# Devrait avoir: proxy_pass http://localhost:3000
```

## 📚 Documentation complète

- `README.md` - Documentation générale
- `MIGRATION-SQLITE.md` - Guide migration détaillé
- `NIGHT-WORK-SUMMARY.md` - Résumé session consolidation
- `backend/tests/` - Suite de tests

## 🎉 Prochaines étapes recommandées

1. ✅ Déployer (ce guide)
2. 🔐 Changer les mots de passe par défaut
3. 🔑 Configurer les vraies clés API
4. 📊 Monitorer les logs pendant 24h
5. 💾 Configurer backups automatiques
6. 🧪 Tester toutes les fonctionnalités depuis l'interface
