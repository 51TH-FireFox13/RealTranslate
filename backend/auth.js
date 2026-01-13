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

// Rôles disponibles
const ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  GUEST: 'guest'
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

  // Hasher un mot de passe
  hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  // Générer un token aléatoire
  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Créer un utilisateur
  createUser(email, password, role = ROLES.USER) {
    if (this.users[email]) {
      return { success: false, message: 'Utilisateur existe déjà' };
    }

    const user = {
      id: email,
      email,
      passwordHash: this.hashPassword(password),
      role,
      createdAt: new Date().toISOString()
    };

    this.users[email] = user;
    this.saveUsers();

    logger.auth('User created', email, true, { role });
    return { success: true, user: { id: user.id, email: user.email, role: user.role } };
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
      role: user.role,
      createdAt: user.createdAt
    }));
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
  PERMISSIONS
};
