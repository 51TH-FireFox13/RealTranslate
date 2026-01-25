# Phase 2 : Refactoring Modulaire du Code Monolithique

## 📋 Vue d'ensemble

Actuellement, server.js est un fichier monolithique de plusieurs milliers de lignes mélant :
- Configuration et initialisation
- Routes API
- WebSocket
- Logique métier
- Gestion des abonnements
- Upload de fichiers
- etc.

La Phase 2 vise à découper ce code en modules logiques et maintenables.

## 🎯 Objectifs

1. **Séparer** les préoccupations (separation of concerns)
2. **Modulariser** le code en fichiers logiques
3. **Améliorer** la maintenabilité et testabilité
4. **Conserver** la compatibilité totale
5. **Documenter** l'architecture résultante

## 📁 Structure cible

```
backend/
├── src/
│   ├── config/
│   │   ├── database.js          ✅ (Phase 1.2)
│   │   ├── environment.js       ✅ (Phase 1.2)
│   │   ├── server.js            🔜 Configuration Express
│   │   └── cors.js              🔜 Configuration CORS
│   │
│   ├── db/
│   │   ├── db.js                ✅ (Phase 1.2 - pool)
│   │   ├── repositories/        🔜 Accès données
│   │   │   ├── users.repository.js
│   │   │   ├── groups.repository.js
│   │   │   ├── messages.repository.js
│   │   │   └── quotas.repository.js
│   │   └── models/              🔜 Définitions de modèles
│   │       ├── user.model.js
│   │       ├── group.model.js
│   │       └── message.model.js
│   │
│   ├── routes/                  🔜 Routes API
│   │   ├── index.js            (Router principal)
│   │   ├── auth.routes.js      (Login, logout, register)
│   │   ├── users.routes.js     (CRUD users)
│   │   ├── groups.routes.js    (CRUD groups)
│   │   ├── messages.routes.js  (Messages)
│   │   ├── api.routes.js       (Transcribe, translate, speak)
│   │   ├── payments.routes.js  (Stripe, PayPal, WeChat)
│   │   └── upload.routes.js    (Upload fichiers)
│   │
│   ├── services/                🔜 Logique métier
│   │   ├── auth.service.js     (Authentification)
│   │   ├── ai.service.js       (OpenAI, DeepSeek)
│   │   ├── payment.service.js  (Paiements)
│   │   ├── quota.service.js    (Gestion quotas)
│   │   └── subscription.service.js
│   │
│   ├── middleware/              🔜 Middlewares Express
│   │   ├── auth.middleware.js
│   │   ├── csrf.middleware.js
│   │   ├── upload.middleware.js
│   │   └── error.middleware.js
│   │
│   ├── websocket/               🔜 Gestion WebSocket
│   │   ├── socket.js           (Configuration)
│   │   ├── handlers/           (Event handlers)
│   │   │   ├── chat.handler.js
│   │   │   ├── group.handler.js
│   │   │   └── presence.handler.js
│   │   └── middleware/
│   │       └── auth.socket.middleware.js
│   │
│   └── utils/                   🔜 Utilitaires
│       ├── validators.js
│       ├── sanitizers.js
│       └── helpers.js
│
├── database.js                  ✅ (Phase 1.3 - sync-compat)
├── database-v2.js               ✅ (Phase 1.3 - async pool)
├── logger.js                    ✅ (existant)
├── server.js                    🔜 (à réduire drastiquement)
└── app.js                       🔜 (nouveau point d'entrée)
```

## 🗺️ Plan de refactoring

### Phase 2.1 : Configuration et Middlewares
**Objectif:** Extraire la configuration et les middlewares

**Fichiers à créer:**
- `src/config/server.js` - Configuration Express, CORS, middlewares
- `src/config/cors.js` - Configuration CORS détaillée
- `src/middleware/auth.middleware.js` - Middlewares d'authentification
- `src/middleware/csrf.middleware.js` - Protection CSRF
- `src/middleware/upload.middleware.js` - Configuration Multer
- `src/middleware/error.middleware.js` - Gestion d'erreurs

**Tâches:**
1. Extraire configuration Express de server.js
2. Extraire configuration CORS
3. Extraire middlewares dans fichiers dédiés
4. Tester que server.js fonctionne avec imports

### Phase 2.2 : Routes API
**Objectif:** Séparer les routes en modules logiques

**Fichiers à créer:**
- `src/routes/index.js` - Router principal
- `src/routes/auth.routes.js` - Routes authentification
- `src/routes/users.routes.js` - Routes CRUD users
- `src/routes/groups.routes.js` - Routes CRUD groups
- `src/routes/messages.routes.js` - Routes messages
- `src/routes/api.routes.js` - Routes AI (transcribe, translate, speak)
- `src/routes/payments.routes.js` - Routes paiements
- `src/routes/upload.routes.js` - Routes upload

