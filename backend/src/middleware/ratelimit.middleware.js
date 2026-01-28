/**
 * @fileoverview Middleware de rate limiting pour les endpoints coûteux
 * @module middleware/ratelimit
 *
 * Ce module fournit des limiteurs de débit pour :
 * - Transcription audio (Whisper API - coûteux)
 * - Traduction de texte (OpenAI/DeepSeek)
 * - Synthèse vocale (TTS)
 * - Upload de fichiers
 *
 * Le rate limiting est appliqué par IP ET par utilisateur pour une protection double.
 */

import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger.js';

/**
 * Extrait l'identifiant unique pour le rate limiting
 * Combine IP et email utilisateur si disponible
 */
function getKeyGenerator(req) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const userEmail = req.user?.email || 'anonymous';
  return `${ip}:${userEmail}`;
}

/**
 * Handler appelé quand la limite est atteinte
 */
function createLimitHandler(action) {
  return (req, res, options) => {
    logger.warn('Rate limit exceeded', {
      action,
      ip: req.ip,
      user: req.user?.email || 'anonymous',
      limit: options.max,
      windowMs: options.windowMs
    });

    res.status(429).json({
      error: `Trop de requêtes. Veuillez réessayer dans ${Math.ceil(options.windowMs / 60000)} minute(s).`,
      retryAfter: Math.ceil(options.windowMs / 1000)
    });
  };
}

/**
 * Rate limiter pour la transcription audio (Whisper)
 * Limite stricte car c'est l'endpoint le plus coûteux
 * 10 requêtes par minute par utilisateur
 */
export const transcribeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requêtes max
  keyGenerator: getKeyGenerator,
  handler: createLimitHandler('transcribe'),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Ne pas limiter les admins
    return req.user?.role === 'admin';
  }
});

/**
 * Rate limiter pour la traduction
 * Plus permissif car moins coûteux
 * 30 requêtes par minute par utilisateur
 */
export const translateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requêtes max
  keyGenerator: getKeyGenerator,
  handler: createLimitHandler('translate'),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.user?.role === 'admin';
  }
});

/**
 * Rate limiter pour la synthèse vocale (TTS)
 * 15 requêtes par minute par utilisateur
 */
export const speakLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15, // 15 requêtes max
  keyGenerator: getKeyGenerator,
  handler: createLimitHandler('speak'),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.user?.role === 'admin';
  }
});

/**
 * Rate limiter pour l'upload de fichiers
 * 20 uploads par 5 minutes par utilisateur
 */
export const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 uploads max
  keyGenerator: getKeyGenerator,
  handler: createLimitHandler('upload'),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.user?.role === 'admin';
  }
});

/**
 * Rate limiter global pour les API sensibles
 * Protection contre les abus généraux
 * 100 requêtes par minute par IP
 */
export const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requêtes max par minute
  keyGenerator: (req) => req.ip || 'unknown',
  handler: createLimitHandler('global'),
  standardHeaders: true,
  legacyHeaders: false
});

export default {
  transcribeLimiter,
  translateLimiter,
  speakLimiter,
  uploadLimiter,
  globalApiLimiter
};
