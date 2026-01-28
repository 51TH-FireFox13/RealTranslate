import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Fichier de stockage des utilisateurs et tokens
const USERS_FILE = path.join(__dirname, 'users.json');
const TOKENS_FILE = path.join(__dirname, 'tokens.json');
const ACCESS_TOKENS_FILE = path.join(__dirname, 'access-tokens.json');

// Rôles disponibles
const ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  GUEST: 'guest'
};

// Paliers d'abonnement
const SUBSCRIPTION_TIERS = {
  FREE: {
    name: 'free',
    displayName: 'Gratuit',
    price: 0,
    billingPeriod: 'monthly',  // Quotas mensuels (non quotidiens)
    quotas: {
      transcribe: 50,     // 50 transcriptions/mois (~1.7/jour) - Réduit pour viabilité
      translate: 250,     // 250 traductions/mois (~8/jour) - Réduit pour viabilité
      speak: 50           // 50 TTS/mois (~1.7/jour) - Réduit pour viabilité
    }
  },
  PREMIUM: {
    name: 'premium',
    displayName: 'Premium',
    price: 9.99,
    billingPeriod: 'monthly',
    quotas: {
      transcribe: 500,    // 500 transcriptions/mois (~17/jour) - Marge ~70%
      translate: 2500,    // 2500 traductions/mois (~83/jour) - Marge ~70%
      speak: 500          // 500 TTS/mois (~17/jour) - Marge ~70%
    }
  },
  ENTERPRISE: {
    name: 'enterprise',
    displayName: 'Enterprise',
    price: 49.99,
    billingPeriod: 'monthly',
    quotas: {
      transcribe: 5000,   // 5000 transcriptions/mois (~167/jour) - Marge ~70%
      translate: 25000,   // 25000 traductions/mois (~833/jour) - Marge ~70%
      speak: 5000         // 5000 TTS/mois (~167/jour) - Marge ~70%
    }
  },
  ADMIN: {
    name: 'admin',
    displayName: 'Admin',
    price: 0,  // Non vendu publiquement
    billingPeriod: 'monthly',
    quotas: {
      transcribe: -1,    // Illimité
      translate: -1,     // Illimité
      speak: -1          // Illimité
    }
  }
};

// Permissions par rôle
const PERMISSIONS = {
  admin: ['*'], // Toutes les permissions
  user: ['transcribe', 'translate', 'speak'],
  guest: ['translate'] // Seulement traduction
};

// Classe de gestion des utilisateurs
class AuthManager {
  constructor() {
    this.users = this.loadUsers();
    this.tokens = this.loadTokens();
    this.accessTokens = this.loadAccessTokens();
  }

