/**
 * @fileoverview Point d'entrée principal du serveur RealTranslate (Version modulaire finale)
 * @version 3.0.0
 *
 * Architecture modulaire Phase 2 complète :
 * - Routes API : src/routes/*
 * - Services métier : src/services/*
 * - WebSocket handlers : src/websocket/*
 * - Middlewares : src/middleware/*
 * - Configuration : src/config/*
 *
 * Réduction : ~2900 lignes → ~150 lignes (~95% de réduction)
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// Configuration
dotenv.config();

// Imports internes
import { logger, accessLoggerMiddleware } from './logger.js';
import { initDatabase } from './database.js';
import { csrfProtection } from './src/middleware/csrf.middleware.js';
import { setupRoutes } from './src/routes/index.js';
import { setupWebSocket } from './src/websocket/socket.js';
import { authSocketMiddleware } from './src/websocket/middleware/auth.middleware.js';

// Variables d'environnement
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ===================================
// INITIALISATION EXPRESS
// ===================================

const app = express();
const httpServer = createServer(app);

// Configuration Socket.IO
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// ===================================
// MIDDLEWARES GLOBAUX
// ===================================

// CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
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
// Utilise csrfProtection qui gère les exemptions pour login/register
app.use(csrfProtection);

// ===================================
// ROUTES API
// ===================================

// Monter toutes les routes modulaires sous /api
const apiRouter = setupRoutes({ io });
app.use('/api', apiRouter);

// ===================================
// WEBSOCKET
// ===================================

// Middleware d'authentification WebSocket
io.use(authSocketMiddleware);

// Configuration et handlers WebSocket
setupWebSocket(io);

// ===================================
// ROUTE CATCH-ALL (FRONTEND SPA)
// ===================================

// Servir le frontend pour toutes les autres routes
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../frontend/index.html'));
});

// ===================================
// GESTION DES ERREURS GLOBALES
// ===================================

// Middleware de gestion d'erreurs
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });

  res.status(err.status || 500).json({
    error: NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Exceptions non capturées
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// Promesses rejetées non gérées
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', {
    reason,
    promise
  });
});

// ===================================
// INITIALISATION & DÉMARRAGE
// ===================================

// Initialiser la base de données
try {
  initDatabase();
  logger.info('✅ Base de données SQLite initialisée');
} catch (error) {
  logger.error('❌ Erreur initialisation base de données', { error: error.message });
  process.exit(1);
}

// Démarrer le serveur
httpServer.listen(PORT, () => {
  logger.info('🚀 ============================================');
  logger.info('🚀  RealTranslate Backend - Version 3.0.0');
  logger.info('🚀 ============================================');
  logger.info(`🚀  Server: http://localhost:${PORT}`);
  logger.info(`🚀  Environment: ${NODE_ENV}`);
  logger.info('🚀  WebSocket: ✅ Ready');
  logger.info('🚀  API endpoints: ✅ Loaded');
  logger.info('🚀  Database: ✅ SQLite');
  logger.info('🚀  Architecture: ✅ Modulaire (Phase 2)');
  logger.info('🚀 ============================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Exports
export { app, httpServer, io };
