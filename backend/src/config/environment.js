/**
 * Configuration centralisée des variables d'environnement
 * Charge et valide toutes les variables d'environnement nécessaires
 */

require('dotenv').config();

/**
 * Valide qu'une variable d'environnement requise est définie
 * @param {string} key - Nom de la variable
 * @param {boolean} required - Si la variable est obligatoire
 * @returns {string|undefined}
 */
function getEnvVar(key, required = false) {
  const value = process.env[key];

  if (required && !value) {
    throw new Error(`Variable d'environnement requise manquante: ${key}`);
  }

  return value;
}

/**
 * Configuration de l'environnement
 */
const environment = {
  // Environnement
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Serveur
  PORT: parseInt(process.env.PORT || '3000', 10),
  DISABLE_AUTH: process.env.DISABLE_AUTH === 'true',

  // OpenAI
  OPENAI_API_KEY: getEnvVar('OPENAI_API_KEY', false),

  // DeepSeek
  DEEPSEEK_API_KEY: getEnvVar('DEEPSEEK_API_KEY', false),

  // Stripe
  STRIPE_SECRET_KEY: getEnvVar('STRIPE_SECRET_KEY', false),
  STRIPE_WEBHOOK_SECRET: getEnvVar('STRIPE_WEBHOOK_SECRET', false),
  STRIPE_PRICE_PREMIUM: getEnvVar('STRIPE_PRICE_PREMIUM', false),
  STRIPE_PRICE_ENTERPRISE: getEnvVar('STRIPE_PRICE_ENTERPRISE', false),

  // PayPal
  PAYPAL_MODE: process.env.PAYPAL_MODE || 'sandbox',

  // WeChat Pay
  WECHAT_API_KEY: getEnvVar('WECHAT_API_KEY', false),
  WECHAT_API_V3_KEY: getEnvVar('WECHAT_API_V3_KEY', false),

  // Helpers
  isDevelopment() {
    return this.NODE_ENV === 'development';
  },

  isProduction() {
    return this.NODE_ENV === 'production';
  },

  isTest() {
    return this.NODE_ENV === 'test';
  },

  hasOpenAI() {
    return !!this.OPENAI_API_KEY;
  },

  hasDeepSeek() {
    return !!this.DEEPSEEK_API_KEY;
  },

  hasStripe() {
    return !!(this.STRIPE_SECRET_KEY && this.STRIPE_WEBHOOK_SECRET);
  },

  isPayPalSandbox() {
    return this.PAYPAL_MODE === 'sandbox';
  }
};

// Validation au démarrage (optionnel, peut être activé en production)
function validateConfig() {
  const warnings = [];

  if (!environment.hasOpenAI() && !environment.hasDeepSeek()) {
    warnings.push('⚠️  Aucune clé API de traduction configurée (OPENAI_API_KEY ou DEEPSEEK_API_KEY)');
  }

  if (!environment.hasStripe()) {
    warnings.push('⚠️  Stripe non configuré (STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET requis)');
  }

  if (warnings.length > 0 && environment.isProduction()) {
    console.warn('\n⚠️  AVERTISSEMENTS DE CONFIGURATION:');
    warnings.forEach(w => console.warn(w));
    console.warn('');
  }

  return warnings.length === 0;
}

module.exports = {
  environment,
  validateConfig
};
