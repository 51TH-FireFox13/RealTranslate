# Phase 2.1 : Configuration et Middlewares

## 📋 Vue d'ensemble

Première phase du refactoring modulaire : extraction de la configuration et des middlewares de server.js dans des modules dédiés et réutilisables.

## 🎯 Objectifs

1. ✅ Centraliser la configuration Express
2. ✅ Modulariser la configuration CORS
3. ✅ Créer des middlewares réutilisables
4. ✅ Améliorer la maintenabilité
5. ✅ Documenter l'utilisation

## 📁 Fichiers créés

### 1. `src/config/server.js` (140 lignes)
Configuration centralisée du serveur Express.

**Exports:**
- `PATHS` - Chemins importants (root, frontend, uploads)
- `SERVER_CONFIG` - Configuration serveur (port, host, timeouts, etc.)
- `createExpressApp()` - Crée et configure une app Express
- `configureMiddlewares(app)` - Configure tous les middlewares
- `configureServer(server)` - Configure le serveur HTTP
- `CSRF_EXEMPT_PATHS` - Routes exemptées de CSRF

**Exemple:**
```javascript
import { createExpressApp, SERVER_CONFIG } from './src/config/server.js';

const app = createExpressApp();
// App déjà configurée avec CORS, body parsers, CSRF, etc.

console.log(`Server will run on port ${SERVER_CONFIG.port}`);
```

### 2. `src/config/cors.js` (170 lignes)
Configuration CORS avancée avec gestion des origines.

**Features:**
- Origines autorisées depuis env (`ALLOWED_ORIGINS`)
- Validation stricte des origines
- Mode développement (all origins) vs production (whitelist)
- Configuration Socket.IO CORS
- Utilitaires (`isOriginAllowed`, `addAllowedOrigin`)

**Exemple:**
```javascript
import { getCorsMiddleware, SOCKET_CORS_CONFIG } from './src/config/cors.js';

// Pour Express
app.use(getCorsMiddleware());

// Pour Socket.IO
const io = new Server(httpServer, {
  cors: SOCKET_CORS_CONFIG
});
```

### 3. `src/middleware/auth.middleware.js` (270 lignes)
Middlewares d'authentification et autorisation avancés.

**Middlewares:**
- `authMiddleware` - Auth de base (JWT)
- `requirePermission(permission)` - Requiert une permission
- `requireAdmin` - Requiert rôle admin
- `requireSubscription(tier)` - Requiert tier d'abonnement
- `requireQuota(action)` - Vérifie les quotas
- `optionalAuth` - Auth optionnelle
- `requireOwnerOrAdmin(getEmail)` - Propriétaire ou admin
- `requireGroupMember(getGroupId)` - Membre du groupe
- `rateLimit(max, window)` - Rate limiting simple

**Exemple:**
```javascript
import { authMiddleware, requireSubscription, requireQuota } from './src/middleware/auth.middleware.js';

// Route protégée avec quota
app.post('/api/transcribe',
  authMiddleware,
  requireSubscription('premium'),
  requireQuota('transcribe'),
  async (req, res) => {
    // ...
  }
);

// Rate limiting
app.post('/api/expensive',
  rateLimit(10, 60000), // 10 req/min
  async (req, res) => {
    // ...
  }
);
```

### 4. `src/middleware/csrf.middleware.js` (120 lignes)
Protection CSRF centralisée.

**Features:**
- Liste configurable de routes exemptées
- Middleware de protection automatique
- Endpoint pour obtenir un token
- Debug logger
- Utilitaires (`isCSRFExempt`, `addCSRFExemptPath`)

**Exemple:**
```javascript
import { csrfProtection, exemptFromCSRF, getCsrfToken } from './src/middleware/csrf.middleware.js';

// Protection CSRF globale
app.use(csrfProtection);

// Endpoint token CSRF
app.get('/api/csrf-token', getCsrfToken);

// Exempter une route
app.post('/api/webhook', exemptFromCSRF, webhookHandler);
```

### 5. `src/middleware/upload.middleware.js` (290 lignes)
Gestion complète des uploads avec Multer.

**Middlewares pré-configurés:**
- `uploadMemory` - Upload en mémoire (audio/vidéo)
- `uploadDisk` - Upload sur disque (fichiers chat)
- `uploadImage` - Images uniquement (5MB max)
- `uploadAudio` - Audio uniquement (25MB max)
- `uploadDocument` - Documents uniquement (10MB max)

**Autres:**
- `handleUploadError` - Gestion d'erreurs upload
- `validateUpload` - Validation post-upload
- `getFileUrl(filename)` - URL publique
- `getFilePath(filename)` - Chemin complet

**Exemple:**
```javascript
import { uploadImage, uploadAudio, handleUploadError } from './src/middleware/upload.middleware.js';

// Upload image (avatar)
app.post('/api/avatar',
  uploadImage.single('avatar'),
  handleUploadError,
  (req, res) => {
    const url = getFileUrl(req.file.filename);
    res.json({ url });
  }
);

// Upload audio pour transcription
app.post('/api/transcribe',
  uploadAudio.single('audio'),
  handleUploadError,
  async (req, res) => {
    const audioBuffer = req.file.buffer;
    // Process...
  }
);
```

### 6. `src/middleware/error.middleware.js` (340 lignes)
Gestion d'erreurs centralisée et classes d'erreurs personnalisées.

**Classes d'erreurs:**
- `HttpError` - Erreur HTTP de base
- `BadRequestError` (400)
- `UnauthorizedError` (401)
- `ForbiddenError` (403)
- `NotFoundError` (404)
- `ConflictError` (409)
- `TooManyRequestsError` (429)
- `InternalServerError` (500)

