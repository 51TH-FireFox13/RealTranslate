# RealTranslate VPS Setup Scripts

Scripts d'installation automatisée pour déployer RealTranslate sur un VPS Ubuntu.

## 📋 Prérequis

- VPS avec Ubuntu 22.04 ou 24.04
- Accès SSH avec sudo
- Nom de domaine pointant vers l'IP du serveur
- Clés API OpenAI et DeepSeek

## 🚀 Installation Rapide

### Option A : Installation automatique (tout en une fois)

```bash
# 1. Télécharger les scripts
git clone https://github.com/51TH-FireFox13/RealTranslate.git
cd RealTranslate/vps-setup

# 2. Rendre les scripts exécutables
chmod +x *.sh

# 3. Exécuter l'installation complète
sudo ./install-all.sh
```

### Option B : Installation pas-à-pas (recommandé)

```bash
# 1. Télécharger les scripts
git clone https://github.com/51TH-FireFox13/RealTranslate.git
cd RealTranslate/vps-setup
chmod +x *.sh

# 2. System setup (avec sudo)
sudo ./01-system-setup.sh

# 3. Node.js installation (avec sudo)
sudo ./02-nodejs-setup.sh

# 4. PostgreSQL installation (avec sudo)
sudo ./03-postgresql-setup.sh
# ⚠️ IMPORTANT: Sauvegarde le mot de passe de la base de données !

# 5. Nginx & SSL (avec sudo)
sudo ./04-nginx-setup.sh

# 6. Deploy application (SANS sudo, en tant qu'utilisateur normal)
./05-deploy-app.sh
```

## 📁 Structure des scripts

| Script | Description | Sudo requis |
|--------|-------------|-------------|
| `01-system-setup.sh` | Update système, firewall, fail2ban | ✅ Oui |
| `02-nodejs-setup.sh` | Installation Node.js 20 LTS + PM2 | ✅ Oui |
| `03-postgresql-setup.sh` | Installation PostgreSQL 16 + BDD | ✅ Oui |
| `04-nginx-setup.sh` | Installation Nginx + SSL Let's Encrypt | ✅ Oui |
| `05-deploy-app.sh` | Clone repo + deploy + PM2 | ❌ Non |

## 🔐 Informations de sécurité

### Fichiers sensibles créés

- `/home/USER/realtranslate/backend/.env` - Variables d'environnement (chmod 600)
- `/tmp/realtranslate_db_password.txt` - Mot de passe BDD temporaire

### Ports ouverts

- `22` - SSH
- `80` - HTTP (redirige vers HTTPS)
- `443` - HTTPS
- `3000` - Node.js app (local seulement, via reverse proxy)
- `5432` - PostgreSQL (local seulement)

### Sécurité appliquée

✅ Firewall UFW configuré
✅ Fail2ban activé (protection brute-force SSH)
✅ SSL/TLS avec Let's Encrypt
✅ Variables d'environnement protégées (chmod 600)
✅ PostgreSQL accessible uniquement en local

## 🛠️ Commandes utiles après installation

### Gestion de l'application (PM2)

```bash
pm2 status              # Statut de l'app
pm2 logs                # Voir les logs
pm2 restart realtranslate   # Redémarrer l'app
pm2 stop realtranslate      # Arrêter l'app
pm2 monit               # Monitoring en temps réel
```

### Gestion Nginx

```bash
sudo systemctl status nginx     # Statut
sudo systemctl reload nginx     # Recharger config
sudo nginx -t                   # Tester config
sudo tail -f /var/log/nginx/access.log  # Logs
```

### Gestion PostgreSQL

```bash
sudo systemctl status postgresql    # Statut
sudo -u postgres psql               # Console PostgreSQL
sudo -u postgres psql -d realtranslate  # Se connecter à la BDD
```

### SSL/Certificat

```bash
sudo certbot renew --dry-run    # Tester renouvellement
sudo certbot renew              # Renouveler manuellement
sudo certbot certificates       # Voir les certificats
```

## 🔄 Mise à jour de l'application

```bash
cd /home/USER/realtranslate
git pull origin main
cd backend
npm install
pm2 restart realtranslate
```

## 🐛 Dépannage

### L'application ne démarre pas

```bash
# Vérifier les logs
pm2 logs realtranslate

# Vérifier le fichier .env
cat backend/.env

# Tester manuellement
cd backend
npm start
```

### Nginx 502 Bad Gateway

```bash
# Vérifier que l'app tourne
pm2 status

# Vérifier que le port 3000 est écouté
sudo ss -tlnp | grep 3000

# Redémarrer l'app
pm2 restart realtranslate
```

### SSL ne fonctionne pas

```bash
# Vérifier les certificats
sudo certbot certificates

# Renouveler
sudo certbot renew

# Vérifier la config Nginx
sudo nginx -t
```

### Base de données inaccessible

```bash
# Vérifier que PostgreSQL tourne
sudo systemctl status postgresql

# Tester la connexion
psql -U realtranslate_user -d realtranslate -h localhost

# Voir les logs PostgreSQL
sudo tail -f /var/log/postgresql/postgresql-16-main.log
```

## 📊 Monitoring et logs

### Logs applicatifs

```bash
# Logs PM2
pm2 logs realtranslate

# Logs système
sudo journalctl -u nginx -f
sudo journalctl -u postgresql -f
```

### Ressources système

```bash
htop                    # CPU/RAM en temps réel
df -h                   # Espace disque
free -h                 # Mémoire
pm2 monit               # Monitoring PM2
```

## 🔒 Hardening additionnel (optionnel)

### Changer le port SSH

```bash
sudo nano /etc/ssh/sshd_config
# Changer "Port 22" vers "Port 2222"
sudo systemctl restart sshd
sudo ufw allow 2222/tcp
sudo ufw delete allow 22/tcp
```

### Désactiver login root

```bash
sudo nano /etc/ssh/sshd_config
# Changer "PermitRootLogin yes" vers "PermitRootLogin no"
sudo systemctl restart sshd
```

### Backups automatiques

```bash
# TODO: Script de backup à créer
```

## 📞 Support

Pour toute question ou problème, ouvrir une issue sur GitHub.

## 📝 Licence

GPL-3.0
