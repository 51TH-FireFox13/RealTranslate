/**
 * Version SQLite d'AuthManager
 * Remplace le stockage JSON par SQLite
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { usersDB, tokensDB, friendsDB, groupsDB, archivedDB, quotasDB } from './database.js';
import { logger } from './utils/logger.js';

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

        // Récupérer quotaUsage depuis la DB
        const quotaData = quotasDB.get(email);
        const quotaUsage = quotaData ? {
          transcribe: quotaData.transcribe_used,
          translate: quotaData.translate_used,
          speak: quotaData.speak_used
        } : { transcribe: 0, translate: 0, speak: 0 };

        // Récupérer les amis et demandes d'ami depuis la DB
        const friends = friendsDB.getFriends(email).map(f => f.email);
        const friendRequests = friendsDB.getFriendRequests(email).map(req => ({
          from: req.from_email,
          fromDisplayName: req.fromDisplayName,
          sentAt: new Date(req.sentAt * 1000).toISOString()
        }));

        // Récupérer les groupes depuis la DB (via group_members)
        const userGroups = groupsDB.getByUser(email).map(g => g.id);

        // Récupérer les archives depuis la DB
        const archivedGroups = archivedDB.getArchived(email, 'group');
        const archivedDMs = archivedDB.getArchived(email, 'dm');

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
          historyEncrypted: user.history_encrypted,
          preferredLanguage: user.preferred_language || 'en',
          createdAt: user.created_at,
          // Propriétés calculées depuis la DB (read-only)
          groups: userGroups,
          friends: friends,
          friendRequests: friendRequests,
          archivedGroups: archivedGroups,
          archivedDMs: archivedDMs,
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
            if (value.historyEncrypted !== undefined) updates.history_encrypted = value.historyEncrypted;

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
    // Utiliser bcrypt avec 10 rounds (bon compromis sécurité/performance)
    return bcrypt.hashSync(password, 10);
  }

  async hashPasswordAsync(password) {
    // Version async pour les nouvelles créations
    return bcrypt.hash(password, 10);
  }

  verifyPassword(password, hash) {
    // Support legacy SHA256 pour migration progressive
    if (hash.length === 64 && /^[a-f0-9]+$/.test(hash)) {
      // C'est probablement un hash SHA256 legacy
      logger.warn('Legacy SHA256 hash detected - user should change password');
      return crypto.createHash('sha256').update(password).digest('hex') === hash;
    }
    // Hash bcrypt
    return bcrypt.compareSync(password, hash);
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

    // Utiliser verifyPassword qui supporte bcrypt + legacy SHA256
    if (!this.verifyPassword(password, user.password)) {
      return { success: false, message: 'Mot de passe incorrect' };
    }

    logger.info('User verified', { email });
    // Retourner l'utilisateur via le proxy pour compatibilité
    return { success: true, user: this.sanitizeUser(this.users[email]) };
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
      user: this.sanitizeUser(result.user),
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

    return { success: true, user: this.sanitizeUser(this.users[tokenData.email]) };
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
    const user = usersDB.getByEmail(email);
    if (!user) return;

    // Incrémenter dans la DB
    quotasDB.increment(email, action);
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
        user: this.sanitizeUser(this.users[email])
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

    // Récupérer l'usage actuel depuis la DB
    const quotaData = quotasDB.getOrCreate(email);
    const actionMap = {
      transcribe: 'transcribe_used',
      translate: 'translate_used',
      speak: 'speak_used'
    };
    const currentUsage = quotaData[actionMap[action]] || 0;
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

    // Récupérer quotas depuis la DB
    const quotaData = quotasDB.getOrCreate(email);
    const quotaUsage = {
      transcribe: quotaData.transcribe_used || 0,
      translate: quotaData.translate_used || 0,
      speak: quotaData.speak_used || 0
    };

    return {
      tier: user.subscription_tier || 'free',
      status: user.subscription_status || 'active',
      expiresAt: user.subscription_expires_at,
      quotas: {
        transcribe: { used: quotaUsage.transcribe, limit: tier?.quotas?.transcribe || 50, resetAt: this.getNextDayTimestamp() },
        translate: { used: quotaUsage.translate, limit: tier?.quotas?.translate || 100, resetAt: this.getNextDayTimestamp() },
        speak: { used: quotaUsage.speak, limit: tier?.quotas?.speak || 50, resetAt: this.getNextDayTimestamp() }
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

    // Réinitialiser les quotas dans la DB
    quotasDB.reset(email);

    logger.info('Subscription updated', { email, tier: tierData.name, expiresAt });

    return { success: true, user: this.sanitizeUser(this.users[email]) };
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

  updateLanguagePreference(email, language) {
    const user = usersDB.getByEmail(email);
    if (!user) {
      return { success: false, message: 'Utilisateur introuvable' };
    }

    // Validation de la langue (codes ISO 639-1)
    if (!language || language.trim().length < 2) {
      return { success: false, message: 'Code de langue invalide' };
    }

    usersDB.update(email, {
      preferred_language: language.trim().toLowerCase()
    });

    logger.info('Language preference updated', { email, language });

    return { success: true, language: language.trim().toLowerCase() };
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

    // Vérifier si déjà amis
    if (friendsDB.areFriends(fromEmail, toEmail)) {
      return { success: false, message: 'Déjà ami avec cet utilisateur' };
    }

    // Vérifier si demande déjà envoyée
    const existingRequest = friendsDB.checkExistingRequest(fromEmail, toEmail);
    if (existingRequest) {
      return { success: false, message: 'Demande d\'ami déjà envoyée' };
    }

    // CORRECTION: Vérifier si demande croisée (TO a déjà envoyé une demande à FROM)
    const crossRequest = friendsDB.checkCrossRequest(fromEmail, toEmail);
    if (crossRequest) {
      // Demande croisée détectée : les deux veulent être amis
      // Accepter automatiquement les deux demandes
      friendsDB.acceptFriendRequest(fromEmail, toEmail);

      logger.info('Friend request auto-accepted (cross-request)', { from: fromEmail, to: toEmail });

      return { success: true, message: 'Demande acceptée automatiquement', autoAccepted: true };
    }

    // Ajouter la demande
    friendsDB.addFriendRequest(fromEmail, toEmail);

    logger.info('Friend request sent', { from: fromEmail, to: toEmail });

    return { success: true, message: 'Demande envoyée' };
  }

  acceptFriendRequest(userEmail, fromEmail) {
    const user = usersDB.getByEmail(userEmail);
    const fromUser = usersDB.getByEmail(fromEmail);

    if (!user || !fromUser) {
      return { success: false, message: 'Utilisateur introuvable' };
    }

    // Vérifier que la demande existe
    const userProxy = this.users[userEmail];
    const requestExists = userProxy.friendRequests.find(req => req.from === fromEmail);

    if (!requestExists) {
      return { success: false, message: 'Demande d\'ami introuvable' };
    }

    // Accepter la demande (supprime la demande et crée la relation mutuelle)
    friendsDB.acceptFriendRequest(userEmail, fromEmail);

    logger.info('Friend request accepted', { user: userEmail, from: fromEmail });

    return { success: true, message: 'Demande acceptée' };
  }

  rejectFriendRequest(userEmail, fromEmail) {
    const user = usersDB.getByEmail(userEmail);

    if (!user) {
      return { success: false, message: 'Utilisateur introuvable' };
    }

    // Vérifier que la demande existe
    const userProxy = this.users[userEmail];
    const requestExists = userProxy.friendRequests.find(req => req.from === fromEmail);

    if (!requestExists) {
      return { success: false, message: 'Demande d\'ami introuvable' };
    }

    // Rejeter la demande
    friendsDB.rejectFriendRequest(userEmail, fromEmail);
    logger.info('Friend request rejected', { user: userEmail, from: fromEmail });

    return { success: true, message: 'Demande refusée' };
  }

  removeFriend(userEmail, friendEmail) {
    const user = usersDB.getByEmail(userEmail);
    const friend = usersDB.getByEmail(friendEmail);

    if (!user || !friend) {
      return { success: false, message: 'Utilisateur introuvable' };
    }

    // Vérifier qu'ils sont bien amis
    if (!friendsDB.areFriends(userEmail, friendEmail)) {
      return { success: false, message: 'Vous n\'êtes pas ami avec cet utilisateur' };
    }

    // Supprimer la relation d'ami (mutuelle)
    friendsDB.removeFriend(userEmail, friendEmail);

    logger.info('Friend removed', { user: userEmail, friend: friendEmail });

    return { success: true, message: 'Ami supprimé' };
  }

  // ===================================
  // Access Tokens (jetons d'accès invités)
  // ===================================

  generateAccessToken(subscriptionTier = 'free', expiresInDays = 30, maxUses = 1, description = '') {
    const token = `AT-${crypto.randomBytes(16).toString('hex')}`;

    const tokenData = {
      token,
      tier: subscriptionTier,
      maxUses,
      description,
      expiresAt: Math.floor(Date.now() / 1000) + (expiresInDays * 24 * 60 * 60)
    };

    tokensDB.create(tokenData);
    logger.info('Access token generated', { tier: subscriptionTier, maxUses });

    return {
      token,
      tier: subscriptionTier,
      maxUses,
      usedCount: 0,
      description,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(tokenData.expiresAt * 1000).toISOString(),
      status: 'active'
    };
  }

  authenticateWithAccessToken(accessToken) {
    const tokenData = tokensDB.getByToken(accessToken);

    if (!tokenData) {
      logger.info('Access token login failed - token not found');
      return { success: false, message: 'Jeton d\'accès invalide' };
    }

    // Vérifier le statut
    if (tokenData.status !== 'active') {
      logger.info('Access token login failed - token inactive', { status: tokenData.status });
      return { success: false, message: 'Jeton d\'accès désactivé' };
    }

    // Vérifier l'expiration
    const now = Math.floor(Date.now() / 1000);
    if (tokenData.expires_at && tokenData.expires_at < now) {
      tokensDB.updateStatus(accessToken, 'expired');
      logger.info('Access token login failed - token expired');
      return { success: false, message: 'Jeton d\'accès expiré' };
    }

    // Vérifier le nombre d'utilisations
    if (tokenData.current_uses >= tokenData.max_uses) {
      tokensDB.updateStatus(accessToken, 'exhausted');
      logger.info('Access token login failed - max uses reached');
      return { success: false, message: 'Jeton d\'accès déjà utilisé (limite atteinte)' };
    }

    // Créer un utilisateur temporaire
    const tempUserId = `guest-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const tempUser = {
      id: tempUserId,
      email: `${tempUserId}@guest.realtranslate.com`,
      role: ROLES.GUEST,
      subscription_tier: tokenData.tier,
      subscription_status: 'active',
      display_name: `Invité ${tokenData.tier}`,
      accessTokenUsed: accessToken,
      created_at: new Date().toISOString()
    };

    // Incrémenter l'utilisation
    tokensDB.incrementUse(accessToken);

    // Marquer comme épuisé si limite atteinte
    if (tokenData.current_uses + 1 >= tokenData.max_uses) {
      tokensDB.updateStatus(accessToken, 'exhausted');
    }

    // Générer un token de session classique pour cet utilisateur temporaire
    const sessionToken = this.generateToken();
    this.tokens[sessionToken] = {
      email: tempUser.email,
      role: tempUser.role,
      tier: tokenData.tier,
      createdAt: Date.now(),
      isGuest: true
    };

    logger.info('Access token login success', { userId: tempUserId, tier: tokenData.tier });

    return {
      success: true,
      token: sessionToken,
      user: this.sanitizeUser(tempUser)
    };
  }

  listAccessTokens() {
    const allTokens = tokensDB.getAll();
    const now = Math.floor(Date.now() / 1000);

    return allTokens.map(token => {
      // Dériver le status si nécessaire
      let status = token.status || 'active';
      if (status === 'active') {
        if (token.expires_at && token.expires_at < now) {
          status = 'expired';
        } else if (token.current_uses >= token.max_uses) {
          status = 'exhausted';
        }
      }

      return {
        token: token.token,
        tier: token.tier,
        maxUses: token.max_uses,
        usedCount: token.current_uses,
        description: token.description,
        status,
        createdAt: new Date(token.created_at * 1000).toISOString(),
        expiresAt: token.expires_at ? new Date(token.expires_at * 1000).toISOString() : null
      };
    });
  }

  revokeAccessToken(accessToken) {
    const tokenData = tokensDB.getByToken(accessToken);
    if (tokenData) {
      tokensDB.updateStatus(accessToken, 'revoked');
      logger.info('Access token revoked', { token: accessToken });
      return { success: true, message: 'Jeton révoqué' };
    }
    return { success: false, message: 'Jeton introuvable' };
  }

  sanitizeUser(user) {
    // Enlever les champs sensibles avant de retourner au client
    const { passwordHash, password, ...sanitized } = user;
    return sanitized;
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