**Middlewares:**
- `errorHandler` - Gestionnaire global d'erreurs
- `notFoundHandler` - Routes 404
- `asyncHandler(fn)` - Wrapper pour fonctions async
- `validate(schema, source)` - Validation de données
- `sanitize(fields, source)` - Nettoyage de données
- `timeout(ms)` - Timeout requêtes

**Exemple:**
```javascript
import {
  BadRequestError,
  NotFoundError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  validate
} from './src/middleware/error.middleware.js';

// Route avec validation
app.post('/api/users',
  validate({
    email: { required: true, type: 'string', pattern: /^.+@.+\..+$/ },
    age: { required: false, type: 'number', min: 18, max: 120 }
  }, 'body'),
  asyncHandler(async (req, res) => {
    const user = await createUser(req.body);
    if (!user) throw new BadRequestError('User creation failed');
    res.json(user);
  })
);

// Gestionnaires d'erreurs (en dernier)
app.use(notFoundHandler);
app.use(errorHandler);
```

## 📊 Statistiques

| Métrique | Valeur |
|----------|--------|
| Fichiers créés | 6 |
| Lignes de code | ~1,330 |
| Middlewares | 25+ |
| Classes d'erreurs | 8 |
| Fonctions utilitaires | 15+ |

## ✨ Avantages

### Avant Phase 2.1
```javascript
// server.js (monolithique)
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use((req, res, next) => {
  // 20 lignes de logique CSRF...
});

const upload = multer({ /* 30 lignes de config */ });
const fileUpload = multer({ /* 30 autres lignes */ });

// Middleware d'auth copié-collé partout
function checkAdmin(req, res, next) {
  // 15 lignes...
}

// Pas de gestion d'erreurs centralisée
```

### Après Phase 2.1
```javascript
// server.js (modulaire)
import { createExpressApp } from './src/config/server.js';
import { authMiddleware, requireAdmin } from './src/middleware/auth.middleware.js';
import { uploadImage } from './src/middleware/upload.middleware.js';
import { errorHandler, asyncHandler } from './src/middleware/error.middleware.js';

const app = createExpressApp(); // Tout configuré !

app.post('/api/admin/action',
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    // Logique métier seulement
  })
);

app.use(errorHandler);
```

**Bénéfices:**
- ✅ Code 5x plus court et lisible
- ✅ Middlewares réutilisables
- ✅ Gestion d'erreurs uniforme
- ✅ Validation centralisée
- ✅ Configuration documentée
- ✅ Testabilité améliorée

## 🧪 Utilisation

### Configuration serveur
```javascript
import { createExpressApp, SERVER_CONFIG, PATHS } from './src/config/server.js';

const app = createExpressApp();

console.log('Server config:', {
  port: SERVER_CONFIG.port,
  env: SERVER_CONFIG.env,
  uploads: PATHS.uploads
});
```

### CORS
```javascript
import { getCorsMiddleware, addAllowedOrigin } from './src/config/cors.js';

app.use(getCorsMiddleware());

// Ajouter une origine dynamiquement
addAllowedOrigin('https://newdomain.com');
```

### Auth et autorisation
```javascript
import {
  authMiddleware,
  requireSubscription,
  requireQuota,
  requireOwnerOrAdmin
} from './src/middleware/auth.middleware.js';

// Route premium avec quota
app.post('/api/premium-feature',
  authMiddleware,
  requireSubscription('premium'),
  requireQuota('translate'),
  asyncHandler(async (req, res) => {
    // ...
  })
);

// Route propriétaire ou admin
app.put('/api/users/:email/profile',
  authMiddleware,
  requireOwnerOrAdmin((req) => req.params.email),
  asyncHandler(async (req, res) => {
    // ...
  })
);
```

### Upload de fichiers
```javascript
import {
  uploadImage,
  uploadAudio,
  handleUploadError,
  validateUpload,
  getFileUrl
} from './src/middleware/upload.middleware.js';

app.post('/api/avatar',
  uploadImage.single('avatar'),
  handleUploadError,
  validateUpload,
  (req, res) => {
    res.json({ url: getFileUrl(req.file.filename) });
  }
);
```

### Gestion d'erreurs
```javascript
import {
  BadRequestError,
  NotFoundError,
  errorHandler,
  asyncHandler,
  validate
} from './src/middleware/error.middleware.js';

app.post('/api/resource',
  validate({
    name: { required: true, type: 'string', minLength: 3 },
    value: { required: true, type: 'number', min: 0 }
  }),
  asyncHandler(async (req, res) => {
    const resource = await findResource(req.body.name);
    if (!resource) throw new NotFoundError('Resource not found');
    res.json(resource);
  })
);

app.use(errorHandler);
```

## 🔜 Prochaines étapes

**Phase 2.2 : Routes API**
- Créer `src/routes/` avec routers modulaires
- Séparer auth, users, groups, messages, payments, API AI
- Intégrer dans server.js
- Tester chaque groupe de routes

**Objectif:** Réduire server.js à ~200 lignes (vs ~2000 actuellement)

## ✅ Validation

- ✅ 6 fichiers créés, ~1,330 lignes
- ✅ Tous les middlewares documentés
- ✅ Exemples d'utilisation fournis
- ✅ Compatible avec server.js existant
- ✅ Pas de breaking changes
- ✅ Prêt pour Phase 2.2

**Phase 2.1 COMPLÈTE ! 🎉**
