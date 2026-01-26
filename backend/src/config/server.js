/**
 * Configuration centralisée du serveur Express
 * Initialise et configure l'application Express avec tous les middlewares nécessaires
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger, accessLoggerMiddleware } from '../utils/logger.js';
import { getCorsMiddleware } from './cors.js';
import { verifyCSRFToken } from '../../csrf-protection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Chemins importants
export const PATHS = {
  root: join(__dirname, '../..'),
  frontend: join(__dirname, '../../../frontend'),
  uploads: join(__dirname, '../../uploads')
};

/**
 * Routes exemptées de la vérification CSRF
 */
const CSRF_EXEMPT_PATHS = [
  '/api/webhook/stripe',
  '/api/webhook/paypal',
  '/api/webhook/wechat',
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/guest',
  '/api/csrf-token',
];

/**
 * Middleware de vérification CSRF conditionnelle
 * Exempte certaines routes comme les webhooks
 */
function csrfMiddleware(req, res, next) {
  // Vérifier si la route est exemptée
  if (CSRF_EXEMPT_PATHS.includes(req.path)) {
    return next();
  }

  // Appliquer la vérification CSRF
  return verifyCSRFToken(req, res, next);
}

/**
 * Configure tous les middlewares de base de l'application Express
 * @param {express.Application} app - Instance Express
 */
export function configureMiddlewares(app) {
  // CORS
  app.use(getCorsMiddleware());

  // Cookie parser (requis pour CSRF protection)
  app.use(cookieParser());

  // Body parsers
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Access logger (log toutes les requêtes)
  app.use(accessLoggerMiddleware);

  // Protection CSRF pour routes mutantes
  app.use(csrfMiddleware);

  // Fichiers statiques
  app.use(express.static(PATHS.frontend));
  app.use('/uploads', express.static(PATHS.uploads));

  logger.info('Express middlewares configured');
}

/**
 * Crée et configure une nouvelle application Express
 * @returns {express.Application} Application configurée
 */
export function createExpressApp() {
  const app = express();

  // Configurer les middlewares
  configureMiddlewares(app);

  return app;
}

/**
 * Configuration du serveur
 */
export const SERVER_CONFIG = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'development',

  // Timeouts
  requestTimeout: 30000, // 30 secondes
  keepAliveTimeout: 65000, // 65 secondes (> load balancer timeout)

  // Limits
  bodyLimit: '10mb',
  parameterLimit: 1000,

  // Trust proxy (si derrière un reverse proxy)
  trustProxy: process.env.TRUST_PROXY === 'true',

  // Helpers
  isDevelopment() {
    return this.env === 'development';
  },

  isProduction() {
    return this.env === 'production';
  },

  isTest() {
    return this.env === 'test';
  }
};

/**
 * Configure les paramètres avancés du serveur HTTP
 * @param {http.Server} server - Serveur HTTP
 */
export function configureServer(server) {
  // Timeouts
  server.timeout = SERVER_CONFIG.requestTimeout;
  server.keepAliveTimeout = SERVER_CONFIG.keepAliveTimeout;

  // Headers timeout (légèrement supérieur au keepAlive)
  server.headersTimeout = SERVER_CONFIG.keepAliveTimeout + 1000;

  logger.info('HTTP server configured', {
    timeout: server.timeout,
    keepAliveTimeout: server.keepAliveTimeout
  });
}

export default {
  PATHS,
  SERVER_CONFIG,
  createExpressApp,
  configureMiddlewares,
  configureServer,
  CSRF_EXEMPT_PATHS
};
