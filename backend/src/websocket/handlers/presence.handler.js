/**
 * @fileoverview Handlers WebSocket pour la présence utilisateur
 * @module websocket/handlers/presence
 *
 * Gère :
 * - Statuts online/offline
 * - Indicateurs de frappe (typing)
 */

import { logger } from '../../utils/logger.js';
import { statusesDB } from '../../database.js';
import { authManager } from '../../auth-sqlite.js';
import { groups } from '../../db-proxy.js';

// Maps pour tracking des sockets utilisateurs
const userSockets = new Map(); // email -> Set<socketId>
const onlineUsers = {}; // socketId -> { email, displayName }

/**
 * Handler pour la connexion d'un utilisateur
 * Met à jour le statut online et notifie les contacts
 * @param {Object} io - Instance Socket.IO
 * @param {Object} socket - Socket client
 */
export function handleUserOnline(io, socket) {
  try {
    const userEmail = socket.userId;
    const displayName = socket.displayName;

    if (!userEmail) {
      return;
    }

    logger.info('User connected', { userId: userEmail, socketId: socket.id });

    // Enregistrer le socket
    onlineUsers[socket.id] = { email: userEmail, displayName };

    // Vérifier si c'est la première connexion
    const wasOffline = !userSockets.has(userEmail) || userSockets.get(userEmail).size === 0;

    if (!userSockets.has(userEmail)) {
      userSockets.set(userEmail, new Set());
    }
    userSockets.get(userEmail).add(socket.id);

    // Mettre à jour le statut en base
    if (wasOffline) {
      statusesDB.setOnline(userEmail);

      // Notifier les contacts concernés
      const notifiedUsers = getUserContactsForStatusNotification(userEmail);

      notifiedUsers.forEach(contactEmail => {
        const status = statusesDB.get(userEmail) || {};
        io.to(`user:${contactEmail}`).emit('user_status_changed', {
          email: userEmail,
          displayName: displayName,
          online: true,
          lastSeen: status.last_seen || Date.now()
        });
      });

      logger.info('User status changed to online', {
        userId: userEmail,
        notifiedCount: notifiedUsers.size
      });
    }

    // Rejoindre la room personnelle
    socket.join(`user:${userEmail}`);
  } catch (error) {
    logger.error('Error handling user online', {
      error: error.message,
      userId: socket.userId
    });
  }
}

/**
 * Handler pour la déconnexion d'un utilisateur
 * Met à jour le statut offline si c'était la dernière connexion
 * @param {Object} io - Instance Socket.IO
 * @param {Object} socket - Socket client
 */
export function handleUserOffline(io, socket) {
  try {
    const userEmail = socket.userId;

    if (!userEmail) {
      logger.info('Anonymous socket disconnected', { socketId: socket.id });
      return;
    }

    logger.info('User disconnected', { userId: userEmail, socketId: socket.id });

    // Supprimer le socket
    delete onlineUsers[socket.id];

    if (userSockets.has(userEmail)) {
      userSockets.get(userEmail).delete(socket.id);

      // Si c'était la dernière connexion, marquer offline
      if (userSockets.get(userEmail).size === 0) {
        statusesDB.setOffline(userEmail);

        // Notifier les contacts
        const notifiedUsers = getUserContactsForStatusNotification(userEmail);
        const status = statusesDB.get(userEmail) || {};

        notifiedUsers.forEach(contactEmail => {
          io.to(`user:${contactEmail}`).emit('user_status_changed', {
            email: userEmail,
            displayName: socket.displayName,
            online: false,
            lastSeen: status.last_seen || Date.now()
          });
        });

        logger.info('User status changed to offline', {
          userId: userEmail,
          notifiedCount: notifiedUsers.size
        });

        // Nettoyer la map
        userSockets.delete(userEmail);
      }
    }
  } catch (error) {
    logger.error('Error handling user offline', {
      error: error.message,
      userId: socket.userId
    });
  }
}

