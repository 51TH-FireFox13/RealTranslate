# 📦 Guide de Déploiement et Administration - RealTranslate

Ce guide explique comment déployer, mettre à jour et administrer RealTranslate sur votre serveur.

## 🚀 Déploiement Automatique

### Script de Déploiement

Le script `deploy.sh` automatise la mise à jour de l'application depuis GitHub.

#### Utilisation :

```bash
chmod +x deploy.sh
./deploy.sh
```

#### Ce que fait le script :

1. ✅ **Sauvegarde** : Crée une sauvegarde complète de la version actuelle
2. 🔐 **Protection** : Préserve le fichier `.env` avec vos clés API
3. 📥 **Mise à jour** : Récupère les dernières modifications depuis GitHub
4. 📦 **Dépendances** : Installe les nouvelles dépendances npm si nécessaire
5. 🔄 **Redémarrage** : Redémarre le serveur automatiquement
6. ✅ **Vérification** : Vérifie que le serveur répond correctement
7. 🧹 **Nettoyage** : Supprime les anciennes sauvegardes (garde les 5 dernières)

#### Logs de déploiement :

Les logs sont sauvegardés dans `logs/deploy.log`

#### Sauvegardes :

Les sauvegardes sont dans `backups/backup_YYYYMMDD_HHMMSS/`

---

## 🔐 Système d'Authentification

RealTranslate intègre un système d'authentification avec gestion des droits.

### Activer/Désactiver l'Authentification

Par défaut, l'authentification est **activée**. Pour la désactiver (mode développement) :

Dans `backend/.env` :
```bash
DISABLE_AUTH=true
```

⚠️ **Ne jamais désactiver en production !**

### Compte Administrateur par Défaut

```
Email: admin@realtranslate.com
Mot de passe: admin123
```

⚠️ **IMPORTANT** : Changez ce mot de passe immédiatement après la première connexion !

### Rôles et Permissions

| Rôle    | Permissions                             |
|---------|-----------------------------------------|
| `admin` | Toutes les permissions + gestion users  |
| `user`  | transcribe, translate, speak            |
| `guest` | translate uniquement                    |

---

## 🔑 API d'Authentification

### 1. Se connecter (Login)

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@realtranslate.com",
  "password": "admin123"
}
```

**Réponse :**
```json
{
  "success": true,
  "token": "a1b2c3d4...",
  "user": {
    "id": "admin@realtranslate.com",
    "email": "admin@realtranslate.com",
    "role": "admin"
  }
}
```

### 2. Utiliser le Token

Ajoutez le token dans l'en-tête de toutes les requêtes API :

```bash
Authorization: Bearer a1b2c3d4...
```

**Exemple avec curl :**

```bash
curl -X POST http://localhost:3000/api/translate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello", "targetLanguage": "zh"}'
```

### 3. Créer un Utilisateur (Admin uniquement)

```bash
POST /api/auth/users
Authorization: Bearer ADMIN_TOKEN
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "role": "user"
}
```

### 4. Lister les Utilisateurs (Admin uniquement)

```bash
GET /api/auth/users
Authorization: Bearer ADMIN_TOKEN
```

### 5. Supprimer un Utilisateur (Admin uniquement)

```bash
DELETE /api/auth/users/user@example.com
Authorization: Bearer ADMIN_TOKEN
```

### 6. Se Déconnecter (Logout)

```bash
POST /api/auth/logout
Authorization: Bearer YOUR_TOKEN
```

### 7. Obtenir l'Utilisateur Actuel

```bash
GET /api/auth/me
Authorization: Bearer YOUR_TOKEN
```

---

## 📊 Système de Logs

RealTranslate génère plusieurs types de logs pour faciliter le monitoring et le debugging.

### Types de Logs

| Fichier      | Description                                    |
|--------------|------------------------------------------------|
| `app.log`    | Logs généraux de l'application                 |
| `error.log`  | Erreurs uniquement                             |
| `access.log` | Toutes les requêtes HTTP                       |
| `auth.log`   | Authentifications et actions sécurisées        |
| `api.log`    | Appels aux APIs externes (OpenAI, DeepSeek)   |
| `deploy.log` | Historique des déploiements                    |

### Localisation

Tous les logs sont dans le dossier `logs/`

### Consulter les Logs

```bash
# Voir les derniers logs généraux
tail -f logs/app.log

