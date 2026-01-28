# RealTranslate 🌐

**Plateforme de communication multilingue avec traduction instantanée et messagerie chiffrée**

Application web complète combinant traduction vocale en temps réel et messagerie multilingue chiffrée. Brisez les barrières linguistiques avec une interface moderne et intuitive.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Status](https://img.shields.io/badge/Status-Production-success.svg)]()

## 🎯 Vue d'ensemble

RealTranslate est une plateforme tout-en-un permettant de communiquer sans barrière linguistique:
- **Mode Traduction Instantanée**: Conversation vocale 1-à-1 avec VAD (Voice Activity Detection)
- **Mode Communication**: Messagerie groupes/DMs avec PTT (Push-to-Talk) + traduction texte
- **Monétisation**: Système d'abonnements Stripe intégré (Free/Premium/Enterprise)
- **Sécurité**: Chiffrement server-side (XChaCha20-Poly1305) - données protégées au repos
- **Mobile-First**: Interface optimisée smartphone/tablette avec scroll horizontal

---

## ✨ Fonctionnalités

### 🎤 Traduction Vocale (Mode Instantané)
- **VAD (Voice Activity Detection)**: Détection automatique - mains libres
- **Transcription** via Whisper (OpenAI/DeepSeek)
- **Traduction instantanée** (GPT-4o-mini/DeepSeek)
- **Synthèse vocale** automatique (TTS)
- **Modes audio**: PTT (bouton) ou Temps Réel (VAD)
- **VU-mètre** horizontal en temps réel
- Usage: Conversations 1-à-1 en temps réel

### 💬 Messagerie Multilingue (Mode Communication)
- **Messages privés (DMs)**: Conversations 1-à-1 avec traduction automatique
- **Groupes publics/privés**: Discussions multilingues asynchrones
- **Audio PTT (Push-to-Talk)**: Messages vocaux transcrits + traduits dans les groupes
- **Texte prioritaire**: Lecture audio sur clic (pas automatique)
- **Mentions**: @user dans les groupes
- **Historique**: Messages persistés et récupérables
- **Statuts**: En ligne/hors ligne en temps réel
- **Partage de fichiers**: Images, documents, audio (25MB max)

### 🔐 Authentification & Sécurité
- **Authentification**: Email + mot de passe (SHA256, migration Argon2id prévue)
- **Sessions**: JWT tokens avec refresh automatique
- **Rôles**: `user`, `admin`, `guest`
- **OAuth**: Structure prête (Google, Apple, WeChat)
- **Chiffrement server-side**: Infrastructure prête (XChaCha20-Poly1305 / libsodium)
  - ⚠️ **Statut actuel**: Code implémenté mais non intégré (v1.1 prévue)
  - ⚠️ **Non E2EE**: Le serveur peut déchiffrer (nécessaire pour traduction)
  - 🔧 **Quand activé**: DB compromise ne révèlera pas les messages
  - 🔧 **Clés uniques** par conversation (DEK/KEK architecture)
  - 📝 **Actuellement**: Messages en clair dans SQLite (data/realtranslate.db)
- **Protection réseau**: Rate limiting, HTTPS, CORS
- **Backups**: Chiffrés et isolés

### 💳 Abonnements & Quotas
- **Gratuit**: 50 transcriptions/jour, 250 traductions, 50 TTS
- **Premium** (9.99€/mois): 500 transcriptions, 2000 traductions, 500 TTS
- **Enterprise** (49.99€/mois): Illimité
- Paiement Stripe Checkout
- Gestion billing portal
- Webhooks Stripe pour activation automatique

### 👤 Profils Utilisateurs
- Avatar personnalisable
- Nom d'affichage
- Changement de mot de passe
- Historique des abonnements
- Quotas en temps réel
- Suppression de compte

### 🌍 Multi-langues
Support complet: **Français, English, 中文, Español, Deutsch, Italiano, Português**
- Interface UI traduite dynamiquement
- Détection automatique langue navigateur
- Sélection manuelle des langues source/cible

### 📱 Mobile-Optimisé
- Scroll horizontal entre langues (swipe)
- Indicateurs visuels (dots navigation)
- Header compact: provider + retour
- Contrôles tactiles adaptés
- PWA ready (installation possible)

### 🛠️ Administration
- Panel admin (réservé rôle `admin`)
- Gestion utilisateurs (liste, rôles, suppression)
- Statistiques globales
- Génération de tokens d'accès
- Logs système

---

## 🎮 Modes d'utilisation

### 🗣️ Mode 1: Traduction Instantanée (Vocale 1-à-1)

**Usage**: Conversation en temps réel entre 2 personnes de langues différentes

**Fonctionnement**:
1. Chaque utilisateur sélectionne sa langue native
2. **Option A - VAD (Temps Réel)**: Parlez librement, détection automatique
3. **Option B - PTT**: Appuyez sur le bouton micro pour parler
4. Audio → Whisper (transcription) → GPT/DeepSeek (traduction) → TTS (synthèse)
5. Les deux participants entendent la traduction automatiquement

**Caractéristiques**:
- Mains libres (VAD) ou contrôlé (PTT)
- Traduction immédiate
- Pas d'historique persisté
- Usage: Conversations téléphoniques, meetings 1-à-1

---

### 💬 Mode 2: Communication (Groupes/DMs asynchrones)

**Usage**: Messagerie de groupe avec traduction automatique

**Fonctionnement**:
1. Créer un groupe ou conversation DM
2. **Texte prioritaire**: Écrire des messages (traduits automatiquement pour tous)
3. **Audio PTT optionnel**:
   - Appuyer sur micro → enregistrer → envoyer
   - Transcrit en texte → traduit → affiché pour tous
   - Lecture audio **sur clic** (pas automatique)
4. Historique complet sauvegardé

**Caractéristiques**:
- Groupes publics/privés
- Messages privés 1-à-1
- Historique persisté et chiffré
- Fichiers/médias supportés
- Statuts en ligne/hors ligne
- Usage: Équipes multilingues, communautés internationales

---

## 🏗️ Architecture

```
RealTranslate/
├── frontend/              # Client-side (Vanilla JS)
│   ├── index.html        # SPA principale
│   ├── app.js            # Logique (5800+ lignes)
│   ├── manifest.json     # PWA config
│   └── icon-*.png        # Icons PWA
│
├── backend/              # Server-side (Node.js/Express)
│   ├── server.js         # API REST + Socket.IO
│   ├── database.js       # SQLite schema + CRUD
│   ├── db-proxy.js       # Proxy layer (compatibilité)
│   ├── db-helpers.js     # Helpers format legacy
│   ├── migrate-to-sqlite.js # Script migration JSON→SQLite
│   ├── auth-sqlite.js    # AuthManager (SQLite)
│   ├── auth.js           # Legacy auth (deprecated)
│   ├── logger.js         # Logging Winston
│   ├── stripe-payment.js # Intégration Stripe
│   ├── encryption.js     # Chiffrement (prêt, intégration prévue)
│   ├── realtranslate.db  # Base SQLite (users, groups, messages)
│   ├── package.json      # Dependencies
│   └── .env              # Configuration (secrets)
│
├── vps-setup/            # Scripts déploiement
│   ├── setup-https.sh    # Certbot SSL
│   ├── setup-pm2.sh      # PM2 daemon
│   └── README.md
│
└── README.md             # Ce fichier
```

### Stack Technique

**Backend:**
- Node.js 18+ + Express.js
- Socket.IO (WebSocket temps réel)
- SQLite3 + better-sqlite3
- JWT (jsonwebtoken)
- Stripe SDK
- Winston (logs)
- Multer (uploads)
- Argon2 (hashing mdp - bientôt)

**Frontend:**
- Vanilla JavaScript (ES6+)
- Web Audio API (VAD, analyse volume)
- MediaRecorder API
- Fetch API + WebSocket
- CSS Grid/Flexbox
- PWA (Service Worker)

**APIs Externes:**
- OpenAI (Whisper, GPT-4o-mini, TTS)
- DeepSeek (transcription + traduction pour Chine)
- Stripe (paiements)

---

## 🚀 Installation & Déploiement

### Prérequis

- Node.js 18+ ([télécharger](https://nodejs.org/))
- Clés API:
  - OpenAI API key
  - DeepSeek API key (optionnel, pour utilisateurs Chine)
  - Stripe keys (live + test)
- Domaine avec HTTPS (pour production)

### Installation Locale

```bash
# 1. Cloner le repo
git clone https://github.com/votre-username/RealTranslate.git
cd RealTranslate

# 2. Installer dépendances backend
cd backend
npm install

# 3. Configurer les secrets
cp .env.example .env
nano .env  # Éditer avec vos clés

# 4. Démarrer le serveur
npm start
# Ou en dev:
npm run dev
```

Le serveur démarre sur `http://localhost:3000`

### Configuration `.env`

```env
# Serveur
PORT=3000
NODE_ENV=production

# JWT
JWT_SECRET=votre-secret-jwt-super-long-et-aleatoire-ici
JWT_REFRESH_SECRET=votre-refresh-secret-different-ici

# OpenAI
OPENAI_API_KEY=sk-votre-cle-openai-ici

# DeepSeek (optionnel)
DEEPSEEK_API_KEY=sk-votre-cle-deepseek-ici

# Stripe
STRIPE_SECRET_KEY=sk_live_votre-cle-stripe-ici
STRIPE_PUBLISHABLE_KEY=pk_live_votre-cle-publique-ici
STRIPE_WEBHOOK_SECRET=whsec_votre-webhook-secret-ici
STRIPE_PRICE_PREMIUM=price_votre-price-id-premium
STRIPE_PRICE_ENTERPRISE=price_votre-price-id-enterprise

# Base de données
DATABASE_PATH=./realtranslate.db

# CORS (optionnel)
ALLOWED_ORIGINS=https://votre-domaine.com,https://www.votre-domaine.com
```

### Déploiement VPS (Ubuntu)

```bash
# 1. Installer Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Installer PM2
sudo npm install -g pm2

# 3. Cloner & configurer
git clone https://github.com/votre-username/RealTranslate.git
cd RealTranslate/backend
npm install
cp .env.example .env
nano .env  # Configurer

# 4. Démarrer avec PM2
pm2 start server.js --name realtranslate
pm2 save
pm2 startup  # Suivre instructions

# 5. Configurer HTTPS (Certbot)
cd ../vps-setup
chmod +x setup-https.sh
sudo ./setup-https.sh votre-domaine.com
```

### Configuration Stripe

1. **Créer les produits** dans [Stripe Dashboard](https://dashboard.stripe.com/products)
   - Premium: 9.99 EUR/mois (récurrent)
   - Enterprise: 49.99 EUR/mois (récurrent)

2. **Copier les Price IDs** dans `.env`

3. **Configurer le Webhook**:
   - URL: `https://votre-domaine.com/api/webhook/stripe`
   - Événements: `checkout.session.completed`, `customer.subscription.*`
   - Copier le signing secret dans `.env`

---

## 📖 Utilisation

### Première Connexion

1. Accéder à `https://votre-domaine.com`
2. Cliquer sur "✨ Créer un compte"
3. Remplir: nom, email, mot de passe
4. Se connecter avec les identifiants

### Mode Traduction Instantanée

1. Sélectionner vos 2 langues (ex: Français ↔ 中文)
2. Choisir "🎤 Traduction Instantanée"
3. Autoriser le microphone
4. **Option A - VAD (Temps Réel)**: Parler normalement, détection automatique
5. **Option B - PTT**: Maintenir le bouton micro pour parler
6. **Mobile**: Swiper horizontalement entre les 2 panneaux de langues

### Mode Communication

1. Sélectionner votre langue principale
2. Choisir "💬 Communication Multilingue"
3. **Messages privés**: Cliquer sur "✉️ Nouveau Message"
4. **Groupes**: Rejoindre ou créer un groupe
5. Tous les messages sont traduits automatiquement dans votre langue

### Gestion du Profil

1. Depuis le menu principal, cliquer "⚙️ Mon Profil"
2. Modifier avatar, nom, mot de passe
3. Voir quotas restants
4. Gérer abonnement (Premium/Enterprise)

---

## 🎨 Captures d'écran

*(À ajouter: screenshots de l'interface)*

---

## 🔧 Configuration Avancée

### Sensibilité VAD (Mode Traduction Instantanée uniquement)

Dans `frontend/app.js`:

```javascript
const VAD_CONFIG = {
  VOLUME_THRESHOLD: 0.015,     // ↑ = moins sensible (Mode 1)
  SILENCE_DURATION: 1000,      // ms de silence avant arrêt
  MIN_RECORDING_DURATION: 600  // ms minimale d'enregistrement
};
```

**Note**: Le Mode Communication utilise PTT uniquement (pas de VAD dans les groupes)

### Voix TTS

Dans `frontend/app.js`, fonction `speakText()`:

```javascript
// Voix disponibles: alloy, echo, fable, onyx, nova, shimmer
const voice = language === 'zh' ? 'nova' : 'onyx';
```

### Rate Limiting

Dans `backend/server.js`:

```javascript
// Limiter les tentatives de connexion
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5 // 5 tentatives max
});
```

---

## 🐛 Résolution de Problèmes

### Stripe webhook ne fonctionne pas

```bash
# Tester en local avec Stripe CLI
stripe listen --forward-to localhost:3000/api/webhook/stripe
stripe trigger checkout.session.completed
```

### Base de données accessible

**Note**: Actuellement les messages sont stockés en clair dans SQLite
- Infrastructure de chiffrement prête (encryption.js)
- Intégration prévue en v1.1
- Pour protéger: limiter accès à `backend/realtranslate.db` (chmod 600)

### Scroll horizontal ne marche pas (mobile)

- Vider cache navigateur
- Vérifier CSS: `.container` doit avoir `scroll-snap-type: x mandatory`

### JWT expiré trop vite

Modifier dans `backend/auth.js`:

```javascript
const token = jwt.sign({ userId, email, role }, JWT_SECRET, {
  expiresIn: '7d' // Au lieu de 24h
});
```

---

## 🔒 Sécurité

### Bonnes Pratiques Implémentées

- ✅ HTTPS strict (HSTS headers)
- ✅ JWT avec refresh tokens
- ✅ Mots de passe hashés (SHA256, migration Argon2id prévue)
- ✅ CORS configuré
- ✅ Rate limiting sur login/API
- ✅ XSS protection (CSP headers)
- ✅ SQL injection protection (parameterized queries, SQLite)
- 🔧 Chiffrement messages: Code prêt (XChaCha20-Poly1305), intégration v1.1
- ✅ Secrets en variables d'environnement
- ✅ Validation inputs backend
- ✅ Stripe webhook signature verification

### Recommandations Production

```bash
# 1. Firewall
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable

# 2. Fail2ban (anti brute-force)
sudo apt install fail2ban
sudo systemctl enable fail2ban

# 3. Backups automatiques
0 2 * * * tar -czf /backup/realtranslate-$(date +\%Y\%m\%d).tar.gz /root/RealTranslate/backend/realtranslate.db

# 4. Monitoring
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
```

---

## 📊 Roadmap

### Version Actuelle (v1.0)
- [x] Traduction vocale temps réel (VAD + PTT)
- [x] Messagerie DMs + groupes avec traduction
- [x] Abonnements Stripe (Free/Premium/Enterprise)
- [x] Interface mobile optimisée (scroll horizontal)
- [x] Base SQLite (migration JSON terminée)
- [x] Panel admin (gestion utilisateurs/groupes)

### Prochaines Versions

**v1.1 - Q1 2026**
- [ ] Intégration chiffrement server-side (code prêt)
- [ ] Tests automatisés (auth, quotas, WebSockets)
- [ ] Refactoring frontend (modularisation app.js)
- [ ] Partage de fichiers amélioré (aperçus images)

**v1.2 - Q2 2026**
- [ ] Appels vocaux/vidéo P2P (WebRTC)
- [ ] Notifications push (Firebase)
- [ ] Réactions aux messages
- [ ] Recherche dans l'historique

**v2.0 - Q3 2026**
- [ ] E2E encryption (Signal Protocol)
- [ ] Messages éphémères
- [ ] Thèmes personnalisables (+ dark mode amélioré)

**v2.0 - Q4 2026**
- [ ] Application mobile native (React Native)
- [ ] Desktop app (Electron)
- [ ] API publique pour développeurs
- [ ] Marketplace de plugins

---

## 🤝 Contribution

Les contributions sont les bienvenues!

### Comment contribuer

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit vos changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

### Guidelines

- Code ES6+ moderne
- Commentaires en français ou anglais
- Tests pour les fonctionnalités critiques
- Respecter l'architecture existante

---

## 📝 License

MIT License - voir [LICENSE](LICENSE)

---

## 👥 Auteurs

- **Julien Leuca** - *Initial work* - [@51TH-FireFox13](https://github.com/51TH-FireFox13)

---

## 🙏 Remerciements

- OpenAI pour Whisper, GPT et TTS
- DeepSeek pour l'alternative Chine
- Stripe pour le système de paiement
- Toute la communauté open-source

---

## 📧 Support & Contact

- **Issues**: [GitHub Issues](https://github.com/votre-username/RealTranslate/issues)
- **Email**: julien@leuca.fr
- **Website**: https://ia.leuca.fr

---

**Développé avec ❤️ pour briser les barrières linguistiques**

