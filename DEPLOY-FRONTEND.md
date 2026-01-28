# Guide de Déploiement Frontend - RealTranslate

## 🎯 Problème: Les modifications HTML ne s'affichent pas

### Cause

Quand vous faites un `git pull origin` sur le serveur, **les fichiers sont mis à jour sur le disque**, MAIS:

1. **Le serveur Node.js continue de tourner** avec les anciens fichiers en mémoire/cache
2. **Express.js met en cache les fichiers statiques** pour améliorer les performances
3. **Le navigateur peut aussi avoir mis les pages en cache**

➡️ **Solution**: Il faut REDÉMARRER le serveur après chaque `git pull`

---

## ✅ Solution Rapide (Recommandée)

Utilisez le nouveau script de déploiement frontend:

```bash
cd /home/user/RealTranslate
./deploy-frontend.sh
```

Ce script:
- ✅ Fait le `git pull` automatiquement
- ✅ Redémarre le serveur (PM2 ou manuel)
- ✅ Vérifie que le serveur fonctionne
- ✅ Affiche les instructions pour vider le cache navigateur

---

## 🔧 Solution Manuelle

Si vous préférez faire les étapes manuellement:

### 1. Git Pull

```bash
cd /home/user/RealTranslate
git pull origin [nom-de-votre-branche]
```

### 2. Redémarrer le serveur

**Avec PM2 (recommandé):**
```bash
pm2 restart realtranslate
```

**Sans PM2:**
```bash
pkill -f "node server.js"
sleep 2
cd backend
nohup node server.js > /tmp/realtranslate.log 2>&1 &
```

### 3. Vérifier que le serveur fonctionne

```bash
curl http://localhost:3000/api/health
```

Si vous voyez `{"status":"ok"}`, c'est bon! ✅

### 4. Vider le cache navigateur

**Important**: Même après le redémarrage du serveur, votre navigateur peut avoir mis les pages en cache.

**Solutions:**
- **Chrome/Edge**: `Ctrl + Shift + R` (Windows/Linux) ou `Cmd + Shift + R` (Mac)
- **Firefox**: `Ctrl + F5` (Windows/Linux) ou `Cmd + Shift + R` (Mac)
- **Safari**: `Cmd + Option + R`
- **Navigation privée**: Ouvrez une fenêtre en navigation privée pour tester

---

## 🔍 Vérifications Supplémentaires

### Si ça ne marche toujours pas:

#### 1. Vérifier que les fichiers ont bien été mis à jour

```bash
cd /home/user/RealTranslate/frontend
ls -lah landing.html
git log -1 --oneline landing.html
```

#### 2. Vérifier que le serveur sert les bons fichiers

```bash
# Dans server.js ligne 77, on devrait voir:
grep "express.static" backend/server.js
# Résultat attendu: app.use(express.static(join(__dirname, '../frontend')));
```

#### 3. Vérifier les logs du serveur

```bash
# Avec PM2:
pm2 logs realtranslate --lines 50

# Sans PM2:
tail -f /tmp/realtranslate.log
```

#### 4. Vérifier que vous êtes sur la bonne branche

```bash
git branch --show-current
git status
```

#### 5. Vérifier nginx (si configuré)

Si vous avez nginx devant Node.js, il peut aussi mettre les fichiers en cache:

```bash
# Vérifier la config nginx
cat /etc/nginx/sites-enabled/ia.leuca.fr

# Recharger nginx si nécessaire
sudo nginx -t
sudo systemctl reload nginx
```

---

## 📊 Architecture du Déploiement

```
┌─────────────────────────────────────────┐
│         Navigateur                       │
│  (peut mettre en cache les pages)       │
└─────────────────┬───────────────────────┘
                  │
                  │ HTTPS
                  ▼
┌─────────────────────────────────────────┐
│         Nginx (optionnel)                │
│  (peut mettre en cache les fichiers)    │
└─────────────────┬───────────────────────┘
                  │
                  │ proxy_pass
                  ▼
┌─────────────────────────────────────────┐
│     Node.js/Express (backend/server.js) │
│  • Express.static('/frontend')          │
│  • Met en CACHE les fichiers statiques  │
│  • DOIT être redémarré après git pull   │
└─────────────────┬───────────────────────┘
                  │
                  │ lit les fichiers
                  ▼
┌─────────────────────────────────────────┐
│         Système de fichiers              │
│    /home/user/RealTranslate/frontend/   │
│    • landing.html                        │
│    • index.html                          │
│    • pricing.html                        │
│    • *.css, *.js                         │
└─────────────────────────────────────────┘
```

**Point clé**: Node.js charge les fichiers en mémoire au démarrage et les garde en cache. Un simple `git pull` ne force pas Node.js à recharger les fichiers!

---

## 🚀 Workflow Recommandé

### Pour un développement continu:

```bash
# 1. Développer localement et commiter
git add frontend/
git commit -m "Update landing page"
git push origin [branche]

# 2. Sur le serveur, déployer
ssh user@serveur
cd /home/user/RealTranslate
./deploy-frontend.sh

# 3. Tester dans le navigateur
# Ouvrir https://ia.leuca.fr en navigation privée
```

### Pour un déploiement complet (backend + frontend):

```bash
cd /home/user/RealTranslate
./deploy.sh  # Script principal qui redémarre aussi le serveur
```

---

## 💡 Astuces

### Désactiver le cache en développement

Pour éviter ce problème pendant le développement, vous pouvez désactiver le cache d'Express:

Dans `backend/server.js`, ajoutez après la ligne 77:

```javascript
if (NODE_ENV === 'development') {
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
  });
}
```

### Utiliser un watcher pour redémarrer automatiquement

Installez `nodemon` pour redémarrer automatiquement le serveur à chaque modification:

```bash
npm install -g nodemon
pm2 delete realtranslate
pm2 start "nodemon backend/server.js" --name realtranslate
```

### Forcer le rechargement dans le navigateur

Ajoutez un paramètre de version dans vos URLs:

```html
<link rel="stylesheet" href="landing.css?v=1.0.1">
```

---

## 📝 Checklist de Déploiement

Avant de dire "ça ne marche pas":

- [ ] J'ai bien fait `git pull origin [branche]`
- [ ] J'ai redémarré le serveur avec `pm2 restart realtranslate`
- [ ] J'ai vidé le cache du navigateur (`Ctrl+Shift+R`)
- [ ] J'ai testé en navigation privée
- [ ] J'ai vérifié les logs du serveur (`pm2 logs realtranslate`)
- [ ] J'ai vérifié que je suis sur la bonne branche (`git branch`)
- [ ] Le serveur répond bien (`curl http://localhost:3000/api/health`)

---

## 🆘 Support

Si ça ne marche toujours pas après avoir suivi ce guide:

1. Vérifiez les logs: `pm2 logs realtranslate --lines 100`
2. Vérifiez l'état du serveur: `pm2 status`
3. Vérifiez le git status: `git status` et `git log -5 --oneline`
4. Testez directement le fichier: `curl http://localhost:3000/landing.html | head -50`

---

## 📚 Voir aussi

- `DEPLOY-GUIDE.md` - Guide de déploiement complet
- `deploy.sh` - Script de déploiement backend + frontend
- `deploy-frontend.sh` - Script de déploiement frontend uniquement
