/**
 * @fileoverview Handlers WebSocket pour les messages (groupes et DMs)
 * @module websocket/handlers/message
 */

import { logger } from '../../../logger.js';
import { validateWebSocketData } from '../../../websocket-validation.js';
import { groups } from '../../../db-proxy.js';
import { messagesDB } from '../../database.js';
import {
  createGroupMessage,
  createDirectMessage
} from '../../services/conversation.service.js';

/**
 * Handler pour les messages de groupe
 * @param {Object} io - Instance Socket.IO
 * @param {Object} socket - Socket client
 * @param {Object} data - Données du message
 */
export async function handleGroupMessage(io, socket, data) {
  try {
    // Vérifier authentification
    if (!socket.userId) {
      return socket.emit('error', { message: 'Non authentifié' });
    }

    // Valider les données
    const validation = validateWebSocketData('send_message', data);
    if (!validation.valid) {
      return socket.emit('error', {
        message: 'Données invalides',
        errors: validation.errors
      });
    }

    const { groupId, content, userLang, fileInfo } = data;
    const userEmail = socket.userId;

    // Vérifier que l'utilisateur est membre du groupe
    const group = groups[groupId];
    if (!group || !group.members.some(m => m.email === userEmail)) {
      return socket.emit('error', { message: 'Accès refusé au groupe' });
    }

    // Créer le message avec traduction
    const messageData = await createGroupMessage({
      groupId,
      sender: userEmail,
      message: content,
      timestamp: Date.now(),
      targetLang: userLang,
      provider: data.translationProvider || 'openai',
      fileInfo
    });

    // Diffuser à tous les membres du groupe
    io.to(`group:${groupId}`).emit('group_message', messageData);

    logger.info('Group message sent', {
      groupId,
      sender: userEmail,
      messageId: messageData.id,
      messageLength: content.length
    });
  } catch (error) {
    logger.error('Error handling group message', {
      error: error.message,
      userId: socket.userId,
      groupId: data?.groupId
    });
    socket.emit('error', { message: 'Erreur lors de l\'envoi du message' });
  }
}

/**
 * Handler pour les messages privés (DMs)
 * @param {Object} io - Instance Socket.IO
 * @param {Object} socket - Socket client
 * @param {Object} data - Données du message
 */
export async function handleDirectMessage(io, socket, data) {
  try {
    // Vérifier authentification
    if (!socket.userId) {
      return socket.emit('error', { message: 'Non authentifié' });
    }

    // Valider les données
    const validation = validateWebSocketData('send_dm', data);
    if (!validation.valid) {
      return socket.emit('error', {
        message: 'Données invalides',
        errors: validation.errors
      });
    }

    const { recipientEmail, content, userLang, fileInfo } = data;
    const userEmail = socket.userId;

    // Créer le message avec traduction
    const messageData = await createDirectMessage({
      from: userEmail,
      to: recipientEmail,
      message: content,
      timestamp: Date.now(),
      targetLang: userLang,
      provider: data.translationProvider || 'openai',
      fileInfo
    });

    // Envoyer au destinataire
    io.to(`user:${recipientEmail}`).emit('dm_message', {
      from: userEmail,
      ...messageData
    });

    // Confirmer l'envoi à l'expéditeur
    socket.emit('dm_sent', {
      conversationId: messageData.conversationId,
      messageId: messageData.id
    });

    logger.info('Direct message sent', {
      from: userEmail,
      to: recipientEmail,
      messageId: messageData.id,
      conversationId: messageData.conversationId
    });
  } catch (error) {
    logger.error('Error handling direct message', {
      error: error.message,
      userId: socket.userId,
      recipientEmail: data?.recipientEmail
    });
    socket.emit('error', { message: 'Erreur lors de l\'envoi du message' });
  }
}

/**
 * Handler pour rejoindre des rooms de groupes
 * @param {Object} socket - Socket client
 * @param {Object} data - Données { groupIds: string[] }
 */
export function handleJoinRooms(socket, data) {
  try {
    if (!socket.userId) {
      return socket.emit('error', { message: 'Non authentifié' });
    }

    const { groupIds } = data;

    if (!Array.isArray(groupIds)) {
      return socket.emit('error', { message: 'groupIds doit être un tableau' });
    }

    // Rejoindre chaque room de groupe
    groupIds.forEach(groupId => {
      socket.join(`group:${groupId}`);
    });

    logger.info('User joined group rooms', {
      userId: socket.userId,
      groupCount: groupIds.length
    });

    socket.emit('rooms_joined', { count: groupIds.length });
  } catch (error) {
    logger.error('Error joining rooms', {
      error: error.message,
      userId: socket.userId
    });
    socket.emit('error', { message: 'Erreur lors de la connexion aux rooms' });
  }
}

/**
 * Handler pour quitter une room de groupe
 * @param {Object} socket - Socket client
 * @param {Object} data - Données { groupId: string }
 */
export function handleLeaveRoom(socket, data) {
  try {
    if (!socket.userId) {
      return socket.emit('error', { message: 'Non authentifié' });
    }

    const { groupId } = data;

    if (!groupId) {
      return socket.emit('error', { message: 'groupId requis' });
    }

    socket.leave(`group:${groupId}`);

    logger.info('User left group room', {
      userId: socket.userId,
      groupId
    });

    socket.emit('room_left', { groupId });
  } catch (error) {
    logger.error('Error leaving room', {
      error: error.message,
      userId: socket.userId,
      groupId: data?.groupId
    });
    socket.emit('error', { message: 'Erreur lors de la déconnexion de la room' });
  }
}

