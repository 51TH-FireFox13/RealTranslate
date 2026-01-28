/**
 * Module de validation pour les messages WebSocket
 * Valide les données reçues des clients pour éviter les injections et erreurs
 */

import { logger } from './logger.js';

/**
 * Valide qu'une valeur est une chaîne non vide
 */
function isNonEmptyString(value, fieldName) {
  if (typeof value !== 'string') {
    return { valid: false, error: `${fieldName} doit être une chaîne de caractères` };
  }
  if (value.trim().length === 0) {
    return { valid: false, error: `${fieldName} ne peut pas être vide` };
  }
  return { valid: true };
}

/**
 * Valide qu'une valeur est une chaîne avec longueur maximale
 */
function isStringWithMaxLength(value, maxLength, fieldName) {
  const result = isNonEmptyString(value, fieldName);
  if (!result.valid) return result;

  if (value.length > maxLength) {
    return { valid: false, error: `${fieldName} ne peut pas dépasser ${maxLength} caractères` };
  }
  return { valid: true };
}

/**
 * Valide qu'une valeur est un objet
 */
function isObject(value, fieldName) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { valid: false, error: `${fieldName} doit être un objet` };
  }
  return { valid: true };
}

/**
 * Valide qu'une valeur est optionnelle (undefined ou du bon type)
 */
function isOptional(value, validator) {
  if (value === undefined || value === null) {
    return { valid: true };
  }
  return validator(value);
}

/**
 * Schémas de validation pour chaque type de message WebSocket
 */
const validationSchemas = {
  send_message: {
    groupId: (value) => isNonEmptyString(value, 'groupId'),
    content: (value) => isStringWithMaxLength(value, 10000, 'content'),
    userLang: (value) => isStringWithMaxLength(value, 10, 'userLang'),
    fileInfo: (value) => isOptional(value, (v) => isObject(v, 'fileInfo'))
  },

  send_dm: {
    toEmail: (value) => isNonEmptyString(value, 'toEmail'),
    content: (value) => isStringWithMaxLength(value, 10000, 'content'),
    userLang: (value) => isStringWithMaxLength(value, 10, 'userLang'),
    fileInfo: (value) => isOptional(value, (v) => isObject(v, 'fileInfo'))
  },

  user_typing: {
    groupId: (value) => isOptional(value, (v) => isNonEmptyString(v, 'groupId')),
    recipientEmail: (value) => isOptional(value, (v) => isNonEmptyString(v, 'recipientEmail'))
  },

  toggle_reaction: {
    groupId: (value) => isNonEmptyString(value, 'groupId'),
    messageId: (value) => isNonEmptyString(value, 'messageId'),
    emoji: (value) => isStringWithMaxLength(value, 10, 'emoji')
  },

  delete_message: {
    groupId: (value) => isNonEmptyString(value, 'groupId'),
    messageId: (value) => isNonEmptyString(value, 'messageId')
  },

  join_group: {
    groupId: (value) => isNonEmptyString(value, 'groupId')
  },

  leave_group: {
    groupId: (value) => isNonEmptyString(value, 'groupId')
  }
};

/**
 * Valide les données d'un message WebSocket selon son type
 * @param {string} eventName - Nom de l'événement (ex: 'send_message')
 * @param {object} data - Données reçues du client
 * @returns {object} {valid: boolean, errors?: string[]}
 */
export function validateWebSocketData(eventName, data) {
  const schema = validationSchemas[eventName];

  if (!schema) {
    logger.warn('No validation schema for WebSocket event', { eventName });
    return { valid: true }; // Pas de schéma = pas de validation (pour rétrocompatibilité)
  }

  // Vérifier que data est un objet
  if (typeof data !== 'object' || data === null) {
    return {
      valid: false,
      errors: ['Les données doivent être un objet']
    };
  }

  const errors = [];

  // Valider chaque champ du schéma
  for (const [field, validator] of Object.entries(schema)) {
    const result = validator(data[field]);
    if (!result.valid) {
      errors.push(result.error);
    }
  }

  // Vérifier les champs inconnus (potentiellement malveillants)
  const knownFields = Object.keys(schema);
  const receivedFields = Object.keys(data);
  const unknownFields = receivedFields.filter(f => !knownFields.includes(f));

  if (unknownFields.length > 0) {
    logger.warn('Unknown fields in WebSocket message', {
      eventName,
      unknownFields
    });
    // On ne rejette pas pour les champs inconnus, juste un warning
  }

  if (errors.length > 0) {
    logger.warn('WebSocket validation failed', {
      eventName,
      errors,
      dataPreview: JSON.stringify(data).substring(0, 200)
    });

    return {
      valid: false,
      errors
    };
  }

  return { valid: true };
}

/**
 * Middleware WebSocket pour valider automatiquement les données
 * Utilisation: socket.on('send_message', validateMiddleware('send_message', handler))
 */
export function validateMiddleware(eventName, handler) {
  return async (data) => {
    const validation = validateWebSocketData(eventName, data);

    if (!validation.valid) {
      // Émettre une erreur au client
      const socket = this; // 'this' dans le contexte du handler est le socket
      socket.emit('error', {
        message: 'Données invalides',
        errors: validation.errors
      });
      return;
    }

    // Données valides, appeler le handler original
    return handler.call(this, data);
  };
}

/**
 * Sanitise une chaîne de caractères pour éviter les injections XSS
 * @param {string} str - Chaîne à sanitiser
 * @returns {string} Chaîne sanitisée
 */
export function sanitizeString(str) {
  if (typeof str !== 'string') return '';

  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Valide une adresse email
 */
export function isValidEmail(email) {
  if (typeof email !== 'string') return false;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Valide un identifiant (groupId, messageId, etc.)
 * Doit être alphanumérique avec tirets et underscores
 */
export function isValidId(id) {
  if (typeof id !== 'string') return false;

  const idRegex = /^[a-zA-Z0-9_-]+$/;
  return idRegex.test(id) && id.length >= 3 && id.length <= 100;
}

export default {
  validateWebSocketData,
  validateMiddleware,
  sanitizeString,
  isValidEmail,
  isValidId
};
