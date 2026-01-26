/**
 * @fileoverview Routes de gestion des messages et conversations
 * @module routes/messages
 *
 * Ce module gère :
 * - Historique des traductions (crypté)
 * - Messages privés (DMs)
 * - Statuts utilisateurs (en ligne/hors ligne)
 * - Archivage des conversations
 */

import express from 'express';
import crypto from 'crypto';
import { logger } from '../logger.js';
import { authManager, authMiddleware } from '../auth-sqlite.js';
import {
  statusesDB,
  archivedDB
} from '../database.js';
import {
  getUserConversations,
  getConversationMessages
} from '../db-helpers.js';
import {
  groups,
  directMessages
} from '../db-proxy.js';

// ===================================
// FONCTIONS UTILITAIRES
// ===================================

/**
 * Générer un ID de conversation entre 2 utilisateurs (toujours dans le même ordre)
 */
function getConversationId(email1, email2) {
  return [email1, email2].sort().join('_');
}

/**
 * Dériver une clé de chiffrement depuis le passwordHash
 */
function deriveEncryptionKey(passwordHash) {
  // Utiliser le passwordHash comme base pour dériver une clé
  // PBKDF2 avec un salt fixe (le passwordHash lui-même est déjà un hash sécurisé)
  return crypto.pbkdf2Sync(passwordHash, 'realtranslate-history-salt', 10000, 32, 'sha256');
}

/**
 * Crypter l'historique avec une clé dérivée du passwordHash
 */
