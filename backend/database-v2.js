/**
 * Database access layer - Version 2 avec pool de connexions
 * Migré pour utiliser src/db.js (pool de connexions)
 * API compatible avec database.js (v1) pour faciliter la migration
 */

import { logger } from './logger.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  initializeDatabase as initPool,
  withConnection,
  transaction as poolTransaction,
  getConnection,
  releaseConnection,
  closeDatabase as closePool,
  healthCheck
} from './src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Support for test database via environment variable
const DB_FILE = process.env.DB_FILE || join(__dirname, 'realtranslate.db');

/**
 * Initialise la base de données avec le pool de connexions
 * @param {string} dbPath - Chemin vers la base de données (optionnel)
 * @returns {Promise<void>}
 */
export async function initDatabase(dbPath = null) {
  const finalPath = dbPath || DB_FILE;
  try {
    // Initialiser le pool de connexions
    await initPool(finalPath === ':memory:' ? 'test' : 'main');

    logger.info('SQLite database initialized with connection pool', { file: finalPath });

    // Créer les tables
    await createTables();

    // Vérifier la santé
    const isHealthy = await healthCheck();
    if (!isHealthy) {
      throw new Error('Database health check failed');
    }

    logger.info('Database health check passed');
  } catch (error) {
    logger.error('Error initializing database', { error: error.message });
    throw error;
  }
}

/**
 * Crée toutes les tables de la base de données
 */
async function createTables() {
  await withConnection(async (db) => {
    // Table users
    db.exec(`
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
      db.exec(`ALTER TABLE users ADD COLUMN history_encrypted TEXT`);
      logger.info('Migration: Added history_encrypted column to users table');
    } catch (error) {
      // Colonne existe déjà, ignorer l'erreur
      if (!error.message.includes('duplicate column name')) {
        logger.error('Migration error for history_encrypted', { error: error.message });
      }
    }

    // Table groups
    db.exec(`
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
    db.exec(`
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
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        from_email TEXT NOT NULL,
        from_display_name TEXT,
        content TEXT NOT NULL,
        original_lang TEXT NOT NULL,
        translations TEXT, -- JSON: {lang: text}
        reactions TEXT, -- JSON: {emoji: [{email, displayName, timestamp}]}
        file_info TEXT, -- JSON: {filename, size, url}
        timestamp INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        FOREIGN KEY (from_email) REFERENCES users(email) ON DELETE CASCADE
      )
    `);

    // Index pour performances
    db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id, timestamp DESC)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC)`);

    // Table direct_messages
    db.exec(`
      CREATE TABLE IF NOT EXISTS direct_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        from_email TEXT NOT NULL,
        to_email TEXT NOT NULL,
        from_display_name TEXT,
        content TEXT NOT NULL,
        original_lang TEXT NOT NULL,
        translations TEXT, -- JSON: {lang: text}
        file_info TEXT, -- JSON: {filename, size, url}
        timestamp INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (from_email) REFERENCES users(email) ON DELETE CASCADE,
        FOREIGN KEY (to_email) REFERENCES users(email) ON DELETE CASCADE
      )
    `);

    // Index pour DMs
    db.exec(`CREATE INDEX IF NOT EXISTS idx_dm_conversation ON direct_messages(conversation_id, timestamp DESC)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_dm_users ON direct_messages(from_email, to_email)`);

    // Migration: Ajouter reactions column si elle n'existe pas
    try {
      db.exec(`ALTER TABLE messages ADD COLUMN reactions TEXT`);
      logger.info('Migration: reactions column added to messages table');
    } catch (error) {
      // Column already exists, ignore
      if (!error.message.includes('duplicate column')) {
        logger.warn('Migration warning', { error: error.message });
      }
    }

    // Table access_tokens
    db.exec(`
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

    // Table user_archived (groupes et DMs archivés par utilisateur)
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_archived (
        user_email TEXT NOT NULL,
        item_type TEXT NOT NULL, -- 'group' ou 'dm'
        item_id TEXT NOT NULL,
        archived_at INTEGER DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY (user_email, item_type, item_id),
        FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
      )
    `);

    // Table user_friends
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_friends (
        user_email TEXT NOT NULL,
        friend_email TEXT NOT NULL,
        status TEXT DEFAULT 'accepted', -- 'pending', 'accepted', 'blocked'
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY (user_email, friend_email),
        FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
        FOREIGN KEY (friend_email) REFERENCES users(email) ON DELETE CASCADE
      )
    `);

    // Table user_statuses (online/offline)
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_statuses (
        user_email TEXT PRIMARY KEY,
        status TEXT DEFAULT 'offline',
        last_seen INTEGER,
        FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
      )
    `);

    // Table user_quotas (usage des quotas par utilisateur)
    db.exec(`
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
  });
}

