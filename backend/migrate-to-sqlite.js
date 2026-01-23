#!/usr/bin/env node

/**
 * Script de migration: JSON → SQLite
 *
 * Usage: node migrate-to-sqlite.js
 *
 * Ce script importe toutes les données des fichiers JSON
 * vers la nouvelle base SQLite.
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, usersDB, groupsDB, messagesDB, directMessagesDB, tokensDB, archivedDB, closeDatabase } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Fichiers JSON
const USERS_FILE = join(__dirname, 'users.json');
const GROUPS_FILE = join(__dirname, 'groups.json');
const MESSAGES_FILE = join(__dirname, 'messages.json');
const DMS_FILE = join(__dirname, 'dms.json');
const TOKENS_FILE = join(__dirname, 'access-tokens.json');

async function loadJSON(filePath) {
  try {
    const data = await readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.log(`⚠️  Fichier ${filePath} non trouvé, ignoré`);
    return null;
  }
}

async function migrateUsers(usersData) {
  console.log('\n📦 Migration des utilisateurs...');

  let count = 0;
  for (const [email, user] of Object.entries(usersData)) {
    try {
      usersDB.create({
        email: email,
        password: user.password,
        name: user.name || email.split('@')[0],
        displayName: user.displayName || email.split('@')[0],
        role: user.role || 'user',
        subscriptionTier: user.subscriptionTier || 'free'
      });

      // Avatar si existe
      if (user.avatar) {
        usersDB.update(email, { avatar: user.avatar });
      }

      // Stripe data si existe
      if (user.stripeCustomerId) {
        usersDB.update(email, {
          stripe_customer_id: user.stripeCustomerId,
          stripe_subscription_id: user.stripeSubscriptionId,
          subscription_status: user.subscriptionStatus || 'active'
        });
      }

      // Groupes archivés
      if (user.archivedGroups && user.archivedGroups.length > 0) {
        for (const groupId of user.archivedGroups) {
          archivedDB.archive(email, 'group', groupId);
        }
      }

      // DMs archivés
      if (user.archivedDMs && user.archivedDMs.length > 0) {
        for (const dmId of user.archivedDMs) {
          archivedDB.archive(email, 'dm', dmId);
        }
      }

      count++;
    } catch (error) {
      console.error(`   ❌ Erreur utilisateur ${email}:`, error.message);
    }
  }

  console.log(`   ✅ ${count} utilisateurs migrés`);
}

async function migrateGroups(groupsData) {
  console.log('\n📦 Migration des groupes...');

  let count = 0;
  for (const [groupId, group] of Object.entries(groupsData)) {
    try {
      // Créer le groupe
      groupsDB.create({
        id: groupId,
        name: group.name,
        creator: group.creator,
        visibility: group.visibility || 'private',
        createdAt: group.createdAt || Date.now()
      });

      // Ajouter les membres
      if (group.members && group.members.length > 0) {
        for (const member of group.members) {
          try {
            groupsDB.addMember(groupId, {
              email: member.email,
              displayName: member.displayName || member.email.split('@')[0],
              role: member.role || 'member'
            });
          } catch (error) {
            console.error(`   ⚠️  Membre ${member.email} du groupe ${group.name}: ${error.message}`);
          }
        }
      }

      count++;
    } catch (error) {
      console.error(`   ❌ Erreur groupe ${group.name}:`, error.message);
    }
  }

  console.log(`   ✅ ${count} groupes migrés`);
}

async function migrateMessages(messagesData) {
  console.log('\n📦 Migration des messages de groupe...');

  let totalCount = 0;
  for (const [groupId, messages] of Object.entries(messagesData)) {
    let count = 0;
    for (const msg of messages) {
      try {
        messagesDB.create({
          id: msg.id,
          groupId: groupId,
          from: msg.from,
          fromDisplayName: msg.fromDisplayName || msg.from.split('@')[0],
          content: msg.content,
          originalLang: msg.originalLang || 'fr',
          translations: msg.translations || {},
          fileInfo: msg.fileInfo || null,
          timestamp: msg.timestamp || Date.now()
        });
        count++;
        totalCount++;
      } catch (error) {
        console.error(`   ⚠️  Message ${msg.id}: ${error.message}`);
      }
    }
    if (count > 0) {
      console.log(`   ✓ Groupe ${groupId}: ${count} messages`);
    }
  }

  console.log(`   ✅ ${totalCount} messages de groupe migrés`);
}

async function migrateDirectMessages(dmsData) {
  console.log('\n📦 Migration des messages privés...');

  let totalCount = 0;
  for (const [conversationId, messages] of Object.entries(dmsData)) {
    let count = 0;
    for (const msg of messages) {
      try {
        directMessagesDB.create({
          id: msg.id,
          conversationId: conversationId,
          from: msg.from,
          to: msg.to,
          fromDisplayName: msg.fromDisplayName || msg.from.split('@')[0],
          content: msg.content,
          originalLang: msg.originalLang || 'fr',
          translations: msg.translations || {},
          fileInfo: msg.fileInfo || null,
          timestamp: msg.timestamp || Date.now()
        });
        count++;
        totalCount++;
      } catch (error) {
        console.error(`   ⚠️  DM ${msg.id}: ${error.message}`);
      }
    }
    if (count > 0) {
      console.log(`   ✓ Conversation ${conversationId}: ${count} messages`);
    }
  }

  console.log(`   ✅ ${totalCount} messages privés migrés`);
}

async function migrateTokens(tokensData) {
  console.log('\n📦 Migration des tokens d\'accès...');

  let count = 0;
  for (const [token, data] of Object.entries(tokensData)) {
    try {
      tokensDB.create({
        token: token,
        tier: data.tier,
        maxUses: data.maxUses || 1,
        expiresAt: data.expiresAt || null,
        description: data.description || null
      });

      // Mettre à jour les utilisations
      if (data.usedBy && data.usedBy.length > 0) {
        for (let i = 0; i < data.usedBy.length; i++) {
          tokensDB.incrementUse(token);
        }
      }

      count++;
    } catch (error) {
      console.error(`   ❌ Erreur token ${token}:`, error.message);
    }
  }

  console.log(`   ✅ ${count} tokens migrés`);
}

async function main() {
  console.log('🚀 Début de la migration JSON → SQLite\n');
  console.log('=' .repeat(50));

  // Initialiser la DB
  initDatabase();

  // Charger les fichiers JSON
  const usersData = await loadJSON(USERS_FILE);
  const groupsData = await loadJSON(GROUPS_FILE);
  const messagesData = await loadJSON(MESSAGES_FILE);
  const dmsData = await loadJSON(DMS_FILE);
  const tokensData = await loadJSON(TOKENS_FILE);

  // Migrations dans l'ordre (pour respecter foreign keys)
  if (usersData) {
    await migrateUsers(usersData);
  }

  if (groupsData) {
    await migrateGroups(groupsData);
  }

  if (messagesData) {
    await migrateMessages(messagesData);
  }

  if (dmsData) {
    await migrateDirectMessages(dmsData);
  }

  if (tokensData) {
    await migrateTokens(tokensData);
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Migration terminée avec succès !');
  console.log('\n📊 Statistiques:');
  console.log(`   - Utilisateurs: ${usersDB.getAll().length}`);
  console.log(`   - Groupes: ${groupsDB.getAll().length}`);
  console.log(`   - Tokens: ${tokensDB.getAll().length}`);
  console.log('\n💡 Prochaines étapes:');
  console.log('   1. Vérifier les données dans realtranslate.db');
  console.log('   2. Sauvegarder les fichiers JSON (backup)');
  console.log('   3. Démarrer le serveur avec la nouvelle DB');

  closeDatabase();
}

main().catch(error => {
  console.error('💥 Erreur fatale:', error);
  process.exit(1);
});
