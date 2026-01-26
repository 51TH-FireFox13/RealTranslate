/**
 * @fileoverview Routes d'authentification et gestion des utilisateurs
 * @module routes/auth
 *
 * Ce module gère toutes les routes liées à :
 * - Authentification (login, register, logout)
 * - Gestion de profil utilisateur
 * - Gestion des abonnements
 * - Jetons d'accès (access tokens)
 * - Logs d'administration
 */

import express from 'express';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';
import {
  authManager,
  authMiddleware,
  requireAdmin,
  ROLES,
  SUBSCRIPTION_TIERS
} from '../auth-sqlite.js';
import { csrfTokenEndpoint } from '../csrf-protection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure les routes d'authentification
 * @param {Object} dependencies - Dépendances injectées
 * @returns {express.Router} Router Express configuré
 */
export default function authRoutes(dependencies = {}) {
  const router = express.Router();

  // ===================================
  // AUTHENTIFICATION DE BASE
  // ===================================

  /**
   * POST /api/auth/login
   * Connexion utilisateur avec email/password ou access token
   */
  router.post('/login', (req, res) => {
    try {
      const { email, password, accessToken } = req.body;

      // Login avec jeton d'accès
      if (accessToken) {
        const result = authManager.authenticateWithAccessToken(accessToken);

        if (!result.success) {
          return res.status(401).json({ error: result.message });
        }

        return res.json({
          success: true,
          token: result.token,
          user: result.user
        });
      }

      // Login classique email/password
      if (!email || !password) {
        return res.status(400).json({ error: 'Email et mot de passe ou jeton d\'accès requis' });
      }

      const result = authManager.authenticate(email, password);

      if (!result.success) {
        return res.status(401).json({ error: result.message });
      }

      res.json({
        success: true,
        token: result.token,
        user: result.user
      });
    } catch (error) {
      logger.error('Login error', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * POST /api/auth/register
   * Inscription d'un nouvel utilisateur
   */
  router.post('/register', (req, res) => {
    try {
      const { email, password, displayName } = req.body;

      // Validation des champs
      if (!email || !password || !displayName) {
        return res.status(400).json({ error: 'Email, mot de passe et nom d\'affichage requis' });
      }

      // Validation de l'email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Format d\'email invalide' });
      }

      // Validation du mot de passe
      if (password.length < 6) {
        return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
      }

      // Créer l'utilisateur avec le rôle USER et le tier FREE par défaut
      const result = authManager.createUser(email, password, ROLES.USER, 'free', displayName);

      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      // Pour l'instant, on marque l'utilisateur comme non vérifié
      // TODO: Envoyer un email de validation
      if (result.user) {
        result.user.emailVerified = false;
      }

      logger.info(`Nouvel utilisateur inscrit: ${email}`);

      res.json({
        success: true,
        message: 'Inscription réussie ! Vous pouvez maintenant vous connecter.',
        user: result.user
      });
    } catch (error) {
      logger.error('Register error', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * POST /api/auth/logout
   * Déconnexion utilisateur (révocation du token)
   */
  router.post('/logout', authMiddleware, (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        authManager.revokeToken(token);
      }
      res.json({ success: true });
    } catch (error) {
      logger.error('Logout error', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * GET /api/auth/me
   * Obtenir les informations de l'utilisateur connecté
   */
  router.get('/me', authMiddleware, (req, res) => {
    const subscriptionInfo = authManager.getSubscriptionInfo(req.user.email);
    res.json({
      user: {
        ...req.user,
        subscription: subscriptionInfo
      }
    });
  });

  /**
   * POST /api/auth/change-password
   * Changer le mot de passe de l'utilisateur connecté
   */
  router.post('/change-password', authMiddleware, (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userEmail = req.user.email;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Mots de passe requis' });
      }

      const user = Object.values(authManager.users).find(u => u.email === userEmail);
      if (!user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }

      // Vérifier que l'utilisateur a un passwordHash (pas un guest)
      if (!user.passwordHash) {
        return res.status(400).json({ error: 'Changement de mot de passe non disponible pour les utilisateurs invités' });
      }

      // Vérifier le mot de passe actuel
      const currentPasswordHash = authManager.hashPassword(currentPassword);
      if (user.passwordHash !== currentPasswordHash) {
        return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
      }

      // IMPORTANT: Supprimer l'historique car le passwordHash change
      // (l'historique est crypté avec une clé dérivée du passwordHash)
      const hadHistory = !!user.historyEncrypted;
      delete user.historyEncrypted;

      // Mettre à jour le mot de passe
      user.passwordHash = authManager.hashPassword(newPassword);

      // Note: saveUsers() est un no-op dans la version SQLite (auto-persisted)
      logger.info(`Mot de passe changé pour ${userEmail}${hadHistory ? ' (historique supprimé)' : ''}`);

      res.json({
        success: true,
        message: 'Mot de passe modifié avec succès',
        historyCleared: hadHistory
      });
    } catch (error) {
      logger.error('Erreur changement mot de passe', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * DELETE /api/auth/me
   * Supprimer son propre compte
   */
  router.delete('/me', authMiddleware, (req, res) => {
    try {
      const userEmail = req.user.email;
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ error: 'Mot de passe requis pour confirmation' });
      }

      const user = Object.values(authManager.users).find(u => u.email === userEmail);
      if (!user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }

      // Vérifier que l'utilisateur a un passwordHash (pas un guest)
      if (!user.passwordHash) {
        return res.status(400).json({ error: 'Suppression de compte non disponible pour les utilisateurs invités' });
      }

      // Vérifier le mot de passe
      const passwordHash = authManager.hashPassword(password);
      if (user.passwordHash !== passwordHash) {
        return res.status(401).json({ error: 'Mot de passe incorrect' });
      }

      // Supprimer l'utilisateur via la méthode dédiée (supprime de DB + révoque tokens)
      const result = authManager.deleteUser(userEmail);

      if (!result.success) {
        logger.error('Failed to delete user', { email: userEmail, error: result.message });
        return res.status(500).json({ error: result.message });
      }

      logger.info(`Compte supprimé: ${userEmail}`);
      res.json({ success: true, message: 'Compte supprimé avec succès' });

    } catch (error) {
      logger.error('Erreur suppression compte', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // ===================================
  // GESTION DES UTILISATEURS (ADMIN)
  // ===================================

  /**
   * POST /api/auth/users
   * Créer un nouvel utilisateur (admin uniquement)
   */
  router.post('/users', authMiddleware, requireAdmin, (req, res) => {
    try {
      const { email, password, role } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email et mot de passe requis' });
      }

      const result = authManager.createUser(email, password, role || ROLES.USER);

      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      res.json({ success: true, user: result.user });
    } catch (error) {
      logger.error('Create user error', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * GET /api/auth/users
   * Lister tous les utilisateurs (admin uniquement)
   */
  router.get('/users', authMiddleware, requireAdmin, (req, res) => {
    try {
      const users = authManager.listUsers();
      res.json({ users });
    } catch (error) {
      logger.error('List users error', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * DELETE /api/auth/users/:email
   * Supprimer un utilisateur (admin uniquement)
   */
  router.delete('/users/:email', authMiddleware, requireAdmin, (req, res) => {
    try {
      const { email } = req.params;
      const result = authManager.deleteUser(email);

      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      res.json({ success: true });
    } catch (error) {
      logger.error('Delete user error', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * PATCH /api/auth/users/:email/role
   * Changer le rôle d'un utilisateur (admin uniquement)
   */
  router.patch('/users/:email/role', authMiddleware, requireAdmin, (req, res) => {
    try {
      const { email } = req.params;
      const { role } = req.body;

      if (!role) {
        return res.status(400).json({ error: 'Rôle requis' });
      }

      const result = authManager.updateUserRole(email, role);

      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      res.json({ success: true, user: result.user });
    } catch (error) {
      logger.error('Update user role error', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // ===================================
  // GESTION DES ABONNEMENTS
  // ===================================

  /**
   * POST /api/auth/subscription
   * Mettre à jour l'abonnement d'un utilisateur (admin uniquement)
   */
  router.post('/subscription', authMiddleware, requireAdmin, (req, res) => {
    try {
      const { email, tier, expiresAt } = req.body;

      if (!email || !tier) {
        return res.status(400).json({ error: 'Email et palier requis' });
      }

      const result = authManager.updateSubscription(email, tier, expiresAt);

      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      res.json({ success: true, user: result.user });
    } catch (error) {
      logger.error('Update subscription error', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // ===================================
  // JETONS D'ACCÈS (ACCESS TOKENS)
  // ===================================

  /**
   * POST /api/auth/access-token/generate
   * Générer un nouveau jeton d'accès (admin uniquement)
   */
  router.post('/access-token/generate', authMiddleware, requireAdmin, (req, res) => {
    try {
      const { tier = 'free', expiresInDays = 30, maxUses = 1, description = '' } = req.body;

      const accessToken = authManager.generateAccessToken(tier, expiresInDays, maxUses, description);

      res.json({
        success: true,
        accessToken
      });
    } catch (error) {
      logger.error('Generate access token error', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * GET /api/auth/access-tokens
   * Lister tous les jetons d'accès (admin uniquement)
   */
  router.get('/access-tokens', authMiddleware, requireAdmin, (req, res) => {
    try {
      const tokens = authManager.listAccessTokens();
      res.json({ tokens });
    } catch (error) {
      logger.error('List access tokens error', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * DELETE /api/auth/access-token/:token
   * Révoquer un jeton d'accès (admin uniquement)
   */
  router.delete('/access-token/:token', authMiddleware, requireAdmin, (req, res) => {
    try {
      const { token } = req.params;
      const result = authManager.revokeAccessToken(token);

      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      res.json({ success: true });
    } catch (error) {
      logger.error('Revoke access token error', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * GET /api/auth/logs
   * Récupérer les logs d'application (admin uniquement)
   */
  router.get('/logs', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const { type = 'app', lines = 100 } = req.query;
      const logDir = join(dirname(dirname(__dirname)), 'logs');

      const validTypes = ['app', 'error', 'access', 'auth', 'api'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: 'Type de log invalide' });
      }

      const logFile = join(logDir, `${type}.log`);

      try {
        const content = await fs.readFile(logFile, 'utf-8');
        const logLines = content.trim().split('\n');
        const recentLines = logLines.slice(-parseInt(lines));

        res.json({
          type,
          lines: recentLines,
          total: logLines.length
        });
      } catch (error) {
        if (error.code === 'ENOENT') {
          res.json({
            type,
            lines: [],
            total: 0,
            message: 'Fichier de log non trouvé'
          });
        } else {
          throw error;
        }
      }
    } catch (error) {
      logger.error('Erreur récupération logs', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  return router;
}

/**
 * Routes relatives aux abonnements (montées séparément)
 * Ces routes ne nécessitent pas le préfixe /auth
 */
export function subscriptionPublicRoutes(dependencies = {}) {
  const router = express.Router();

  /**
   * GET /api/subscription/tiers
   * Obtenir les paliers d'abonnement disponibles (public)
   */
  router.get('/tiers', (req, res) => {
    res.json({ tiers: Object.values(SUBSCRIPTION_TIERS) });
  });

  /**
   * GET /api/subscription/info
   * Obtenir les informations d'abonnement de l'utilisateur actuel
   */
  router.get('/info', authMiddleware, (req, res) => {
    try {
      const info = authManager.getSubscriptionInfo(req.user.email);
      res.json({ subscription: info });
    } catch (error) {
      logger.error('Get subscription info error', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  return router;
}

/**
 * Route CSRF token (montée séparément)
 */
export function csrfRoute(dependencies = {}) {
  const router = express.Router();

  /**
   * GET /api/csrf-token
   * Obtenir un token CSRF pour les SPAs
   */
  router.get('/csrf-token', csrfTokenEndpoint);

  return router;
}
