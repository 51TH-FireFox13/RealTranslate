/**
 * Helpers pour faciliter la migration SQLite
 * Fonctions utilitaires pour convertir entre formats legacy et DB
 */

import { groupsDB, messagesDB, directMessagesDB } from './database.js';

// ===================================
// GROUPS HELPERS
// ===================================

/**
 * Récupère un groupe avec ses membres formatés comme avant
 */
export function getGroupWithMembers(groupId) {
  const group = groupsDB.getById(groupId);
  if (!group) return null;

  const members = groupsDB.getMembers(groupId);

  return {
    id: group.id,
    name: group.name,
    creator: group.creator,
    visibility: group.visibility,
    createdAt: group.created_at,
    members: members.map(m => ({
      email: m.user_email,
      displayName: m.display_name,
      role: m.role
    }))
  };
}

/**
 * Récupère tous les groupes d'un utilisateur (formatés)
 */
export function getUserGroups(userEmail) {
  const groups = groupsDB.getByUser(userEmail);
  return groups.map(g => {
    const members = groupsDB.getMembers(g.id);
    return {
      id: g.id,
      name: g.name,
      creator: g.creator,
      visibility: g.visibility,
      createdAt: g.created_at,
      members: members.map(m => ({
        email: m.user_email,
        displayName: m.display_name,
        role: m.role
      }))
    };
  });
}

// ===================================
// MESSAGES HELPERS
// ===================================

/**
 * Récupère les messages d'un groupe (formatés)
 */
export function getGroupMessages(groupId, limit = 100) {
  const msgs = messagesDB.getByGroup(groupId, limit);
  return msgs.map(m => ({
    id: m.id,
    from: m.from_email,
    fromDisplayName: m.from_display_name,
    content: m.content,
    originalLang: m.original_lang,
    translations: m.translations ? JSON.parse(m.translations) : {},
    reactions: m.reactions ? JSON.parse(m.reactions) : {},
    fileInfo: m.file_info ? JSON.parse(m.file_info) : null,
    timestamp: m.timestamp
  }));
}

/**
 * Ajoute un message de groupe
 */
export function addGroupMessage(groupId, message) {
  return messagesDB.create({
    id: message.id,
    groupId: groupId,
    from: message.from,
    fromDisplayName: message.fromDisplayName,
    content: message.content,
    originalLang: message.originalLang,
    translations: message.translations,
    reactions: message.reactions,
    fileInfo: message.fileInfo,
    timestamp: message.timestamp
  });
}

// ===================================
// DIRECT MESSAGES HELPERS
// ===================================

/**
 * Récupère les messages d'une conversation DM (formatés)
 */
export function getConversationMessages(conversationId, limit = 100) {
  const msgs = directMessagesDB.getByConversation(conversationId, limit);
  return msgs.map(m => ({
    id: m.id,
    from: m.from_email,
    to: m.to_email,
    fromDisplayName: m.from_display_name,
    content: m.content,
    originalLang: m.original_lang,
    translations: m.translations ? JSON.parse(m.translations) : {},
    fileInfo: m.file_info ? JSON.parse(m.file_info) : null,
    timestamp: m.timestamp
  }));
}

/**
 * Ajoute un message DM
 */
export function addDirectMessage(conversationId, message) {
  return directMessagesDB.create({
    id: message.id,
    conversationId: conversationId,
    from: message.from,
    to: message.to,
    fromDisplayName: message.fromDisplayName,
    content: message.content,
    originalLang: message.originalLang,
    translations: message.translations,
    fileInfo: message.fileInfo,
    timestamp: message.timestamp
  });
}

/**
 * Récupère toutes les conversations d'un utilisateur
 */
export function getUserConversations(userEmail) {
  const convs = directMessagesDB.getConversationsByUser(userEmail);
  return convs.map(c => c.conversation_id);
}
