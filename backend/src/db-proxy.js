/**
 * Proxy layer pour compatibilité avec le code legacy
 * Permet de rediriger les accès groups[id], messages[id], etc. vers SQLite
 * sans toucher à tout le code existant
 */

import { groupsDB, messagesDB, directMessagesDB } from './database.js';
import {
  getGroupWithMembers,
  getGroupMessages,
  getConversationMessages,
  addGroupMessage,
  addDirectMessage
} from './db-helpers.js';
import { logger } from './utils/logger.js';

// ===================================
// GESTION DES ERREURS PROXY
// ===================================

/**
 * Stocke la dernière erreur survenue dans un proxy
 * Permet de récupérer l'erreur après qu'un proxy retourne false
 */
export const lastProxyError = {
  error: null,
  context: null,
  timestamp: null
};

/**
 * Gère une erreur de proxy de manière cohérente
 * @param {Error} error - L'erreur survenue
 * @param {string} operation - L'opération qui a échoué (ex: 'groups.set', 'messages.delete')
 * @param {object} context - Contexte supplémentaire (ex: {groupId, userId})
 * @returns {boolean} false (pour que le proxy indique l'échec)
 */
function handleProxyError(error, operation, context = {}) {
  // Logger l'erreur complète avec stack trace
  logger.error(`Proxy error: ${operation}`, {
    error: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString()
  });

  // Stocker pour récupération ultérieure
  lastProxyError.error = error;
  lastProxyError.context = { operation, ...context };
  lastProxyError.timestamp = Date.now();

  return false;
}

// ===================================
// GROUPS PROXY
// ===================================

export const groups = new Proxy({}, {
  get(target, groupId) {
    if (typeof groupId === 'symbol' || groupId === 'inspect' || groupId === 'constructor') {
      return undefined;
    }
    return getGroupWithMembers(groupId);
  },

  set(target, groupId, value) {
    // Création ou modification d'un groupe
    try {
      const existing = groupsDB.getById(groupId);

      if (existing) {
        // Update (pas implémenté pour l'instant, on garde tel quel)
        logger.warn('Group update via proxy not fully implemented', { groupId });
      } else {
        // Create - Utiliser la fonction atomique avec transaction
        const result = groupsDB.createGroupWithMembers(
          {
            id: value.id,
            name: value.name,
            creator: value.creator,
            visibility: value.visibility || 'private',
            createdAt: value.createdAt || Date.now()
          },
          value.members || []
        );

        if (!result.success) {
          logger.error('Failed to create group atomically in proxy', {
            error: result.error,
            groupId
          });
          return false;
        }
      }
      return true;
    } catch (error) {
      return handleProxyError(error, 'groups.set', { groupId, groupName: value?.name });
    }
  },

  deleteProperty(target, groupId) {
    try {
      // Utiliser la fonction atomique avec cascade explicite pour meilleur logging
      const result = groupsDB.deleteGroupWithCascade(groupId);
      if (!result.success) {
        logger.error('Failed to delete group atomically in proxy', {
          error: result.error,
          groupId
        });
        // Stocker l'erreur pour récupération
        lastProxyError.error = new Error(result.error);
        lastProxyError.context = { operation: 'groups.deleteProperty', groupId };
        lastProxyError.timestamp = Date.now();
        return false;
      }
      return true;
    } catch (error) {
      return handleProxyError(error, 'groups.deleteProperty', { groupId });
    }
  },

  has(target, groupId) {
    if (typeof groupId === 'symbol') return false;
    return groupsDB.getById(groupId) !== undefined;
  },

  ownKeys(target) {
    // Retourne tous les IDs de groupes
    return groupsDB.getAll().map(g => g.id);
  },

  getOwnPropertyDescriptor(target, groupId) {
    if (groupsDB.getById(groupId)) {
      return {
        enumerable: true,
        configurable: true
      };
    }
    return undefined;
  }
});

// ===================================
// MESSAGES PROXY
// ===================================

/**
 * Cache avec TTL (Time To Live) pour les messages
 * Expire automatiquement les entrées après un certain temps
 */
