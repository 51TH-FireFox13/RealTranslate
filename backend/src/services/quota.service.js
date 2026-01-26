/**
 * @fileoverview Service de gestion des quotas utilisateur
 * @module services/quota
 *
 * Ce service gère les quotas d'utilisation des APIs d'IA :
 * - Transcription (Whisper)
 * - Traduction (GPT/DeepSeek)
 * - Synthèse vocale (TTS)
 *
 * Quotas par tier :
 * - Free: 50 transcriptions, 250 traductions, 50 TTS / jour
 * - Premium: 500 transcriptions, 2000 traductions, 500 TTS / jour
 * - Enterprise: Illimité
 */

import { quotasDB } from '../../database.js';
import { logger } from '../../logger.js';

// Limites par tier
const QUOTA_LIMITS = {
  free: {
    transcribe: 50,
    translate: 250,
    speak: 50
  },
  premium: {
    transcribe: 500,
    translate: 2000,
    speak: 500
  },
  enterprise: {
    transcribe: Infinity,
    translate: Infinity,
    speak: Infinity
  }
};

/**
 * Récupère les quotas d'un utilisateur
 * @param {string} userEmail - Email de l'utilisateur
 * @returns {Object} - Quotas utilisés { transcribe, translate, speak }
 */
export function getUserQuotas(userEmail) {
  try {
    const quotaData = quotasDB.get(userEmail);

    if (!quotaData) {
      // Créer quotas par défaut
      quotasDB.getOrCreate(userEmail);
      return { transcribe: 0, translate: 0, speak: 0 };
    }

    return {
      transcribe: quotaData.transcribe_used || 0,
      translate: quotaData.translate_used || 0,
      speak: quotaData.speak_used || 0
    };
  } catch (error) {
    logger.error('Error getting user quotas', { userEmail, error: error.message });
    return { transcribe: 0, translate: 0, speak: 0 };
  }
}

/**
 * Récupère les limites de quotas pour un tier
 * @param {string} tier - Tier de l'utilisateur (free, premium, enterprise)
 * @returns {Object} - Limites { transcribe, translate, speak }
 */
export function getQuotaLimits(tier) {
  const normalizedTier = (tier || 'free').toLowerCase();
  return QUOTA_LIMITS[normalizedTier] || QUOTA_LIMITS.free;
}

/**
 * Vérifie si un utilisateur a dépassé un quota spécifique
 * @param {string} userEmail - Email de l'utilisateur
 * @param {string} quotaType - Type de quota ('transcribe', 'translate', 'speak')
 * @param {string} userTier - Tier de l'utilisateur
 * @returns {boolean} - true si quota dépassé
 */
export function hasExceededQuota(userEmail, quotaType, userTier = 'free') {
  try {
    const quotas = getUserQuotas(userEmail);
    const limits = getQuotaLimits(userTier);

    const used = quotas[quotaType] || 0;
    const limit = limits[quotaType];

    // Enterprise = illimité
    if (limit === Infinity) {
      return false;
    }

    return used >= limit;
  } catch (error) {
    logger.error('Error checking quota', { userEmail, quotaType, error: error.message });
    return false; // En cas d'erreur, ne pas bloquer
  }
}

/**
 * Incrémente un quota utilisateur
 * @param {string} userEmail - Email de l'utilisateur
 * @param {string} quotaType - Type de quota à incrémenter
 * @returns {Object} - Nouveaux quotas { transcribe, translate, speak }
 */
export function incrementQuota(userEmail, quotaType) {
  try {
    // Vérifier que le type de quota est valide
    if (!['transcribe', 'translate', 'speak'].includes(quotaType)) {
      throw new Error(`Invalid quota type: ${quotaType}`);
    }

    // Incrémenter dans la DB
    quotasDB.increment(userEmail, quotaType);

    // Retourner les nouveaux quotas
    return getUserQuotas(userEmail);
  } catch (error) {
    logger.error('Error incrementing quota', { userEmail, quotaType, error: error.message });
    throw error;
  }
}

/**
 * Réinitialise les quotas d'un utilisateur
 * @param {string} userEmail - Email de l'utilisateur
 * @returns {boolean} - true si succès
 */
export function resetUserQuotas(userEmail) {
  try {
    quotasDB.reset(userEmail);
    logger.info('User quotas reset', { userEmail });
    return true;
  } catch (error) {
    logger.error('Error resetting quotas', { userEmail, error: error.message });
    return false;
  }
}

/**
 * Réinitialise tous les quotas (cron job quotidien)
 * @returns {number} - Nombre d'utilisateurs réinitialisés
 */
export function resetAllQuotas() {
  try {
    const count = quotasDB.resetAll();
    logger.info('All quotas reset', { count });
    return count;
  } catch (error) {
    logger.error('Error resetting all quotas', { error: error.message });
    return 0;
  }
}

/**
 * Récupère le résumé des quotas pour affichage utilisateur
 * @param {string} userEmail - Email de l'utilisateur
 * @param {string} userTier - Tier de l'utilisateur
 * @returns {Object} - Résumé { used, limits, percentages }
 */
export function getQuotaSummary(userEmail, userTier = 'free') {
  const used = getUserQuotas(userEmail);
  const limits = getQuotaLimits(userTier);

  // Calculer les pourcentages
  const percentages = {
    transcribe: limits.transcribe === Infinity ? 0 : Math.round((used.transcribe / limits.transcribe) * 100),
    translate: limits.translate === Infinity ? 0 : Math.round((used.translate / limits.translate) * 100),
    speak: limits.speak === Infinity ? 0 : Math.round((used.speak / limits.speak) * 100)
  };

  return {
    used,
    limits,
    percentages,
    tier: userTier
  };
}

/**
 * Vérifie si un utilisateur peut utiliser un service
 * @param {string} userEmail - Email de l'utilisateur
 * @param {string} quotaType - Type de quota
 * @param {string} userTier - Tier de l'utilisateur
 * @returns {Object} - { allowed: boolean, reason?: string }
 */
export function checkQuotaAllowance(userEmail, quotaType, userTier = 'free') {
  try {
    const exceeded = hasExceededQuota(userEmail, quotaType, userTier);

    if (exceeded) {
      const limits = getQuotaLimits(userTier);
      return {
        allowed: false,
        reason: `Quota ${quotaType} dépassé. Limite : ${limits[quotaType]}/${userTier === 'enterprise' ? 'illimité' : 'jour'}.`
      };
    }

    return { allowed: true };
  } catch (error) {
    logger.error('Error checking quota allowance', { userEmail, quotaType, error: error.message });
    return { allowed: true }; // En cas d'erreur, autoriser (fail-open)
  }
}

/**
 * Middleware Express pour vérifier les quotas avant traitement
 * @param {string} quotaType - Type de quota à vérifier
 * @returns {Function} - Middleware Express
 */
export function quotaMiddleware(quotaType) {
  return (req, res, next) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const { allowed, reason } = checkQuotaAllowance(user.email, quotaType, user.tier);

    if (!allowed) {
      return res.status(429).json({
        error: 'Quota dépassé',
        message: reason,
        quota: getQuotaSummary(user.email, user.tier)
      });
    }

    // Passer au prochain middleware
    next();
  };
}

export default {
  getUserQuotas,
  getQuotaLimits,
  hasExceededQuota,
  incrementQuota,
  resetUserQuotas,
  resetAllQuotas,
  getQuotaSummary,
  checkQuotaAllowance,
  quotaMiddleware
};