/**
 * Handler pour toggle reaction sur un message
 * @param {Object} io - Instance Socket.IO
 * @param {Object} socket - Socket client
 * @param {Object} data - Données { groupId, messageId, emoji }
 */
export async function handleToggleReaction(io, socket, data) {
  try {
    if (!socket.userId) {
      return socket.emit('error', { message: 'Non authentifié' });
    }

    // Valider les données
    const validation = validateWebSocketData('toggle_reaction', data);
    if (!validation.valid) {
      return socket.emit('error', {
        message: 'Données invalides',
        errors: validation.errors
      });
    }

    const { groupId, messageId, emoji } = data;
    const userEmail = socket.userId;

    // Vérifier que le groupe existe
    const group = groups[groupId];
    if (!group) {
      return socket.emit('error', { message: 'Groupe introuvable' });
    }

    // Vérifier que l'utilisateur est membre
    const isMember = group.members.some(m => m.email === userEmail);
    if (!isMember) {
      return socket.emit('error', { message: 'Accès refusé' });
    }

    // Récupérer le message depuis la DB
    const message = messagesDB.get(messageId);
    if (!message) {
      return socket.emit('error', { message: 'Message introuvable' });
    }

    // Vérifier que le message appartient au groupe
    if (message.group_id !== groupId) {
      return socket.emit('error', { message: 'Message introuvable dans ce groupe' });
    }

    // Parser les réactions (stockées en JSON)
    let reactions = message.reactions ? JSON.parse(message.reactions) : {};

    // Initialiser la réaction pour cet emoji si elle n'existe pas
    if (!reactions[emoji]) {
      reactions[emoji] = [];
    }

    // Vérifier si l'utilisateur a déjà réagi avec cet emoji
    const reactionIndex = reactions[emoji].findIndex(r => r.email === userEmail);

    if (reactionIndex !== -1) {
      // Retirer la réaction
      reactions[emoji].splice(reactionIndex, 1);

      // Supprimer l'emoji s'il n'y a plus de réactions
      if (reactions[emoji].length === 0) {
        delete reactions[emoji];
      }
    } else {
      // Ajouter la réaction
      const user = group.members.find(m => m.email === userEmail);
      reactions[emoji].push({
        email: userEmail,
        displayName: user?.displayName || userEmail,
        timestamp: new Date().toISOString()
      });
    }

    // Sauvegarder dans la DB de manière atomique
    // Le cache TTL expirera automatiquement, pas besoin de clearMessagesCache
    messagesDB.update(messageId, { reactions });

    // Diffuser la mise à jour à tous les membres du groupe
    io.to(`group:${groupId}`).emit('message_reaction_updated', {
      groupId,
      messageId,
      reactions
    });

    logger.info('Reaction toggled', {
      groupId,
      messageId,
      emoji,
      userEmail,
      action: reactionIndex !== -1 ? 'removed' : 'added'
    });

  } catch (error) {
    logger.error('Error toggling reaction', {
      error: error.message,
      stack: error.stack,
      userId: socket.userId,
      data
    });
    socket.emit('error', { message: 'Erreur lors de l\'ajout de la réaction' });
  }
}

/**
 * Handler pour supprimer un message
 * @param {Object} io - Instance Socket.IO
 * @param {Object} socket - Socket client
 * @param {Object} data - Données { groupId, messageId }
 */
export async function handleDeleteMessage(io, socket, data) {
  try {
    if (!socket.userId) {
      return socket.emit('error', { message: 'Non authentifié' });
    }

    // Valider les données
    const validation = validateWebSocketData('delete_message', data);
    if (!validation.valid) {
      return socket.emit('error', {
        message: 'Données invalides',
        errors: validation.errors
      });
    }

    const { groupId, messageId } = data;
    const userEmail = socket.userId;

    // Vérifier que le groupe existe
    const group = groups[groupId];
    if (!group) {
      return socket.emit('error', { message: 'Groupe introuvable' });
    }

    // Vérifier que l'utilisateur est membre
    const isMember = group.members.some(m => m.email === userEmail);
    if (!isMember) {
      return socket.emit('error', { message: 'Accès refusé' });
    }

    // Récupérer le message depuis la DB
    const message = messagesDB.get(messageId);
    if (!message) {
      return socket.emit('error', { message: 'Message introuvable' });
    }

    // Vérifier que le message appartient au groupe
    if (message.group_id !== groupId) {
      return socket.emit('error', { message: 'Message introuvable dans ce groupe' });
    }

    // Vérifier les permissions (auteur du message ou admin du groupe)
    const isAuthor = message.from_email === userEmail;
    const isGroupAdmin = group.members.find(m => m.email === userEmail && m.role === 'admin');

    if (!isAuthor && !isGroupAdmin) {
      return socket.emit('error', {
        message: 'Vous n\'avez pas la permission de supprimer ce message'
      });
    }

    // Supprimer le message de la DB de manière atomique
    // Le cache TTL expirera automatiquement, pas besoin de clearMessagesCache
    messagesDB.delete(messageId);

    // Diffuser la suppression à tous les membres du groupe
    io.to(`group:${groupId}`).emit('message_deleted', {
      groupId,
      messageId
    });

    logger.info('Message deleted', {
      groupId,
      messageId,
      deletedBy: userEmail,
      wasAuthor: isAuthor,
      wasAdmin: !!isGroupAdmin
    });

  } catch (error) {
    logger.error('Error deleting message', {
      error: error.message,
      stack: error.stack,
      userId: socket.userId,
      data
    });
    socket.emit('error', { message: 'Erreur lors de la suppression du message' });
  }
}

export default {
  handleGroupMessage,
  handleDirectMessage,
  handleJoinRooms,
  handleLeaveRoom,
  handleToggleReaction,
  handleDeleteMessage
};
