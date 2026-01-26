/**
 * @fileoverview Middleware d'authentification WebSocket
 * @module websocket/middleware/auth
 */

import { authManager } from '../../auth-sqlite.js';
import { logger } from '../../utils/logger.js';
import { statusesDB } from '../../database.js';

/**
 * Middleware d'authentification pour Socket.IO
 * Vérifie le token JWT et attache l'utilisateur au socket
 */
export function authSocketMiddleware(socket, next) {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      logger.warn('WebSocket connection attempt without token', { socketId: socket.id });
      return next(new Error('Authentication required'));
    }

    // Vérifier le token
    const result = authManager.verifyToken(token);

    if (!result.success) {
      logger.warn('WebSocket connection attempt with invalid token', {
        socketId: socket.id,
        message: result.message
      });
      return next(new Error('Invalid token'));
    }

    // Attacher l'utilisateur au socket
    socket.userId = result.user.email;
    socket.userEmail = result.user.email;
    socket.displayName = result.user.displayName || result.user.email;
    socket.tier = result.user.tier || 'free';

    logger.info('WebSocket authenticated', {
      socketId: socket.id,
      userId: result.user.email
    });

    next();
  } catch (error) {
    logger.error('WebSocket auth error', {
      error: error.message,
      socketId: socket.id
    });
    next(new Error('Authentication failed'));
  }
}

/**
 * Handler d'authentification manuel (événement 'authenticate')
 * Pour les clients qui ne peuvent pas passer le token dans le handshake
 */
export function handleAuthenticate(socket, token, callback) {
  try {
    const result = authManager.verifyToken(token);

    if (!result.success) {
      logger.warn('Authentication attempt with invalid token', {
        socketId: socket.id,
        message: result.message
      });

      if (callback) {
        callback({ success: false, error: result.message || 'Invalid token' });
      }

      socket.emit('auth_error', { error: 'Token invalide' });
      socket.disconnect();
      return;
    }

    // Attacher l'utilisateur au socket
    socket.userId = result.user.email;
    socket.userEmail = result.user.email;
    socket.displayName = result.user.displayName || result.user.email;
    socket.tier = result.user.tier || 'free';

    // Rejoindre la room personnelle
    socket.join(`user:${result.user.email}`);

    // Mettre à jour le statut en ligne
    statusesDB.upsert(result.user.email, 'online');

    logger.info('Socket authenticated via event', {
      userId: result.user.email,
      socketId: socket.id
    });

    if (callback) {
      callback({ success: true });
    }

    socket.emit('authenticated', { success: true });
  } catch (error) {
    logger.error('Authentication handler error', {
      error: error.message,
      socketId: socket.id
    });

    if (callback) {
      callback({ success: false, error: error.message });
    }

    socket.emit('auth_error', { error: 'Authentication failed' });
    socket.disconnect();
  }
}

export default {
  authSocketMiddleware,
  handleAuthenticate
};