class TTLCache {
  constructor(ttlMs = 60000) { // 60 secondes par défaut
    this.cache = new Map();
    this.ttl = ttlMs;
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      expireAt: Date.now() + this.ttl
    });
  }

  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Vérifier si l'entrée a expiré
    if (Date.now() > entry.expireAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  has(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Vérifier si l'entrée a expiré
    if (Date.now() > entry.expireAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  /**
   * Nettoie toutes les entrées expirées
   */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expireAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Retourne le nombre d'entrées dans le cache (incluant les expirées)
   */
  size() {
    return this.cache.size;
  }
}

// Cache avec TTL de 5 minutes pour les messages
const messagesCache = new TTLCache(5 * 60 * 1000);

// Nettoyer le cache toutes les 10 minutes
setInterval(() => {
  messagesCache.cleanup();
  logger.info('Messages cache cleaned up', { size: messagesCache.size() });
}, 10 * 60 * 1000);

export const messages = new Proxy({}, {
  get(target, groupId) {
    if (typeof groupId === 'symbol' || groupId === 'inspect' || groupId === 'constructor') {
      return undefined;
    }

    // Retourner le tableau de messages du groupe
    if (!messagesCache.has(groupId)) {
      messagesCache.set(groupId, getGroupMessages(groupId));
    }
    return messagesCache.get(groupId);
  },

  set(target, groupId, value) {
    // Remplacement complet du tableau de messages (rarement utilisé)
    // On va plutôt utiliser push sur le tableau retourné
    messagesCache.set(groupId, value);
    return true;
  },

  deleteProperty(target, groupId) {
    try {
      messagesDB.deleteByGroup(groupId);
      messagesCache.delete(groupId);
      return true;
    } catch (error) {
      return handleProxyError(error, 'messages.deleteProperty', { groupId });
    }
  },

  has(target, groupId) {
    if (typeof groupId === 'symbol') return false;
    return getGroupMessages(groupId).length > 0;
  },

  ownKeys(target) {
    // Retourne tous les groupIds qui ont des messages
    // Note: pas optimal, mais nécessaire pour Object.keys(messages)
    return groupsDB.getAll().map(g => g.id);
  },

  getOwnPropertyDescriptor(target, groupId) {
    if (getGroupMessages(groupId).length > 0) {
      return {
        enumerable: true,
        configurable: true
      };
    }
    return undefined;
  }
});

// Wrapper pour le tableau de messages pour intercepter push()
function createMessageArrayProxy(groupId) {
  const arr = getGroupMessages(groupId);

  return new Proxy(arr, {
    get(target, prop) {
      if (prop === 'push') {
        return function(...messages) {
          try {
            // Intercepter push pour sauvegarder en DB
            messages.forEach(msg => {
              addGroupMessage(groupId, msg);
            });
            // Mettre à jour le cache
            messagesCache.set(groupId, getGroupMessages(groupId));
            return target.length + messages.length;
          } catch (error) {
            handleProxyError(error, 'messagesEnhanced.push', { groupId, messageCount: messages.length });
            throw error; // Re-throw pour que l'appelant sache qu'il y a eu une erreur
          }
        };
      }
      return target[prop];
    }
  });
}

// Améliorer le proxy messages pour retourner un tableau avec push intercepté
export const messagesEnhanced = new Proxy({}, {
  get(target, groupId) {
    if (typeof groupId === 'symbol' || groupId === 'inspect' || groupId === 'constructor') {
      return undefined;
    }
    return createMessageArrayProxy(groupId);
  },

  set(target, groupId, value) {
    messagesCache.set(groupId, value);
    return true;
  },

  deleteProperty(target, groupId) {
    try {
      messagesDB.deleteByGroup(groupId);
      messagesCache.delete(groupId);
      return true;
    } catch (error) {
      return handleProxyError(error, 'messages.deleteProperty', { groupId });
    }
  },

  ownKeys(target) {
    return groupsDB.getAll().map(g => g.id);
  }
});

// ===================================
// DIRECT MESSAGES PROXY
// ===================================

// Cache avec TTL de 5 minutes pour les DMs
const dmsCache = new TTLCache(5 * 60 * 1000);

// Nettoyer le cache DMs toutes les 10 minutes
setInterval(() => {
  dmsCache.cleanup();
  logger.info('DMs cache cleaned up', { size: dmsCache.size() });
}, 10 * 60 * 1000);

export const directMessages = new Proxy({}, {
  get(target, convId) {
    if (typeof convId === 'symbol' || convId === 'inspect' || convId === 'constructor') {
      return undefined;
    }

    if (!dmsCache.has(convId)) {
      dmsCache.set(convId, getConversationMessages(convId));
    }
    return dmsCache.get(convId);
  },

  set(target, convId, value) {
    dmsCache.set(convId, value);
    return true;
  },

  deleteProperty(target, convId) {
    try {
      // Note: pas d'endpoint deleteByConversation pour l'instant
      dmsCache.delete(convId);
      return true;
    } catch (error) {
      return handleProxyError(error, 'directMessages.deleteProperty', { convId });
    }
  },

  ownKeys(target) {
    // Retourne toutes les conversations
    // Note: nécessite une requête spéciale
    return [];
  }
});

// Wrapper pour tableau de DMs avec push intercepté
function createDMArrayProxy(convId) {
  const arr = getConversationMessages(convId);

  return new Proxy(arr, {
    get(target, prop) {
      if (prop === 'push') {
        return function(...dms) {
          try {
            dms.forEach(dm => {
              addDirectMessage(convId, dm);
            });
            dmsCache.set(convId, getConversationMessages(convId));
            return target.length + dms.length;
          } catch (error) {
            handleProxyError(error, 'directMessagesEnhanced.push', { convId, messageCount: dms.length });
            throw error; // Re-throw pour que l'appelant sache qu'il y a eu une erreur
          }
        };
      }
      return target[prop];
    }
  });
}

export const directMessagesEnhanced = new Proxy({}, {
  get(target, convId) {
    if (typeof convId === 'symbol' || convId === 'inspect' || convId === 'constructor') {
      return undefined;
    }
    return createDMArrayProxy(convId);
  },

  set(target, convId, value) {
    dmsCache.set(convId, value);
    return true;
  },

  ownKeys(target) {
    return [];
  }
});

// Fonctions pour vider les caches (utile après modifications)
export function clearMessagesCache() {
  messagesCache.clear();
}

export function clearDMsCache() {
  dmsCache.clear();
}

export function clearAllCaches() {
  messagesCache.clear();
  dmsCache.clear();
}