**Tâches:**
1. Créer structure de base des routers
2. Migrer routes auth
3. Migrer routes users
4. Migrer routes groups
5. Migrer routes messages
6. Migrer routes API AI
7. Migrer routes paiements
8. Migrer routes upload
9. Intégrer dans server.js
10. Tester chaque groupe de routes

### Phase 2.3 : Services métier
**Objectif:** Extraire la logique métier des routes

**Fichiers à créer:**
- `src/services/auth.service.js` - Logique authentification
- `src/services/ai.service.js` - Appels OpenAI/DeepSeek
- `src/services/payment.service.js` - Logique paiements
- `src/services/quota.service.js` - Gestion quotas
- `src/services/subscription.service.js` - Gestion abonnements

**Tâches:**
1. Identifier la logique métier dans les routes
2. Extraire dans services
3. Faire appeler les services depuis les routes
4. Tester chaque service
5. Documenter les APIs des services

### Phase 2.4 : WebSocket modulaire
**Objectif:** Organiser la gestion WebSocket

**Fichiers à créer:**
- `src/websocket/socket.js` - Configuration Socket.IO
- `src/websocket/handlers/chat.handler.js` - Events chat
- `src/websocket/handlers/group.handler.js` - Events groupes
- `src/websocket/handlers/presence.handler.js` - Présence en ligne
- `src/websocket/middleware/auth.socket.middleware.js` - Auth WebSocket

**Tâches:**
1. Extraire configuration Socket.IO
2. Séparer event handlers
3. Créer middleware d'auth WebSocket
4. Tester tous les events
5. Documenter le protocole WebSocket

### Phase 2.5 : Repositories (optionnel, avancé)
**Objectif:** Abstraire l'accès aux données

**Fichiers à créer:**
- `src/db/repositories/users.repository.js`
- `src/db/repositories/groups.repository.js`
- `src/db/repositories/messages.repository.js`
- `src/db/repositories/quotas.repository.js`

**Note:** Peut être reporté à Phase 3 car database-sync-compat fournit déjà une abstraction.

### Phase 2.6 : Nouveau point d'entrée
**Objectif:** Créer un nouveau server.js léger

**Fichiers à créer:**
- `app.js` - Application Express composée
- `server-new.js` - Nouveau point d'entrée léger

**Tâches:**
1. Créer app.js qui compose tous les modules
2. Créer server-new.js minimal
3. Tester démarrage complet
4. Comparer avec server.js original
5. Remplacer server.js par server-new.js

## 📊 Métriques de succès

### Avant (Phase 1)
- server.js : ~2000+ lignes
- Tout mélangé dans un fichier
- Difficile à tester
- Difficile à maintenir

### Après (Phase 2)
- server.js : ~50-100 lignes (point d'entrée)
- Code organisé en ~20-30 fichiers logiques
- Chaque module testable indépendamment
- Séparation claire des responsabilités

## ⚠️ Risques et mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Régression fonctionnelle | Élevé | Tests après chaque sous-phase |
| Import circulaires | Moyen | Architecture en couches claire |
| Performance dégradée | Faible | Benchmarks avant/après |
| Complexité augmentée | Moyen | Documentation exhaustive |

## 🧪 Stratégie de test

1. **Tests unitaires** : Chaque service, chaque repository
2. **Tests d'intégration** : Routes complètes
3. **Tests E2E** : Scénarios utilisateur complets
4. **Tests de régression** : Comparer avec version précédente
5. **Tests de performance** : Benchmarks

## 📝 Conventions de code

### Nommage
- Fichiers : `kebab-case.js`
- Classes : `PascalCase`
- Fonctions : `camelCase`
- Constantes : `UPPER_SNAKE_CASE`

### Structure fichier
```javascript
// 1. Imports externes
import express from 'express';

// 2. Imports internes
import { logger } from '../logger.js';

// 3. Constantes
const TIMEOUT = 5000;

// 4. Fonctions/Classes
export class MyService {
  // ...
}

// 5. Export
export default MyService;
```

### Documentation
- JSDoc pour toutes les fonctions publiques
- README.md dans chaque dossier src/
- Exemples d'utilisation

## 🔜 Prochaines étapes immédiates

**Phase 2.1 commence maintenant !**

1. Créer `src/config/server.js`
2. Créer `src/config/cors.js`
3. Créer `src/middleware/` (4 fichiers)
4. Tester que server.js fonctionne
5. Commit Phase 2.1

Temps estimé Phase 2 complète : ~4-6 heures de travail continu

**Let's go! 🚀**