/**
 * Exécute une fonction dans une transaction SQLite
 * Wrapper pour maintenir la compatibilité avec database.js (v1)
 * @param {Function} fn - Fonction à exécuter dans la transaction
 * @returns {Promise<*>} Résultat de la fonction
 */
export async function transaction(fn) {
  return await poolTransaction(fn);
}

/**
 * Obtient une connexion directe (pour compatibilité)
 * ATTENTION: Doit être libérée avec releaseConnection()
 * @deprecated Préférer withConnection() ou transaction()
 */
export async function getDB() {
  return await getConnection();
}

// ===================================
// USERS
// ===================================

export const usersDB = {
  async getAll() {
    return await withConnection(async (db) => {
      const stmt = db.prepare('SELECT * FROM users');
      return stmt.all();
    });
  },

  async getByEmail(email) {
    return await withConnection(async (db) => {
      const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
      return stmt.get(email);
    });
  },

  async create(user) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
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
    });
  },

  async update(email, fields) {
    return await withConnection(async (db) => {
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

      const stmt = db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE email = ?`);
      return stmt.run(...values);
    });
  },

  async delete(email) {
    return await withConnection(async (db) => {
      const stmt = db.prepare('DELETE FROM users WHERE email = ?');
      return stmt.run(email);
    });
  }
};

// ===================================
// GROUPS
// ===================================

export const groupsDB = {
  async getAll() {
    return await withConnection(async (db) => {
      const stmt = db.prepare('SELECT * FROM groups');
      return stmt.all();
    });
  },

  async getById(id) {
    return await withConnection(async (db) => {
      const stmt = db.prepare('SELECT * FROM groups WHERE id = ?');
      return stmt.get(id);
    });
  },

  async getByUser(userEmail) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
        SELECT g.* FROM groups g
        INNER JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.user_email = ?
      `);
      return stmt.all(userEmail);
    });
  },

  async getPublic() {
    return await withConnection(async (db) => {
      const stmt = db.prepare('SELECT * FROM groups WHERE visibility = ?');
      return stmt.all('public');
    });
  },

  async create(group) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
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
    });
  },

  async delete(id) {
    return await withConnection(async (db) => {
      const stmt = db.prepare('DELETE FROM groups WHERE id = ?');
      return stmt.run(id);
    });
  },

  // Membres
  async getMembers(groupId) {
    return await withConnection(async (db) => {
      const stmt = db.prepare('SELECT * FROM group_members WHERE group_id = ?');
      return stmt.all(groupId);
    });
  },

  async addMember(groupId, member) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
        INSERT INTO group_members (group_id, user_email, display_name, role)
        VALUES (?, ?, ?, ?)
      `);
      return stmt.run(groupId, member.email, member.displayName, member.role || 'member');
    });
  },

  async removeMember(groupId, userEmail) {
    return await withConnection(async (db) => {
      const stmt = db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_email = ?');
      return stmt.run(groupId, userEmail);
    });
  },

  async updateMemberRole(groupId, userEmail, role) {
    return await withConnection(async (db) => {
      const stmt = db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_email = ?');
      return stmt.run(role, groupId, userEmail);
    });
  },

  /**
   * Crée un groupe avec ses membres de manière atomique (transaction)
   */
  async createGroupWithMembers(group, members) {
    try {
      return await transaction(async (db) => {
        // 1. Créer le groupe
        const createStmt = db.prepare(`
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

        // 2. Ajouter tous les membres (atomiquement)
        if (members && members.length > 0) {
          const addMemberStmt = db.prepare(`
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

  /**
   * Supprime un groupe avec cascade (transaction explicite pour garantir atomicité)
   */
  async deleteGroupWithCascade(groupId) {
    try {
      return await transaction(async (db) => {
        // Compter ce qui sera supprimé (pour logging)
        const membersCount = db.prepare('SELECT COUNT(*) as count FROM group_members WHERE group_id = ?').get(groupId).count;
        const messagesCount = db.prepare('SELECT COUNT(*) as count FROM messages WHERE group_id = ?').get(groupId).count;

        // Supprimer le groupe (CASCADE DELETE supprimera automatiquement members et messages)
        const deleteStmt = db.prepare('DELETE FROM groups WHERE id = ?');
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
// MESSAGES
// ===================================

export const messagesDB = {
  async getByGroup(groupId, limit = 100) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
        SELECT * FROM messages
        WHERE group_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `);
      return stmt.all(groupId, limit).reverse(); // Plus récent en dernier
    });
  },

  async create(message) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
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
    });
  },

  async update(messageId, fields) {
    return await withConnection(async (db) => {
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
      const stmt = db.prepare(`UPDATE messages SET ${updates.join(', ')} WHERE id = ?`);
      return stmt.run(...values);
    });
  },

  async delete(messageId) {
    return await withConnection(async (db) => {
      const stmt = db.prepare('DELETE FROM messages WHERE id = ?');
      return stmt.run(messageId);
    });
  },

  async deleteByGroup(groupId) {
    return await withConnection(async (db) => {
      const stmt = db.prepare('DELETE FROM messages WHERE group_id = ?');
      return stmt.run(groupId);
    });
  }
};

