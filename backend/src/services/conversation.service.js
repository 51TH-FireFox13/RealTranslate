/**
 * @fileoverview Service de gestion des conversations et messages
 * @module services/conversation
 *
 * Ce service gère :
 * - ID de conversation DM
 * - Traduction des messages
 * - Sauvegarde des messages
 * - Gestion du cache
 */

import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import {
  addGroupMessage,
  addDirectMessage,
  getConversationMessages,
  getGroupMessages
} from '../db-helpers.js';
import {
  clearMessagesCache,
  clearDMsCache
} from '../db-proxy.js';
import { translateText } from './ai.service.js';

/**
 * Génère un ID de conversation entre 2 utilisateurs (toujours dans le même ordre)
 * @param {string} email1 - Premier email
 * @param {string} email2 - Deuxième email
 * @returns {string} - ID de conversation
 */
export function getConversationId(email1, email2) {
  return [email1, email2].sort().join('_');
}

/**
 * Génère un ID unique pour un message
 * @param {string} prefix - Préfixe ('msg' pour groupe, 'dm' pour DM)
 * @returns {string} - ID unique
 */
export function generateMessageId(prefix = 'msg') {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Crée un message de groupe avec traduction
 * @param {Object} params - Paramètres
 * @param {string} params.groupId - ID du groupe
 * @param {string} params.sender - Email de l'expéditeur
 * @param {string} params.message - Contenu du message
 * @param {number} params.timestamp - Timestamp du message
 * @param {string} params.targetLang - Langue cible pour traduction (optionnel, deprecated)
 * @param {Array<string>} params.targetLangs - Langues cibles pour traduction (optionnel)
 * @param {string} params.provider - Provider IA (optionnel)
 * @param {Object} params.fileInfo - Informations fichier (optionnel)
 * @returns {Promise<Object>} - Message créé
 */
export async function createGroupMessage({
  groupId,
  sender,
  message,
  timestamp,
  targetLang = null,
  targetLangs = null,
  provider = 'openai',
  fileInfo = null,
  fromDisplayName = null
}) {
  try {
    // Préparer le message avec les champs corrects pour la DB
    const messageData = {
      id: generateMessageId('msg'),
      from: sender,
      fromDisplayName: fromDisplayName || sender.split('@')[0],
      content: message,
      originalLang: 'auto',
      timestamp,
      translations: {},
      fileInfo: fileInfo || undefined
    };

    // Supporter l'ancien paramètre targetLang pour la compatibilité
    const languagesToTranslate = targetLangs || (targetLang ? [targetLang] : []);

    // Traduire vers toutes les langues demandées en parallèle
    if (languagesToTranslate.length > 0) {
      try {
        const translationPromises = languagesToTranslate.map(async (lang) => {
          try {
            const translated = await translateText(message, lang, provider);
            return { lang, translated };
          } catch (error) {
            logger.error('Translation error for language', {
              error: error.message,
              groupId,
              targetLang: lang
            });
            return { lang, translated: null };
          }
        });

        const results = await Promise.all(translationPromises);

        // Ajouter les traductions réussies
        for (const { lang, translated } of results) {
          if (translated) {
            messageData.translations[lang] = translated;
          }
        }
      } catch (error) {
        logger.error('Translation error in group message', {
          error: error.message,
          stack: error.stack,
          groupId,
          targetLangs: languagesToTranslate
        });
        // Continuer sans traduction
      }
    }

    // Sauvegarder dans la DB
    addGroupMessage(groupId, messageData);

    // Invalider le cache
    clearMessagesCache(groupId);

    logger.info('Group message created', {
      groupId,
      sender,
      messageId: messageData.id,
      translationsCount: Object.keys(messageData.translations).length,
      hasFile: !!fileInfo
    });

    return messageData;
  } catch (error) {
    logger.error('Error creating group message', {
      error: error.message,
      stack: error.stack,
      groupId,
      sender
    });
    throw error;
  }
}

/**
 * Crée un message privé (DM) avec traduction
 * @param {Object} params - Paramètres
 * @param {string} params.from - Email de l'expéditeur
 * @param {string} params.to - Email du destinataire
 * @param {string} params.message - Contenu du message
 * @param {number} params.timestamp - Timestamp du message
 * @param {string} params.targetLang - Langue cible pour traduction (optionnel, deprecated)
 * @param {Array<string>} params.targetLangs - Langues cibles pour traduction (optionnel)
 * @param {string} params.provider - Provider IA (optionnel)
 * @param {Object} params.fileInfo - Informations fichier (optionnel)
 * @returns {Promise<Object>} - Message créé avec conversationId
 */
export async function createDirectMessage({
  from,
  to,
  message,
  timestamp,
  targetLang = null,
  targetLangs = null,
  provider = 'openai',
  fileInfo = null,
  fromDisplayName = null
}) {
  try {
    const conversationId = getConversationId(from, to);

    // Préparer le message avec les champs corrects pour la DB
    const messageData = {
      id: generateMessageId('dm'),
      from: from,
      to: to,
      fromDisplayName: fromDisplayName || from.split('@')[0],
      content: message,
      originalLang: 'auto',
      timestamp,
      translations: {},
      fileInfo: fileInfo || undefined
    };

    // Supporter l'ancien paramètre targetLang pour la compatibilité
    const languagesToTranslate = targetLangs || (targetLang ? [targetLang] : []);

    // Traduire vers toutes les langues demandées en parallèle
    if (languagesToTranslate.length > 0) {
      try {
        const translationPromises = languagesToTranslate.map(async (lang) => {
          try {
            const translated = await translateText(message, lang, provider);
            return { lang, translated };
          } catch (error) {
            logger.error('Translation error for language in DM', {
              error: error.message,
              conversationId,
              targetLang: lang
            });
            return { lang, translated: null };
          }
        });

        const results = await Promise.all(translationPromises);

        // Ajouter les traductions réussies
        for (const { lang, translated } of results) {
          if (translated) {
            messageData.translations[lang] = translated;
          }
        }
      } catch (error) {
        logger.error('Translation error in DM', {
          error: error.message,
          stack: error.stack,
          conversationId,
          targetLangs: languagesToTranslate
        });
        // Continuer sans traduction
      }
    }

    // Sauvegarder dans la DB
    addDirectMessage(conversationId, messageData);

    // Invalider le cache
    clearDMsCache(conversationId);

    logger.info('Direct message created', {
      conversationId,
      from,
      to,
      messageId: messageData.id,
      translationsCount: Object.keys(messageData.translations).length,
      hasFile: !!fileInfo
    });

    return {
      conversationId,
      ...messageData
    };
  } catch (error) {
    logger.error('Error creating direct message', {
      error: error.message,
      stack: error.stack,
      from,
      to
    });
    throw error;
  }
}

/**
 * Récupère les messages d'un groupe
 * @param {string} groupId - ID du groupe
 * @param {number} limit - Nombre de messages à récupérer (optionnel)
 * @returns {Array} - Messages du groupe
 */
export function getGroupMessageList(groupId, limit = null) {
  try {
    const messages = getGroupMessages(groupId);

    if (limit && messages.length > limit) {
      return messages.slice(-limit);
    }

    return messages;
  } catch (error) {
    logger.error('Error getting group messages', {
      error: error.message,
      groupId
    });
    return [];
  }
}

/**
 * Récupère les messages d'une conversation DM
 * @param {string} email1 - Premier email
 * @param {string} email2 - Deuxième email
 * @param {number} limit - Nombre de messages à récupérer (optionnel)
 * @returns {Array} - Messages de la conversation
 */
export function getDMMessageList(email1, email2, limit = null) {
  try {
    const conversationId = getConversationId(email1, email2);
    const messages = getConversationMessages(conversationId);

    if (limit && messages.length > limit) {
      return messages.slice(-limit);
    }

    return messages;
  } catch (error) {
    logger.error('Error getting DM messages', {
      error: error.message,
      conversationId: getConversationId(email1, email2)
    });
    return [];
  }
}

export default {
  getConversationId,
  generateMessageId,
  createGroupMessage,
  createDirectMessage,
  getGroupMessageList,
  getDMMessageList
};
