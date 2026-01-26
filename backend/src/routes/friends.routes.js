/**
 * @fileoverview Routes du système d'amis
 * @module routes/friends
 *
 * Ce module gère :
 * - Recherche d'utilisateurs
 * - Demandes d'ami
 * - Acceptation/rejet de demandes
 * - Liste des amis
 * - Suppression d'amis
 */

import express from 'express';
import { logger } from '../logger.js';
import { authManager, authMiddleware } from '../auth-sqlite.js';

/**
 * Configure les routes du système d'amis
 * @param {Object} dependencies - Dépendances injectées
 * @returns {express.Router} Router Express configuré
 */
export default function friendsRoutes(dependencies = {}) {
  const router = express.Router();

  /**
   * GET /api/friends/search
   * Rechercher des utilisateurs par displayName
   */
  router.get('/search', authMiddleware, async (req, res) => {
    try {
      const { q } = req.query;

      if (!q) {
        return res.status(400).json({ error: 'Paramètre de recherche requis' });
      }

      const results = authManager.searchUsersByDisplayName(q);
      res.json({ users: results });

    } catch (error) {
      logger.error('Erreur recherche utilisateurs', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * POST /api/friends/request
   * Envoyer une demande d'ami
   */
  router.post('/request', authMiddleware, async (req, res) => {
    try {
      const { toEmail } = req.body;
      const fromEmail = req.user.email;

      if (!toEmail) {
        return res.status(400).json({ error: 'Email destinataire requis' });
      }

      const result = authManager.sendFriendRequest(fromEmail, toEmail);

      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      logger.info(`Friend request sent from ${fromEmail} to ${toEmail}`);
      res.json({ success: true, message: result.message });

    } catch (error) {
      logger.error('Erreur envoi demande ami', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * POST /api/friends/accept
   * Accepter une demande d'ami
   */
  router.post('/accept', authMiddleware, async (req, res) => {
    try {
      const { fromEmail } = req.body;
      const userEmail = req.user.email;

      if (!fromEmail) {
        return res.status(400).json({ error: 'Email requis' });
      }

      const result = authManager.acceptFriendRequest(userEmail, fromEmail);

      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      logger.info(`Friend request accepted by ${userEmail} from ${fromEmail}`);
      res.json({ success: true, message: result.message });

    } catch (error) {
      logger.error('Erreur acceptation ami', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * POST /api/friends/reject
   * Rejeter une demande d'ami
   */
  router.post('/reject', authMiddleware, async (req, res) => {
    try {
      const { fromEmail } = req.body;
      const userEmail = req.user.email;

      if (!fromEmail) {
        return res.status(400).json({ error: 'Email requis' });
      }

      const result = authManager.rejectFriendRequest(userEmail, fromEmail);

      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      logger.info(`Friend request rejected by ${userEmail} from ${fromEmail}`);
      res.json({ success: true, message: result.message });

    } catch (error) {
      logger.error('Erreur rejet ami', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * DELETE /api/friends/:friendEmail
   * Supprimer un ami
   */
  router.delete('/:friendEmail', authMiddleware, async (req, res) => {
    try {
      const { friendEmail } = req.params;
      const userEmail = req.user.email;

      const result = authManager.removeFriend(userEmail, friendEmail);

      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      logger.info(`Friend removed by ${userEmail}: ${friendEmail}`);
      res.json({ success: true, message: result.message });

    } catch (error) {
      logger.error('Erreur suppression ami', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * GET /api/friends
   * Obtenir la liste des amis
   */
  router.get('/', authMiddleware, async (req, res) => {
    try {
      const userEmail = req.user.email;
      const friends = authManager.getFriends(userEmail);

      res.json({ friends });

    } catch (error) {
      logger.error('Erreur récupération amis', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * GET /api/friends/requests
   * Obtenir les demandes d'ami en attente
   */
  router.get('/requests', authMiddleware, async (req, res) => {
    try {
      const userEmail = req.user.email;
      const requests = authManager.getFriendRequests(userEmail);

      res.json({ requests });

    } catch (error) {
      logger.error('Erreur récupération demandes ami', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  return router;
}
