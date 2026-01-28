/**
 * Script de test pour database-v2.js
 * Vérifie que le pool de connexions et les opérations DB fonctionnent
 */

import {
  initDatabase,
  usersDB,
  groupsDB,
  messagesDB,
  transaction,
  closeDatabase
} from './database-v2.js';
import { healthCheck, getPoolStats } from './src/db.js';

async function runTests() {
  console.log('🧪 Testing database-v2.js...\n');

  try {
    // Test 1: Initialisation
    console.log('1️⃣  Testing initialization...');
    await initDatabase(':memory:');
    console.log('✅ Database initialized with pool');

    // Test 2: Health check
    console.log('\n2️⃣  Testing health check...');
    const healthy = await healthCheck();
    if (!healthy) throw new Error('Health check failed');
    console.log('✅ Database is healthy');

    // Test 3: Pool stats
    console.log('\n3️⃣  Testing pool stats...');
    const stats = getPoolStats();
    console.log('📊 Pool stats:', stats);
    console.log('✅ Pool stats retrieved');

    // Test 4: Create user
    console.log('\n4️⃣  Testing user creation...');
    await usersDB.create({
      email: 'test@example.com',
      password: 'hashed_password',
      name: 'Test User',
      displayName: 'Test',
      role: 'user',
      subscriptionTier: 'free'
    });
    console.log('✅ User created');

    // Test 5: Get user
    console.log('\n5️⃣  Testing user retrieval...');
    const user = await usersDB.getByEmail('test@example.com');
    if (!user) throw new Error('User not found');
    console.log('✅ User retrieved:', user.email);

    // Test 6: Get all users
    console.log('\n6️⃣  Testing get all users...');
    const users = await usersDB.getAll();
    console.log('✅ Found', users.length, 'user(s)');

    // Test 7: Update user
    console.log('\n7️⃣  Testing user update...');
    await usersDB.update('test@example.com', {
      name: 'Updated Name',
      avatar: 'avatar.png'
    });
    const updatedUser = await usersDB.getByEmail('test@example.com');
    if (updatedUser.name !== 'Updated Name') throw new Error('Update failed');
    console.log('✅ User updated');

    // Test 8: Create group
    console.log('\n8️⃣  Testing group creation...');
    await groupsDB.create({
      id: 'group-123',
      name: 'Test Group',
      creator: 'test@example.com',
      visibility: 'private',
      createdAt: Date.now()
    });
    console.log('✅ Group created');

    // Test 9: Add member to group
    console.log('\n9️⃣  Testing add member...');
    await groupsDB.addMember('group-123', {
      email: 'test@example.com',
      displayName: 'Test',
      role: 'admin'
    });
    console.log('✅ Member added');

    // Test 10: Get group members
    console.log('\n🔟 Testing get members...');
    const members = await groupsDB.getMembers('group-123');
    if (members.length !== 1) throw new Error('Wrong number of members');
    console.log('✅ Found', members.length, 'member(s)');

    // Test 11: Transaction test
    console.log('\n1️⃣1️⃣  Testing transaction...');
    await transaction(async (db) => {
      const stmt = db.prepare(`
        INSERT INTO messages (id, group_id, from_email, from_display_name, content, original_lang, translations, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        'msg-123',
        'group-123',
        'test@example.com',
        'Test',
        'Test message',
        'en',
        JSON.stringify({ fr: 'Message de test' }),
        Date.now()
      );
    });
    const msgs = await messagesDB.getByGroup('group-123');
    if (msgs.length !== 1) throw new Error('Message not created in transaction');
    console.log('✅ Transaction successful');

    // Test 12: Delete operations
    console.log('\n1️⃣2️⃣  Testing delete operations...');
    await messagesDB.delete('msg-123');
    await groupsDB.delete('group-123');
    await usersDB.delete('test@example.com');
    console.log('✅ Delete operations successful');

    // Test 13: Pool stats after operations
    console.log('\n1️⃣3️⃣  Final pool stats...');
    const finalStats = getPoolStats();
    console.log('📊 Final pool stats:', finalStats);

    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await closeDatabase();
    console.log('✅ Database closed');

    console.log('\n✅✅✅ ALL TESTS PASSED! ✅✅✅');
    console.log('\n🎉 database-v2.js is working correctly with connection pool!');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);

    try {
      await closeDatabase();
    } catch (e) {
      // Ignore cleanup errors
    }

    process.exit(1);
  }
}

runTests();
