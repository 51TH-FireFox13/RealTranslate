/**
 * @fileoverview Configuration Socket.IO et enregistrement des handlers
 * @module websocket/socket
 *
 * Ce fichier configure Socket.IO et enregistre tous les event handlers
 * de manière modulaire.
 */

import { logger } from '../../logger.js';
import { handleAuthenticate } from './middleware/auth.middleware.js';
import {
  handleGroupMessage,
  handleDirectMessage,
  handleJoinRooms,
  handleLeaveRoom
} from './handlers/message.handler.js';
import {
  handleUserOnline,
  handleUserOffline,
  handleTypingStart,
  handleTypingStop
} from './handlers/presence.handler.js';

/**
 * Configure Socket.IO et enregistre tous les event handlers
 * @param {Object} io - Instance Socket.IO
 * @returns {Object} - Instance IO configurée
 */
export function setupWebSocket(io) {
  logger.info('📡 Setting up WebSocket handlers...');

  // Connexion d'un client
  io.on('connection', (socket) => {
    logger.info('Client WebSocket connected', { socketId: socket.id });

    // Gérer la connexion utilisateur (mise à jour statut online)
    handleUserOnline(io, socket);

    // ===================================
    // AUTHENTIFICATION
    // ===================================

    /**
     * Authentification manuelle (pour clients qui ne peuvent pas passer le token dans handshake)
     */
    socket.on('authenticate', (token, callback) => {
      handleAuthenticate(socket, token, callback);
    });

    // ===================================
    // GESTION DES ROOMS
    // ===================================

    /**
     * Rejoindre des rooms de groupes
     */
    socket.on('join_rooms', (data) => {
      handleJoinRooms(socket, data);
    });

    /**
     * Quitter une room de groupe
     */
    socket.on('leave_room', (data) => {
      handleLeaveRoom(socket, data);
    });

    // ===================================
    // MESSAGES
    // ===================================

    /**
     * Envoyer un message dans un groupe
     */
    socket.on('group_message', async (data) => {
      await handleGroupMessage(io, socket, data);
    });

    /**
     * Envoyer un message privé (DM)
     */
    socket.on('dm_message', async (data) => {
      await handleDirectMessage(io, socket, data);
    });

    /**
     * Anciens noms d'événements (rétrocompatibilité)
     */
    socket.on('send_message', async (data) => {
      await handleGroupMessage(io, socket, data);
    });

    socket.on('send_dm', async (data) => {
      await handleDirectMessage(io, socket, data);
    });

    // ===================================
    // PRÉSENCE & TYPING INDICATORS
    // ===================================

    /**
     * Début de frappe
     */
    socket.on('typing_start', (data) => {
      handleTypingStart(socket, data);
    });

    /**
     * Arrêt de frappe
     */
    socket.on('typing_stop', (data) => {
      handleTypingStop(socket, data);
    });

    /**
     * Anciens noms (rétrocompatibilité)
     */
    socket.on('user_typing', (data) => {
      handleTypingStart(socket, data);
    });

    socket.on('stop_typing', (data) => {
      handleTypingStop(socket, data);
    });

    // ===================================
    // DÉCONNEXION
    // ===================================

    /**
     * Déconnexion du client
     */
    socket.on('disconnect', (reason) => {
      handleUserOffline(io, socket);
      logger.info('Client WebSocket disconnected', {
        socketId: socket.id,
        userId: socket.userId,
        reason
      });
    });

    // ===================================
    // GESTION DES ERREURS
    // ===================================

    /**
     * Erreur socket
     */
    socket.on('error', (error) => {
      logger.error('WebSocket error', {
        socketId: socket.id,
        userId: socket.userId,
        error: error.message
      });
    });
  });

  logger.info('✅ WebSocket handlers configured successfully');

  return io;
}

export default setupWebSocket;
