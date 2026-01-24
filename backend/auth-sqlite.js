/**
 * Version SQLite d'AuthManager
 * Remplace le stockage JSON par SQLite
 */

import crypto from 'crypto';
import { usersDB, tokensDB } from './database.js';
import { logger } from './logger.js';

// Rôles disponibles
export const ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  GUEST: 'guest'
};

// Paliers d'abonnement
export const SUBSCRIPTION_TIERS = {
  FREE: {
    name: 'free',
    displayName: 'Gratuit',
    price: 0,
    billingPeriod: 'monthly',
    quotas: {
      transcribe: 50,
      translate: 250,
      speak: 50
    }
  },
  PREMIUM: {
    name: 'premium',
    displayName: 'Premium',
    price: 9.99,
    billingPeriod: 'monthly',
    quotas: {
      transcribe: 500,
      translate: 2500,
      speak: 500
    }
  },
  ENTERPRISE: {
    name: 'enterprise',
    displayName: 'Enterprise',
    price: 49.99,
    billingPeriod: 'monthly',
    quotas: {
      transcribe: 5000,
      translate: 25000,
      speak: 5000
    }
  },
  ADMIN: {
    name: 'admin',
    displayName: 'Admin',
    price: 0,
    billingPeriod: 'monthly',
    quotas: {
      transcribe: -1,
      translate: -1,
      speak: -1
    }
  }
};

// Permissions par rôle
const PERMISSIONS = {
  admin: ['*'],
  user: ['transcribe', 'translate', 'speak'],
  guest: ['translate']
};

// Classe de gestion des utilisateurs (version SQLite)
class AuthManagerSQLite {
  constructor() {
    // Créer un proxy pour this.users qui redirige vers usersDB
    this.users = this.createUsersProxy();
    this.tokens = {}; // Tokens de session (en mémoire uniquement)
    this.accessTokens = this.createAccessTokensProxy();

    // Quotas usage en mémoire (pas encore persisté en DB)
    this.quotaUsageStore = new Map(); // email -> { transcribe, translate, speak }

    // Créer admin par défaut si absent
    this.ensureDefaultAdmin();
  }

  createUsersProxy() {
    const self = this;
    return new Proxy({}, {
      get(target, email) {
        if (typeof email === 'symbol' || email === 'inspect' || email === 'constructor') {
          return undefined;
        }
        const user = usersDB.getByEmail(email);
        if (!user) return undefined;

        // Récupérer quotaUsage depuis le store en mémoire
        const quotaUsage = self.quotaUsageStore.get(email) || { transcribe: 0, translate: 0, speak: 0 };

        // Convertir format DB → format legacy
        return {
          id: user.email,
          email: user.email,
          displayName: user.display_name || user.email.split('@')[0],
          name: user.name,
          passwordHash: user.password,
          password: user.password, // Alias
          role: user.role,
          subscriptionTier: user.subscription_tier,
          subscriptionStatus: user.subscription_status,
          stripeCustomerId: user.stripe_customer_id,
          stripeSubscriptionId: user.stripe_subscription_id,
          avatar: user.avatar,
          createdAt: user.created_at,
          // Propriétés calculées/temporaires
          groups: user.groups || [],
          friends: user.friends || [],
          archivedGroups: user.archivedGroups || [],
          archivedDMs: user.archivedDMs || [],
          lastQuotaReset: user.lastQuotaReset,
          quotaUsage: quotaUsage
        };
      },

      set(target, email, value) {
        // Création ou modification d'un utilisateur
        try {
          const existing = usersDB.getByEmail(email);

          if (existing) {
            // Update
            const updates = {};
            if (value.password !== undefined) updates.password = value.password;
            if (value.passwordHash !== undefined) updates.password = value.passwordHash;
            if (value.displayName !== undefined) updates.display_name = value.displayName;
            if (value.name !== undefined) updates.name = value.name;
            if (value.avatar !== undefined) updates.avatar = value.avatar;
            if (value.subscriptionTier !== undefined) updates.subscription_tier = value.subscriptionTier;
            if (value.subscriptionStatus !== undefined) updates.subscription_status = value.subscriptionStatus;
            if (value.stripeCustomerId !== undefined) updates.stripe_customer_id = value.stripeCustomerId;
            if (value.stripeSubscriptionId !== undefined) updates.stripe_subscription_id = value.stripeSubscriptionId;

            usersDB.update(email, updates);
          } else {
            // Create
            usersDB.create({
              email: value.email || email,
              password: value.passwordHash || value.password,
              name: value.name || email.split('@')[0],
              displayName: value.displayName || email.split('@')[0],
              role: value.role || 'user',
              subscriptionTier: value.subscriptionTier || 'free'
            });
          }
          return true;
        } catch (error) {
          logger.error('Error in users proxy set', { error: error.message, email });
          return false;
        }
      },

      deleteProperty(target, email) {
        try {
          usersDB.delete(email);
          return true;
        } catch (error) {
          logger.error('Error in users proxy delete', { error: error.message, email });
          return false;
        }
      },

      has(target, email) {
        if (typeof email === 'symbol') return false;
        return usersDB.getByEmail(email) !== undefined;
      },

      ownKeys(target) {
        return usersDB.getAll().map(u => u.email);
      },

      getOwnPropertyDescriptor(target, email) {
        if (usersDB.getByEmail(email)) {
          return {
            enumerable: true,
            configurable: true
          };
        }
        return undefined;
      }
    });
  }

