/**
 * Configuration CORS (Cross-Origin Resource Sharing)
 * Gère les origines autorisées et les options CORS
 */

import cors from 'cors';
import { logger } from '../utils/logger.js';

/**
 * Origines autorisées par défaut
 */
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173', // Vite dev server
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
];

/**
 * Obtient la liste des origines autorisées depuis les variables d'environnement
 * @returns {string[]} Liste des origines autorisées
 */
function getAllowedOrigins() {
  const envOrigins = process.env.ALLOWED_ORIGINS;

  if (envOrigins) {
    // Parse la variable d'environnement (format: "origin1,origin2,origin3")
    const origins = envOrigins.split(',').map(origin => origin.trim());
    logger.info('CORS allowed origins from env', { origins });
    return origins;
  }

  // En développement, autoriser localhost
  if (process.env.NODE_ENV === 'development') {
    logger.info('CORS allowed origins (development)', { origins: DEFAULT_ALLOWED_ORIGINS });
    return DEFAULT_ALLOWED_ORIGINS;
  }

  // En production, ne rien autoriser par défaut (doit être configuré explicitement)
  logger.warn('No CORS origins configured for production!');
  return [];
}

/**
 * Configuration CORS
 */
export const CORS_CONFIG = {
  // Origines autorisées
  allowedOrigins: getAllowedOrigins(),

  // Méthodes HTTP autorisées
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],

  // Headers autorisés
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-CSRF-Token',
    'Accept',
    'Origin'
  ],

  // Headers exposés au client
  exposedHeaders: [
    'X-CSRF-Token',
    'Content-Length',
    'Content-Type'
  ],

  // Autoriser les credentials (cookies, auth headers)
  credentials: true,

  // Préflight cache (en secondes)
  maxAge: 600, // 10 minutes

  // Autoriser toutes les origines en développement
  allowAllInDevelopment: true
};

/**
 * Fonction de vérification des origines
 * @param {string} origin - Origine de la requête
 * @param {Function} callback - Callback(error, allow)
 */
function checkOrigin(origin, callback) {
  // Pas d'origine = requête same-origin (curl, Postman, etc.)
  if (!origin) {
    return callback(null, true);
  }

  // En développement, autoriser toutes les origines si configuré
  if (process.env.NODE_ENV === 'development' && CORS_CONFIG.allowAllInDevelopment) {
    logger.info('CORS: Allowing all origins in development', { origin });
    return callback(null, true);
  }

  // Vérifier si l'origine est dans la liste autorisée
  if (CORS_CONFIG.allowedOrigins.includes(origin)) {
    callback(null, true);
  } else {
    logger.warn('CORS: Origin not allowed', { origin, allowedOrigins: CORS_CONFIG.allowedOrigins });
    callback(new Error('Not allowed by CORS'));
  }
}

/**
 * Options CORS pour le middleware
 */
const corsOptions = {
  origin: checkOrigin,
  methods: CORS_CONFIG.methods,
  allowedHeaders: CORS_CONFIG.allowedHeaders,
  exposedHeaders: CORS_CONFIG.exposedHeaders,
  credentials: CORS_CONFIG.credentials,
  maxAge: CORS_CONFIG.maxAge,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

/**
 * Retourne le middleware CORS configuré
 * @returns {Function} Middleware CORS
 */
export function getCorsMiddleware() {
  return cors(corsOptions);
}

/**
 * Configuration CORS pour Socket.IO
 */
export const SOCKET_CORS_CONFIG = {
  origin: (origin, callback) => {
    // Socket.IO utilise la même logique que Express
    checkOrigin(origin, callback);
  },
  methods: ['GET', 'POST'],
  credentials: true,
  allowedHeaders: CORS_CONFIG.allowedHeaders
};

/**
 * Vérifie si une origine est autorisée (utilitaire)
 * @param {string} origin - Origine à vérifier
 * @returns {boolean} true si autorisée
 */
export function isOriginAllowed(origin) {
  if (!origin) return true;
  if (process.env.NODE_ENV === 'development' && CORS_CONFIG.allowAllInDevelopment) return true;
  return CORS_CONFIG.allowedOrigins.includes(origin);
}

/**
 * Ajoute une origine aux origines autorisées (utilitaire)
 * @param {string} origin - Origine à ajouter
 */
export function addAllowedOrigin(origin) {
  if (!CORS_CONFIG.allowedOrigins.includes(origin)) {
    CORS_CONFIG.allowedOrigins.push(origin);
    logger.info('Added allowed origin', { origin });
  }
}

export default {
  CORS_CONFIG,
  SOCKET_CORS_CONFIG,
  getCorsMiddleware,
  isOriginAllowed,
  addAllowedOrigin
};
