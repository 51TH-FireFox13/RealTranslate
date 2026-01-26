/**
 * @fileoverview Middleware d'authentification WebSocket
 * @module websocket/middleware/auth
 */

import { authManager } from '../../../auth-sqlite.js';
import { logger } from '../../../logger.js';
import { statusesDB } from '../../../database.js';

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
    const user = authManager.verifyToken(token);

    if (!user) {
      logger.warn('WebSocket connection attempt with invalid token', { socketId: socket.id });
      return next(new Error('Invalid token'));
    }

    // Attacher l'utilisateur au socket
    socket.userId = user.email;
    socket.userEmail = user.email;
    socket.displayName = user.displayName || user.email;
    socket.tier = user.tier || 'free';

    logger.info('WebSocket authenticated', {
      socketId: socket.id,
      userId: user.email
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
    const user = authManager.verifyToken(token);

    if (!user) {
      logger.warn('Authentication attempt with invalid token', {
        socketId: socket.id
      });

      if (callback) {
        callback({ success: false, error: 'Invalid token' });
      }

      socket.emit('auth_error', { error: 'Token invalide' });
      socket.disconnect();
      return;
    }

    // Attacher l'utilisateur au socket
    socket.userId = user.email;
    socket.userEmail = user.email;
    socket.displayName = user.displayName || user.email;
    socket.tier = user.tier || 'free';

    // Rejoindre la room personnelle
    socket.join(`user:${user.email}`);

    // Mettre à jour le statut en ligne
    statusesDB.upsert(user.email, 'online');

    logger.info('Socket authenticated via event', {
      userId: user.email,
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