  createAccessTokensProxy() {
    return new Proxy({}, {
      get(target, token) {
        if (typeof token === 'symbol') return undefined;
        const tokenData = tokensDB.getByToken(token);
        if (!tokenData) return undefined;

        return {
          token: tokenData.token,
          tier: tokenData.tier,
          maxUses: tokenData.max_uses,
          usedBy: [], // TODO: tracker les utilisations
          expiresAt: tokenData.expires_at,
          description: tokenData.description
        };
      },

      set(target, token, value) {
        try {
          tokensDB.create({
            token: value.token || token,
            tier: value.tier,
            maxUses: value.maxUses || 1,
            expiresAt: value.expiresAt,
            description: value.description
          });
          return true;
        } catch (error) {
          logger.error('Error in accessTokens proxy set', { error: error.message });
          return false;
        }
      },

      deleteProperty(target, token) {
        try {
          tokensDB.delete(token);
          return true;
        } catch (error) {
          logger.error('Error in accessTokens proxy delete', { error: error.message });
          return false;
        }
      }
    });
  }

  ensureDefaultAdmin() {
    const admin = usersDB.getByEmail('admin@realtranslate.com');
    if (!admin) {
      logger.info('Creating default admin user');
      usersDB.create({
        email: 'admin@realtranslate.com',
        password: this.hashPassword('admin123'),
        name: 'Administrator',
        displayName: 'Administrator',
        role: ROLES.ADMIN,
        subscriptionTier: 'admin'
      });
    }
  }

  // Méthodes compatibles avec l'ancien AuthManager

  saveUsers() {
    // No-op: auto-saved via proxy
    return;
  }

  saveTokens() {
    // Tokens de session restent en mémoire (JWT)
    return;
  }

  saveAccessTokens() {
    // No-op: auto-saved via proxy
    return;
  }

  hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  createUser(email, password, role = ROLES.USER, subscriptionTier = 'free', displayName = null) {
    try {
      const existing = usersDB.getByEmail(email);
      if (existing) {
        return { success: false, message: 'Utilisateur existe déjà' };
      }

      usersDB.create({
        email,
        password: this.hashPassword(password),
        name: displayName || email.split('@')[0],
        displayName: displayName || email.split('@')[0],
        role,
        subscriptionTier
      });

      logger.info('User created', { email, role, tier: subscriptionTier });
      return { success: true, message: 'Utilisateur créé' };
    } catch (error) {
      logger.error('Error creating user', { error: error.message, email });
      return { success: false, message: 'Erreur lors de la création' };
    }
  }

  verifyUser(email, password) {
    const user = usersDB.getByEmail(email);
    if (!user) {
      return { success: false, message: 'Utilisateur introuvable' };
    }

    const hashedPassword = this.hashPassword(password);
    if (user.password !== hashedPassword) {
      return { success: false, message: 'Mot de passe incorrect' };
    }

    logger.info('User verified', { email });
    // Retourner l'utilisateur via le proxy pour compatibilité
    return { success: true, user: this.users[email] };
  }