# Voir les erreurs
tail -f logs/error.log

# Voir les accès en temps réel
tail -f logs/access.log

# Voir les tentatives de connexion
tail -f logs/auth.log
```

### Rotation Automatique

- Les logs sont automatiquement **archivés** quand ils dépassent **10 MB**
- Les logs de plus de **30 jours** sont **supprimés** automatiquement

---

## 🔧 Configuration Serveur

### Variables d'Environnement

Créez un fichier `backend/.env` :

```bash
# Port du serveur
PORT=3000

# Clés API
OPENAI_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...

# Authentification (true = désactivée)
DISABLE_AUTH=false
```

### Avec PM2 (Recommandé pour Production)

PM2 est un gestionnaire de processus qui redémarre automatiquement l'application en cas de crash.

```bash
# Installer PM2
npm install -g pm2

# Démarrer l'application
cd backend
pm2 start server.js --name realtranslate

# Sauvegarder la configuration
pm2 save

# Démarrage automatique au boot
pm2 startup
```

**Commandes PM2 utiles :**

```bash
pm2 status              # Voir le statut
pm2 logs realtranslate  # Voir les logs en temps réel
pm2 restart realtranslate  # Redémarrer
pm2 stop realtranslate  # Arrêter
pm2 delete realtranslate  # Supprimer
```

### Sans PM2

```bash
cd backend
nohup node server.js > ../logs/server.log 2>&1 &
```

---

## 🛡️ Sécurité

### Bonnes Pratiques

1. **Changez le mot de passe admin** immédiatement
2. **Ne committez JAMAIS** le fichier `.env`
3. **Activez HTTPS** avec Nginx/Apache en production
4. **Limitez les tokens** à durée de vie raisonnable (30 jours par défaut)
5. **Consultez les logs** régulièrement pour détecter les tentatives d'intrusion

### Configuration Nginx (Production)

```nginx
server {
    listen 443 ssl http2;
    server_name ia.leuca.fr;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## 🔄 Workflow de Mise à Jour

### Depuis GitHub

```bash
# Sur votre serveur
cd /path/to/RealTranslate
./deploy.sh
```

### Vérification Post-Déploiement

```bash
# Vérifier que le serveur répond
curl http://localhost:3000/api/health

# Vérifier les logs
tail -f logs/app.log

# Si PM2 est installé
pm2 status
pm2 logs realtranslate
```

---

## 🆘 Résolution de Problèmes

### Le serveur ne démarre pas

1. Vérifiez les logs : `tail -f logs/app.log`
2. Vérifiez que le port 3000 est disponible : `lsof -i :3000`
3. Vérifiez les variables d'environnement dans `.env`

### Erreurs d'authentification

1. Consultez `logs/auth.log`
2. Vérifiez que `DISABLE_AUTH` n'est pas à `true` en production
3. Vérifiez que le token n'a pas expiré

### Erreurs d'API (OpenAI/DeepSeek)

1. Consultez `logs/api.log`
2. Vérifiez vos clés API dans `.env`
3. Vérifiez les quotas de votre compte OpenAI/DeepSeek

---

## 📈 Monitoring

### Endpoints de Santé

```bash
# Vérifier que le serveur est en ligne
GET /api/health

# Réponse attendue :
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "openai": true,
  "deepseek": true
}
```

### Statistiques d'Utilisation

Les logs dans `logs/api.log` contiennent toutes les requêtes aux APIs externes.

Pour analyser l'utilisation :

```bash
# Nombre de traductions aujourd'hui
grep "translate" logs/api.log | grep $(date +%Y-%m-%d) | wc -l

# Nombre de transcriptions
grep "transcribe" logs/api.log | wc -l
```

---

## 📞 Support

Pour toute question ou problème, consultez :
- Les logs dans `logs/`
- Le fichier README.md
- Le code source sur GitHub

---

**Dernière mise à jour :** Janvier 2025
