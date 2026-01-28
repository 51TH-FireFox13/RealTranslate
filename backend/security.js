/**
 * Module de sécurité pour RealTranslate
 * Gestion du rate limiting, CORS, et protections diverses
 */

import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Configuration Helmet pour sécuriser les en-têtes HTTP
 */
export function configureHelmet() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        connectSrc: ["'self'", 'https://api.openai.com', 'https://api.deepseek.com', 'wss:'],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'", 'blob:'],
        frameSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Pour compatibilité WebRTC
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: {
      maxAge: 31536000, // 1 an
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
    hidePoweredBy: true,
  });
}

/**
 * Configuration CORS avec whitelist de domaines
 */
export function configureCORS() {
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : ['http://localhost:3000'];

  const corsOptions = {
    origin: (origin, callback) => {
      // Autoriser les requêtes sans origine (apps mobiles, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Non autorisé par CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 600, // 10 minutes
  };

  return cors(corsOptions);
}

/**
 * Rate limiter global pour toutes les requêtes
 */
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limite de 1000 requêtes par IP
  message: {
    error: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true, // Retourne les infos dans les headers `RateLimit-*`
  legacyHeaders: false,
  // Clé basée sur l'IP
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress;
  },
});

/**
 * Rate limiter strict pour l'authentification (login, register)
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 tentatives maximum
  skipSuccessfulRequests: true, // Ne compte que les échecs
  message: {
    error: 'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter pour les opérations sensibles (changement de mot de passe, etc.)
 */
export const sensitiveOperationsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 3, // 3 tentatives par heure
  message: {
    error: 'Trop de tentatives pour cette opération sensible. Veuillez réessayer plus tard.',
    retryAfter: '1 heure',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter pour les API de traduction/transcription
 */
export const translationRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requêtes par minute
  message: {
    error: 'Limite de requêtes atteinte. Veuillez patienter une minute.',
    retryAfter: '1 minute',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter pour les uploads de fichiers
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // 20 uploads par 10 minutes
  message: {
    error: 'Trop d\'uploads. Veuillez réessayer dans 10 minutes.',
    retryAfter: '10 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter pour les webhooks
 */
export const webhookRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 webhooks par minute (généreux pour les providers)
  message: {
    error: 'Trop de webhooks reçus.',
  },
  standardHeaders: false,
  legacyHeaders: false,
  // Pas de limite basée sur IP pour les webhooks (viennent des providers)
  skip: (req) => {
    // Optionnel: vérifier que c'est bien un webhook légitime
    return false;
  },
});

/**
 * Middleware pour valider les origines des webhooks
 * @param {Array} allowedIPs - Liste des IPs autorisées
 */
export function webhookIPValidator(allowedIPs = []) {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;

    // En développement, autoriser toutes les IPs
    if (process.env.NODE_ENV === 'development') {
      return next();
    }

    // Vérifier si l'IP est dans la liste blanche
    if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
      return res.status(403).json({
        error: 'Accès refusé',
        message: 'IP non autorisée pour les webhooks',
      });
    }

    next();
  };
}

/**
 * Middleware pour logger les requêtes suspectes
 */
export function suspiciousActivityLogger(logger) {
  return (err, req, res, next) => {
    if (err.status === 429) {
      // Rate limit dépassé
      logger.warn('Rate limit dépassé', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('user-agent'),
      });
    }

    if (err.message === 'Non autorisé par CORS') {
      logger.warn('Tentative d\'accès CORS non autorisé', {
        origin: req.get('origin'),
        ip: req.ip,
        path: req.path,
      });
    }

    next(err);
  };
}

/**
 * Middleware pour sanitiser les inputs utilisateur
 */
export function sanitizeInput(req, res, next) {
  // Fonction pour nettoyer récursivement les objets
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      // Supprimer les caractères dangereux
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    }
    if (typeof obj === 'object' && obj !== null) {
      Object.keys(obj).forEach((key) => {
        obj[key] = sanitize(obj[key]);
      });
    }
    return obj;
  };

  // Sanitiser body, query, params
  if (req.body) req.body = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query);
  if (req.params) req.params = sanitize(req.params);

  next();
}

/**
 * Middleware pour forcer HTTPS en production
 */
export function enforceHTTPS(req, res, next) {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
}

/**
 * Génère un nonce pour CSP (Content Security Policy)
 */
export function generateNonce() {
  return Buffer.from(Math.random().toString()).toString('base64');
}

/**
 * Configuration des IPs autorisées pour les webhooks Stripe
 * Source: https://stripe.com/docs/ips
 */
export const STRIPE_WEBHOOK_IPS = [
  '3.18.12.63',
  '3.130.192.231',
  '13.235.14.237',
  '13.235.122.149',
  '18.211.135.69',
  '35.154.171.200',
  '52.15.183.38',
  '54.187.174.169',
  '54.187.205.235',
  '54.187.216.72',
];

export default {
  configureHelmet,
  configureCORS,
  globalRateLimiter,
  authRateLimiter,
  sensitiveOperationsLimiter,
  translationRateLimiter,
  uploadRateLimiter,
  webhookRateLimiter,
  webhookIPValidator,
  suspiciousActivityLogger,
  sanitizeInput,
  enforceHTTPS,
  generateNonce,
  STRIPE_WEBHOOK_IPS,
};
