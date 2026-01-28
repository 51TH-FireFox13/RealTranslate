# Guide de Sécurisation du Serveur Ubuntu 22.04

Ce guide fournit des instructions détaillées pour sécuriser votre serveur Ubuntu 22.04 hébergeant RealTranslate.

## 📋 Table des Matières

1. [Mise à jour système](#mise-à-jour-système)
2. [Configuration du pare-feu (UFW)](#configuration-du-pare-feu-ufw)
3. [Configuration SSH](#configuration-ssh)
4. [Fail2Ban - Protection contre les attaques par force brute](#fail2ban)
5. [Configuration HTTPS avec Let's Encrypt](#configuration-https)
6. [Sécurisation de Node.js et PM2](#sécurisation-nodejs)
7. [Nginx comme reverse proxy](#nginx-reverse-proxy)
8. [Surveillance et monitoring](#surveillance)
9. [Sauvegardes automatiques](#sauvegardes)
10. [Checklist de sécurité](#checklist)

---

## 1. Mise à jour système

```bash
# Mettre à jour la liste des paquets
sudo apt update

# Mettre à niveau tous les paquets
sudo apt upgrade -y

# Mettre à niveau la distribution (facultatif)
sudo apt dist-upgrade -y

# Nettoyer les paquets inutilisés
sudo apt autoremove -y
sudo apt autoclean

# Activer les mises à jour automatiques de sécurité
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

**Configuration des mises à jour automatiques** (`/etc/apt/apt.conf.d/50unattended-upgrades`) :

```
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Automatic-Reboot "false";
```

---

## 2. Configuration du pare-feu (UFW)

```bash
# Installer UFW (normalement pré-installé)
sudo apt install ufw -y

# Configurer les règles par défaut
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Autoriser SSH (IMPORTANT : à faire AVANT d'activer UFW !)
sudo ufw allow 22/tcp
# OU si vous avez changé le port SSH (voir section SSH)
# sudo ufw allow 2222/tcp

# Autoriser HTTP et HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Autoriser le port de l'application (si accès direct, sinon utiliser Nginx)
# sudo ufw allow 3000/tcp

# Activer le pare-feu
sudo ufw enable

# Vérifier le statut
sudo ufw status verbose
```

**Règles avancées** :

```bash
# Limiter les connexions SSH pour prévenir les attaques par force brute
sudo ufw limit 22/tcp

# Autoriser SSH uniquement depuis une IP spécifique
sudo ufw allow from VOTRE_IP to any port 22

# Bloquer une IP malveillante
sudo ufw deny from IP_MALVEILLANTE
```

---

## 3. Configuration SSH

### Désactiver la connexion root et utiliser des clés SSH

**Créer une clé SSH sur votre machine locale** :

```bash
# Sur votre machine locale
ssh-keygen -t ed25519 -C "votre-email@example.com"

# Copier la clé publique sur le serveur
ssh-copy-id user@votre-serveur.com

# OU manuellement
cat ~/.ssh/id_ed25519.pub | ssh user@votre-serveur.com "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

**Configurer le serveur SSH** (`/etc/ssh/sshd_config`) :

```bash
# Éditer la configuration SSH
sudo nano /etc/ssh/sshd_config
```

**Modifications recommandées** :

```
# Changer le port SSH (optionnel mais recommandé)
Port 2222

# Désactiver la connexion root
PermitRootLogin no

# Désactiver l'authentification par mot de passe
PasswordAuthentication no
PubkeyAuthentication yes

# Désactiver l'authentification par challenge-response
ChallengeResponseAuthentication no

# Désactiver X11 forwarding
X11Forwarding no

# Limiter les utilisateurs autorisés
AllowUsers votre-utilisateur

# Timeout de connexion
ClientAliveInterval 300
ClientAliveCountMax 2

# Protocole SSH 2 uniquement
Protocol 2

# Désactiver les connexions vides
PermitEmptyPasswords no
```

**Redémarrer SSH** :

```bash
sudo systemctl restart sshd

# Tester la connexion SSH dans un NOUVEAU terminal avant de fermer l'ancien !
ssh -p 2222 user@votre-serveur.com
```

---

## 4. Fail2Ban - Protection contre les attaques par force brute

```bash
# Installer Fail2Ban
sudo apt install fail2ban -y

# Créer un fichier de configuration local
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local
```

**Configuration recommandée** (`/etc/fail2ban/jail.local`) :

```ini
[DEFAULT]
# Bannir une IP pendant 1 heure
bantime = 3600

# Temps de surveillance (10 minutes)
findtime = 600

# Nombre de tentatives avant bannissement
maxretry = 5

# Email de notification (optionnel)
destemail = admin@votre-domaine.com
sender = fail2ban@votre-domaine.com
action = %(action_mwl)s

[sshd]
enabled = true
port = 2222  # Changez si vous avez modifié le port SSH
logpath = /var/log/auth.log
maxretry = 3
bantime = 7200

[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log

[nginx-botsearch]
enabled = true
port = http,https
logpath = /var/log/nginx/access.log
maxretry = 2
```

**Créer un filtre pour protéger l'API Node.js** (`/etc/fail2ban/filter.d/nodejs-auth.conf`) :

```ini
[Definition]
failregex = ^.*"error":"Authentication failed".*"ip":"<HOST>".*$
            ^.*Login failed.*from <HOST>.*$
ignoreregex =
```

**Ajouter la jail Node.js** (`/etc/fail2ban/jail.local`) :

```ini
[nodejs-auth]
enabled = true
port = http,https
logpath = /var/log/realtranslate/auth.log
maxretry = 5
bantime = 3600
```

**Démarrer Fail2Ban** :

```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Vérifier le statut
sudo fail2ban-client status

# Vérifier une jail spécifique
sudo fail2ban-client status sshd
```

---

## 5. Configuration HTTPS avec Let's Encrypt

```bash
# Installer Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtenir un certificat SSL (avec Nginx)
sudo certbot --nginx -d votre-domaine.com -d www.votre-domaine.com

# OU pour un certificat standalone (sans Nginx)
sudo certbot certonly --standalone -d votre-domaine.com

# Renouvellement automatique (déjà configuré par défaut)
sudo certbot renew --dry-run

# Vérifier le timer de renouvellement
sudo systemctl status certbot.timer
```

**Configuration pour forcer HTTPS** (voir section Nginx ci-dessous).

---

## 6. Sécurisation de Node.js et PM2

### Installer Node.js (via NVM pour une meilleure gestion)

```bash
# Installer NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
source ~/.bashrc

# Installer Node.js LTS
nvm install --lts
nvm use --lts
```

### Installer et configurer PM2

```bash
# Installer PM2 globalement
npm install -g pm2

# Démarrer l'application
cd /chemin/vers/RealTranslate/backend
pm2 start server.js --name realtranslate

# Sauvegarder la configuration PM2
pm2 save

# Configurer PM2 pour démarrer au boot
pm2 startup systemd
# Exécuter la commande affichée par PM2
```

**Configuration PM2 avancée** (`ecosystem.config.js`) :

```javascript
module.exports = {
  apps: [{
    name: 'realtranslate',
    script: './server.js',
    instances: 'max',  // Utiliser tous les CPU disponibles
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/realtranslate/pm2-error.log',
    out_file: '/var/log/realtranslate/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '500M',
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

**Lancer avec la configuration** :

```bash
pm2 start ecosystem.config.js
pm2 save
```

### Permissions et propriétaire

```bash
# Créer un utilisateur dédié pour l'application
sudo useradd -r -s /bin/false realtranslate

# Changer le propriétaire des fichiers
sudo chown -R realtranslate:realtranslate /chemin/vers/RealTranslate

# Permissions strictes sur les fichiers sensibles
chmod 600 /chemin/vers/RealTranslate/backend/.env
chmod 600 /chemin/vers/RealTranslate/backend/*.json
```

---

## 7. Nginx comme Reverse Proxy

### Installer Nginx

```bash
sudo apt install nginx -y
```

### Configuration Nginx pour RealTranslate

**Créer la configuration** (`/etc/nginx/sites-available/realtranslate`) :

```nginx
# Limite de connexion
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/m;
limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;

# Cache pour les fichiers statiques
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=static_cache:10m max_size=1g inactive=60m use_temp_path=off;

# Redirection HTTP → HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name votre-domaine.com www.votre-domaine.com;

    return 301 https://$server_name$request_uri;
}

# Configuration HTTPS
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name votre-domaine.com www.votre-domaine.com;

    # Certificats SSL
    ssl_certificate /etc/letsencrypt/live/votre-domaine.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/votre-domaine.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/votre-domaine.com/chain.pem;

    # Configuration SSL moderne
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_stapling on;
    ssl_stapling_verify on;

    # En-têtes de sécurité
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';" always;

    # Taille max des uploads
    client_max_body_size 25M;

    # Logs
    access_log /var/log/nginx/realtranslate-access.log;
    error_log /var/log/nginx/realtranslate-error.log;

    # Fichiers statiques
    location / {
        root /chemin/vers/RealTranslate/frontend;
        try_files $uri $uri/ /index.html;

        # Cache
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # API avec rate limiting
    location /api/auth/login {
        limit_req zone=login_limit burst=3 nodelay;
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/ {
        limit_req zone=api_limit burst=10 nodelay;
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket pour Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # Bloquer l'accès aux fichiers sensibles
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    location ~ ~$ {
        deny all;
        access_log off;
        log_not_found off;
    }
}
```

**Activer le site** :

```bash
# Créer un lien symbolique
sudo ln -s /etc/nginx/sites-available/realtranslate /etc/nginx/sites-enabled/

# Tester la configuration
sudo nginx -t

# Recharger Nginx
sudo systemctl reload nginx
```

---

## 8. Surveillance et Monitoring

### Installer Netdata (monitoring en temps réel)

```bash
# Installation one-liner
bash <(curl -Ss https://my-netdata.io/kickstart.sh)

# Sécuriser l'accès à Netdata (accessible sur le port 19999)
sudo ufw allow from VOTRE_IP to any port 19999
```

### Logs et alertes

```bash
# Créer un dossier de logs
sudo mkdir -p /var/log/realtranslate
sudo chown realtranslate:realtranslate /var/log/realtranslate

# Rotation des logs
sudo nano /etc/logrotate.d/realtranslate
```

**Configuration logrotate** :

```
/var/log/realtranslate/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 realtranslate realtranslate
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

---

## 9. Sauvegardes Automatiques

### Script de sauvegarde

**Créer le script** (`/usr/local/bin/backup-realtranslate.sh`) :

```bash
#!/bin/bash

# Configuration
BACKUP_DIR="/var/backups/realtranslate"
APP_DIR="/chemin/vers/RealTranslate/backend"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Créer le dossier de sauvegarde
mkdir -p "$BACKUP_DIR"

# Sauvegarder les données JSON
tar -czf "$BACKUP_DIR/data-$DATE.tar.gz" \
    "$APP_DIR/users.json" \
    "$APP_DIR/tokens.json" \
    "$APP_DIR/groups.json" \
    "$APP_DIR/messages.json" \
    "$APP_DIR/dms.json" \
    "$APP_DIR/statuses.json" \
    "$APP_DIR/gdpr-consents.json" \
    "$APP_DIR/gdpr-data-requests.json" \
    "$APP_DIR/gdpr-deletion-requests.json"

# Sauvegarder les fichiers uploadés
tar -czf "$BACKUP_DIR/uploads-$DATE.tar.gz" "$APP_DIR/uploads/"

# Sauvegarder la configuration
tar -czf "$BACKUP_DIR/config-$DATE.tar.gz" "$APP_DIR/.env"

# Supprimer les sauvegardes de plus de X jours
find "$BACKUP_DIR" -type f -mtime +$RETENTION_DAYS -delete

echo "Sauvegarde terminée : $DATE"
```

**Rendre le script exécutable** :

```bash
sudo chmod +x /usr/local/bin/backup-realtranslate.sh
```

**Planifier avec cron** :

```bash
sudo crontab -e
```

**Ajouter** :

```
# Sauvegarde quotidienne à 2h du matin
0 2 * * * /usr/local/bin/backup-realtranslate.sh >> /var/log/backup.log 2>&1
```

---

## 10. Checklist de Sécurité

### ✅ Système

- [ ] Mises à jour automatiques activées
- [ ] Pare-feu UFW configuré et actif
- [ ] SSH sécurisé (port non standard, clés SSH, root désactivé)
- [ ] Fail2Ban installé et configuré
- [ ] Utilisateur dédié pour l'application créé
- [ ] Permissions des fichiers correctement définies

### ✅ Application

- [ ] HTTPS configuré avec certificat SSL valide
- [ ] Variables d'environnement sécurisées (.env non accessible publiquement)
- [ ] Rate limiting activé sur tous les endpoints
- [ ] CORS restreint aux domaines autorisés
- [ ] Helmet.js configuré pour les en-têtes de sécurité
- [ ] Validation et sanitisation des inputs
- [ ] Authentification forte (bcrypt pour les mots de passe)
- [ ] Webhooks sécurisés avec vérification de signature
- [ ] Logs d'audit configurés

### ✅ Infrastructure

- [ ] Nginx configuré comme reverse proxy
- [ ] PM2 configuré pour le clustering et auto-restart
- [ ] Monitoring activé (Netdata ou équivalent)
- [ ] Sauvegardes automatiques configurées
- [ ] Rotation des logs configurée
- [ ] Alertes configurées pour les événements critiques

### ✅ RGPD

- [ ] Politique de confidentialité publiée
- [ ] Système de consentement implémenté
- [ ] Export des données utilisateur disponible
- [ ] Procédure de suppression des données conforme
- [ ] Registre des traitements maintenu

---

## 🔒 Commandes de Vérification Rapide

```bash
# Vérifier les ports ouverts
sudo ss -tulpn | grep LISTEN

# Vérifier le statut du pare-feu
sudo ufw status verbose

# Vérifier les tentatives de connexion SSH échouées
sudo grep "Failed password" /var/log/auth.log | tail -20

# Vérifier les IP bannies par Fail2Ban
sudo fail2ban-client status sshd

# Vérifier les certificats SSL
sudo certbot certificates

# Vérifier le statut de l'application
pm2 status
pm2 logs realtranslate --lines 50

# Vérifier les connexions actives
sudo netstat -tunap | grep ESTABLISHED

# Vérifier l'utilisation des ressources
htop
```

---

## 📚 Ressources Additionnelles

- [Guide de sécurité Ubuntu](https://ubuntu.com/security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CIS Ubuntu Benchmark](https://www.cisecurity.org/benchmark/ubuntu_linux)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
- [RGPD - CNIL](https://www.cnil.fr/fr/reglement-europeen-protection-donnees)

---

**Dernière mise à jour** : Janvier 2026
