# RealTranslate 🌐

**Traduction en temps réel multilingue** avec détection automatique de la voix

Application web de traduction instantanée multilingue, utilisant la reconnaissance vocale, la traduction automatique et la synthèse vocale.

## ✨ Fonctionnalités

- 🎤 **Détection automatique de la voix (VAD)** - Pas de bouton à presser !
- 🔄 **Traduction en temps réel** - Whisper + GPT-4o-mini / DeepSeek
- 🔊 **Synthèse vocale automatique** - OpenAI TTS
- 🌍 **Détection géographique** - OpenAI (monde) ou DeepSeek (Chine)
- 📱 **Responsive** - Fonctionne sur smartphone, PC, enceintes Bluetooth
- 🔒 **Sécurisé** - Clés API protégées côté backend

## 🏗️ Architecture

```
RealTranslate/
├── frontend/           # Interface utilisateur
│   ├── index.html     # Page web principale
│   └── app.js         # Logique VAD + API calls
├── backend/           # Serveur Node.js
│   ├── server.js      # API REST sécurisée
│   ├── package.json   # Dépendances Node
│   ├── .env           # Clés API (à créer)
│   └── .env.example   # Template de configuration
└── README.md          # Ce fichier
```

## 🚀 Installation

### Prérequis

- Node.js v18+ installé ([télécharger](https://nodejs.org/))
- Clés API OpenAI et DeepSeek

### 1. Installer les dépendances

```bash
cd backend
npm install
```

### 2. Configuration des clés API

Créez un fichier `.env` dans le dossier `backend/` :

```bash
cp .env.example .env
```

Éditez `.env` et ajoutez vos clés :

```env
OPENAI_API_KEY=sk-votre-cle-openai-ici
DEEPSEEK_API_KEY=sk-votre-cle-deepseek-ici
PORT=3000
```

### 3. Démarrer le serveur

```bash
npm start
```

Le serveur démarre sur `http://localhost:3000`

## 📖 Utilisation

1. **Ouvrir l'application** : Accédez à `http://localhost:3000` dans votre navigateur
2. **Autoriser le microphone** : Cliquez sur "Activer le Microphone" et acceptez la permission
3. **Parler** : Parlez simplement en français ou en chinois
4. **Traduction automatique** : L'application détecte automatiquement quand vous arrêtez de parler, traduit et lit la traduction

## 🎯 Comment ça marche ?

### Flux de traduction

```
1. 🎤 Microphone → Détection de voix (VAD)
2. 📝 Enregistrement audio → Whisper API (transcription)
3. 🌐 Texte → GPT-4o-mini / DeepSeek (traduction)
4. 🔊 Traduction → OpenAI TTS (synthèse vocale)
5. 🔄 Retour à l'étape 1
```

### VAD (Voice Activity Detection)

- **Analyse du volume audio** en temps réel (Web Audio API)
- **Détection de parole** : volume > seuil pendant > 800ms
- **Détection de silence** : volume < seuil pendant > 1200ms
- **Auto-arrêt** : enregistrement s'arrête automatiquement après le silence

### Sélection du provider

- **Détection géographique** via headers HTTP (`cf-ipcountry`, etc.)
- **Chine** → DeepSeek API
- **Reste du monde** → OpenAI API

## 🛠️ Technologies utilisées

### Backend
- Node.js + Express
- OpenAI API (Whisper, GPT-4o-mini, TTS)
- DeepSeek API (deepseek-chat)
- Multer (upload audio)

### Frontend
- HTML5 + CSS3 + Vanilla JavaScript
- Web Audio API (VAD)
- MediaRecorder API (enregistrement)
- Fetch API (communication backend)

## 📱 Support des plateformes

| Plateforme | Support | Notes |
|-----------|---------|-------|
| 🖥️ Desktop (Chrome/Edge) | ✅ Complet | Recommandé |
| 🖥️ Desktop (Firefox) | ✅ Complet | |
| 🖥️ Desktop (Safari) | ⚠️ Partiel | Limitations MediaRecorder |
| 📱 Android (Chrome) | ✅ Complet | |
| 📱 iOS (Safari) | ⚠️ Partiel | Limitations WebRTC |
| 🔊 Enceintes Bluetooth | ✅ Complet | Via connexion système |

## 🔧 Configuration avancée

### Ajuster la sensibilité VAD

Dans `frontend/app.js`, modifiez les paramètres :

```javascript
const VAD_CONFIG = {
  VOLUME_THRESHOLD: 0.02,      // Seuil de détection (↑ = moins sensible)
  SILENCE_DURATION: 1200,      // Durée silence (ms) avant arrêt
  MIN_RECORDING_DURATION: 800  // Durée minimale d'enregistrement (ms)
};
```

### Changer les voix TTS

Dans `frontend/app.js`, fonction `speakText()` :

```javascript
// Voix disponibles: alloy, echo, fable, onyx, nova, shimmer
const voice = language === 'zh' ? 'nova' : 'onyx';
```

## 🐛 Résolution de problèmes

### Le microphone ne fonctionne pas

- Vérifiez les permissions du navigateur (icône cadenas dans la barre d'adresse)
- Sur iOS : Safari uniquement, Chrome/Firefox non supportés
- Essayez HTTPS au lieu de HTTP (requis sur certains navigateurs)

### La traduction est lente

- Vérifiez votre connexion internet
- DeepSeek peut être plus lent qu'OpenAI selon votre localisation
- Réduisez `SILENCE_DURATION` pour une réponse plus rapide (mais risque de coupure)

### Erreur "API Key invalid"

- Vérifiez que vos clés sont correctes dans `backend/.env`
- Redémarrez le serveur après modification du `.env`

### Audio coupé trop tôt

- Augmentez `SILENCE_DURATION` dans `VAD_CONFIG`
- Augmentez `VOLUME_THRESHOLD` si l'environnement est bruyant

## 🔐 Sécurité

- ✅ Clés API stockées côté serveur uniquement (jamais exposées au client)
- ✅ Validation des inputs côté backend
- ✅ CORS configuré pour limiter les accès
- ✅ Uploads audio limités à 25MB
- ⚠️ Pour la production : ajouter HTTPS, rate limiting, authentification

## 📝 License

MIT

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou une pull request.

## 📧 Support

Pour toute question ou problème, ouvrez une issue sur GitHub.

---

**Développé avec ❤️ pour faciliter la communication FR ↔ ZH**
