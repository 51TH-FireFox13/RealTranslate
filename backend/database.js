import Database from 'better-sqlite3';
import { logger } from './logger.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_FILE = join(__dirname, 'realtranslate.db');

// Connexion SQLite
let db;

export function initDatabase() {
  try {
    db = new Database(DB_FILE);
    db.pragma('journal_mode = WAL'); // Write-Ahead Logging pour meilleures perfs
    db.pragma('foreign_keys = ON'); // Intégrité référentielle

    logger.info('SQLite database connected', { file: DB_FILE });

    // Créer les tables
    createTables();

    return db;
  } catch (error) {
    logger.error('Error initializing database', { error: error.message });
    throw error;
  }
}

function createTables() {
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
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

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

  // Table access_tokens
  db.exec(`
    CREATE TABLE IF NOT EXISTS access_tokens (
      token TEXT PRIMARY KEY,
      tier TEXT NOT NULL,
      max_uses INTEGER DEFAULT 1,
      current_uses INTEGER DEFAULT 0,
      expires_at INTEGER,
      description TEXT,
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

  logger.info('Database tables created/verified');
}

// ===================================
// USERS
// ===================================

export const usersDB = {
  getAll() {
    const stmt = db.prepare('SELECT * FROM users');
    return stmt.all();
  },

  getByEmail(email) {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email);
  },

  create(user) {
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

    if (updates.length === 0) return;

    updates.push('updated_at = ?');
    values.push(Math.floor(Date.now() / 1000));
    values.push(email);

    const stmt = db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE email = ?`);
    return stmt.run(...values);
  },

  delete(email) {
    const stmt = db.prepare('DELETE FROM users WHERE email = ?');
    return stmt.run(email);
  }
};

// ===================================
// GROUPS
// ===================================

export const groupsDB = {
  getAll() {
    const stmt = db.prepare('SELECT * FROM groups');
    return stmt.all();
  },

  getById(id) {
    const stmt = db.prepare('SELECT * FROM groups WHERE id = ?');
    return stmt.get(id);
  },

  getByUser(userEmail) {
    const stmt = db.prepare(`
      SELECT g.* FROM groups g
      INNER JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_email = ?
    `);
    return stmt.all(userEmail);
  },

  getPublic() {
    const stmt = db.prepare('SELECT * FROM groups WHERE visibility = ?');
    return stmt.all('public');
  },

  create(group) {
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
  },

  delete(id) {
    const stmt = db.prepare('DELETE FROM groups WHERE id = ?');
    return stmt.run(id);
  },

  // Membres
  getMembers(groupId) {
    const stmt = db.prepare('SELECT * FROM group_members WHERE group_id = ?');
    return stmt.all(groupId);
  },

  addMember(groupId, member) {
    const stmt = db.prepare(`
      INSERT INTO group_members (group_id, user_email, display_name, role)
      VALUES (?, ?, ?, ?)
    `);
    return stmt.run(groupId, member.email, member.displayName, member.role || 'member');
  },

  removeMember(groupId, userEmail) {
    const stmt = db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_email = ?');
    return stmt.run(groupId, userEmail);
  },

  updateMemberRole(groupId, userEmail, role) {
    const stmt = db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_email = ?');
    return stmt.run(role, groupId, userEmail);
  }
};

// ===================================
// MESSAGES
// ===================================

