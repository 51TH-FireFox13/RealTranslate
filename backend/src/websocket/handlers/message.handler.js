/**
 * @fileoverview Handlers WebSocket pour les messages (groupes et DMs)
 * @module websocket/handlers/message
 */

import { logger } from '../../../logger.js';
import { validateWebSocketData } from '../../../websocket-validation.js';
import { groups } from '../../../db-proxy.js';
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

export default {
  handleGroupMessage,
  handleDirectMessage,
  handleJoinRooms,
  handleLeaveRoom
};