  // Charger les utilisateurs
  loadUsers() {
    try {
      if (fs.existsSync(USERS_FILE)) {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('Erreur chargement users', error);
    }

    // Créer un utilisateur admin par défaut
    const defaultUsers = {
      'admin': {
        id: 'admin',
        email: 'admin@realtranslate.com',
        displayName: 'Administrator',
        passwordHash: this.hashPassword('admin123'), // Mot de passe par défaut à changer
        role: ROLES.ADMIN,
        createdAt: new Date().toISOString()
      }
    };

    this.saveUsers(defaultUsers);
    return defaultUsers;
  }

  // Charger les tokens
  loadTokens() {
    try {
      if (fs.existsSync(TOKENS_FILE)) {
        const data = fs.readFileSync(TOKENS_FILE, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('Erreur chargement tokens', error);
    }
    return {};
  }

  // Charger les jetons d'accès à usage unique
  loadAccessTokens() {
    try {
      if (fs.existsSync(ACCESS_TOKENS_FILE)) {
        const data = fs.readFileSync(ACCESS_TOKENS_FILE, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('Erreur chargement access tokens', error);
    }
    return {};
  }

  // Sauvegarder les utilisateurs
  saveUsers(users = this.users) {
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (error) {
      logger.error('Erreur sauvegarde users', error);
    }
  }

  // Sauvegarder les tokens
  saveTokens(tokens = this.tokens) {
    try {
      fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
    } catch (error) {
      logger.error('Erreur sauvegarde tokens', error);
    }
  }

  // Sauvegarder les jetons d'accès
  saveAccessTokens(accessTokens = this.accessTokens) {
    try {
      fs.writeFileSync(ACCESS_TOKENS_FILE, JSON.stringify(accessTokens, null, 2));
    } catch (error) {
      logger.error('Erreur sauvegarde access tokens', error);
    }
  }

  // Hasher un mot de passe
  hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  // Générer un token aléatoire
  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Créer un utilisateur
  createUser(email, password, role = ROLES.USER, subscriptionTier = 'free', displayName = null) {
    if (this.users[email]) {
      return { success: false, message: 'Utilisateur existe déjà' };
    }

    const user = {
      id: email,
      email,
      displayName: displayName || email.split('@')[0], // Par défaut: partie avant @ de l'email
      passwordHash: this.hashPassword(password),
      role,
      subscription: {
        tier: subscriptionTier,
        status: 'active',
        expiresAt: null, // null = pas d'expiration (pour free)
        quotas: this.resetQuotas(subscriptionTier)
      },
      friends: [], // Liste des amis (user IDs)
      friendRequests: [], // Demandes d'amis reçues
      groups: [], // Liste des groupes (group IDs)
      paymentHistory: [],
      createdAt: new Date().toISOString()
    };

    this.users[email] = user;
    this.saveUsers();

    logger.auth('User created', email, true, { role, subscription: subscriptionTier });
    return { success: true, user: this.sanitizeUser(user) };
  }

  // Réinitialiser les quotas utilisateur (quotas journaliers)
  resetQuotas(tier) {
    const tierData = SUBSCRIPTION_TIERS[tier.toUpperCase()];
    if (!tierData) return {};

    return {
      transcribe: { used: 0, limit: tierData.quotas.transcribe, resetAt: this.getNextDayTimestamp() },
      translate: { used: 0, limit: tierData.quotas.translate, resetAt: this.getNextDayTimestamp() },
      speak: { used: 0, limit: tierData.quotas.speak, resetAt: this.getNextDayTimestamp() }
    };
  }

  // Obtenir le timestamp de minuit prochain
  getNextDayTimestamp() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.toISOString();
  }

  // Nettoyer les données utilisateur (enlever le hash de mot de passe)
  sanitizeUser(user) {
    const { passwordHash, ...sanitized } = user;
    return sanitized;
  }

  // Authentifier un utilisateur
  authenticate(email, password) {
    const user = this.users[email];

    if (!user) {
      logger.auth('Login failed', email, false, { reason: 'User not found' });
      return { success: false, message: 'Identifiants invalides' };
    }

    const passwordHash = this.hashPassword(password);
    if (user.passwordHash !== passwordHash) {
      logger.auth('Login failed', email, false, { reason: 'Invalid password' });
      return { success: false, message: 'Identifiants invalides' };
    }

    // Générer un token
    const token = this.generateToken();
    this.tokens[token] = {
      userId: user.id,
      email: user.email,
      role: user.role,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 jours
    };

    this.saveTokens();
    logger.auth('Login success', email, true, { role: user.role });

    return {
      success: true,
      token,
      user: { id: user.id, email: user.email, role: user.role }
    };
  }

  // Vérifier un token
  verifyToken(token) {
    const tokenData = this.tokens[token];

    if (!tokenData) {
      return null;
    }

    // Vérifier l'expiration
    if (new Date(tokenData.expiresAt) < new Date()) {
      delete this.tokens[token];
      this.saveTokens();
      return null;
    }

    return tokenData;
  }

  // Révoquer un token
  revokeToken(token) {
    if (this.tokens[token]) {
      const userId = this.tokens[token].userId;
      delete this.tokens[token];
      this.saveTokens();
      logger.auth('Token revoked', userId, true);
      return true;
    }
    return false;
  }

  // Vérifier les permissions
  hasPermission(role, action) {
    const rolePermissions = PERMISSIONS[role] || [];
    return rolePermissions.includes('*') || rolePermissions.includes(action);
  }

  // Supprimer un utilisateur
  deleteUser(email) {
    if (email === 'admin') {
      return { success: false, message: 'Impossible de supprimer l\'admin' };
    }

    if (this.users[email]) {
      delete this.users[email];
      this.saveUsers();

      // Révoquer tous les tokens de l'utilisateur
      Object.keys(this.tokens).forEach(token => {
        if (this.tokens[token].email === email) {
          delete this.tokens[token];
        }
      });
      this.saveTokens();

      logger.auth('User deleted', email, true);
      return { success: true };
    }

    return { success: false, message: 'Utilisateur introuvable' };
  }

  // Lister tous les utilisateurs
  listUsers() {
    return Object.values(this.users).map(user => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0],
      role: user.role,
      subscription: user.subscription || { tier: 'free', status: 'active' },
      createdAt: user.createdAt
    }));
  }

  // Vérifier et consommer un quota
  consumeQuota(email, action) {
    const user = this.users[email];
    if (!user) {
      return { allowed: false, message: 'Utilisateur introuvable' };
    }

    // Vérifier si les quotas doivent être réinitialisés
    const now = new Date();
    const quota = user.subscription?.quotas?.[action];

    if (!quota) {
      // Pas de quota défini, on initialise
      if (!user.subscription) {
        user.subscription = {
          tier: 'free',
          status: 'active',
          expiresAt: null,
          quotas: this.resetQuotas('free')
        };
      } else if (!user.subscription.quotas) {
        user.subscription.quotas = this.resetQuotas(user.subscription.tier);
      }
    }

    // Réinitialiser si nécessaire
    const actionQuota = user.subscription.quotas[action];
    if (actionQuota && new Date(actionQuota.resetAt) < now) {
      const tierData = SUBSCRIPTION_TIERS[user.subscription.tier.toUpperCase()];
      user.subscription.quotas[action] = {
        used: 0,
        limit: tierData.quotas[action],
        resetAt: this.getNextDayTimestamp()
      };
    }

    const currentQuota = user.subscription.quotas[action];

    // Quota illimité (-1)
    if (currentQuota.limit === -1) {
      currentQuota.used++;
      this.saveUsers();
      return { allowed: true, remaining: -1 };
    }

    // Vérifier si quota dépassé
    if (currentQuota.used >= currentQuota.limit) {
      return {
        allowed: false,
        message: `Quota ${action} dépassé (${currentQuota.limit}/${currentQuota.limit})`,
        resetAt: currentQuota.resetAt
      };
    }

    // Consommer le quota
    currentQuota.used++;
    this.saveUsers();

    return {
      allowed: true,
      remaining: currentQuota.limit - currentQuota.used,
      resetAt: currentQuota.resetAt
    };
  }

  // Mettre à jour l'abonnement d'un utilisateur
  updateSubscription(email, tier, expiresAt = null) {
    const user = this.users[email];
    if (!user) {
      return { success: false, message: 'Utilisateur introuvable' };
    }

    const tierData = SUBSCRIPTION_TIERS[tier.toUpperCase()];
    if (!tierData) {
      return { success: false, message: 'Palier d\'abonnement invalide' };
    }

    user.subscription = {
      tier: tierData.name,
      status: 'active',
      expiresAt: expiresAt,
      quotas: this.resetQuotas(tierData.name)
    };

    // Ajouter à l'historique de paiement
    if (!user.paymentHistory) {
      user.paymentHistory = [];
    }

    user.paymentHistory.push({
      tier: tierData.name,
      price: tierData.price,
      paidAt: new Date().toISOString(),
      expiresAt: expiresAt
    });

    this.saveUsers();
    logger.auth('Subscription updated', email, true, { tier: tierData.name });

    return { success: true, user: this.sanitizeUser(user) };
  }

  // Obtenir les informations d'abonnement
  getSubscriptionInfo(email) {
    const user = this.users[email];
    if (!user) {
      return null;
    }

    return {
      tier: user.subscription?.tier || 'free',
      status: user.subscription?.status || 'active',
      expiresAt: user.subscription?.expiresAt,
      quotas: user.subscription?.quotas || this.resetQuotas('free')
    };
  }

  // ===================================
  // SYSTÈME DE JETONS D'ACCÈS (ONE-TIME USE)
  // ===================================

  // Générer un jeton d'accès à usage unique
  generateAccessToken(subscriptionTier = 'free', expiresInDays = 30, maxUses = 1, description = '') {
    const token = `AT-${crypto.randomBytes(16).toString('hex')}`;

    this.accessTokens[token] = {
      token,
      tier: subscriptionTier,
      maxUses,
      usedCount: 0,
      description,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
      status: 'active',
      usedBy: [] // Liste des utilisateurs qui ont utilisé ce token
    };

    this.saveAccessTokens();
    logger.auth('Access token generated', 'system', true, { tier: subscriptionTier, maxUses });

    return this.accessTokens[token];
  }

  // Authentifier avec un jeton d'accès
  authenticateWithAccessToken(accessToken) {
    const tokenData = this.accessTokens[accessToken];

    if (!tokenData) {
      logger.auth('Access token login failed', 'unknown', false, { reason: 'Token not found' });
      return { success: false, message: 'Jeton d\'accès invalide' };
    }

    // Vérifier le statut
    if (tokenData.status !== 'active') {
      logger.auth('Access token login failed', 'unknown', false, { reason: 'Token inactive' });
      return { success: false, message: 'Jeton d\'accès désactivé' };
    }

    // Vérifier l'expiration
    if (new Date(tokenData.expiresAt) < new Date()) {
      tokenData.status = 'expired';
      this.saveAccessTokens();
      logger.auth('Access token login failed', 'unknown', false, { reason: 'Token expired' });
      return { success: false, message: 'Jeton d\'accès expiré' };
    }

    // Vérifier le nombre d'utilisations
    if (tokenData.usedCount >= tokenData.maxUses) {
      tokenData.status = 'exhausted';
      this.saveAccessTokens();
      logger.auth('Access token login failed', 'unknown', false, { reason: 'Max uses reached' });
      return { success: false, message: 'Jeton d\'accès déjà utilisé (limite atteinte)' };
    }

    // Créer un utilisateur temporaire
    const tempUserId = `guest-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const tempUser = {
      id: tempUserId,
      email: `${tempUserId}@guest.realtranslate.com`,
      role: ROLES.GUEST,
      subscription: {
        tier: tokenData.tier,
        status: 'active',
        expiresAt: tokenData.expiresAt,
        quotas: this.resetQuotas(tokenData.tier)
      },
      accessTokenUsed: accessToken,
      createdAt: new Date().toISOString()
    };

    // Enregistrer l'utilisation
    tokenData.usedCount++;
    tokenData.usedBy.push({
      userId: tempUserId,
      usedAt: new Date().toISOString()
    });

    // Marquer comme épuisé si limite atteinte
    if (tokenData.usedCount >= tokenData.maxUses) {
      tokenData.status = 'exhausted';
    }

    this.saveAccessTokens();

    // Générer un token de session classique pour cet utilisateur temporaire
    const sessionToken = this.generateToken();
    this.tokens[sessionToken] = {
      userId: tempUser.id,
      email: tempUser.email,
      role: tempUser.role,
      tier: tokenData.tier,
      createdAt: new Date().toISOString(),
      expiresAt: tokenData.expiresAt
    };

    this.saveTokens();
    logger.auth('Access token login success', tempUserId, true, { tier: tokenData.tier });

    return {
      success: true,
      token: sessionToken,
      user: {
        id: tempUser.id,
        email: tempUser.email,
        role: tempUser.role,
        subscription: tempUser.subscription
      }
    };
  }

  // Lister tous les jetons d'accès
  listAccessTokens() {
    return Object.values(this.accessTokens).map(token => ({
      token: token.token,
      tier: token.tier,
      maxUses: token.maxUses,
      usedCount: token.usedCount,
      description: token.description,
      status: token.status,
      createdAt: token.createdAt,
      expiresAt: token.expiresAt
    }));
  }

  // Révoquer un jeton d'accès
  revokeAccessToken(accessToken) {
    if (this.accessTokens[accessToken]) {
      this.accessTokens[accessToken].status = 'revoked';
      this.saveAccessTokens();
      logger.auth('Access token revoked', 'admin', true, { token: accessToken });
      return { success: true };
    }
    return { success: false, message: 'Jeton introuvable' };
  }

  // ===================================
  // SYSTÈME DE PROFIL ET AMIS
  // ===================================

  // Mettre à jour le displayName
  updateDisplayName(email, newDisplayName) {
    const user = this.users[email];
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

    user.displayName = newDisplayName.trim();
    this.saveUsers();
    logger.auth('DisplayName updated', email, true, { newDisplayName });

    return { success: true, displayName: user.displayName };
  }

  // Rechercher des utilisateurs par displayName (exact match seulement pour privacy)
  searchUsersByDisplayName(searchTerm) {
    if (!searchTerm || searchTerm.trim().length < 2) {
      return [];
    }

    const exactMatch = Object.values(this.users).filter(user => {
      // Utiliser le même fallback que l'affichage
      const displayName = user.displayName || user.email.split('@')[0];
      return displayName &&
        displayName.toLowerCase() === searchTerm.trim().toLowerCase() &&
        user.role !== ROLES.GUEST; // Ne pas inclure les invités
    });

    return exactMatch.map(user => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0]
    }));
  }

  // Envoyer une demande d'ami
  sendFriendRequest(fromEmail, toEmail) {
    const fromUser = this.users[fromEmail];
    const toUser = this.users[toEmail];

    if (!fromUser || !toUser) {
      return { success: false, message: 'Utilisateur introuvable' };
    }

    if (fromEmail === toEmail) {
      return { success: false, message: 'Vous ne pouvez pas vous ajouter vous-même' };
    }

    // Vérifier si déjà amis
    if (!fromUser.friends) fromUser.friends = [];
    if (!toUser.friends) toUser.friends = [];

    if (fromUser.friends.includes(toEmail)) {
      return { success: false, message: 'Déjà ami avec cet utilisateur' };
    }

    // Vérifier si demande déjà envoyée
    if (!toUser.friendRequests) toUser.friendRequests = [];
    if (!fromUser.friendRequests) fromUser.friendRequests = [];

    const existingRequest = toUser.friendRequests.find(req => req.from === fromEmail);
    if (existingRequest) {
      return { success: false, message: 'Demande d\'ami déjà envoyée' };
    }

    // CORRECTION: Vérifier si demande croisée (TO a déjà envoyé une demande à FROM)
    const crossRequest = fromUser.friendRequests.find(req => req.from === toEmail);
    if (crossRequest) {
      // Demande croisée détectée : les deux veulent être amis
      // Supprimer la demande existante
      fromUser.friendRequests = fromUser.friendRequests.filter(req => req.from !== toEmail);

      // Ajouter comme amis mutuellement
      if (!fromUser.friends.includes(toEmail)) {
        fromUser.friends.push(toEmail);
      }
      if (!toUser.friends.includes(fromEmail)) {
        toUser.friends.push(fromEmail);
      }

      this.saveUsers();
      logger.auth('Friend request auto-accepted (cross-request)', fromEmail, true, { to: toEmail });

      return { success: true, message: 'Demande acceptée automatiquement', autoAccepted: true };
    }

    // Ajouter la demande
    toUser.friendRequests.push({
      from: fromEmail,
      fromDisplayName: fromUser.displayName || fromUser.email.split('@')[0],
      sentAt: new Date().toISOString()
    });

    this.saveUsers();
    logger.auth('Friend request sent', fromEmail, true, { to: toEmail });

    return { success: true, message: 'Demande d\'ami envoyée' };
  }

  // Accepter une demande d'ami
  acceptFriendRequest(userEmail, fromEmail) {
    const user = this.users[userEmail];
    const fromUser = this.users[fromEmail];

    if (!user || !fromUser) {
      return { success: false, message: 'Utilisateur introuvable' };
    }

    if (!user.friendRequests) user.friendRequests = [];

    const requestIndex = user.friendRequests.findIndex(req => req.from === fromEmail);
    if (requestIndex === -1) {
      return { success: false, message: 'Demande d\'ami introuvable' };
    }

    // Retirer la demande
    user.friendRequests.splice(requestIndex, 1);

    // Ajouter comme amis mutuellement
    if (!user.friends) user.friends = [];
    if (!fromUser.friends) fromUser.friends = [];

    if (!user.friends.includes(fromEmail)) {
      user.friends.push(fromEmail);
    }
    if (!fromUser.friends.includes(userEmail)) {
      fromUser.friends.push(userEmail);
    }

    this.saveUsers();
    logger.auth('Friend request accepted', userEmail, true, { from: fromEmail });

    return { success: true, message: 'Ami ajouté' };
  }

  // Rejeter une demande d'ami
  rejectFriendRequest(userEmail, fromEmail) {
    const user = this.users[userEmail];

    if (!user) {
      return { success: false, message: 'Utilisateur introuvable' };
    }

    if (!user.friendRequests) user.friendRequests = [];

    const requestIndex = user.friendRequests.findIndex(req => req.from === fromEmail);
    if (requestIndex === -1) {
      return { success: false, message: 'Demande d\'ami introuvable' };
    }

    user.friendRequests.splice(requestIndex, 1);
    this.saveUsers();
    logger.auth('Friend request rejected', userEmail, true, { from: fromEmail });

    return { success: true, message: 'Demande refusée' };
  }

  // Supprimer un ami
  removeFriend(userEmail, friendEmail) {
    const user = this.users[userEmail];
    const friend = this.users[friendEmail];

    if (!user || !friend) {
      return { success: false, message: 'Utilisateur introuvable' };
    }

    if (!user.friends) user.friends = [];
    if (!friend.friends) friend.friends = [];

    // Retirer mutuellement
    user.friends = user.friends.filter(f => f !== friendEmail);
    friend.friends = friend.friends.filter(f => f !== userEmail);

    this.saveUsers();
    logger.auth('Friend removed', userEmail, true, { friend: friendEmail });

    return { success: true, message: 'Ami supprimé' };
  }

  // Obtenir la liste des amis
  getFriends(userEmail) {
    const user = this.users[userEmail];

    if (!user) {
      return [];
    }

    if (!user.friends) return [];

    return user.friends
      .map(friendEmail => this.users[friendEmail])
      .filter(friend => friend) // Filtrer les amis supprimés
      .map(friend => ({
        id: friend.id,
        email: friend.email,
        displayName: friend.displayName || friend.email.split('@')[0]
      }));
  }

  // Obtenir les demandes d'ami en attente
  getFriendRequests(userEmail) {
    const user = this.users[userEmail];

    if (!user) {
      return [];
    }

    if (!user.friendRequests) return [];

    return user.friendRequests;
  }
}

// Instance globale
const authManager = new AuthManager();

// Middleware d'authentification
function authMiddleware(req, res, next) {
  // Vérifier si l'authentification est désactivée
  const authDisabled = process.env.DISABLE_AUTH === 'true';

  if (authDisabled) {
    req.user = { id: 'anonymous', role: ROLES.ADMIN };
    return next();
  }

  // Récupérer le token
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    logger.auth('Access denied', 'unknown', false, { reason: 'No token' });
    return res.status(401).json({ error: 'Token requis' });
  }

  // Vérifier le token
  const tokenData = authManager.verifyToken(token);
  if (!tokenData) {
    logger.auth('Access denied', 'unknown', false, { reason: 'Invalid token' });
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }

  // Attacher l'utilisateur à la requête
  req.user = {
    id: tokenData.userId,
    email: tokenData.email,
    role: tokenData.role
  };

  next();
}

// Middleware de vérification des permissions
function requirePermission(action) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    if (!authManager.hasPermission(req.user.role, action)) {
      logger.auth('Permission denied', req.user.id, false, { action });
      return res.status(403).json({ error: 'Permission refusée' });
    }

    next();
  };
}

// Middleware pour admin uniquement
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== ROLES.ADMIN) {
    logger.auth('Admin access denied', req.user?.id || 'unknown', false);
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
}

export {
  authManager,
  authMiddleware,
  requirePermission,
  requireAdmin,
  ROLES,
  PERMISSIONS,
  SUBSCRIPTION_TIERS
};