  // Alias pour compatibilité avec l'ancien code server.js
  authenticate(email, password) {
    const result = this.verifyUser(email, password);
    if (!result.success) {
      return result;
    }

    // Générer un token de session
    const token = this.createAuthToken(email);
    return {
      success: true,
      user: result.user,
      token
    };
  }

  createAuthToken(email) {
    const token = this.generateToken();
    this.tokens[token] = {
      email,
      createdAt: Date.now()
    };
    return token;
  }

  verifyToken(token) {
    const tokenData = this.tokens[token];
    if (!tokenData) {
      return { success: false, message: 'Token invalide' };
    }

    const user = usersDB.getByEmail(tokenData.email);
    if (!user) {
      return { success: false, message: 'Utilisateur introuvable' };
    }

    return { success: true, user: this.users[tokenData.email] };
  }

  updateUserSubscription(email, tier, status = 'active') {
    const user = usersDB.getByEmail(email);
    if (!user) {
      return { success: false, message: 'Utilisateur introuvable' };
    }

    usersDB.update(email, {
      subscription_tier: tier,
      subscription_status: status
    });

    logger.info('User subscription updated', { email, tier, status });
    return { success: true };
  }

  hasPermission(user, permission) {
    if (!user || !user.role) return false;
    const userPermissions = PERMISSIONS[user.role];
    if (!userPermissions) return false;
    return userPermissions.includes('*') || userPermissions.includes(permission);
  }

  getUserQuota(email) {
    const user = this.users[email];
    if (!user) return null;

    const tier = SUBSCRIPTION_TIERS[user.subscriptionTier.toUpperCase()];
    if (!tier) return null;

    return {
      tier: tier.name,
      quotas: tier.quotas,
      usage: user.quotaUsage || { transcribe: 0, translate: 0, speak: 0 }
    };
  }

  checkQuota(email, action) {
    const user = this.users[email];
    if (!user) return false;

    const tier = SUBSCRIPTION_TIERS[user.subscriptionTier.toUpperCase()];
    if (!tier) return false;

    const quota = tier.quotas[action];
    if (quota === -1) return true; // Illimité

    const usage = user.quotaUsage || { transcribe: 0, translate: 0, speak: 0 };
    return (usage[action] || 0) < quota;
  }

  incrementQuota(email, action) {
    // Note: quotaUsage n'est pas encore dans la DB
    // Utiliser le store en mémoire
    const user = usersDB.getByEmail(email);
    if (!user) return;

    let quotaUsage = this.quotaUsageStore.get(email);
    if (!quotaUsage) {
      quotaUsage = { transcribe: 0, translate: 0, speak: 0 };
      this.quotaUsageStore.set(email, quotaUsage);
    }

    quotaUsage[action] = (quotaUsage[action] || 0) + 1;
  }

  listUsers() {
    // Retourner tous les utilisateurs depuis la DB
    const allUsers = usersDB.getAll();
    return allUsers.map(user => ({
      id: user.email,
      email: user.email,
      displayName: user.display_name || user.email.split('@')[0],
      name: user.name,
      role: user.role,
      subscriptionTier: user.subscription_tier,
      subscriptionStatus: user.subscription_status,
      stripeCustomerId: user.stripe_customer_id,
      stripeSubscriptionId: user.stripe_subscription_id,
      avatar: user.avatar,
      createdAt: user.created_at,
      subscription: {
        tier: user.subscription_tier,
        status: user.subscription_status,
        stripeCustomerId: user.stripe_customer_id,
        stripeSubscriptionId: user.stripe_subscription_id
      }
    }));
  }

  deleteUser(email) {
    try {
      const user = usersDB.getByEmail(email);
      if (!user) {
        return { success: false, message: 'Utilisateur introuvable' };
      }

      // Ne pas permettre la suppression du compte admin par défaut
      if (email === 'admin@realtranslate.com') {
        return { success: false, message: 'Impossible de supprimer le compte administrateur principal' };
      }

      // Supprimer de la base de données
      usersDB.delete(email);

      // Révoquer tous les tokens de cet utilisateur
      const tokensToRevoke = Object.keys(this.tokens).filter(
        token => this.tokens[token].email === email
      );
      tokensToRevoke.forEach(token => delete this.tokens[token]);

      logger.info('User deleted', { email });
      return { success: true, message: 'Utilisateur supprimé' };
    } catch (error) {
      logger.error('Error deleting user', { error: error.message, email });
      return { success: false, message: 'Erreur lors de la suppression' };
    }
  }

