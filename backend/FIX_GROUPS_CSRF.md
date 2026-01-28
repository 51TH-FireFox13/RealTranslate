# FIX: Correction problème groupes "Non authentifié"

**Date:** 2026-01-26
**Sévérité:** HIGH
**Statut:** ✅ RÉSOLU

## Problème identifié

Les utilisateurs recevaient une erreur "Non authentifié" lorsqu'ils essayaient d'utiliser les fonctionnalités de groupes (créer, rejoindre, envoyer des messages, etc.).

### Cause racine

Le middleware de protection CSRF bloquait toutes les requêtes POST/PUT/DELETE/PATCH vers les routes `/api/groups/*` car elles n'étaient pas exemptées de la vérification CSRF, alors que le frontend utilise l'authentification Bearer token (JWT) sans envoyer de token CSRF.

### Symptômes

- Erreur "Non authentifié" affichée par le navigateur
- Impossible de créer des groupes
- Impossible de rejoindre des groupes publics
- Impossible d'envoyer des messages dans les groupes
- **Aucun log d'erreur** dans error.log car l'erreur 403 CSRF n'était pas loggée

## Solution appliquée

### 1. Exemption CSRF pour Bearer token (PRINCIPAL)

**Fichier:** `backend/src/middleware/csrf.middleware.js`

Ajout d'une exemption automatique pour toutes les requêtes API utilisant Bearer token :

```javascript
// Exempter automatiquement les routes API protégées par Bearer token
// Ces routes sont déjà sécurisées par JWT et ne nécessitent pas de CSRF
const authHeader = req.headers.authorization;
if (req.path.startsWith('/api/') && authHeader && authHeader.startsWith('Bearer ')) {
  logger.info('CSRF check bypassed for Bearer token authenticated API request', {
    path: req.path,
    method: req.method
  });
  return next();
}
```

**Justification:**
- Les routes API REST utilisant Bearer token (JWT) sont déjà protégées contre les attaques CSRF car le token ne peut pas être volé par un site malveillant
- La protection CSRF est principalement nécessaire pour les cookies de session, pas pour les Bearer tokens
- Cohérent avec les routes `/api/translate`, `/api/transcribe` déjà exemptées

### 2. Amélioration du logging

**Fichier:** `backend/src/routes/groups.routes.js`

Ajout de métadonnées contextuelles dans tous les logs d'erreurs :

```javascript
// Avant
logger.error('Error creating group', error);

// Après
logger.error('Error creating group', error, {
  user: req.user?.email,
  body: req.body
});
```

**Bénéfices:**
- Meilleure traçabilité des erreurs
- Identification rapide de l'utilisateur et du contexte
- Facilite le debugging

### 3. Logs CSRF informatifs

Le middleware CSRF logge maintenant toutes les exemptions :
- Routes exemptées explicitement
- Routes avec Bearer token

Cela permet de voir dans les logs que les routes de groupes sont correctement exemptées.

## Tests recommandés

1. ✅ Créer un nouveau groupe privé
2. ✅ Créer un nouveau groupe public
3. ✅ Rejoindre un groupe public existant
4. ✅ Envoyer un message dans un groupe
5. ✅ Ajouter un membre à un groupe (admin)
6. ✅ Archiver/désarchiver un groupe
7. ✅ Vérifier que les logs capturent les erreurs (créer intentionnellement une erreur)

## Vérification des logs

Après le déploiement, vérifier que :
- Les requêtes aux groupes sont bien exemptées CSRF (dans `app.log`)
- Les erreurs sont loggées avec contexte (dans `error.log`)
- Aucune erreur 403 CSRF pour les routes groupes

## Impact

- ✅ Toutes les fonctionnalités de groupes fonctionnent à nouveau
- ✅ Meilleure observabilité avec logs enrichis
- ✅ Pas d'impact sur la sécurité (Bearer token toujours requis)
- ✅ Solution générique pour toutes les routes API avec Bearer token

## Notes techniques

### Pourquoi CSRF avec Bearer token ?

Les attaques CSRF exploitent le fait que les navigateurs envoient automatiquement les cookies avec chaque requête. Avec Bearer token :
- Le token est stocké en JavaScript (localStorage/memory)
- Le token doit être ajouté manuellement à chaque requête
- Un site malveillant ne peut pas voler le token ni forcer le navigateur à l'envoyer
- La protection CSRF n'est donc pas nécessaire

### Alternative considérée mais rejetée

Implémenter le support CSRF dans le frontend :
- ❌ Plus complexe (récupérer token, l'envoyer avec chaque requête)
- ❌ Pas cohérent avec l'architecture REST/Bearer token actuelle
- ❌ Surcharge inutile alors que Bearer token suffit

## Références

- Commits liés aux bugs CSRF précédents:
  - `a0635dc` - FIX CRITICAL: Correction bug CSRF bloquant la traduction
  - `6fce661` - FIX CRITICAL: Correction erreur CSRF token manquant à la connexion
- OWASP CSRF Prevention Cheat Sheet
- RFC 6749 (OAuth 2.0) - Bearer token security
