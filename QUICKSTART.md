# 🚀 Guide de Démarrage Rapide

## Installation en 3 étapes

### 1️⃣ Configurer les clés API

Créez le fichier `backend/.env` avec vos clés :

```bash
cd backend
cp .env.example .env
```

Éditez `backend/.env` et ajoutez vos clés :

```env
OPENAI_API_KEY=sk-votre-cle-openai-ici
DEEPSEEK_API_KEY=sk-votre-cle-deepseek-ici
PORT=3000
```

### 2️⃣ Installer les dépendances

```bash
npm install
```

### 3️⃣ Démarrer l'application

**Linux/Mac :**
```bash
./start.sh
```

**Windows :**
```cmd
start.bat
```

**Ou manuellement :**
```bash
cd backend
npm start
```

## 🎯 Utilisation

1. Ouvrez votre navigateur sur `http://localhost:3000`
2. Cliquez sur "Activer le Microphone" et autorisez l'accès
3. **Parlez** en français ou en chinois
4. La traduction se fait **automatiquement** !

## 🔑 Obtenir les clés API

### OpenAI API Key
1. Allez sur https://platform.openai.com/api-keys
2. Connectez-vous ou créez un compte
3. Cliquez sur "Create new secret key"
4. Copiez la clé (format: `sk-...`)

### DeepSeek API Key
1. Allez sur https://platform.deepseek.com/
2. Créez un compte
3. Accédez à la section API Keys
4. Créez une nouvelle clé
5. Copiez la clé (format: `sk-...`)

## ⚡ Raccourcis

### Modifier le port
Dans `backend/.env`, changez :
```env
PORT=8080
```

### Tester sans DeepSeek
Seule la clé OpenAI est obligatoire. DeepSeek est optionnel (uniquement pour la Chine).

### Ajuster la sensibilité VAD
Dans `frontend/app.js`, ligne 3-8 :
```javascript
const VAD_CONFIG = {
  VOLUME_THRESHOLD: 0.02,      // ↑ = moins sensible
  SILENCE_DURATION: 1200,      // ms avant arrêt
  MIN_RECORDING_DURATION: 800  // ms minimum
};
```

## 🐛 Problèmes courants

### "Microphone bloqué"
→ Vérifiez les permissions dans votre navigateur (icône cadenas)

### "API Key invalid"
→ Vérifiez que vos clés sont correctes dans `backend/.env`
→ Redémarrez le serveur après modification

### "Port 3000 already in use"
→ Changez le port dans `backend/.env`

### Audio coupé trop tôt
→ Augmentez `SILENCE_DURATION` dans `frontend/app.js`

## 📱 Support Mobile

- **Android Chrome** : ✅ Support complet
- **iOS Safari** : ⚠️ Support partiel (limitations WebRTC)
- **Desktop** : ✅ Tous les navigateurs modernes

## 🔗 Liens utiles

- [Documentation complète](README.md)
- [OpenAI Documentation](https://platform.openai.com/docs)
- [DeepSeek Documentation](https://platform.deepseek.com/docs)

---

**Prêt à traduire ! 🎉**