  updateUserRole(email, newRole) {
    try {
      const user = usersDB.getByEmail(email);
      if (!user) {
        return { success: false, message: 'Utilisateur introuvable' };
      }

      // Valider le rôle
      if (!Object.values(ROLES).includes(newRole)) {
        return { success: false, message: 'Rôle invalide' };
      }

      // Ne pas permettre de retirer le rôle admin du compte principal
      if (email === 'admin@realtranslate.com' && newRole !== ROLES.ADMIN) {
        return { success: false, message: 'Impossible de modifier le rôle du compte administrateur principal' };
      }

      // Mettre à jour le rôle
      usersDB.update(email, { role: newRole });

      logger.info('User role updated', { email, newRole });
      return {
        success: true,
        message: 'Rôle mis à jour',
        user: this.users[email]
      };
    } catch (error) {
      logger.error('Error updating user role', { error: error.message, email, newRole });
      return { success: false, message: 'Erreur lors de la mise à jour du rôle' };
    }
  }

  revokeToken(token) {
    if (this.tokens[token]) {
      delete this.tokens[token];
      logger.info('Token revoked', { token: token.substring(0, 10) + '...' });
      return true;
    }
    return false;
  }

  resetQuotas(tier) {
    const tierData = SUBSCRIPTION_TIERS[tier.toUpperCase()];
    if (!tierData) return {};

    return {
      transcribe: { used: 0, limit: tierData.quotas.transcribe, resetAt: this.getNextDayTimestamp() },
      translate: { used: 0, limit: tierData.quotas.translate, resetAt: this.getNextDayTimestamp() },
      speak: { used: 0, limit: tierData.quotas.speak, resetAt: this.getNextDayTimestamp() }
    };
  }

