# 🚀 Installation RealTranslate sur OVH (FTP)

Guide d'installation pour hébergement mutualisé OVH MX Plan

## 📁 Structure des fichiers

```
ftp-version/
├── index.html              # Interface utilisateur
└── api/
    ├── .htaccess           # Protection config.php
    ├── config.php          # Configuration & clés API
    ├── transcribe.php      # Endpoint Whisper
    ├── translate.php       # Endpoint traduction
    ├── speak.php           # Endpoint TTS
    └── detect-region.php   # Détection région
```

## 🔐 Étape 1 : Configuration des clés API

### Obtenir les clés API

**OpenAI API Key :**
1. Allez sur https://platform.openai.com/api-keys
2. Connectez-vous ou créez un compte
3. Cliquez sur "Create new secret key"
4. Copiez la clé (format: `sk-...`)

**DeepSeek API Key (optionnel) :**
1. Allez sur https://platform.deepseek.com/
2. Créez un compte
3. Accédez à la section API Keys
4. Créez une nouvelle clé
5. Copiez la clé (format: `sk-...`)

### Configurer config.php

Éditez le fichier `api/config.php` et remplacez les clés :

```php
define('OPENAI_API_KEY', 'sk-votre-vraie-cle-openai');
define('DEEPSEEK_API_KEY', 'sk-votre-vraie-cle-deepseek');
```

## 📤 Étape 2 : Upload via FTP

### Connexion FTP OVH

1. Ouvrez votre client FTP (FileZilla, WinSCP, etc.)
2. Connectez-vous avec vos identifiants OVH :
   - **Hôte** : ftp.leuca.fr (ou ftp.cluster0XX.ovh.net)
   - **Utilisateur** : Votre login FTP OVH
   - **Mot de passe** : Votre mot de passe FTP
   - **Port** : 21

### Upload des fichiers

1. Naviguez vers le dossier `/www/translate/` sur le serveur
2. Uploadez **tous les fichiers** du dossier `ftp-version/` :
   ```
   - index.html
   - api/
     - .htaccess
     - config.php
     - transcribe.php
     - translate.php
     - speak.php
     - detect-region.php
   ```

### Vérification des permissions

Assurez-vous que les fichiers PHP sont exécutables (chmod 644 ou 755)

## 🌐 Étape 3 : Test de l'installation

### Vérifier l'accès

1. Ouvrez votre navigateur
2. Allez sur `https://leuca.fr/translate/`
3. Vous devriez voir l'interface RealTranslate

### Test complet

1. Cliquez sur "Activer le Microphone"
2. Autorisez l'accès au microphone
3. Parlez en français ou en chinois
4. La traduction devrait apparaître automatiquement

## ⚙️ Configuration avancée

### Augmenter la limite d'upload

Si nécessaire, ajoutez dans le fichier `.htaccess` à la racine :

```apache
php_value upload_max_filesize 25M
php_value post_max_size 25M
php_value max_execution_time 300
```

### Protection du fichier config.php

Le fichier `api/.htaccess` protège déjà `config.php`. Vérifiez qu'il est bien uploadé.

Pour tester la protection :
- Essayez d'accéder à `https://leuca.fr/translate/api/config.php`
- Vous devriez avoir une erreur 403 (Forbidden)

### Ajuster la sensibilité VAD

Dans `index.html`, ligne ~283, modifiez :

```javascript
const VAD_CONFIG = {
  VOLUME_THRESHOLD: 0.02,      // ↑ = moins sensible
  SILENCE_DURATION: 1200,      // ms avant arrêt
  MIN_RECORDING_DURATION: 800  // ms minimum
};
```

## 🔧 Dépannage

### "Erreur microphone"
- Vérifiez les permissions du navigateur (icône cadenas)
- Utilisez HTTPS (requis pour getUserMedia)
- Sur iOS : uniquement Safari, pas Chrome

### "Erreur transcription" ou "Erreur traduction"
1. Vérifiez que vos clés API sont correctes dans `config.php`
2. Vérifiez que vous avez du crédit sur votre compte OpenAI
3. Consultez les logs PHP sur votre hébergement OVH :
   - Espace client OVH → Hébergement → Logs

### "Erreur CORS"
- Vérifiez que le fichier `api/.htaccess` est bien uploadé
- Si le problème persiste, contactez le support OVH pour activer les headers CORS

### Audio coupé trop tôt
- Augmentez `SILENCE_DURATION` dans `index.html`
- Augmentez `VOLUME_THRESHOLD` si l'environnement est bruyant

### "Script timeout" ou erreurs 500
- Augmentez `max_execution_time` dans `.htaccess`
- Vérifiez les logs d'erreurs PHP

## 📊 Monitoring

### Vérifier l'utilisation des API

**OpenAI :**
- https://platform.openai.com/usage

**DeepSeek :**
- https://platform.deepseek.com/usage

### Logs d'erreurs OVH

1. Connectez-vous à l'espace client OVH
2. Allez dans "Hébergement"
3. Cliquez sur "Statistiques et logs"
4. Consultez les erreurs PHP

## 🔒 Sécurité

### Protection des clés API

✅ **Fait automatiquement :**
- `config.php` protégé par `.htaccess`
- Clés jamais exposées au client
- Seuls les endpoints PHP sont accessibles

⚠️ **Recommandations supplémentaires :**
- Ne commitez JAMAIS `config.php` avec vos vraies clés sur Git
- Changez vos clés régulièrement
- Surveillez l'utilisation sur les dashboards OpenAI/DeepSeek
- Limitez les domaines autorisés dans `config.php`

### Limiter l'accès par domaine

Dans `api/config.php`, ajustez :

```php
define('ALLOWED_ORIGINS', [
    'https://leuca.fr',
    'https://www.leuca.fr'
    // Retirez localhost en production
]);
```

## 🎯 Fichiers à ne PAS modifier après upload

- ✅ **Modifiables** : `config.php` (pour changer les clés)
- ❌ **Ne pas toucher** : `.htaccess`, `*.php` (sauf config.php)
- ✅ **Personnalisable** : `index.html` (design, VAD settings)

## 📱 Compatibilité

| Plateforme | Support | Notes |
|-----------|---------|-------|
| 🖥️ Desktop Chrome | ✅ | Recommandé |
| 🖥️ Desktop Firefox | ✅ | Complet |
| 🖥️ Desktop Edge | ✅ | Complet |
| 🖥️ Desktop Safari | ⚠️ | Limitations MediaRecorder |
| 📱 Android Chrome | ✅ | Complet |
| 📱 iOS Safari | ⚠️ | Limitations WebRTC |
| 🔊 Enceintes BT | ✅ | Via connexion système |

## 🆘 Support

En cas de problème :
1. Consultez les logs d'erreurs PHP (espace client OVH)
2. Vérifiez la console JavaScript du navigateur (F12)
3. Testez les endpoints individuellement :
   - `https://leuca.fr/translate/api/detect-region.php`

## 🎉 Résultat

Votre application est maintenant en ligne sur :
**https://leuca.fr/translate/**

- ✅ Traduction en temps réel FR ↔ ZH
- ✅ VAD automatique (sans bouton)
- ✅ Clés API sécurisées
- ✅ Compatible mobile/desktop
- ✅ Hébergement gratuit sur votre OVH

---

**Prêt à traduire ! 🚀**