export const messagesDB = {
  getByGroup(groupId, limit = 100) {
    const stmt = db.prepare(`
      SELECT * FROM messages
      WHERE group_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return stmt.all(groupId, limit).reverse(); // Plus récent en dernier
  },

  create(message) {
    const stmt = db.prepare(`
      INSERT INTO messages (id, group_id, from_email, from_display_name, content, original_lang, translations, file_info, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      message.id,
      message.groupId,
      message.from,
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
      const stmt = db.prepare('UPDATE messages SET translations = ? WHERE id = ?');
      return stmt.run(JSON.stringify(fields.translations), messageId);
    }
  },

  delete(messageId) {
    const stmt = db.prepare('DELETE FROM messages WHERE id = ?');
    return stmt.run(messageId);
  },

  deleteByGroup(groupId) {
    const stmt = db.prepare('DELETE FROM messages WHERE group_id = ?');
    return stmt.run(groupId);
  }
};

// ===================================
// DIRECT MESSAGES
// ===================================

export const directMessagesDB = {
  getByConversation(conversationId, limit = 100) {
    const stmt = db.prepare(`
      SELECT * FROM direct_messages
      WHERE conversation_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return stmt.all(conversationId, limit).reverse();
  },

  getConversationsByUser(userEmail) {
    const stmt = db.prepare(`
      SELECT DISTINCT conversation_id FROM direct_messages
      WHERE from_email = ? OR to_email = ?
    `);
    return stmt.all(userEmail, userEmail);
  },

  create(message) {
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
  },

  update(messageId, fields) {
    if (fields.translations) {
      const stmt = db.prepare('UPDATE direct_messages SET translations = ? WHERE id = ?');
      return stmt.run(JSON.stringify(fields.translations), messageId);
    }
  },

  delete(messageId) {
    const stmt = db.prepare('DELETE FROM direct_messages WHERE id = ?');
    return stmt.run(messageId);
  }
};

// ===================================
// ACCESS TOKENS
// ===================================

export const tokensDB = {
  getAll() {
    const stmt = db.prepare('SELECT * FROM access_tokens');
    return stmt.all();
  },

  getByToken(token) {
    const stmt = db.prepare('SELECT * FROM access_tokens WHERE token = ?');
    return stmt.get(token);
  },

  create(token) {
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
  },

  incrementUse(token) {
    const stmt = db.prepare('UPDATE access_tokens SET current_uses = current_uses + 1 WHERE token = ?');
    return stmt.run(token);
  },

  delete(token) {
    const stmt = db.prepare('DELETE FROM access_tokens WHERE token = ?');
    return stmt.run(token);
  }
};

// ===================================
// USER ARCHIVED
// ===================================

export const archivedDB = {
  getArchived(userEmail, itemType) {
    const stmt = db.prepare('SELECT item_id FROM user_archived WHERE user_email = ? AND item_type = ?');
    return stmt.all(userEmail, itemType).map(row => row.item_id);
  },

  archive(userEmail, itemType, itemId) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO user_archived (user_email, item_type, item_id)
      VALUES (?, ?, ?)
    `);
    return stmt.run(userEmail, itemType, itemId);
  },

  unarchive(userEmail, itemType, itemId) {
    const stmt = db.prepare('DELETE FROM user_archived WHERE user_email = ? AND item_type = ? AND item_id = ?');
    return stmt.run(userEmail, itemType, itemId);
  }
};

// ===================================
// USER STATUSES
// ===================================

export const statusesDB = {
  get(userEmail) {
    const stmt = db.prepare('SELECT * FROM user_statuses WHERE user_email = ?');
    return stmt.get(userEmail);
  },

  setOnline(userEmail) {
    const stmt = db.prepare(`
      INSERT INTO user_statuses (user_email, status, last_seen)
      VALUES (?, 'online', ?)
      ON CONFLICT(user_email) DO UPDATE SET status = 'online', last_seen = ?
    `);
    const now = Date.now();
    return stmt.run(userEmail, now, now);
  },

  setOffline(userEmail) {
    const stmt = db.prepare(`
      UPDATE user_statuses SET status = 'offline', last_seen = ? WHERE user_email = ?
    `);
    return stmt.run(Date.now(), userEmail);
  },

  getAll() {
    const stmt = db.prepare('SELECT * FROM user_statuses');
    return stmt.all();
  }
};

export function closeDatabase() {
  if (db) {
    db.close();
    logger.info('Database connection closed');
  }
}

export default {
  initDatabase,
  closeDatabase,
  usersDB,
  groupsDB,
  messagesDB,
  directMessagesDB,
  tokensDB,
  archivedDB,
  statusesDB
};
