/**
 * Couche de compatibilité synchrone pour database.js
 * Permet d'utiliser l'ancien code synchrone avec le nouveau système de pool
 *
 * ATTENTION: Cette approche utilise un pattern "sync-over-async" qui n'est pas idéal.
 * À terme, il faudra migrer tout le code vers async/await.
 *
 * Pour l'instant, on garde une connexion globale ouverte en permanence
 * pour maintenir la compatibilité avec auth-sqlite.js et autres fichiers
 */

import Database from 'better-sqlite3';
import { logger } from './utils/logger.js';
import { getDatabaseConfig } from './config/database.js';

// Connexion globale (comme dans l'ancien database.js)
let globalDb = null;

/**
 * Initialise la connexion globale
 */
export function initDatabase(dbPath = null) {
  const config = getDatabaseConfig('main');
  const finalPath = dbPath || config.path;

  try {
    globalDb = new Database(finalPath, config.options);

    // Appliquer les pragmas
    Object.entries(config.pragmas).forEach(([key, value]) => {
      globalDb.pragma(`${key} = ${value}`);
    });

    logger.info('SQLite database initialized', { file: finalPath });

    // Créer les tables
    createTables();

    return globalDb;
  } catch (error) {
    logger.error('Error initializing database', { error: error.message });
    throw error;
  }
}

/**
 * Crée toutes les tables
 */
function createTables() {
  // Table users
  globalDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      name TEXT,
      display_name TEXT,
      role TEXT DEFAULT 'user',
      avatar TEXT,
      subscription_tier TEXT DEFAULT 'free',
      subscription_status TEXT DEFAULT 'active',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      history_encrypted TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Migration: Ajouter colonne history_encrypted si elle n'existe pas
  try {
    globalDb.exec(`ALTER TABLE users ADD COLUMN history_encrypted TEXT`);
    logger.info('Migration: Added history_encrypted column to users table');
  } catch (error) {
    if (!error.message.includes('duplicate column name')) {
      logger.error('Migration error for history_encrypted', { error: error.message });
    }
  }

  // Table groups
  globalDb.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      creator TEXT NOT NULL,
      visibility TEXT DEFAULT 'private',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (creator) REFERENCES users(email) ON DELETE CASCADE
    )
  `);

  // Table group_members
  globalDb.exec(`
    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      user_email TEXT NOT NULL,
      display_name TEXT,
      role TEXT DEFAULT 'member',
      joined_at INTEGER DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (group_id, user_email),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
    )
  `);

  // Table messages (groupes)
  globalDb.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      from_email TEXT NOT NULL,
      from_display_name TEXT,
      content TEXT NOT NULL,
      original_lang TEXT NOT NULL,
      translations TEXT,
      reactions TEXT,
      file_info TEXT,
      timestamp INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (from_email) REFERENCES users(email) ON DELETE CASCADE
    )
  `);

  globalDb.exec(`CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id, timestamp DESC)`);
  globalDb.exec(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC)`);

  // Table direct_messages
  globalDb.exec(`
    CREATE TABLE IF NOT EXISTS direct_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      from_email TEXT NOT NULL,
      to_email TEXT NOT NULL,
      from_display_name TEXT,
      content TEXT NOT NULL,
      original_lang TEXT NOT NULL,
      translations TEXT,
      file_info TEXT,
      timestamp INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      FOREIGN KEY (from_email) REFERENCES users(email) ON DELETE CASCADE,
      FOREIGN KEY (to_email) REFERENCES users(email) ON DELETE CASCADE
    )
  `);

  globalDb.exec(`CREATE INDEX IF NOT EXISTS idx_dm_conversation ON direct_messages(conversation_id, timestamp DESC)`);
  globalDb.exec(`CREATE INDEX IF NOT EXISTS idx_dm_users ON direct_messages(from_email, to_email)`);

  // Migration: Ajouter reactions column si elle n'existe pas
  try {
    globalDb.exec(`ALTER TABLE messages ADD COLUMN reactions TEXT`);
    logger.info('Migration: reactions column added to messages table');
  } catch (error) {
    if (!error.message.includes('duplicate column')) {
      logger.warn('Migration warning', { error: error.message });
    }
  }

  // Table access_tokens
  globalDb.exec(`
    CREATE TABLE IF NOT EXISTS access_tokens (
      token TEXT PRIMARY KEY,
      tier TEXT NOT NULL,
      max_uses INTEGER DEFAULT 1,
      current_uses INTEGER DEFAULT 0,
      expires_at INTEGER,
      description TEXT,
      status TEXT DEFAULT 'active',
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Table user_archived
  globalDb.exec(`
    CREATE TABLE IF NOT EXISTS user_archived (
      user_email TEXT NOT NULL,
      item_type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      archived_at INTEGER DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (user_email, item_type, item_id),
      FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
    )
  `);

  // Table user_friends
  globalDb.exec(`
    CREATE TABLE IF NOT EXISTS user_friends (
      user_email TEXT NOT NULL,
      friend_email TEXT NOT NULL,
      status TEXT DEFAULT 'accepted',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (user_email, friend_email),
      FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
      FOREIGN KEY (friend_email) REFERENCES users(email) ON DELETE CASCADE
    )
  `);

  // Table user_statuses
  globalDb.exec(`
    CREATE TABLE IF NOT EXISTS user_statuses (
      user_email TEXT PRIMARY KEY,
      status TEXT DEFAULT 'offline',
      last_seen INTEGER,
      FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
    )
  `);

  // Table user_quotas
  globalDb.exec(`
    CREATE TABLE IF NOT EXISTS user_quotas (
      user_email TEXT PRIMARY KEY,
      transcribe_used INTEGER DEFAULT 0,
      translate_used INTEGER DEFAULT 0,
      speak_used INTEGER DEFAULT 0,
      last_reset INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
    )
  `);

  logger.info('Database tables created/verified');
}