  getNextDayTimestamp() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.toISOString();
  }

  consumeQuota(email, action) {
    const user = usersDB.getByEmail(email);
    if (!user) {
      return { allowed: false, message: 'Utilisateur introuvable' };
    }

    // Obtenir le tier de l'utilisateur
    const tierKey = (user.subscription_tier || 'free').toUpperCase();
    const tier = SUBSCRIPTION_TIERS[tierKey];

    if (!tier) {
      return { allowed: false, message: 'Tier invalide' };
    }

    // Quota illimité
    if (tier.quotas[action] === -1) {
      this.incrementQuota(email, action);
      return { allowed: true, remaining: -1 };
    }

    // Récupérer l'usage actuel
    let quotaUsage = this.quotaUsageStore.get(email);
    if (!quotaUsage) {
      quotaUsage = { transcribe: 0, translate: 0, speak: 0 };
      this.quotaUsageStore.set(email, quotaUsage);
    }

    const currentUsage = quotaUsage[action] || 0;
    const limit = tier.quotas[action];

    // Vérifier si quota dépassé
    if (currentUsage >= limit) {
      return {
        allowed: false,
        message: `Quota ${action} dépassé (${currentUsage}/${limit})`,
        resetAt: this.getNextDayTimestamp()
      };
    }

    // Consommer le quota
    this.incrementQuota(email, action);

    return {
      allowed: true,
      remaining: limit - currentUsage - 1,
      resetAt: this.getNextDayTimestamp()
    };
  }

  getSubscriptionInfo(email) {
    const user = usersDB.getByEmail(email);
    if (!user) {
      return null;
    }

    const tierKey = (user.subscription_tier || 'free').toUpperCase();
    const tier = SUBSCRIPTION_TIERS[tierKey];
    const quotaUsage = this.quotaUsageStore.get(email) || { transcribe: 0, translate: 0, speak: 0 };

    return {
      tier: user.subscription_tier || 'free',
      status: user.subscription_status || 'active',
      expiresAt: user.subscription_expires_at,
      quotas: {
        transcribe: { used: quotaUsage.transcribe || 0, limit: tier?.quotas?.transcribe || 50, resetAt: this.getNextDayTimestamp() },
        translate: { used: quotaUsage.translate || 0, limit: tier?.quotas?.translate || 100, resetAt: this.getNextDayTimestamp() },
        speak: { used: quotaUsage.speak || 0, limit: tier?.quotas?.speak || 50, resetAt: this.getNextDayTimestamp() }
      }
    };
  }

  getFriends(userEmail) {
    const user = usersDB.getByEmail(userEmail);

    if (!user) {
      return [];
    }

    const userProxy = this.users[userEmail];
    if (!userProxy.friends || !Array.isArray(userProxy.friends)) {
      return [];
    }

    return userProxy.friends
      .map(friendEmail => {
        const friend = usersDB.getByEmail(friendEmail);
        return friend ? {
          id: friend.email,
          email: friend.email,
          displayName: friend.display_name || friend.email.split('@')[0]
        } : null;
      })
      .filter(friend => friend !== null);
  }

  updateSubscription(email, tier, expiresAt = null) {
    const user = usersDB.getByEmail(email);
    if (!user) {
      return { success: false, message: 'Utilisateur introuvable' };
    }

    const tierData = SUBSCRIPTION_TIERS[tier.toUpperCase()];
    if (!tierData) {
      return { success: false, message: 'Palier d\'abonnement invalide' };
    }

    // Mettre à jour l'abonnement dans la DB
    usersDB.update(email, {
      subscription_tier: tierData.name.toLowerCase(),
      subscription_status: 'active',
      subscription_expires_at: expiresAt
    });

    // Réinitialiser les quotas
    this.quotaUsageStore.set(email, { transcribe: 0, translate: 0, speak: 0 });

    logger.info('Subscription updated', { email, tier: tierData.name, expiresAt });

    return { success: true, user: this.users[email] };
  }

  updateDisplayName(email, newDisplayName) {
    const user = usersDB.getByEmail(email);
    if (!user) {
      return { success: false, message: 'Utilisateur introuvable' };
    }

    // Validation du displayName
    if (!newDisplayName || newDisplayName.trim().length < 2) {
      return { success: false, message: 'Le nom doit contenir au moins 2 caractères' };
    }

    if (newDisplayName.trim().length > 50) {
      return { success: false, message: 'Le nom ne peut pas dépasser 50 caractères' };
    }

    usersDB.update(email, {
      display_name: newDisplayName.trim()
    });

    logger.info('DisplayName updated', { email, newDisplayName });

    return { success: true, displayName: newDisplayName.trim() };
  }

  searchUsersByDisplayName(searchTerm) {
    if (!searchTerm || searchTerm.trim().length < 2) {
      return [];
    }

    const allUsers = usersDB.getAll();
    const exactMatch = allUsers.filter(user => {
      const displayName = user.display_name || user.email.split('@')[0];
      return displayName &&
        displayName.toLowerCase() === searchTerm.trim().toLowerCase() &&
        user.role !== ROLES.GUEST; // Ne pas inclure les invités
    });

    return exactMatch.map(user => ({
      id: user.email,
      email: user.email,
      displayName: user.display_name || user.email.split('@')[0]
    }));
  }

  getFriendRequests(userEmail) {
    const user = usersDB.getByEmail(userEmail);

    if (!user) {
      return [];
    }

    const userProxy = this.users[userEmail];
    if (!userProxy.friendRequests || !Array.isArray(userProxy.friendRequests)) {
      return [];
    }

    return userProxy.friendRequests;
  }

  sendFriendRequest(fromEmail, toEmail) {
    const fromUser = usersDB.getByEmail(fromEmail);
    const toUser = usersDB.getByEmail(toEmail);

    if (!fromUser || !toUser) {
      return { success: false, message: 'Utilisateur introuvable' };
    }

    if (fromEmail === toEmail) {
      return { success: false, message: 'Vous ne pouvez pas vous ajouter vous-même' };
    }

    // Utiliser le proxy pour gérer les arrays
    const fromUserProxy = this.users[fromEmail];
    const toUserProxy = this.users[toEmail];

    // Vérifier si déjà amis
    if (!fromUserProxy.friends) fromUserProxy.friends = [];
    if (!toUserProxy.friends) toUserProxy.friends = [];

    if (fromUserProxy.friends.includes(toEmail)) {
      return { success: false, message: 'Déjà ami avec cet utilisateur' };
    }

    // Vérifier si demande déjà envoyée
    if (!toUserProxy.friendRequests) toUserProxy.friendRequests = [];

    const existingRequest = toUserProxy.friendRequests.find(req => req.from === fromEmail);
    if (existingRequest) {
      return { success: false, message: 'Demande d\'ami déjà envoyée' };
    }

    // Ajouter la demande
    toUserProxy.friendRequests.push({
      from: fromEmail,
      fromDisplayName: fromUser.display_name || fromEmail.split('@')[0],
      sentAt: new Date().toISOString()
    });

    logger.info('Friend request sent', { from: fromEmail, to: toEmail });

    return { success: true, message: 'Demande envoyée' };
  }

  acceptFriendRequest(userEmail, fromEmail) {
    const user = usersDB.getByEmail(userEmail);
    const fromUser = usersDB.getByEmail(fromEmail);

    if (!user || !fromUser) {
      return { success: false, message: 'Utilisateur introuvable' };
    }

    const userProxy = this.users[userEmail];
    const fromUserProxy = this.users[fromEmail];

    if (!userProxy.friendRequests) userProxy.friendRequests = [];

    const requestIndex = userProxy.friendRequests.findIndex(req => req.from === fromEmail);
    if (requestIndex === -1) {
      return { success: false, message: 'Demande d\'ami introuvable' };
    }

    // Retirer la demande
    userProxy.friendRequests.splice(requestIndex, 1);

    // Ajouter comme amis mutuellement
    if (!userProxy.friends) userProxy.friends = [];
    if (!fromUserProxy.friends) fromUserProxy.friends = [];

    if (!userProxy.friends.includes(fromEmail)) {
      userProxy.friends.push(fromEmail);
    }
    if (!fromUserProxy.friends.includes(userEmail)) {
      fromUserProxy.friends.push(userEmail);
    }

    logger.info('Friend request accepted', { user: userEmail, from: fromEmail });

    return { success: true, message: 'Demande acceptée' };
  }

  rejectFriendRequest(userEmail, fromEmail) {
    const user = usersDB.getByEmail(userEmail);

    if (!user) {
      return { success: false, message: 'Utilisateur introuvable' };
    }

    const userProxy = this.users[userEmail];
    if (!userProxy.friendRequests) userProxy.friendRequests = [];

    const requestIndex = userProxy.friendRequests.findIndex(req => req.from === fromEmail);
    if (requestIndex === -1) {
      return { success: false, message: 'Demande d\'ami introuvable' };
    }

    userProxy.friendRequests.splice(requestIndex, 1);
    logger.info('Friend request rejected', { user: userEmail, from: fromEmail });

    return { success: true, message: 'Demande refusée' };
  }

  removeFriend(userEmail, friendEmail) {
    const user = usersDB.getByEmail(userEmail);
    const friend = usersDB.getByEmail(friendEmail);

    if (!user || !friend) {
      return { success: false, message: 'Utilisateur introuvable' };
    }

    const userProxy = this.users[userEmail];
    const friendProxy = this.users[friendEmail];

    if (!userProxy.friends) userProxy.friends = [];
    if (!friendProxy.friends) friendProxy.friends = [];

    // Retirer mutuellement
    userProxy.friends = userProxy.friends.filter(f => f !== friendEmail);
    friendProxy.friends = friendProxy.friends.filter(f => f !== userEmail);

    logger.info('Friend removed', { user: userEmail, friend: friendEmail });

    return { success: true, message: 'Ami supprimé' };
  }
}

// Créer une instance unique
const authManager = new AuthManagerSQLite();

// Middleware d'authentification
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  const token = authHeader.substring(7);
  const result = authManager.verifyToken(token);

  if (!result.success) {
    return res.status(401).json({ error: result.message });
  }

  req.user = result.user;
  next();
}

// Middleware pour vérifier une permission
function requirePermission(permission) {
  return (req, res, next) => {
    if (!authManager.hasPermission(req.user, permission)) {
      return res.status(403).json({ error: 'Permission refusée' });
    }
    next();
  };
}

// Middleware pour vérifier le rôle admin
function requireAdmin(req, res, next) {
  if (req.user.role !== ROLES.ADMIN) {
    return res.status(403).json({ error: 'Accès admin requis' });
  }
  next();
}

export {
  authManager,
  authMiddleware,
  requirePermission,
  requireAdmin,
  PERMISSIONS
};

export default authManager;
