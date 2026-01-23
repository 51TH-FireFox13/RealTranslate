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
import { logger } from './logger.js';

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
        // Create
        groupsDB.create({
          id: value.id,
          name: value.name,
          creator: value.creator,
          visibility: value.visibility || 'private',
          createdAt: value.createdAt || Date.now()
        });

        // Ajouter les membres
        if (value.members && value.members.length > 0) {
          value.members.forEach(member => {
            groupsDB.addMember(value.id, {
              email: member.email,
              displayName: member.displayName || member.email.split('@')[0],
              role: member.role || 'member'
            });
          });
        }
      }
      return true;
    } catch (error) {
      logger.error('Error in groups proxy set', { error: error.message, groupId });
      return false;
    }
  },

  deleteProperty(target, groupId) {
    try {
      groupsDB.delete(groupId);
      return true;
    } catch (error) {
      logger.error('Error in groups proxy delete', { error: error.message, groupId });
      return false;
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

const messagesCache = new Map(); // Cache temporaire pour éviter trop de requêtes

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
      logger.error('Error in messages proxy delete', { error: error.message, groupId });
      return false;
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
          // Intercepter push pour sauvegarder en DB
          messages.forEach(msg => {
            addGroupMessage(groupId, msg);
          });
          // Mettre à jour le cache
          messagesCache.set(groupId, getGroupMessages(groupId));
          return target.length + messages.length;
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
      logger.error('Error in messages proxy delete', { error: error.message, groupId });
      return false;
    }
  },

  ownKeys(target) {
    return groupsDB.getAll().map(g => g.id);
  }
});

// ===================================
// DIRECT MESSAGES PROXY
// ===================================

const dmsCache = new Map();

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
      logger.error('Error in DMs proxy delete', { error: error.message, convId });
      return false;
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
          dms.forEach(dm => {
            addDirectMessage(convId, dm);
          });
          dmsCache.set(convId, getConversationMessages(convId));
          return target.length + dms.length;
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
