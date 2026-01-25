/**
 * Middlewares d'authentification et d'autorisation
 * Centralise toute la logique d'auth pour les routes Express
 */

import {
  authManager,
  authMiddleware as baseAuthMiddleware,
  requirePermission as baseRequirePermission,
  requireAdmin as baseRequireAdmin,
  ROLES,
  SUBSCRIPTION_TIERS
} from '../../auth-sqlite.js';
import { logger } from '../../logger.js';

/**
 * Middleware d'authentification de base
 * Vérifie le JWT et attache req.user
 *
 * Usage:
 *   app.get('/api/protected', authMiddleware, (req, res) => { ... })
 */
export const authMiddleware = baseAuthMiddleware;

/**
 * Middleware qui requiert une permission spécifique
 *
 * @param {string} permission - Permission requise
 * @returns {Function} Middleware Express
 *
 * Usage:
 *   app.post('/api/admin/action', requirePermission('admin'), (req, res) => { ... })
 */
export const requirePermission = baseRequirePermission;

/**
 * Middleware qui requiert le rôle admin
 *
 * Usage:
 *   app.delete('/api/users/:id', requireAdmin, (req, res) => { ... })
 */
export const requireAdmin = baseRequireAdmin;

/**
 * Middleware qui requiert un tier d'abonnement minimum
 *
 * @param {string} minTier - Tier minimum requis ('free', 'premium', 'enterprise')
 * @returns {Function} Middleware Express
 *
 * Usage:
 *   app.get('/api/premium-feature', requireSubscription('premium'), (req, res) => { ... })
 */
export function requireSubscription(minTier) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const tierLevels = {
      'free': 0,
      'premium': 1,
      'enterprise': 2
    };

    const userLevel = tierLevels[req.user.subscription.tier] || 0;
    const requiredLevel = tierLevels[minTier] || 0;

    if (userLevel < requiredLevel) {
      logger.warn('Subscription tier insufficient', {
        user: req.user.email,
        currentTier: req.user.subscription.tier,
        requiredTier: minTier
      });
      return res.status(403).json({
        error: 'Subscription tier insufficient',
        currentTier: req.user.subscription.tier,
        requiredTier: minTier
      });
    }

    next();
  };
}

/**
 * Middleware qui vérifie qu'un quota d'utilisateur n'est pas dépassé
 *
 * @param {string} action - Action à vérifier ('transcribe', 'translate', 'speak')
 * @returns {Function} Middleware Express
 *
 * Usage:
 *   app.post('/api/transcribe', requireQuota('transcribe'), (req, res) => { ... })
 */
export function requireQuota(action) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const hasQuota = authManager.checkQuota(req.user.email, action);

    if (!hasQuota) {
      logger.warn('Quota exceeded', {
        user: req.user.email,
        action,
        tier: req.user.subscription.tier
      });
      return res.status(429).json({
        error: 'Quota exceeded',
        action,
        tier: req.user.subscription.tier,
        message: `You have reached your ${action} quota for this month`
      });
    }

    next();
  };
}

/**
 * Middleware optionnel d'authentification
 * Attache req.user si authentifié, mais ne bloque pas si non authentifié
 *
 * Usage:
 *   app.get('/api/optional-auth', optionalAuth, (req, res) => {
 *     if (req.user) { ... } else { ... }
 *   })
 */
export function optionalAuth(req, res, next) {
  // Tenter l'authentification mais ne pas bloquer si elle échoue
  baseAuthMiddleware(req, res, (err) => {
    // Ignorer les erreurs d'auth et continuer
    next();
  });
}

/**
 * Middleware qui vérifie que l'utilisateur est le propriétaire de la ressource
 * ou un admin
 *
 * @param {Function} getResourceOwnerEmail - Fonction qui retourne l'email du propriétaire
 * @returns {Function} Middleware Express
 *
 * Usage:
 *   app.put('/api/users/:email/profile', requireOwnerOrAdmin(
 *     (req) => req.params.email
 *   ), (req, res) => { ... })
 */
export function requireOwnerOrAdmin(getResourceOwnerEmail) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const ownerEmail = getResourceOwnerEmail(req);
    const isOwner = req.user.email === ownerEmail;
    const isAdmin = req.user.role === ROLES.ADMIN;

    if (!isOwner && !isAdmin) {
      logger.warn('Access denied: not owner or admin', {
        user: req.user.email,
        owner: ownerEmail
      });
      return res.status(403).json({ error: 'Access denied' });
    }

    next();
  };
}

/**
 * Middleware qui vérifie qu'un utilisateur est membre d'un groupe
 *
 * @param {Function} getGroupId - Fonction qui retourne l'ID du groupe
 * @returns {Function} Middleware Express
 *
 * Usage:
 *   app.get('/api/groups/:id/messages', requireGroupMember(
 *     (req) => req.params.id
 *   ), (req, res) => { ... })
 */
export function requireGroupMember(getGroupId) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const groupId = getGroupId(req);

    // Importer groupsDB ici pour éviter les imports circulaires
    const { groupsDB } = await import('../../database.js');
    const members = groupsDB.getMembers(groupId);
    const isMember = members.some(m => m.user_email === req.user.email);

    if (!isMember && req.user.role !== ROLES.ADMIN) {
      logger.warn('Access denied: not group member', {
        user: req.user.email,
        groupId
      });
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    // Attacher les membres au request pour éviter de les recharger
    req.groupMembers = members;

    next();
  };
}

/**
 * Middleware de rate limiting simple par utilisateur
 *
 * @param {number} maxRequests - Nombre max de requêtes
 * @param {number} windowMs - Fenêtre de temps en ms
 * @returns {Function} Middleware Express
 *
 * Usage:
 *   app.post('/api/expensive-operation', rateLimit(10, 60000), (req, res) => { ... })
 */
const rateLimitStore = new Map();

export function rateLimit(maxRequests, windowMs) {
  return (req, res, next) => {
    const key = req.user ? req.user.email : req.ip;
    const now = Date.now();

    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, []);
    }

    const requests = rateLimitStore.get(key);

    // Nettoyer les anciennes requêtes
    const recent = requests.filter(timestamp => now - timestamp < windowMs);
    rateLimitStore.set(key, recent);

    if (recent.length >= maxRequests) {
      logger.warn('Rate limit exceeded', {
        key,
        requests: recent.length,
        limit: maxRequests
      });
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((recent[0] + windowMs - now) / 1000)
      });
    }

    recent.push(now);
    rateLimitStore.set(key, recent);

    next();
  };
}

// Export des constantes pour utilisation dans les routes
export { ROLES, SUBSCRIPTION_TIERS };

export default {
  authMiddleware,
  requirePermission,
  requireAdmin,
  requireSubscription,
  requireQuota,
  optionalAuth,
  requireOwnerOrAdmin,
  requireGroupMember,
  rateLimit,
  ROLES,
  SUBSCRIPTION_TIERS
};
