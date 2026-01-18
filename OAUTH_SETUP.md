# Configuration OAuth pour RealTranslate

Ce guide explique comment configurer l'authentification OAuth pour Google, Apple et WeChat dans RealTranslate.

## Sommaire
1. [Google OAuth](#google-oauth)
2. [Apple Sign In](#apple-sign-in)
3. [WeChat OAuth](#wechat-oauth)
4. [Configuration Backend](#configuration-backend)

---

## Google OAuth

### Étape 1 : Créer un projet Google Cloud

1. Accédez à la [Google Cloud Console](https://console.cloud.google.com/)
2. Créez un nouveau projet ou sélectionnez un projet existant
3. Activez l'API "Google+ API" et "Google Identity"

### Étape 2 : Configurer OAuth 2.0

1. Dans la console, allez dans **APIs & Services** > **Credentials**
2. Cliquez sur **Create Credentials** > **OAuth client ID**
3. Sélectionnez **Web application**
4. Configurez les paramètres :
   - **Nom** : RealTranslate
   - **Authorized JavaScript origins** :
     - `http://localhost:3000` (développement)
     - `https://votre-domaine.com` (production)
   - **Authorized redirect URIs** :
     - `http://localhost:3000/auth/google/callback` (développement)
     - `https://votre-domaine.com/auth/google/callback` (production)
5. Cliquez sur **Create**
6. Copiez le **Client ID** et le **Client Secret**

### Étape 3 : Configurer les variables d'environnement

Ajoutez dans votre fichier `.env` :

```env
GOOGLE_CLIENT_ID=votre_client_id_google
GOOGLE_CLIENT_SECRET=votre_client_secret_google
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

---

## Apple Sign In

### Étape 1 : Compte Apple Developer

1. Connectez-vous au [Apple Developer Portal](https://developer.apple.com/)
2. Vous devez avoir un compte Apple Developer actif (99$/an)

### Étape 2 : Créer un App ID

1. Allez dans **Certificates, Identifiers & Profiles**
2. Cliquez sur **Identifiers** > **+** (nouveau)
3. Sélectionnez **App IDs** et cliquez sur **Continue**
4. Configurez :
   - **Description** : RealTranslate
   - **Bundle ID** : com.votreentreprise.realtranslate
   - Cochez **Sign in with Apple**
5. Cliquez sur **Continue** puis **Register**

### Étape 3 : Créer un Service ID

1. Dans **Identifiers**, cliquez sur **+** (nouveau)
2. Sélectionnez **Services IDs** et cliquez sur **Continue**
3. Configurez :
   - **Description** : RealTranslate Web
   - **Identifier** : com.votreentreprise.realtranslate.web
   - Cochez **Sign in with Apple**
4. Cliquez sur **Configure** à côté de "Sign in with Apple"
5. Configurez :
   - **Primary App ID** : Sélectionnez l'App ID créé précédemment
   - **Domains and Subdomains** :
     - `localhost` (développement)
     - `votre-domaine.com` (production)
   - **Return URLs** :
     - `http://localhost:3000/auth/apple/callback` (développement)
     - `https://votre-domaine.com/auth/apple/callback` (production)
6. Cliquez sur **Save** puis **Continue** et **Register**

### Étape 4 : Créer une Key

1. Allez dans **Keys** > **+** (nouveau)
2. Configurez :
   - **Key Name** : RealTranslate Sign in with Apple Key
   - Cochez **Sign in with Apple**
   - Cliquez sur **Configure**, sélectionnez votre App ID
3. Cliquez sur **Continue** puis **Register**
4. **Téléchargez la clé** (.p8 file) - IMPORTANT : vous ne pourrez la télécharger qu'une seule fois !
5. Notez le **Key ID** (affiché dans la liste des clés)

### Étape 5 : Trouver votre Team ID

1. Dans le Apple Developer Portal, votre **Team ID** est affiché en haut à droite
2. Ou allez dans **Membership** pour le trouver

### Étape 6 : Configurer les variables d'environnement

Ajoutez dans votre fichier `.env` :

```env
APPLE_CLIENT_ID=com.votreentreprise.realtranslate.web
APPLE_TEAM_ID=votre_team_id
APPLE_KEY_ID=votre_key_id
APPLE_PRIVATE_KEY_PATH=./config/AuthKey_XXXXXXXXXX.p8
APPLE_CALLBACK_URL=http://localhost:3000/auth/apple/callback
```

Placez le fichier `.p8` dans un dossier `config/` à la racine du projet.

---

## WeChat OAuth

### Étape 1 : Créer un compte WeChat Open Platform

1. Accédez à [WeChat Open Platform](https://open.weixin.qq.com/)
2. Créez un compte ou connectez-vous
3. Vous aurez besoin de vérifier votre identité (entreprise ou développeur individuel)

### Étape 2 : Créer une Web Application

1. Dans le tableau de bord, allez dans **Website Application**
2. Cliquez sur **Create Application**
3. Remplissez les informations :
   - **Application Name** : RealTranslate
   - **Application Description** : Application de traduction en temps réel
   - **Website URL** : `https://votre-domaine.com`
   - **Application Icon** : Téléchargez une icône 120x120px
4. Attendez l'approbation (peut prendre quelques jours)

### Étape 3 : Configurer le domaine de callback

1. Une fois l'application approuvée, allez dans les paramètres
2. Configurez le **Authorization Callback Domain** :
   - `votre-domaine.com` (sans http/https)
3. Notez votre **AppID** et **AppSecret**

### Étape 4 : Configurer les variables d'environnement

Ajoutez dans votre fichier `.env` :

```env
WECHAT_APP_ID=votre_wechat_app_id
WECHAT_APP_SECRET=votre_wechat_app_secret
WECHAT_CALLBACK_URL=https://votre-domaine.com/auth/wechat/callback
```

**Note importante** : WeChat n'autorise pas `localhost` pour OAuth. Vous devrez utiliser un tunnel (comme ngrok) pour le développement.

---

## Configuration Backend

### Installation des dépendances

```bash
cd backend
npm install passport passport-google-oauth20 passport-apple @wechat/passport-wechat
```

### Exemple d'implémentation dans server.js

```javascript
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const AppleStrategy = require('passport-apple').Strategy;
const WeChatStrategy = require('@wechat/passport-wechat').Strategy;
const fs = require('fs');

// Configuration Google
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Récupérer ou créer l'utilisateur
      let user = authManager.users[profile.emails[0].value];

      if (!user) {
        // Créer un nouveau compte
        user = {
          email: profile.emails[0].value,
          displayName: profile.displayName,
          avatar: profile.photos[0]?.value,
          authProvider: 'google',
          googleId: profile.id
        };
        authManager.users[user.email] = user;
        await authManager.saveUsers();
      }

      done(null, user);
    } catch (error) {
      done(error, null);
    }
  }
));

// Configuration Apple
passport.use(new AppleStrategy({
    clientID: process.env.APPLE_CLIENT_ID,
    teamID: process.env.APPLE_TEAM_ID,
    keyID: process.env.APPLE_KEY_ID,
    privateKeyString: fs.readFileSync(process.env.APPLE_PRIVATE_KEY_PATH, 'utf8'),
    callbackURL: process.env.APPLE_CALLBACK_URL,
    passReqToCallback: false
  },
  async (accessToken, refreshToken, idToken, profile, done) => {
    try {
      // Apple renvoie l'email dans le idToken
      const email = profile.email;
      let user = authManager.users[email];

      if (!user) {
        user = {
          email: email,
          displayName: profile.name?.firstName + ' ' + profile.name?.lastName || email.split('@')[0],
          authProvider: 'apple',
          appleId: profile.id
        };
        authManager.users[user.email] = user;
        await authManager.saveUsers();
      }

      done(null, user);
    } catch (error) {
      done(error, null);
    }
  }
));

// Configuration WeChat
passport.use(new WeChatStrategy({
    appID: process.env.WECHAT_APP_ID,
    appSecret: process.env.WECHAT_APP_SECRET,
    callbackURL: process.env.WECHAT_CALLBACK_URL,
    scope: 'snsapi_login',
    state: true
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // WeChat utilise unionid comme identifiant unique
      const email = `wechat_${profile.unionid}@realtranslate.app`;
      let user = authManager.users[email];

      if (!user) {
        user = {
          email: email,
          displayName: profile.nickname,
          avatar: profile.headimgurl,
          authProvider: 'wechat',
          wechatId: profile.unionid
        };
        authManager.users[user.email] = user;
        await authManager.saveUsers();
      }

      done(null, user);
    } catch (error) {
      done(error, null);
    }
  }
));

// Routes OAuth
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
  passport.authenticate('google', { session: false }),
  (req, res) => {
    // Générer un JWT token
    const token = authManager.generateToken(req.user);
    // Rediriger vers le frontend avec le token
    res.redirect(`/?token=${token}`);
  }
);

app.get('/auth/apple', passport.authenticate('apple'));

app.get('/auth/apple/callback',
  passport.authenticate('apple', { session: false }),
  (req, res) => {
    const token = authManager.generateToken(req.user);
    res.redirect(`/?token=${token}`);
  }
);

app.get('/auth/wechat', passport.authenticate('wechat'));

app.get('/auth/wechat/callback',
  passport.authenticate('wechat', { session: false }),
  (req, res) => {
    const token = authManager.generateToken(req.user);
    res.redirect(`/?token=${token}`);
  }
);
```

### Modification du frontend

Dans `app.js`, remplacez les fonctions stub OAuth :

```javascript
function loginWithGoogle() {
  window.location.href = `${API_BASE_URL}/auth/google`;
}

function loginWithApple() {
  window.location.href = `${API_BASE_URL}/auth/apple`;
}

function loginWithWeChat() {
  window.location.href = `${API_BASE_URL}/auth/wechat`;
}

// Récupérer le token depuis l'URL après redirection OAuth
window.addEventListener('load', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  if (token) {
    // Sauvegarder le token
    localStorage.setItem('auth_token', token);

    // Récupérer les infos utilisateur
    fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
      state.user = data.user;
      state.token = token;
      localStorage.setItem('auth_user', JSON.stringify(data.user));

      // Nettoyer l'URL
      window.history.replaceState({}, document.title, '/');

      // Afficher l'application
      showApp();
    });
  }
});
```

---

## Sécurité

### Recommandations importantes :

1. **Ne jamais commiter** les clés API dans Git
   - Ajoutez `.env` à votre `.gitignore`
   - Utilisez des variables d'environnement en production

2. **HTTPS obligatoire** en production
   - Google, Apple et WeChat requirent HTTPS pour OAuth

3. **Valider les tokens** côté serveur
   - Ne faites jamais confiance aux tokens côté client uniquement

4. **Limiter les scopes**
   - Demandez uniquement les permissions nécessaires

5. **Session sécurisée**
   - Utilisez des cookies `httpOnly` et `secure` si vous utilisez des sessions

---

## Dépannage

### Google OAuth
- **"redirect_uri_mismatch"** : Vérifiez que l'URL de callback est exactement la même dans la console Google
- **"invalid_client"** : Vérifiez vos client_id et client_secret

### Apple Sign In
- **"invalid_client"** : Vérifiez que votre Service ID et Team ID sont corrects
- **Clé privée invalide** : Assurez-vous que le fichier .p8 est accessible et correctement formaté

### WeChat OAuth
- **"redirect_uri error"** : Assurez-vous que le domaine est approuvé dans WeChat Open Platform
- **En développement** : Utilisez ngrok pour tester : `ngrok http 3000`

---

## Support

Pour plus d'informations :
- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Apple Sign In Documentation](https://developer.apple.com/sign-in-with-apple/)
- [WeChat Open Platform](https://developers.weixin.qq.com/doc/oplatform/en/Website_App/WeChat_Login/Wechat_Login.html)