// ===================================
// DIRECT MESSAGES
// ===================================

export const directMessagesDB = {
  async getByConversation(conversationId, limit = 100) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
        SELECT * FROM direct_messages
        WHERE conversation_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `);
      return stmt.all(conversationId, limit).reverse();
    });
  },

  async getConversationsByUser(userEmail) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
        SELECT DISTINCT conversation_id FROM direct_messages
        WHERE from_email = ? OR to_email = ?
      `);
      return stmt.all(userEmail, userEmail);
    });
  },

  async create(message) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
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
    });
  },

  async update(messageId, fields) {
    return await withConnection(async (db) => {
      if (fields.translations) {
        const stmt = db.prepare('UPDATE direct_messages SET translations = ? WHERE id = ?');
        return stmt.run(JSON.stringify(fields.translations), messageId);
      }
    });
  },

  async delete(messageId) {
    return await withConnection(async (db) => {
      const stmt = db.prepare('DELETE FROM direct_messages WHERE id = ?');
      return stmt.run(messageId);
    });
  }
};

// ===================================
// ACCESS TOKENS
// ===================================

export const tokensDB = {
  async getAll() {
    return await withConnection(async (db) => {
      const stmt = db.prepare('SELECT * FROM access_tokens');
      return stmt.all();
    });
  },

  async getByToken(token) {
    return await withConnection(async (db) => {
      const stmt = db.prepare('SELECT * FROM access_tokens WHERE token = ?');
      return stmt.get(token);
    });
  },

  async create(token) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
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
    });
  },

  async incrementUse(token) {
    return await withConnection(async (db) => {
      const stmt = db.prepare('UPDATE access_tokens SET current_uses = current_uses + 1 WHERE token = ?');
      return stmt.run(token);
    });
  },

  async updateStatus(token, status) {
    return await withConnection(async (db) => {
      const stmt = db.prepare('UPDATE access_tokens SET status = ? WHERE token = ?');
      return stmt.run(status, token);
    });
  },

  async delete(token) {
    return await withConnection(async (db) => {
      const stmt = db.prepare('DELETE FROM access_tokens WHERE token = ?');
      return stmt.run(token);
    });
  }
};

// ===================================
// USER ARCHIVED
// ===================================