/**
 * Handler pour début de frappe
 * @param {Object} socket - Socket client
 * @param {Object} data - { groupId?: string, to?: string }
 */
export function handleTypingStart(socket, data) {
  try {
    if (!socket.userId) return;

    const { groupId, to } = data;

    if (groupId) {
      // Typing dans un groupe
      socket.to(`group:${groupId}`).emit('user_typing', {
        groupId,
        user: socket.userId,
        displayName: socket.displayName
      });
    } else if (to) {
      // Typing dans un DM
      socket.to(`user:${to}`).emit('user_typing_dm', {
        from: socket.userId,
        displayName: socket.displayName
      });
    }
  } catch (error) {
    logger.error('Error handling typing start', {
      error: error.message,
      userId: socket.userId
    });
  }
}

/**
 * Handler pour arrêt de frappe
 * @param {Object} socket - Socket client
 * @param {Object} data - { groupId?: string, to?: string }
 */
export function handleTypingStop(socket, data) {
  try {
    if (!socket.userId) return;

    const { groupId, to } = data;

    if (groupId) {
      // Stop typing dans un groupe
      socket.to(`group:${groupId}`).emit('user_stopped_typing', {
        groupId,
        user: socket.userId
      });
    } else if (to) {
      // Stop typing dans un DM
      socket.to(`user:${to}`).emit('user_stopped_typing_dm', {
        from: socket.userId
      });
    }
  } catch (error) {
    logger.error('Error handling typing stop', {
      error: error.message,
      userId: socket.userId
    });
  }
}

/**
 * Récupère la liste des contacts à notifier pour un changement de statut
 * (membres des groupes + contacts DM)
 * @private
 * @param {string} userEmail - Email de l'utilisateur
 * @returns {Set<string>} - Ensemble des emails à notifier
 */
function getUserContactsForStatusNotification(userEmail) {
  const notifiedUsers = new Set();

  try {
    const user = authManager.users[userEmail];

    // Ajouter les membres des groupes
    if (user && user.groups) {
      user.groups.forEach(groupId => {
        const group = groups[groupId];
        if (group) {
          group.members.forEach(member => {
            if (member.email !== userEmail) {
              notifiedUsers.add(member.email);
            }
          });
        }
      });
    }

    // TODO: Ajouter les contacts DM depuis la DB
    // const userConversations = getUserConversations(userEmail);
    // userConversations.forEach(convId => {
    //   const [email1, email2] = convId.split('_');
    //   const otherEmail = email1 === userEmail ? email2 : email1;
    //   notifiedUsers.add(otherEmail);
    // });
  } catch (error) {
    logger.error('Error getting user contacts for notification', {
      error: error.message,
      userEmail
    });
  }

  return notifiedUsers;
}

/**
 * Récupère le statut d'un utilisateur (online/offline)
 * @param {string} userEmail - Email de l'utilisateur
 * @returns {Object} - { online: boolean, lastSeen: number }
 */
export function getUserStatus(userEmail) {
  try {
    const status = statusesDB.get(userEmail);
    if (!status) {
      return { online: false, lastSeen: null };
    }

    return {
      online: status.status === 'online',
      lastSeen: status.last_seen
    };
  } catch (error) {
    logger.error('Error getting user status', {
      error: error.message,
      userEmail
    });
    return { online: false, lastSeen: null };
  }
}

/**
 * Récupère les statuts de plusieurs utilisateurs
 * @param {string[]} userEmails - Liste des emails
 * @returns {Object} - Map email -> status
 */
export function getMultipleUserStatuses(userEmails) {
  const statuses = {};

  userEmails.forEach(email => {
    statuses[email] = getUserStatus(email);
  });

  return statuses;
}

export default {
  handleUserOnline,
  handleUserOffline,
  handleTypingStart,
  handleTypingStop,
  getUserStatus,
  getMultipleUserStatuses
};