function encryptHistory(history, passwordHash) {
  const key = deriveEncryptionKey(passwordHash);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  const jsonData = JSON.stringify(history);
  let encrypted = cipher.update(jsonData, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  // Retourner IV + données cryptées
  return iv.toString('base64') + ':' + encrypted;
}

/**
 * Décrypter l'historique avec une clé dérivée du passwordHash
 */
function decryptHistory(encryptedData, passwordHash) {
  try {
    const key = deriveEncryptionKey(passwordHash);
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'base64');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (error) {
    logger.error('Erreur décryptage historique', error);
    return [];
  }
}

/**
 * Configure les routes de messages
 * @param {Object} dependencies - Dépendances injectées
 * @returns {express.Router} Router Express configuré
 */
export default function messagesRoutes(dependencies = {}) {
  const router = express.Router();

  // ===================================
  // HISTORIQUE DES TRADUCTIONS
  // ===================================

  /**
   * POST /api/history/save
   * Sauvegarder une traduction dans l'historique (crypté)
   */
  router.post('/history/save', authMiddleware, async (req, res) => {
    try {
      const { original, translated, sourceLang, targetLang } = req.body;
      const userEmail = req.user.email;
      const user = Object.values(authManager.users).find(u => u.email === userEmail);

      if (!user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }

      // Vérifier que l'utilisateur a un passwordHash (pas un guest)
      if (!user.passwordHash) {
        return res.status(400).json({ error: 'Historique non disponible pour les utilisateurs invités' });
      }

      // Décrypter l'historique existant
      let history = [];
      if (user.historyEncrypted) {
        history = decryptHistory(user.historyEncrypted, user.passwordHash);
      }

      // Ajouter la nouvelle traduction
      history.push({
        timestamp: new Date().toISOString(),
        original,
        translated,
        sourceLang,
        targetLang
      });

      // Limiter l'historique à 1000 entrées (FIFO)
      if (history.length > 1000) {
        history = history.slice(-1000);
      }

      // Crypter et sauvegarder
      user.historyEncrypted = encryptHistory(history, user.passwordHash);
      // Note: saveUsers() est un no-op dans la version SQLite (auto-persisted)

      logger.info(`Historique sauvegardé pour ${userEmail}`);
      res.json({ success: true, count: history.length });

    } catch (error) {
      logger.error('Erreur sauvegarde historique', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * GET /api/history
   * Récupérer l'historique des traductions (décrypté)
   */
  router.get('/history', authMiddleware, async (req, res) => {
    try {
      const userEmail = req.user.email;
      const user = Object.values(authManager.users).find(u => u.email === userEmail);

      if (!user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }

      // Vérifier que l'utilisateur a un passwordHash (pas un guest)
      if (!user.passwordHash) {
        return res.json({ history: [] });
      }

      // Décrypter et retourner l'historique
      const history = user.historyEncrypted ? decryptHistory(user.historyEncrypted, user.passwordHash) : [];
      res.json({ history });

    } catch (error) {
      logger.error('Erreur récupération historique', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * DELETE /api/history
   * Supprimer l'historique des traductions
   */
  router.delete('/history', authMiddleware, async (req, res) => {
    try {
      const userEmail = req.user.email;
      const user = Object.values(authManager.users).find(u => u.email === userEmail);

      if (!user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }

      // Supprimer l'historique crypté
      delete user.historyEncrypted;
      // Note: saveUsers() est un no-op dans la version SQLite (auto-persisted)

      logger.info(`Historique supprimé pour ${userEmail}`);
      res.json({ success: true, message: 'Historique supprimé' });

    } catch (error) {
      logger.error('Erreur suppression historique', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // ===================================
  // STATUTS UTILISATEURS
  // ===================================

  /**
   * GET /api/statuses
   * Récupérer les statuts des utilisateurs (amis + membres de groupes)
   */
  router.get('/statuses', authMiddleware, async (req, res) => {
    try {
      const userEmail = req.user.email;
      const user = authManager.users[userEmail];
      const relevantUsers = new Set();

      // Ajouter les amis
      if (user.friends) {
        user.friends.forEach(email => relevantUsers.add(email));
      }

      // Ajouter les membres des groupes
      if (user.groups) {
        user.groups.forEach(groupId => {
          const group = groups[groupId];
          if (group) {
            group.members.forEach(member => {
              if (member.email !== userEmail) {
                relevantUsers.add(member.email);
              }
            });
          }
        });
      }

      // Récupérer les statuts depuis SQLite
      const statuses = {};
      relevantUsers.forEach(email => {
        const status = statusesDB.get(email);
        if (status) {
          statuses[email] = {
            online: status.status === 'online',
            lastSeen: status.last_seen
          };
        } else {
          // Par défaut, considérer comme hors ligne
          statuses[email] = {
            online: false,
            lastSeen: null
          };
        }
      });

      res.json({ statuses });
    } catch (error) {
      logger.error('Error fetching statuses', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des statuts' });
    }
  });

  // ===================================
  // MESSAGES PRIVÉS (DMs)
  // ===================================

  /**
   * GET /api/dms
   * Récupérer toutes les conversations DM de l'utilisateur
   */
  router.get('/dms', authMiddleware, async (req, res) => {
    try {
      const userEmail = req.user.email;
      const user = authManager.users[userEmail];
      const conversations = [];

      // Filtrer les DMs archivés
      const archivedDMs = user.archivedDMs || [];

      // Récupérer les conversations de l'utilisateur depuis SQLite
      const userConvs = getUserConversations(userEmail);

      for (const convId of userConvs) {
        // Exclure les conversations archivées
        if (archivedDMs.includes(convId)) continue;

        const [email1, email2] = convId.split('_');
        const otherEmail = email1 === userEmail ? email2 : email1;
        const otherUser = authManager.users[otherEmail];

        if (otherUser) {
          const msgs = getConversationMessages(convId, 100);
          const lastMessage = msgs.length > 0 ? msgs[msgs.length - 1] : null;
          conversations.push({
            conversationId: convId,
            otherUser: {
              email: otherEmail,
              displayName: otherUser.displayName || otherEmail.split('@')[0],
              avatar: otherUser.avatar
            },
            lastMessage,
            unreadCount: 0 // À implémenter plus tard
          });
        }
      }

      // Trier par dernier message
      conversations.sort((a, b) => {
        if (!a.lastMessage) return 1;
        if (!b.lastMessage) return -1;
        return new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp);
      });

      res.json({ conversations });
    } catch (error) {
      logger.error('Error fetching DMs', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des messages' });
    }
  });

  /**
   * GET /api/dms/:otherUserEmail
   * Récupérer les messages d'une conversation spécifique
   */
  router.get('/dms/:otherUserEmail', authMiddleware, async (req, res) => {
    try {
      const userEmail = req.user.email;
      const otherUserEmail = req.params.otherUserEmail;

      // Vérifier que l'autre utilisateur existe
      const otherUser = authManager.users[otherUserEmail];
      if (!otherUser) {
        return res.status(404).json({ error: 'Utilisateur introuvable' });
      }

      // Note: Pas de vérification d'amitié - permet d'envoyer des DMs à tout utilisateur
      // (Système de blocage peut être ajouté plus tard si nécessaire)

      const convId = getConversationId(userEmail, otherUserEmail);
      const msgs = directMessages[convId] || [];

      res.json({
        conversationId: convId,
        messages: msgs,
        otherUser: {
          email: otherUserEmail,
          displayName: otherUser.displayName || otherUserEmail.split('@')[0],
          avatar: otherUser.avatar
        }
      });
    } catch (error) {
      logger.error('Error fetching DM conversation', error);
      res.status(500).json({ error: 'Erreur lors de la récupération de la conversation' });
    }
  });

  /**
   * POST /api/dms/:conversationId/archive
   * Archiver ou désarchiver une conversation DM
   */
  router.post('/dms/:conversationId/archive', authMiddleware, async (req, res) => {
    try {
      const { conversationId } = req.params;
      const { archived } = req.body; // true pour archiver, false pour désarchiver
      const userEmail = req.user.email;

      if (archived) {
        // Archiver dans la DB
        archivedDB.archive(userEmail, 'dm', conversationId);
      } else {
        // Désarchiver depuis la DB
        archivedDB.unarchive(userEmail, 'dm', conversationId);
      }

      logger.info(`DM ${archived ? 'archived' : 'unarchived'}: ${conversationId} by ${userEmail}`);
      res.json({ success: true });

    } catch (error) {
      logger.error('Error archiving DM', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  /**
   * GET /api/dms/archived/list
   * Obtenir les conversations DM archivées
   */
  router.get('/dms/archived/list', authMiddleware, async (req, res) => {
    try {
      const userEmail = req.user.email;
      const user = authManager.users[userEmail];
      const archivedConversations = [];

      const archivedDMs = user.archivedDMs || [];

      // Récupérer les conversations archivées
      for (const convId of archivedDMs) {
        const msgs = directMessages[convId];
        if (!msgs) continue;

        const [email1, email2] = convId.split('_');
        const otherEmail = email1 === userEmail ? email2 : email1;
        const otherUser = authManager.users[otherEmail];

        if (otherUser) {
          const lastMessage = msgs.length > 0 ? msgs[msgs.length - 1] : null;
          archivedConversations.push({
            conversationId: convId,
            otherUser: {
              email: otherEmail,
              displayName: otherUser.displayName || otherEmail.split('@')[0],
              avatar: otherUser.avatar
            },
            lastMessage
          });
        }
      }

      res.json({ conversations: archivedConversations });

    } catch (error) {
      logger.error('Error getting archived DMs', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  return router;
}
