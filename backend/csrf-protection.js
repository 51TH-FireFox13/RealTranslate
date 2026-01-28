import crypto from 'crypto';
import { logger } from './logger.js';

/**
 * Module de protection CSRF (Cross-Site Request Forgery)
 *
 * Stratégie utilisée : Double Submit Cookie
 * 1. Génère un token CSRF aléatoire
 * 2. Stocke le token dans un cookie HttpOnly
 * 3. Client doit envoyer le même token dans un header X-CSRF-Token
 * 4. Serveur compare les deux tokens
 *
 * Compatible avec SPA (Single Page Application)
 */

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';

// Stockage en mémoire des tokens CSRF (par session/token d'auth)
// Structure: { authToken: csrfToken }
const csrfTokens = new Map();

/**
 * Génère un token CSRF aléatoire
 * @returns {string} Token CSRF
 */
export function generateCSRFToken() {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * Middleware Express pour générer et attacher un token CSRF
 * À utiliser sur les routes GET qui servent l'application
 */
export function attachCSRFToken(req, res, next) {
  // Générer un nouveau token CSRF
  const csrfToken = generateCSRFToken();

  // Stocker le token dans un cookie HttpOnly
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS uniquement en prod
    sameSite: 'strict', // Protection CSRF supplémentaire
    maxAge: 24 * 60 * 60 * 1000, // 24 heures
  });

  // Associer le token CSRF au token d'authentification (si présent)
  if (req.user && req.headers.authorization) {
    const authToken = req.headers.authorization.split(' ')[1];
    csrfTokens.set(authToken, csrfToken);
  }

  // Passer le token au client via header (pour les SPAs)
  res.set('X-CSRF-Token', csrfToken);

  next();
}

/**
 * Middleware Express pour vérifier le token CSRF
 * À utiliser sur toutes les routes mutantes (POST, PUT, DELETE, PATCH)
 */
export function verifyCSRFToken(req, res, next) {
  // Méthodes sûres exemptées de vérification CSRF (selon la RFC)
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Récupérer le token CSRF du cookie
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];

  // Récupérer le token CSRF du header
  const headerToken = req.headers[CSRF_HEADER_NAME] || req.headers[CSRF_HEADER_NAME.toLowerCase()];

  // Vérifier que les deux tokens existent
  if (!cookieToken || !headerToken) {
    logger.warn('CSRF token missing', {
      method: req.method,
      path: req.path,
      hasCookie: !!cookieToken,
      hasHeader: !!headerToken,
      ip: req.ip,
    });

    return res.status(403).json({
      error: 'CSRF token manquant. Veuillez recharger la page.',
      code: 'CSRF_TOKEN_MISSING',
    });
  }

  // Comparer les deux tokens (protection contre les attaques temporelles)
  const isValid = timingSafeEqual(cookieToken, headerToken);

  if (!isValid) {
    logger.warn('CSRF token mismatch', {
      method: req.method,
      path: req.path,
      ip: req.ip,
    });

    return res.status(403).json({
      error: 'Token CSRF invalide. Veuillez recharger la page.',
      code: 'CSRF_TOKEN_INVALID',
    });
  }

  // Token valide, continuer
  next();
}

/**
 * Middleware Express pour les webhooks externes
 * Les webhooks ne peuvent pas avoir de CSRF car ils viennent de services tiers
 * À utiliser sur les routes de webhooks (Stripe, PayPal, etc.)
 */
export function exemptCSRF(req, res, next) {
  // Marquer la requête comme exemptée de vérification CSRF
  req.csrfExempt = true;
  next();
}

/**
 * Middleware conditionnel qui vérifie CSRF sauf pour les routes exemptées
 */
export function conditionalCSRF(req, res, next) {
  if (req.csrfExempt) {
    return next();
  }
  return verifyCSRFToken(req, res, next);
}

/**
 * Nettoie les tokens CSRF expirés du cache
 * À appeler périodiquement (ex: toutes les heures)
 */
export function cleanupExpiredTokens() {
  // Pour l'instant, on garde tous les tokens
  // Dans une vraie application, on associerait un timestamp et on supprimerait les vieux tokens
  logger.info('CSRF token cleanup executed', { tokensCount: csrfTokens.size });
}

/**
 * Comparaison sécurisée de chaînes (protection contre les attaques temporelles)
 * @param {string} a - Première chaîne
 * @param {string} b - Deuxième chaîne
 * @returns {boolean} true si égales, false sinon
 */
function timingSafeEqual(a, b) {
  if (!a || !b || a.length !== b.length) {
    return false;
  }

  try {
    // Utiliser crypto.timingSafeEqual pour éviter les attaques temporelles
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    return crypto.timingSafeEqual(bufA, bufB);
  } catch (error) {
    logger.error('Error in timingSafeEqual', { error: error.message });
    return false;
  }
}

/**
 * Endpoint Express pour obtenir un token CSRF
 * Utile pour les SPAs qui chargent via AJAX
 */
export function csrfTokenEndpoint(req, res) {
  const csrfToken = generateCSRFToken();

  // Stocker le token dans un cookie
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
  });

  // Retourner le token au client
  res.json({
    csrfToken,
    expiresIn: 24 * 60 * 60, // secondes
  });
}

export default {
  generateCSRFToken,
  attachCSRFToken,
  verifyCSRFToken,
  exemptCSRF,
  conditionalCSRF,
  cleanupExpiredTokens,
  csrfTokenEndpoint,
};
