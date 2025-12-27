# ⚡ Installation Rapide - 3 Étapes

## 📝 Étape 1 : Configurer les clés API (2 min)

Éditez `api/config.php` :

```php
define('OPENAI_API_KEY', 'sk-votre-vraie-cle-openai');
define('DEEPSEEK_API_KEY', 'sk-votre-vraie-cle-deepseek'); // Optionnel
```

**Obtenir les clés :**
- OpenAI : https://platform.openai.com/api-keys
- DeepSeek : https://platform.deepseek.com/

## 📤 Étape 2 : Upload FTP (3 min)

**Connexion FTP :**
- Hôte : `ftp.leuca.fr`
- Login/Mot de passe : Vos identifiants OVH

**Uploadez tous les fichiers dans `/www/translate/` :**
```
✅ index.html
✅ api/
   ✅ .htaccess
   ✅ config.php
   ✅ transcribe.php
   ✅ translate.php
   ✅ speak.php
   ✅ detect-region.php
   ✅ test.php
```

## 🧪 Étape 3 : Tester (1 min)

1. **Test d'installation :**
   Ouvrez : `https://leuca.fr/translate/api/test.php`
   → Tout doit être ✅

2. **Test de l'application :**
   Ouvrez : `https://leuca.fr/translate/`
   → Cliquez sur "Activer le Microphone"
   → Parlez en français ou chinois
   → 🎉 Magie !

## ⚙️ Configuration optionnelle

### Ajuster la sensibilité VAD

Dans `index.html`, ligne ~283 :

```javascript
const VAD_CONFIG = {
  VOLUME_THRESHOLD: 0.02,      // ↑ = moins sensible
  SILENCE_DURATION: 1200,      // ms silence avant arrêt
  MIN_RECORDING_DURATION: 800  // ms minimum
};
```

### Augmenter la limite d'upload

Si erreur "File too large", ajoutez dans `.htaccess` à la racine :

```apache
php_value upload_max_filesize 25M
php_value post_max_size 25M
```

## 🔒 Sécurité post-installation

1. ✅ Vérifiez que `config.php` n'est pas accessible :
   → `https://leuca.fr/translate/api/config.php`
   → Doit donner erreur 403

2. ✅ Supprimez `test.php` après vérification :
   → Via FTP, supprimez `/api/test.php`

## 🐛 Problèmes courants

| Problème | Solution |
|----------|----------|
| Erreur microphone | Vérifiez HTTPS + permissions navigateur |
| Erreur transcription | Vérifiez clés API dans `config.php` |
| Audio coupé trop tôt | Augmentez `SILENCE_DURATION` |
| Erreur 500 | Consultez logs PHP (espace client OVH) |

## 📊 Monitoring

- **OpenAI Usage** : https://platform.openai.com/usage
- **DeepSeek Usage** : https://platform.deepseek.com/usage

---

## 🎯 Structure finale sur le serveur

```
/www/translate/
├── index.html              ← Interface
└── api/
    ├── .htaccess           ← Protection
    ├── config.php          ← Clés API (protégé)
    ├── transcribe.php      ← Whisper
    ├── translate.php       ← Traduction
    ├── speak.php           ← TTS
    └── detect-region.php   ← Détection
```

---

**✅ Installation terminée en ~6 minutes !**

**URL de votre app :** https://leuca.fr/translate/

Pour plus de détails : [README-FTP.md](README-FTP.md)
