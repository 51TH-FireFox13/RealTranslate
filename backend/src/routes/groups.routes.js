/**
 * @fileoverview Routes de gestion des groupes
 * @module routes/groups
 *
 * Ce module gère :
 * - Création et gestion des groupes
 * - Gestion des membres
 * - Messages de groupe
 * - Groupes publics
 * - Archivage
 */

import express from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { authManager, authMiddleware } from '../auth-sqlite.js';
import {
  groupsDB,
  archivedDB
} from '../database.js';
import {
  getUserGroups,
  getGroupMessages
} from '../db-helpers.js';
import {
  groups,
  messagesEnhanced
} from '../db-proxy.js';

/**
 * Configure les routes de groupes
 * @param {Object} dependencies - Dépendances injectées
 * @returns {express.Router} Router Express configuré
 */
export default function groupsRoutes(dependencies = {}) {
  const router = express.Router();

  // ===================================
  // GESTION DES GROUPES
  // ===================================

  /**
   * POST /api/groups
   * Créer un nouveau groupe
   */
  router.post('/', authMiddleware, async (req, res) => {
    try {
      const { name, memberEmails, visibility } = req.body;
      const creatorEmail = req.user.email;
      const creator = authManager.users[creatorEmail];

      if (!name || !memberEmails || !Array.isArray(memberEmails)) {
        return res.status(400).json({ error: 'Nom et membres requis' });
      }

      // Validation du paramètre visibility (par défaut: private)
      const groupVisibility = visibility === 'public' ? 'public' : 'private';

      // Créer le groupe
      const groupId = `group-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const members = [
        { email: creatorEmail, displayName: creator.displayName, role: 'admin' }
      ];

      // Ajouter les membres (seulement les amis)
      for (const memberEmail of memberEmails) {
        if (memberEmail === creatorEmail) continue;

        const member = authManager.users[memberEmail];
        if (!member) continue;

        // Vérifier que c'est un ami
        if (creator.friends && creator.friends.includes(memberEmail)) {
          members.push({
            email: memberEmail,
            displayName: member.displayName,
            role: 'member'
          });
        }
      }

      // Créer le groupe et ajouter les membres de manière ATOMIQUE (transaction)
      const result = groupsDB.createGroupWithMembers(
        {
          id: groupId,
          name,
          creator: creatorEmail,
          visibility: groupVisibility,
          createdAt: Date.now()
        },
        members
      );

      if (!result.success) {
        logger.error('Failed to create group in DB', { error: result.error, groupId });
        return res.status(500).json({ error: 'Erreur lors de la création du groupe' });
      }

      // Récupérer le groupe depuis la DB via le proxy (pour cohérence)
      const createdGroup = groups[groupId];

      logger.info(`Group created atomically: ${groupId} by ${creatorEmail}`, {
        name,
        memberCount: members.length,
        visibility: groupVisibility
      });

      res.json({ success: true, group: createdGroup });

    } catch (error) {
      logger.error('Error creating group', error, {
        user: req.user?.email,
        body: req.body
      });
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * GET /api/groups
   * Obtenir les groupes de l'utilisateur (non archivés)
   */
  router.get('/', authMiddleware, async (req, res) => {
    try {
      const userEmail = req.user.email;
      const user = authManager.users[userEmail];

      // Récupérer les groupes directement depuis SQLite
      const allUserGroups = getUserGroups(userEmail);

      // Filtrer les groupes archivés
      const archivedGroups = user.archivedGroups || [];
      const userGroups = allUserGroups.filter(g => !archivedGroups.includes(g.id));

      res.json({ groups: userGroups });

    } catch (error) {
      logger.error('Error getting groups', error, {
        user: req.user?.email
      });
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * GET /api/groups/public
   * Obtenir la liste des groupes publics
   */
  router.get('/public', authMiddleware, async (req, res) => {
    try {
      const userEmail = req.user.email;

      // Récupérer les groupes publics depuis SQLite
      const publicGroupsRaw = groupsDB.getPublic();
      const publicGroups = publicGroupsRaw.map(g => {
        const members = groupsDB.getMembers(g.id);
        const isMember = members.some(m => m.user_email === userEmail);
        return {
          id: g.id,
          name: g.name,
          creator: g.creator,
          memberCount: members.length,
          isMember,
          createdAt: g.created_at
        };
      });

      res.json({ groups: publicGroups });

    } catch (error) {
      logger.error('Error fetching public groups', error, {
        user: req.user?.email
      });
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * GET /api/groups/archived/list
   * Obtenir les groupes archivés de l'utilisateur
   */
  router.get('/archived/list', authMiddleware, async (req, res) => {
    try {
      const userEmail = req.user.email;
      const user = authManager.users[userEmail];

      const archivedGroups = (user.archivedGroups || [])
        .map(groupId => groups[groupId])
        .filter(g => g); // Filtrer les groupes supprimés

      res.json({ groups: archivedGroups });

    } catch (error) {
      logger.error('Error getting archived groups', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * GET /api/groups/:groupId
   * Obtenir les détails d'un groupe spécifique
   */
  router.get('/:groupId', authMiddleware, async (req, res) => {
    try {
      const { groupId } = req.params;
      const userEmail = req.user.email;
      const group = groups[groupId];

      if (!group) {
        return res.status(404).json({ error: 'Groupe introuvable' });
      }

      // Vérifier que l'utilisateur est membre
      const isMember = group.members.some(m => m.email === userEmail);
      if (!isMember) {
        return res.status(403).json({ error: 'Accès refusé' });
      }

      res.json({ group });

    } catch (error) {
      logger.error('Error getting group', error, {
        user: req.user?.email,
        groupId: req.params?.groupId
      });
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * GET /api/groups/:groupId/messages
   * Obtenir les messages d'un groupe
   */
  router.get('/:groupId/messages', authMiddleware, async (req, res) => {
    try {
      const { groupId } = req.params;
      const userEmail = req.user.email;
      const group = groups[groupId];

      if (!group) {
        return res.status(404).json({ error: 'Groupe introuvable' });
      }

      // Vérifier que l'utilisateur est membre
      const isMember = group.members.some(m => m.email === userEmail);
      if (!isMember) {
        return res.status(403).json({ error: 'Accès refusé' });
      }

      const groupMessages = messagesEnhanced[groupId] || [];
      res.json({ messages: groupMessages });

    } catch (error) {
      logger.error('Error getting messages', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // ===================================
  // GESTION DES MEMBRES
  // ===================================

  /**
   * POST /api/groups/:groupId/members
   * Ajouter un membre au groupe (admin uniquement)
   */
  router.post('/:groupId/members', authMiddleware, async (req, res) => {
    try {
      const { groupId } = req.params;
      const { memberEmail } = req.body;
      const userEmail = req.user.email;
      const group = groups[groupId];

      if (!group) {
        return res.status(404).json({ error: 'Groupe introuvable' });
      }

      // Vérifier que l'utilisateur est admin
      const userMember = group.members.find(m => m.email === userEmail);
      if (!userMember || userMember.role !== 'admin') {
        return res.status(403).json({ error: 'Seuls les admins peuvent ajouter des membres' });
      }

      // Vérifier que le nouveau membre existe et est ami
      const newMember = authManager.users[memberEmail];
      if (!newMember) {
        return res.status(404).json({ error: 'Utilisateur introuvable' });
      }

      const user = authManager.users[userEmail];
      if (!user.friends || !user.friends.includes(memberEmail)) {
        return res.status(400).json({ error: 'Seuls vos amis peuvent être ajoutés' });
      }

      // Vérifier si déjà membre
      if (group.members.some(m => m.email === memberEmail)) {
        return res.status(400).json({ error: 'Déjà membre du groupe' });
      }

      // Ajouter le membre à la DB
      groupsDB.addMember(groupId, {
        email: memberEmail,
        displayName: newMember.displayName,
        role: 'member'
      });

      // Recharger le groupe depuis la DB pour obtenir la version à jour
      const updatedGroup = groups[groupId];

      // Note: newMember.groups est calculé automatiquement depuis group_members
      // saveUsers() est un no-op dans la version SQLite

      logger.info(`Member added to group: ${memberEmail} -> ${groupId}`);
      res.json({ success: true, group: updatedGroup });

    } catch (error) {
      logger.error('Error adding member', error, {
        user: req.user?.email,
        groupId: req.params?.groupId,
        memberEmail: req.body?.memberEmail
      });
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * DELETE /api/groups/:groupId/members/:memberEmail
   * Retirer un membre du groupe (admin uniquement)
   */
  router.delete('/:groupId/members/:memberEmail', authMiddleware, async (req, res) => {
    try {
      const { groupId, memberEmail } = req.params;
      const userEmail = req.user.email;
      const group = groups[groupId];

      if (!group) {
        return res.status(404).json({ error: 'Groupe introuvable' });
      }

      // Vérifier que l'utilisateur est admin
      const userMember = group.members.find(m => m.email === userEmail);
      if (!userMember || userMember.role !== 'admin') {
        return res.status(403).json({ error: 'Seuls les admins peuvent retirer des membres' });
      }

      // Ne pas retirer le créateur
      if (memberEmail === group.creator) {
        return res.status(400).json({ error: 'Impossible de retirer le créateur' });
      }

      // Retirer le membre de la DB
      groupsDB.removeMember(groupId, memberEmail);

      // Recharger le groupe depuis la DB pour obtenir la version à jour
      const updatedGroup = groups[groupId];

      // Note: member.groups est calculé automatiquement depuis group_members
      // saveUsers() est un no-op dans la version SQLite

      logger.info(`Member removed from group: ${memberEmail} <- ${groupId}`);
      res.json({ success: true, group: updatedGroup });

    } catch (error) {
      logger.error('Error removing member', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * POST /api/groups/:groupId/join
   * Rejoindre un groupe public
   */
  router.post('/:groupId/join', authMiddleware, async (req, res) => {
    try {
      const { groupId } = req.params;
      const userEmail = req.user.email;
      const user = authManager.users[userEmail];
      const group = groups[groupId];

      if (!group) {
        return res.status(404).json({ error: 'Groupe introuvable' });
      }

      // Vérifier que le groupe est public
      if (group.visibility !== 'public') {
        return res.status(403).json({ error: 'Ce groupe est privé. Vous devez être invité par un admin.' });
      }

      // Vérifier si déjà membre
      if (group.members.some(m => m.email === userEmail)) {
        return res.status(400).json({ error: 'Vous êtes déjà membre de ce groupe' });
      }

      // Ajouter l'utilisateur au groupe dans la DB
      groupsDB.addMember(groupId, {
        email: userEmail,
        displayName: user.displayName,
        role: 'member'
      });

      // Recharger le groupe depuis la DB pour obtenir la version à jour
      const updatedGroup = groups[groupId];

      // Note: user.groups est calculé automatiquement depuis group_members
      // saveUsers() est un no-op dans la version SQLite

      logger.info(`User joined public group: ${userEmail} -> ${groupId}`);
      res.json({ success: true, group: updatedGroup });

    } catch (error) {
      logger.error('Error joining group', error, {
        user: req.user?.email,
        groupId: req.params?.groupId
      });
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // ===================================
  // ARCHIVAGE
  // ===================================

  /**
   * POST /api/groups/:groupId/archive
   * Archiver ou désarchiver un groupe
   */
  router.post('/:groupId/archive', authMiddleware, async (req, res) => {
    try {
      const { groupId } = req.params;
      const { archived } = req.body; // true pour archiver, false pour désarchiver
      const userEmail = req.user.email;

      if (archived) {
        // Archiver dans la DB
        archivedDB.archive(userEmail, 'group', groupId);
      } else {
        // Désarchiver depuis la DB
        archivedDB.unarchive(userEmail, 'group', groupId);
      }

      logger.info(`Group ${archived ? 'archived' : 'unarchived'}: ${groupId} by ${userEmail}`);
      res.json({ success: true });

    } catch (error) {
      logger.error('Error archiving group', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  return router;
}