/**
 * Transaction synchrone (comme dans l'ancien database.js)
 */
export function transaction(fn) {
  if (!globalDb) {
    throw new Error('Database not initialized');
  }
  return globalDb.transaction(fn)();
}

/**
 * Obtient la connexion globale
 */
export function getDB() {
  return globalDb;
}

/**
 * Ferme la connexion
 */
export function closeDatabase() {
  if (globalDb) {
    globalDb.close();
    logger.info('Database connection closed');
  }
}

// ===================================
// USERS - API Synchrone
// ===================================

export const usersDB = {
  getAll() {
    const stmt = globalDb.prepare('SELECT * FROM users');
    return stmt.all();
  },

  getByEmail(email) {
    const stmt = globalDb.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email);
  },

  create(user) {
    const stmt = globalDb.prepare(`
      INSERT INTO users (email, password, name, display_name, role, subscription_tier)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      user.email,
      user.password,
      user.name || user.email.split('@')[0],
      user.displayName || user.email.split('@')[0],
      user.role || 'user',
      user.subscriptionTier || 'free'
    );
  },

  update(email, fields) {
    const updates = [];
    const values = [];

    if (fields.password !== undefined) { updates.push('password = ?'); values.push(fields.password); }
    if (fields.name !== undefined) { updates.push('name = ?'); values.push(fields.name); }
    if (fields.display_name !== undefined) { updates.push('display_name = ?'); values.push(fields.display_name); }
    if (fields.avatar !== undefined) { updates.push('avatar = ?'); values.push(fields.avatar); }
    if (fields.subscription_tier !== undefined) { updates.push('subscription_tier = ?'); values.push(fields.subscription_tier); }
    if (fields.subscription_status !== undefined) { updates.push('subscription_status = ?'); values.push(fields.subscription_status); }
    if (fields.stripe_customer_id !== undefined) { updates.push('stripe_customer_id = ?'); values.push(fields.stripe_customer_id); }
    if (fields.stripe_subscription_id !== undefined) { updates.push('stripe_subscription_id = ?'); values.push(fields.stripe_subscription_id); }
    if (fields.history_encrypted !== undefined) { updates.push('history_encrypted = ?'); values.push(fields.history_encrypted); }

    if (updates.length === 0) return;

    updates.push('updated_at = ?');
    values.push(Math.floor(Date.now() / 1000));
    values.push(email);

    const stmt = globalDb.prepare(`UPDATE users SET ${updates.join(', ')} WHERE email = ?`);
    return stmt.run(...values);
  },

  delete(email) {
    const stmt = globalDb.prepare('DELETE FROM users WHERE email = ?');
    return stmt.run(email);
  }
};

// ===================================
// GROUPS - API Synchrone
// ===================================

export const groupsDB = {
  getAll() {
    const stmt = globalDb.prepare('SELECT * FROM groups');
    return stmt.all();
  },

  getById(id) {
    const stmt = globalDb.prepare('SELECT * FROM groups WHERE id = ?');
    return stmt.get(id);
  },

  getByUser(userEmail) {
    const stmt = globalDb.prepare(`
      SELECT g.* FROM groups g
      INNER JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_email = ?
    `);
    return stmt.all(userEmail);
  },

  getPublic() {
    const stmt = globalDb.prepare('SELECT * FROM groups WHERE visibility = ?');
    return stmt.all('public');
  },

  create(group) {
    const stmt = globalDb.prepare(`
      INSERT INTO groups (id, name, creator, visibility, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(
      group.id,
      group.name,
      group.creator,
      group.visibility || 'private',
      group.createdAt || Date.now()
    );
  },

  delete(id) {
    const stmt = globalDb.prepare('DELETE FROM groups WHERE id = ?');
    return stmt.run(id);
  },

  getMembers(groupId) {
    const stmt = globalDb.prepare('SELECT * FROM group_members WHERE group_id = ?');
    return stmt.all(groupId);
  },

  addMember(groupId, member) {
    const stmt = globalDb.prepare(`
      INSERT INTO group_members (group_id, user_email, display_name, role)
      VALUES (?, ?, ?, ?)
    `);
    return stmt.run(groupId, member.email, member.displayName, member.role || 'member');
  },

  removeMember(groupId, userEmail) {
    const stmt = globalDb.prepare('DELETE FROM group_members WHERE group_id = ? AND user_email = ?');
    return stmt.run(groupId, userEmail);
  },

  updateMemberRole(groupId, userEmail, role) {
    const stmt = globalDb.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_email = ?');
    return stmt.run(role, groupId, userEmail);
  },

  createGroupWithMembers(group, members) {
    try {
      return transaction(() => {
        const createStmt = globalDb.prepare(`
          INSERT INTO groups (id, name, creator, visibility, created_at)
          VALUES (?, ?, ?, ?, ?)
        `);
        createStmt.run(
          group.id,
          group.name,
          group.creator,
          group.visibility || 'private',
          group.createdAt || Date.now()
        );

        if (members && members.length > 0) {
          const addMemberStmt = globalDb.prepare(`
            INSERT INTO group_members (group_id, user_email, display_name, role)
            VALUES (?, ?, ?, ?)
          `);

          for (const member of members) {
            addMemberStmt.run(
              group.id,
              member.email,
              member.displayName,
              member.role || 'member'
            );
          }
        }

        logger.info('Group created atomically with transaction', {
          groupId: group.id,
          memberCount: members?.length || 0
        });

        return { success: true, groupId: group.id };
      });
    } catch (error) {
      logger.error('Error creating group with transaction', {
        error: error.message,
        groupId: group.id
      });
      return { success: false, error: error.message };
    }
  },

  deleteGroupWithCascade(groupId) {
    try {
      return transaction(() => {
        const membersCount = globalDb.prepare('SELECT COUNT(*) as count FROM group_members WHERE group_id = ?').get(groupId).count;
        const messagesCount = globalDb.prepare('SELECT COUNT(*) as count FROM messages WHERE group_id = ?').get(groupId).count;

        const deleteStmt = globalDb.prepare('DELETE FROM groups WHERE id = ?');
        const result = deleteStmt.run(groupId);

        logger.info('Group deleted atomically with cascade', {
          groupId,
          membersDeleted: membersCount,
          messagesDeleted: messagesCount,
          changes: result.changes
        });

        return {
          success: true,
          deleted: {
            group: result.changes > 0,
            members: membersCount,
            messages: messagesCount
          }
        };
      });
    } catch (error) {
      logger.error('Error deleting group with cascade', {
        error: error.message,
        groupId
      });
      return { success: false, error: error.message };
    }
  }
};

// ===================================
// MESSAGES - API Synchrone
// ===================================

export const messagesDB = {
  get(messageId) {
    const stmt = globalDb.prepare('SELECT * FROM messages WHERE id = ?');
    return stmt.get(messageId);
  },

  getByGroup(groupId, limit = 100) {
    const stmt = globalDb.prepare(`
      SELECT * FROM messages
      WHERE group_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return stmt.all(groupId, limit).reverse();
  },

  create(message) {
    const stmt = globalDb.prepare(`
      INSERT INTO messages (id, group_id, from_email, from_display_name, content, original_lang, translations, reactions, file_info, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      message.id,
      message.groupId,
      message.from,
      message.fromDisplayName,
      message.content,
      message.originalLang,
      JSON.stringify(message.translations || {}),
      JSON.stringify(message.reactions || {}),
      message.fileInfo ? JSON.stringify(message.fileInfo) : null,
      message.timestamp || Date.now()
    );
  },

  update(messageId, fields) {
    const updates = [];
    const values = [];

    if (fields.translations) {
      updates.push('translations = ?');
      values.push(JSON.stringify(fields.translations));
    }

    if (fields.reactions !== undefined) {
      updates.push('reactions = ?');
      values.push(JSON.stringify(fields.reactions));
    }

    if (updates.length === 0) return;

    values.push(messageId);
    const stmt = globalDb.prepare(`UPDATE messages SET ${updates.join(', ')} WHERE id = ?`);
    return stmt.run(...values);
  },

  delete(messageId) {
    const stmt = globalDb.prepare('DELETE FROM messages WHERE id = ?');
    return stmt.run(messageId);
  },

  deleteByGroup(groupId) {
    const stmt = globalDb.prepare('DELETE FROM messages WHERE group_id = ?');
    return stmt.run(groupId);
  }
};

// ===================================
// DIRECT MESSAGES - API Synchrone
// ===================================

export const directMessagesDB = {
  getByConversation(conversationId, limit = 100) {
    const stmt = globalDb.prepare(`
      SELECT * FROM direct_messages
      WHERE conversation_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return stmt.all(conversationId, limit).reverse();
  },

  getConversationsByUser(userEmail) {
    const stmt = globalDb.prepare(`
      SELECT DISTINCT conversation_id FROM direct_messages
      WHERE from_email = ? OR to_email = ?
    `);
    return stmt.all(userEmail, userEmail);
  },

  create(message) {
    const stmt = globalDb.prepare(`
      INSERT INTO direct_messages (id, conversation_id, from_email, to_email, from_display_name, content, original_lang, translations, file_info, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      message.id,
      message.conversationId,
      message.from,
      message.to,
      message.fromDisplayName,
      message.content,
      message.originalLang,
      JSON.stringify(message.translations || {}),
      message.fileInfo ? JSON.stringify(message.fileInfo) : null,
      message.timestamp || Date.now()
    );
  },

  update(messageId, fields) {
    if (fields.translations) {
      const stmt = globalDb.prepare('UPDATE direct_messages SET translations = ? WHERE id = ?');
      return stmt.run(JSON.stringify(fields.translations), messageId);
    }
  },

  delete(messageId) {
    const stmt = globalDb.prepare('DELETE FROM direct_messages WHERE id = ?');
    return stmt.run(messageId);
  }
};

// ===================================
// TOKENS, ARCHIVED, STATUSES, FRIENDS, QUOTAS
// ===================================

export const tokensDB = {
  getAll() {
    const stmt = globalDb.prepare('SELECT * FROM access_tokens');
    return stmt.all();
  },

  getByToken(token) {
    const stmt = globalDb.prepare('SELECT * FROM access_tokens WHERE token = ?');
    return stmt.get(token);
  },

  create(token) {
    const stmt = globalDb.prepare(`
      INSERT INTO access_tokens (token, tier, max_uses, current_uses, expires_at, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      token.token,
      token.tier,
      token.maxUses || 1,
      0,
      token.expiresAt || null,
      token.description || null
    );
  },

  incrementUse(token) {
    const stmt = globalDb.prepare('UPDATE access_tokens SET current_uses = current_uses + 1 WHERE token = ?');
    return stmt.run(token);
  },

  updateStatus(token, status) {
    const stmt = globalDb.prepare('UPDATE access_tokens SET status = ? WHERE token = ?');
    return stmt.run(status, token);
  },

  delete(token) {
    const stmt = globalDb.prepare('DELETE FROM access_tokens WHERE token = ?');
    return stmt.run(token);
  }
};

export const archivedDB = {
  getArchived(userEmail, itemType) {
    const stmt = globalDb.prepare('SELECT item_id FROM user_archived WHERE user_email = ? AND item_type = ?');
    return stmt.all(userEmail, itemType).map(row => row.item_id);
  },

  archive(userEmail, itemType, itemId) {
    const stmt = globalDb.prepare(`
      INSERT OR IGNORE INTO user_archived (user_email, item_type, item_id)
      VALUES (?, ?, ?)
    `);
    return stmt.run(userEmail, itemType, itemId);
  },

  unarchive(userEmail, itemType, itemId) {
    const stmt = globalDb.prepare('DELETE FROM user_archived WHERE user_email = ? AND item_type = ? AND item_id = ?');
    return stmt.run(userEmail, itemType, itemId);
  }
};

export const statusesDB = {
  get(userEmail) {
    const stmt = globalDb.prepare('SELECT * FROM user_statuses WHERE user_email = ?');
    return stmt.get(userEmail);
  },

  setOnline(userEmail) {
    const stmt = globalDb.prepare(`
      INSERT INTO user_statuses (user_email, status, last_seen)
      VALUES (?, 'online', ?)
      ON CONFLICT(user_email) DO UPDATE SET status = 'online', last_seen = ?
    `);
    const now = Date.now();
    return stmt.run(userEmail, now, now);
  },

  setOffline(userEmail) {
    const stmt = globalDb.prepare(`
      UPDATE user_statuses SET status = 'offline', last_seen = ? WHERE user_email = ?
    `);
    return stmt.run(Date.now(), userEmail);
  },

  getAll() {
    const stmt = globalDb.prepare('SELECT * FROM user_statuses');
    return stmt.all();
  }
};

export const friendsDB = {
  addFriendRequest(fromEmail, toEmail) {
    const stmt = globalDb.prepare(`
      INSERT OR IGNORE INTO user_friends (user_email, friend_email, status)
      VALUES (?, ?, 'pending')
    `);
    return stmt.run(fromEmail, toEmail);
  },

  getFriendRequests(userEmail) {
    const stmt = globalDb.prepare(`
      SELECT uf.user_email as from_email, u.display_name as fromDisplayName, uf.created_at as sentAt
      FROM user_friends uf
      INNER JOIN users u ON uf.user_email = u.email
      WHERE uf.friend_email = ? AND uf.status = 'pending'
    `);
    return stmt.all(userEmail);
  },

  getSentFriendRequests(userEmail) {
    const stmt = globalDb.prepare(`
      SELECT friend_email as to_email, status, created_at as sentAt
      FROM user_friends
      WHERE user_email = ? AND status = 'pending'
    `);
    return stmt.all(userEmail);
  },

  checkCrossRequest(fromEmail, toEmail) {
    const stmt = globalDb.prepare(`
      SELECT * FROM user_friends
      WHERE user_email = ? AND friend_email = ? AND status = 'pending'
    `);
    return stmt.get(toEmail, fromEmail);
  },

  checkExistingRequest(fromEmail, toEmail) {
    const stmt = globalDb.prepare(`
      SELECT * FROM user_friends
      WHERE user_email = ? AND friend_email = ?
    `);
    return stmt.get(fromEmail, toEmail);
  },

  acceptFriendRequest(userEmail, fromEmail) {
    const stmt1 = globalDb.prepare(`
      UPDATE user_friends
      SET status = 'accepted'
      WHERE user_email = ? AND friend_email = ? AND status = 'pending'
    `);
    const stmt2 = globalDb.prepare(`
      INSERT OR REPLACE INTO user_friends (user_email, friend_email, status)
      VALUES (?, ?, 'accepted')
    `);

    stmt1.run(fromEmail, userEmail);
    stmt2.run(userEmail, fromEmail);

    return { success: true };
  },

  rejectFriendRequest(userEmail, fromEmail) {
    const stmt = globalDb.prepare(`
      DELETE FROM user_friends
      WHERE user_email = ? AND friend_email = ? AND status = 'pending'
    `);
    return stmt.run(fromEmail, userEmail);
  },

  removeFriend(userEmail, friendEmail) {
    const stmt = globalDb.prepare(`
      DELETE FROM user_friends
      WHERE (user_email = ? AND friend_email = ?) OR (user_email = ? AND friend_email = ?)
    `);
    return stmt.run(userEmail, friendEmail, friendEmail, userEmail);
  },

  getFriends(userEmail) {
    const stmt = globalDb.prepare(`
      SELECT uf.friend_email as email, u.display_name as displayName, u.avatar
      FROM user_friends uf
      INNER JOIN users u ON uf.friend_email = u.email
      WHERE uf.user_email = ? AND uf.status = 'accepted'
    `);
    return stmt.all(userEmail);
  },

  areFriends(email1, email2) {
    const stmt = globalDb.prepare(`
      SELECT * FROM user_friends
      WHERE user_email = ? AND friend_email = ? AND status = 'accepted'
    `);
    return stmt.get(email1, email2) !== undefined;
  }
};

export const quotasDB = {
  get(userEmail) {
    const stmt = globalDb.prepare('SELECT * FROM user_quotas WHERE user_email = ?');
    return stmt.get(userEmail);
  },

  getOrCreate(userEmail) {
    let quota = this.get(userEmail);
    if (!quota) {
      const stmt = globalDb.prepare(`
        INSERT INTO user_quotas (user_email, transcribe_used, translate_used, speak_used)
        VALUES (?, 0, 0, 0)
      `);
      stmt.run(userEmail);
      quota = this.get(userEmail);
    }
    return quota;
  },

  increment(userEmail, action) {
    const columnMap = {
      transcribe: 'transcribe_used',
      translate: 'translate_used',
      speak: 'speak_used'
    };
    const column = columnMap[action];
    if (!column) return;

    const stmt = globalDb.prepare(`
      INSERT INTO user_quotas (user_email, ${column})
      VALUES (?, 1)
      ON CONFLICT(user_email) DO UPDATE SET ${column} = ${column} + 1
    `);
    return stmt.run(userEmail);
  },

  reset(userEmail) {
    const stmt = globalDb.prepare(`
      UPDATE user_quotas
      SET transcribe_used = 0, translate_used = 0, speak_used = 0, last_reset = ?
      WHERE user_email = ?
    `);
    return stmt.run(Math.floor(Date.now() / 1000), userEmail);
  },

  resetAll() {
    const stmt = globalDb.prepare(`
      UPDATE user_quotas
      SET transcribe_used = 0, translate_used = 0, speak_used = 0, last_reset = ?
    `);
    return stmt.run(Math.floor(Date.now() / 1000));
  }
};

// Auto-initialize database on module load
// This ensures db is ready when auth-sqlite.js or other modules import it
if (!globalDb) {
  initDatabase();
}

export default {
  initDatabase,
  closeDatabase,
  transaction,
  getDB,
  usersDB,
  groupsDB,
  messagesDB,
  directMessagesDB,
  tokensDB,
  archivedDB,
  statusesDB,
  friendsDB,
  quotasDB
};