export const archivedDB = {
  async getArchived(userEmail, itemType) {
    return await withConnection(async (db) => {
      const stmt = db.prepare('SELECT item_id FROM user_archived WHERE user_email = ? AND item_type = ?');
      return stmt.all(userEmail, itemType).map(row => row.item_id);
    });
  },

  async archive(userEmail, itemType, itemId) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO user_archived (user_email, item_type, item_id)
        VALUES (?, ?, ?)
      `);
      return stmt.run(userEmail, itemType, itemId);
    });
  },

  async unarchive(userEmail, itemType, itemId) {
    return await withConnection(async (db) => {
      const stmt = db.prepare('DELETE FROM user_archived WHERE user_email = ? AND item_type = ? AND item_id = ?');
      return stmt.run(userEmail, itemType, itemId);
    });
  }
};

// ===================================
// USER STATUSES
// ===================================

export const statusesDB = {
  async get(userEmail) {
    return await withConnection(async (db) => {
      const stmt = db.prepare('SELECT * FROM user_statuses WHERE user_email = ?');
      return stmt.get(userEmail);
    });
  },

  async setOnline(userEmail) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
        INSERT INTO user_statuses (user_email, status, last_seen)
        VALUES (?, 'online', ?)
        ON CONFLICT(user_email) DO UPDATE SET status = 'online', last_seen = ?
      `);
      const now = Date.now();
      return stmt.run(userEmail, now, now);
    });
  },

  async setOffline(userEmail) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
        UPDATE user_statuses SET status = 'offline', last_seen = ? WHERE user_email = ?
      `);
      return stmt.run(Date.now(), userEmail);
    });
  },

  async getAll() {
    return await withConnection(async (db) => {
      const stmt = db.prepare('SELECT * FROM user_statuses');
      return stmt.all();
    });
  }
};

// ===================================
// USER FRIENDS
// ===================================

export const friendsDB = {
  async addFriendRequest(fromEmail, toEmail) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO user_friends (user_email, friend_email, status)
        VALUES (?, ?, 'pending')
      `);
      return stmt.run(fromEmail, toEmail);
    });
  },

  async getFriendRequests(userEmail) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
        SELECT uf.user_email as from_email, u.display_name as fromDisplayName, uf.created_at as sentAt
        FROM user_friends uf
        INNER JOIN users u ON uf.user_email = u.email
        WHERE uf.friend_email = ? AND uf.status = 'pending'
      `);
      return stmt.all(userEmail);
    });
  },

  async getSentFriendRequests(userEmail) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
        SELECT friend_email as to_email, status, created_at as sentAt
        FROM user_friends
        WHERE user_email = ? AND status = 'pending'
      `);
      return stmt.all(userEmail);
    });
  },

  async checkCrossRequest(fromEmail, toEmail) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
        SELECT * FROM user_friends
        WHERE user_email = ? AND friend_email = ? AND status = 'pending'
      `);
      return stmt.get(toEmail, fromEmail);
    });
  },

  async checkExistingRequest(fromEmail, toEmail) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
        SELECT * FROM user_friends
        WHERE user_email = ? AND friend_email = ?
      `);
      return stmt.get(fromEmail, toEmail);
    });
  },

  async acceptFriendRequest(userEmail, fromEmail) {
    return await withConnection(async (db) => {
      const stmt1 = db.prepare(`
        UPDATE user_friends
        SET status = 'accepted'
        WHERE user_email = ? AND friend_email = ? AND status = 'pending'
      `);
      const stmt2 = db.prepare(`
        INSERT OR REPLACE INTO user_friends (user_email, friend_email, status)
        VALUES (?, ?, 'accepted')
      `);

      stmt1.run(fromEmail, userEmail);
      stmt2.run(userEmail, fromEmail);

      return { success: true };
    });
  },

  async rejectFriendRequest(userEmail, fromEmail) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
        DELETE FROM user_friends
        WHERE user_email = ? AND friend_email = ? AND status = 'pending'
      `);
      return stmt.run(fromEmail, userEmail);
    });
  },

  async removeFriend(userEmail, friendEmail) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
        DELETE FROM user_friends
        WHERE (user_email = ? AND friend_email = ?) OR (user_email = ? AND friend_email = ?)
      `);
      return stmt.run(userEmail, friendEmail, friendEmail, userEmail);
    });
  },

  async getFriends(userEmail) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
        SELECT uf.friend_email as email, u.display_name as displayName, u.avatar
        FROM user_friends uf
        INNER JOIN users u ON uf.friend_email = u.email
        WHERE uf.user_email = ? AND uf.status = 'accepted'
      `);
      return stmt.all(userEmail);
    });
  },

  async areFriends(email1, email2) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
        SELECT * FROM user_friends
        WHERE user_email = ? AND friend_email = ? AND status = 'accepted'
      `);
      return stmt.get(email1, email2) !== undefined;
    });
  }
};

// ===================================
// USER QUOTAS
// ===================================

export const quotasDB = {
  async get(userEmail) {
    return await withConnection(async (db) => {
      const stmt = db.prepare('SELECT * FROM user_quotas WHERE user_email = ?');
      return stmt.get(userEmail);
    });
  },

  async getOrCreate(userEmail) {
    let quota = await this.get(userEmail);
    if (!quota) {
      await withConnection(async (db) => {
        const stmt = db.prepare(`
          INSERT INTO user_quotas (user_email, transcribe_used, translate_used, speak_used)
          VALUES (?, 0, 0, 0)
        `);
        stmt.run(userEmail);
      });
      quota = await this.get(userEmail);
    }
    return quota;
  },

  async increment(userEmail, action) {
    return await withConnection(async (db) => {
      const columnMap = {
        transcribe: 'transcribe_used',
        translate: 'translate_used',
        speak: 'speak_used'
      };
      const column = columnMap[action];
      if (!column) return;

      const stmt = db.prepare(`
        INSERT INTO user_quotas (user_email, ${column})
        VALUES (?, 1)
        ON CONFLICT(user_email) DO UPDATE SET ${column} = ${column} + 1
      `);
      return stmt.run(userEmail);
    });
  },

  async reset(userEmail) {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
        UPDATE user_quotas
        SET transcribe_used = 0, translate_used = 0, speak_used = 0, last_reset = ?
        WHERE user_email = ?
      `);
      return stmt.run(Math.floor(Date.now() / 1000), userEmail);
    });
  },

  async resetAll() {
    return await withConnection(async (db) => {
      const stmt = db.prepare(`
        UPDATE user_quotas
        SET transcribe_used = 0, translate_used = 0, speak_used = 0, last_reset = ?
      `);
      return stmt.run(Math.floor(Date.now() / 1000));
    });
  }
};

export async function closeDatabase() {
  await closePool();
  logger.info('Database connection pool closed');
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
