/**
 * @fileoverview Routes de gestion des utilisateurs et profils
 * @module routes/users
 *
 * Ce module gère :
 * - Liste des utilisateurs
 * - Gestion du profil utilisateur (displayName, avatar, etc.)
 */

import express from 'express';
import { logger } from '../utils/logger.js';
import { authManager, authMiddleware } from '../auth-sqlite.js';

/**
 * Configure les routes utilisateurs
 * @param {Object} dependencies - Dépendances injectées
 * @returns {express.Router} Router Express configuré
 */
export default function usersRoutes(dependencies = {}) {
  const router = express.Router();

  /**
   * GET /api/users/list
   * Récupérer la liste de tous les utilisateurs (infos publiques uniquement)
   * Utilisé notamment pour la sélection lors de la création de DMs
   */
  router.get('/users/list', authMiddleware, async (req, res) => {
    try {
      const currentUserEmail = req.user.email;
      const usersList = [];

      // Parcourir tous les utilisateurs et retourner uniquement les infos publiques
      for (const [email, userData] of Object.entries(authManager.users)) {
        // Ne pas inclure l'utilisateur courant dans la liste
        if (email !== currentUserEmail) {
          usersList.push({
            email: userData.email,
            name: userData.name,
            avatar: userData.avatar || null,
            role: userData.role
          });
        }
      }

      // Trier par nom
      usersList.sort((a, b) => a.name.localeCompare(b.name));

      res.json({
        success: true,
        users: usersList
      });
    } catch (error) {
      logger.error('Error listing users', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs' });
    }
  });

  /**
   * PUT /api/profile/displayname
   * Mettre à jour le nom d'affichage de l'utilisateur connecté
   */
  router.put('/profile/displayname', authMiddleware, async (req, res) => {
    try {
      const { displayName } = req.body;
      const userEmail = req.user.email;

      if (!displayName) {
        return res.status(400).json({ error: 'DisplayName requis' });
      }

      const result = authManager.updateDisplayName(userEmail, displayName);

      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      logger.info(`DisplayName updated for ${userEmail}`, { displayName });
      res.json({ success: true, displayName: result.displayName });

    } catch (error) {
      logger.error('Erreur mise à jour displayName', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * PUT /api/profile/language
   * Mettre à jour la langue préférée de l'utilisateur connecté
   */
  router.put('/profile/language', authMiddleware, async (req, res) => {
    try {
      const { language } = req.body;
      const userEmail = req.user.email;

      if (!language) {
        return res.status(400).json({ error: 'Language requis' });
      }

      const result = authManager.updateLanguagePreference(userEmail, language);

      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      logger.info(`Language preference updated for ${userEmail}`, { language });
      res.json({ success: true, language: result.language });

    } catch (error) {
      logger.error('Erreur mise à jour language preference', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  return router;
}
