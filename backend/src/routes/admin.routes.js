/**
 * @fileoverview Routes d'administration
 * @module routes/admin
 *
 * Ce module gère :
 * - Gestion des groupes (admin uniquement)
 * - Statistiques et monitoring
 * - Modération
 */

import express from 'express';
import { logger } from '../logger.js';
import { authMiddleware } from '../auth-sqlite.js';
import { groupsDB } from '../database.js';
import {
  groups,
  messagesEnhanced
} from '../db-proxy.js';

// Middleware pour vérifier les droits admin
const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès refusé - droits admin requis' });
  }
  next();
};

/**
 * Configure les routes d'administration
 * @param {Object} dependencies - Dépendances injectées
 * @returns {express.Router} Router Express configuré
 */
export default function adminRoutes(dependencies = {}) {
  const router = express.Router();

  // Appliquer le middleware admin à toutes les routes de ce router
  router.use(authMiddleware, adminMiddleware);

  // ===================================
  // GESTION DES GROUPES (ADMIN)
  // ===================================

  /**
   * GET /api/admin/groups
   * Lister tous les groupes (admin uniquement)
   */
  router.get('/groups', async (req, res) => {
    try {
      // Récupérer tous les groupes depuis SQLite
      const allGroupsRaw = groupsDB.getAll();
      const allGroups = allGroupsRaw.map(g => {
        const members = groupsDB.getMembers(g.id);
        return {
          id: g.id,
          name: g.name,
          creator: g.creator,
          visibility: g.visibility,
          memberCount: members.length,
          createdAt: g.created_at
        };
      });

      // Trier par date de création (plus récent en premier)
      allGroups.sort((a, b) => b.createdAt - a.createdAt);

      res.json({ groups: allGroups });

    } catch (error) {
      logger.error('Error listing all groups (admin)', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * GET /api/admin/groups/:groupId
   * Obtenir les détails d'un groupe spécifique (admin uniquement)
   */
  router.get('/groups/:groupId', async (req, res) => {
    try {
      const { groupId } = req.params;
      const group = groups[groupId];

      if (!group) {
        return res.status(404).json({ error: 'Groupe introuvable' });
      }

      // Compter les messages du groupe
      const messageCount = messagesEnhanced[groupId] ? messagesEnhanced[groupId].length : 0;

      res.json({
        group: {
          ...group,
          messageCount
        }
      });

    } catch (error) {
      logger.error('Error getting group details (admin)', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * DELETE /api/admin/groups/:groupId
   * Supprimer un groupe (admin uniquement)
   */
  router.delete('/groups/:groupId', async (req, res) => {
    try {
      const { groupId } = req.params;
      const group = groups[groupId];

      if (!group) {
        return res.status(404).json({ error: 'Groupe introuvable' });
      }

      // Retirer le groupe de tous les membres
      // Note: user.groups sera automatiquement mis à jour via CASCADE DELETE
      // Pas besoin de modifier user.groups manuellement

      // Supprimer les messages du groupe
      delete messagesEnhanced[groupId];

      // Supprimer le groupe (CASCADE DELETE supprimera automatiquement group_members)
      delete groups[groupId];

      // Note: saveUsers() est un no-op dans la version SQLite

      logger.info(`Group deleted by admin: ${groupId} (${group.name})`);

      res.json({
        success: true,
        message: `Groupe "${group.name}" supprimé avec succès`
      });

    } catch (error) {
      logger.error('Error deleting group (admin)', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  return router;
}
