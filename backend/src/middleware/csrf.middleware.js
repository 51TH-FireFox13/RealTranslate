/**
 * Middleware de protection CSRF (Cross-Site Request Forgery)
 * Centralise la logique de génération et vérification des tokens CSRF
 */

import {
  verifyCSRFToken as baseVerifyCSRFToken,
  csrfTokenEndpoint,
  exemptCSRF
} from '../../csrf-protection.js';
import { logger } from '../utils/logger.js';

/**
 * Routes exemptées de la vérification CSRF
 * Ces routes ne nécessitent pas de token CSRF
 */
export const CSRF_EXEMPT_PATHS = [
  // Webhooks externes
  '/api/webhook/stripe',
  '/api/webhook/paypal',
  '/api/webhook/wechat',

  // Endpoints publics d'authentification
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/guest',

  // Endpoint pour obtenir un token CSRF
  '/api/csrf-token',

  // Endpoints publics
  '/api/health',
  '/api/detect-region',

  // Services IA (protégés par Bearer token authentication)
  '/api/translate',
  '/api/transcribe',
  '/api/speak',
];

/**
 * Middleware de vérification CSRF avec exemptions
 * Vérifie le token CSRF pour toutes les requêtes mutantes (POST, PUT, DELETE, PATCH)
 * sauf pour les routes exemptées
 */
export function csrfProtection(req, res, next) {
  // Désactiver CSRF en mode test
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  // Méthodes GET, HEAD, OPTIONS ne nécessitent pas de protection CSRF
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Vérifier si la route est exemptée
  if (CSRF_EXEMPT_PATHS.includes(req.path)) {
    logger.info('CSRF check bypassed for exempt path', {
      path: req.path,
      method: req.method
    });
    return next();
  }

  // Vérifier si la requête a été marquée comme exemptée par le middleware exemptFromCSRF
  if (req.csrfExempt === true) {
    logger.info('CSRF check bypassed via exemptFromCSRF middleware', {
      path: req.path
    });
    return next();
  }

  // Exempter automatiquement les routes API protégées par Bearer token
  // Ces routes sont déjà sécurisées par JWT et ne nécessitent pas de CSRF
  const authHeader = req.headers.authorization;
  if (req.path.startsWith('/api/') && authHeader && authHeader.startsWith('Bearer ')) {
    logger.info('CSRF check bypassed for Bearer token authenticated API request', {
      path: req.path,
      method: req.method
    });
    return next();
  }

  // Appliquer la vérification CSRF
  return baseVerifyCSRFToken(req, res, next);
}

/**
 * Middleware qui exempte explicitement une route de la protection CSRF
 * Usage: app.post('/api/special', exemptFromCSRF, (req, res) => { ... })
 */
export function exemptFromCSRF(req, res, next) {
  req.csrfExempt = true;
  next();
}

/**
 * Endpoint pour obtenir un token CSRF
 * Usage: GET /api/csrf-token
 */
export const getCsrfToken = csrfTokenEndpoint;

/**
 * Ajoute une route à la liste des routes exemptées
 * @param {string} path - Chemin de la route à exempter
 */
export function addCSRFExemptPath(path) {
  if (!CSRF_EXEMPT_PATHS.includes(path)) {
    CSRF_EXEMPT_PATHS.push(path);
    logger.info('Added CSRF exempt path', { path });
  }
}

/**
 * Vérifie si un chemin est exempté de CSRF
 * @param {string} path - Chemin à vérifier
 * @returns {boolean} true si exempté
 */
export function isCSRFExempt(path) {
  return CSRF_EXEMPT_PATHS.includes(path);
}

/**
 * Middleware de logging CSRF pour debugging
 * Log les requêtes qui passent par la vérification CSRF
 */
export function csrfDebugLogger(req, res, next) {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const token = req.headers['x-csrf-token'] || req.cookies['csrf_token'];
    const exempt = isCSRFExempt(req.path);

    logger.info('CSRF Debug', {
      method: req.method,
      path: req.path,
      hasToken: !!token,
      exempt,
      ip: req.ip
    });
  }

  next();
}

export default {
  csrfProtection,
  exemptFromCSRF,
  getCsrfToken,
  addCSRFExemptPath,
  isCSRFExempt,
  csrfDebugLogger,
  CSRF_EXEMPT_PATHS
};
