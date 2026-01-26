/**
 * @fileoverview Point d'entrée principal du serveur RealTranslate (Version refactorisée - Phase 2.2)
 * @version 2.0.0
 *
 * Ce fichier a été refactorisé dans le cadre de la Phase 2.2 pour :
 * - Séparer les routes en modules logiques
 * - Améliorer la maintenabilité
 * - Faciliter les tests
 * - Réduire la complexité du fichier principal
 *
 * L'ancien server.js monolithique (~2900 lignes) a été décomposé en :
 * - src/routes/* : Modules de routes (auth, users, groups, messages, etc.)
 * - server-refactored.js : Point d'entrée léger (~200 lignes)
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { logger, accessLoggerMiddleware } from './logger.js';
import {
  authManager,
  authMiddleware
} from './auth-sqlite.js';
import { verifyCSRFToken, exemptCSRF } from './csrf-protection.js';
import { validateWebSocketData } from './websocket-validation.js';
import crypto from 'crypto';
import {
  initDatabase,
  usersDB,
  groupsDB,
  messagesDB,
  directMessagesDB,
  statusesDB
} from './database.js';
import {
  getUserGroups,
  getGroupMessages,
  addGroupMessage,
  getConversationMessages,
  addDirectMessage
} from './db-helpers.js';
import {
  groups,
  messagesEnhanced,
  directMessages,
  clearMessagesCache,
  clearDMsCache
} from './db-proxy.js';
import { setupRoutes } from './src/routes/index.js';
import fetch from 'node-fetch';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*", // À restreindre en production
    methods: ["GET", "POST"]
  }
});
const PORT = process.env.PORT || 3000;

// ===================================
// CONFIGURATION EXPRESS
// ===================================

// CORS
app.use(cors({
  origin: '*', // À restreindre en production
  credentials: true
}));

// Parsers
app.use(cookieParser());
app.use('/api/webhook', express.raw({ type: 'application/json' })); // Raw body pour webhooks
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers statiques
app.use('/uploads', express.static(join(__dirname, 'uploads')));
app.use(express.static(join(__dirname, '../frontend')));

// Logging des requêtes
app.use(accessLoggerMiddleware);

// Protection CSRF (sauf pour webhooks et endpoints publics)
app.use(exemptCSRF);
app.use(verifyCSRFToken);

// ===================================
// FONCTIONS UTILITAIRES
// ===================================

// Générer un ID de conversation entre 2 utilisateurs (toujours dans le même ordre)
function getConversationId(email1, email2) {
  return [email1, email2].sort().join('_');
}

// Fonction de traduction pour les messages de groupe
async function translateMessage(text, targetLang, provider = 'openai') {
  try {
    if (provider === 'deepseek') {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          temperature: 0.3,
          messages: [{
            role: 'system',
            content: `Tu es un traducteur expert. Traduis le texte suivant en ${targetLang} de manière naturelle et fluide. Réponds UNIQUEMENT avec la traduction, sans explications.`
          }, {
            role: 'user',
            content: text
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content?.trim() || text;

    } else {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.3,
          messages: [{
            role: 'system',
            content: `Tu es un traducteur expert. Traduis le texte suivant en ${targetLang} de manière naturelle et fluide. Réponds UNIQUEMENT avec la traduction, sans explications.`
          }, {
            role: 'user',
            content: text
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content?.trim() || text;
    }
  } catch (error) {
    logger.error('Translation error in WebSocket', error);
    return text; // Fallback au texte original
  }
}

// ===================================
// WEBSOCKET HANDLERS
// ===================================

io.on('connection', (socket) => {
  logger.info('Client WebSocket connecté', socket.id);

  // Authentification Socket.IO
  socket.on('authenticate', (token) => {
    const user = authManager.verifyToken(token);
    if (user) {
      socket.userId = user.email;
      socket.join(`user:${user.email}`);

      // Mettre à jour le statut utilisateur
      statusesDB.upsert(user.email, 'online');

      logger.info('Socket authenticated', { userId: user.email, socketId: socket.id });
      socket.emit('authenticated', { success: true });
    } else {
      socket.emit('auth_error', { error: 'Token invalide' });
      socket.disconnect();
    }
  });

  // Rejoindre les salles de groupes
  socket.on('join_rooms', (data) => {
    if (!socket.userId) {
      return socket.emit('error', { message: 'Non authentifié' });
    }

    if (!validateWebSocketData(data, ['groupIds'])) {
      return socket.emit('error', { message: 'Données invalides' });
    }

    const { groupIds } = data;
    groupIds.forEach(groupId => {
      socket.join(`group:${groupId}`);
    });

    logger.info('User joined group rooms', { userId: socket.userId, groupCount: groupIds.length });
  });

  // Message de groupe
  socket.on('group_message', async (data) => {
    if (!socket.userId) {
      return socket.emit('error', { message: 'Non authentifié' });
    }

    if (!validateWebSocketData(data, ['groupId', 'message', 'timestamp'])) {
      return socket.emit('error', { message: 'Données invalides' });
    }

    const { groupId, message, timestamp, targetLang, translationProvider } = data;
    const userEmail = socket.userId;

    // Vérifier que l'utilisateur est membre du groupe
    const group = groups[groupId];
    if (!group || !group.members.some(m => m.email === userEmail)) {
      return socket.emit('error', { message: 'Accès refusé' });
    }

    // Préparer le message
    let messageData = {
      id: `msg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      sender: userEmail,
      message,
      timestamp,
      translations: {}
    };

    // Traduire si demandé
    if (targetLang) {
      try {
        const translated = await translateMessage(message, targetLang, translationProvider || 'openai');
        messageData.translations[targetLang] = translated;
      } catch (error) {
        logger.error('Translation error in group message', error);
      }
    }

    // Sauvegarder dans la DB
    addGroupMessage(groupId, messageData);

    // Invalider le cache
    clearMessagesCache(groupId);

    // Diffuser à tous les membres du groupe
    io.to(`group:${groupId}`).emit('group_message', messageData);

    logger.info('Group message sent', {
      groupId,
      sender: userEmail,
      messageLength: message.length,
      hasTranslation: !!targetLang
    });
  });

  // Message privé (DM)
  socket.on('dm_message', async (data) => {
    if (!socket.userId) {
      return socket.emit('error', { message: 'Non authentifié' });
    }

    if (!validateWebSocketData(data, ['to', 'message', 'timestamp'])) {
      return socket.emit('error', { message: 'Données invalides' });
    }

    const { to, message, timestamp, targetLang, translationProvider } = data;
    const userEmail = socket.userId;

    const conversationId = getConversationId(userEmail, to);

    // Préparer le message
    let messageData = {
      id: `dm-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      sender: userEmail,
      message,
      timestamp,
      translations: {}
    };

    // Traduire si demandé
    if (targetLang) {
      try {
        const translated = await translateMessage(message, targetLang, translationProvider || 'openai');
        messageData.translations[targetLang] = translated;
      } catch (error) {
        logger.error('Translation error in DM', error);
      }
    }

    // Sauvegarder dans la DB
    addDirectMessage(conversationId, messageData);

    // Invalider le cache
    clearDMsCache(conversationId);

    // Envoyer au destinataire
    io.to(`user:${to}`).emit('dm_message', {
      from: userEmail,
      conversationId,
      ...messageData
    });

    // Confirmer l'envoi à l'expéditeur
    socket.emit('dm_sent', { conversationId, messageId: messageData.id });

    logger.info('DM sent', {
      from: userEmail,
      to,
      messageLength: message.length,
      hasTranslation: !!targetLang
    });
  });

  // Typing indicators
  socket.on('typing_start', (data) => {
    if (!socket.userId) return;

    if (data.groupId) {
      socket.to(`group:${data.groupId}`).emit('user_typing', {
        groupId: data.groupId,
        user: socket.userId
      });
    } else if (data.to) {
      socket.to(`user:${data.to}`).emit('user_typing_dm', {
        from: socket.userId
      });
    }
  });

  socket.on('typing_stop', (data) => {
    if (!socket.userId) return;

    if (data.groupId) {
      socket.to(`group:${data.groupId}`).emit('user_stopped_typing', {
        groupId: data.groupId,
        user: socket.userId
      });
    } else if (data.to) {
      socket.to(`user:${data.to}`).emit('user_stopped_typing_dm', {
        from: socket.userId
      });
    }
  });

  // Déconnexion
  socket.on('disconnect', () => {
    if (socket.userId) {
      // Mettre à jour le statut utilisateur
      statusesDB.upsert(socket.userId, 'offline');
      logger.info('User disconnected', { userId: socket.userId, socketId: socket.id });
    } else {
      logger.info('Client WebSocket déconnecté', socket.id);
    }
  });
});

// ===================================
// MONTAGE DES ROUTES API
// ===================================

// Monter toutes les routes modulaires sous /api
const apiRouter = setupRoutes({ io });
app.use('/api', apiRouter);

// ===================================
// ROUTE CATCH-ALL (FRONTEND)
// ===================================

// Servir le frontend pour toutes les autres routes
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../frontend/index.html'));
});

// ===================================
// INITIALISATION & DÉMARRAGE
// ===================================

// Initialiser la base de données
initDatabase();

// Démarrer le serveur
httpServer.listen(PORT, () => {
  logger.info(`✅ RealTranslate Backend démarré sur http://localhost:${PORT}`);
  logger.info('✅ WebSocket server ready');
  logger.info('✅ API endpoints disponibles');
  logger.info('✅ Base de données SQLite initialisée');
  logger.info('📊 Architecture modulaire Phase 2.2 activée');
});

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
});

export { app, httpServer, io };
