/**
 * Tests WebSocket (Socket.IO)
 * Couvre: Connexion, messages, statuts en ligne
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB = path.join(__dirname, '..', 'test-websocket.db');

let httpServer;
let ioServer;
let authManager;
let db;
let testUser1Token;
let testUser2Token;

// Fonction helper pour créer un client Socket.IO
function createSocketClient(token) {
  return ioClient(`http://localhost:3001`, {
    auth: { token },
    transports: ['websocket']
  });
}

beforeAll(async () => {
  // Nettoyer la DB de test
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }

  process.env.DB_FILE = TEST_DB;

  // Importer modules
  const { initDatabase, usersDB, statusesDB } = await import('../database.js');
  const authModule = await import('../auth-sqlite.js');

  db = initDatabase();
  authManager = authModule.authManager;

  // Créer l'app Express et le serveur HTTP
  const app = express();
  httpServer = createServer(app);

  // Créer le serveur Socket.IO
  ioServer = new Server(httpServer, {
    cors: {
      origin: '*'
    }
  });

  // Middleware Socket.IO basique
  ioServer.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Token manquant'));
    }

    const result = authManager.verifyToken(token);
    if (!result.success) {
      return next(new Error('Token invalide'));
    }

    socket.userEmail = result.user.email;
    socket.user = result.user;
    next();
  });

  // Gestionnaires Socket.IO simplifiés pour les tests
  ioServer.on('connection', (socket) => {
    const userEmail = socket.userEmail;

    // Marquer en ligne
    statusesDB.setOnline(userEmail);
    socket.broadcast.emit('user_status', { email: userEmail, online: true });

    // Rejoindre une room de groupe
    socket.on('join_group', (groupId) => {
      socket.join(`group_${groupId}`);
      socket.emit('joined_group', { groupId });
    });

    // Envoyer un message de groupe
    socket.on('send_group_message', (data) => {
      const { groupId, message } = data;
      ioServer.to(`group_${groupId}`).emit('new_group_message', {
        groupId,
        message: {
          id: `msg_${Date.now()}`,
          from: userEmail,
          content: message,
          timestamp: Date.now()
        }
      });
    });

    // Message privé
    socket.on('send_direct_message', (data) => {
      const { to, message } = data;
      socket.to(`user_${to}`).emit('new_direct_message', {
        from: userEmail,
        message: {
          id: `dm_${Date.now()}`,
          from: userEmail,
          to,
          content: message,
          timestamp: Date.now()
        }
      });
    });

    // Déconnexion
    socket.on('disconnect', () => {
      statusesDB.setOffline(userEmail);
      socket.broadcast.emit('user_status', { email: userEmail, online: false });
    });

    // Room utilisateur pour DMs
    socket.join(`user_${userEmail}`);
  });

  // Démarrer le serveur sur un port de test
  await new Promise((resolve) => {
    httpServer.listen(3001, resolve);
  });

  // Créer des utilisateurs de test
  authManager.createUser('wstest1@example.com', 'password123', 'user', 'free', 'WS Test 1');
  authManager.createUser('wstest2@example.com', 'password123', 'user', 'free', 'WS Test 2');

  testUser1Token = authManager.createAuthToken('wstest1@example.com');
  testUser2Token = authManager.createAuthToken('wstest2@example.com');
});

afterAll(async () => {
  // Fermer le serveur
  ioServer.close();
  await new Promise((resolve) => {
    httpServer.close(resolve);
  });

  // Fermer la DB
  if (db) {
    db.close();
  }

  // Nettoyer
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }
});

describe('WebSocket - Connexion', () => {
  test('Devrait se connecter avec un token valide', (done) => {
    const socket = createSocketClient(testUser1Token);

    socket.on('connect', () => {
      expect(socket.connected).toBe(true);
      socket.disconnect();
      done();
    });

    socket.on('connect_error', (err) => {
      done(err);
    });
  });

  test('Ne devrait pas se connecter sans token', (done) => {
    const socket = ioClient(`http://localhost:3001`, {
      transports: ['websocket']
    });

    socket.on('connect_error', (err) => {
      expect(err.message).toContain('Token');
      socket.disconnect();
      done();
    });

    socket.on('connect', () => {
      socket.disconnect();
      done(new Error('Ne devrait pas se connecter sans token'));
    });
  });

  test('Ne devrait pas se connecter avec un token invalide', (done) => {
    const socket = createSocketClient('invalid_token_abc123');

    socket.on('connect_error', (err) => {
      expect(err.message).toContain('invalide');
      socket.disconnect();
      done();
    });

    socket.on('connect', () => {
      socket.disconnect();
      done(new Error('Ne devrait pas se connecter avec token invalide'));
    });
  });
});

describe('WebSocket - Statuts en ligne', () => {
  test('Devrait diffuser le statut en ligne à la connexion', (done) => {
    // Socket2 doit se connecter et écouter AVANT que socket1 ne se connecte
    const socket2 = createSocketClient(testUser2Token);
    let socket1;

    socket2.on('connect', () => {
      // Socket2 est connecté, maintenant écouter les statuts
      socket2.on('user_status', (data) => {
        if (data.email === 'wstest1@example.com' && data.online === true) {
          expect(data.email).toBe('wstest1@example.com');
          expect(data.online).toBe(true);
          socket1.disconnect();
          socket2.disconnect();
          done();
        }
      });

      // Maintenant que socket2 écoute, connecter socket1
      setTimeout(() => {
        socket1 = createSocketClient(testUser1Token);
      }, 100);
    });
  });

  test('Devrait diffuser le statut hors ligne à la déconnexion', (done) => {
    const socket1 = createSocketClient(testUser1Token);
    const socket2 = createSocketClient(testUser2Token);

    socket1.on('connect', () => {
      socket2.on('user_status', (data) => {
        if (data.email === 'wstest1@example.com' && !data.online) {
          expect(data.online).toBe(false);
          socket2.disconnect();
          done();
        }
      });

      // Déconnecter socket1 après un court délai
      setTimeout(() => {
        socket1.disconnect();
      }, 100);
    });
  });
});

describe('WebSocket - Messages de groupe', () => {
  test('Devrait rejoindre un groupe', (done) => {
    const socket = createSocketClient(testUser1Token);

    socket.on('connect', () => {
      socket.emit('join_group', 'test_group_123');
    });

    socket.on('joined_group', (data) => {
      expect(data.groupId).toBe('test_group_123');
      socket.disconnect();
      done();
    });
  });

  test('Devrait envoyer et recevoir un message de groupe', (done) => {
    const socket1 = createSocketClient(testUser1Token);
    const socket2 = createSocketClient(testUser2Token);

    let socket1Connected = false;
    let socket2Connected = false;

    const checkBothConnected = () => {
      if (socket1Connected && socket2Connected) {
        // Les deux sont connectés, rejoindre le groupe
        socket1.emit('join_group', 'test_group_456');
        socket2.emit('join_group', 'test_group_456');

        setTimeout(() => {
          // Socket1 envoie un message
          socket1.emit('send_group_message', {
            groupId: 'test_group_456',
            message: 'Hello from user 1!'
          });
        }, 100);
      }
    };

    socket1.on('connect', () => {
      socket1Connected = true;
      checkBothConnected();
    });

    socket2.on('connect', () => {
      socket2Connected = true;
      checkBothConnected();
    });

    // Socket2 devrait recevoir le message
    socket2.on('new_group_message', (data) => {
      expect(data.groupId).toBe('test_group_456');
      expect(data.message.from).toBe('wstest1@example.com');
      expect(data.message.content).toBe('Hello from user 1!');
      socket1.disconnect();
      socket2.disconnect();
      done();
    });
  });
});

describe('WebSocket - Messages privés', () => {
  test('Devrait envoyer et recevoir un message privé', (done) => {
    const socket1 = createSocketClient(testUser1Token);
    const socket2 = createSocketClient(testUser2Token);

    let bothConnected = false;

    const checkConnections = () => {
      if (socket1.connected && socket2.connected && !bothConnected) {
        bothConnected = true;
        setTimeout(() => {
          // Socket1 envoie un DM à socket2
          socket1.emit('send_direct_message', {
            to: 'wstest2@example.com',
            message: 'Private message to user 2'
          });
        }, 100);
      }
    };

    socket1.on('connect', checkConnections);
    socket2.on('connect', checkConnections);

    // Socket2 devrait recevoir le DM
    socket2.on('new_direct_message', (data) => {
      expect(data.from).toBe('wstest1@example.com');
      expect(data.message.to).toBe('wstest2@example.com');
      expect(data.message.content).toBe('Private message to user 2');
      socket1.disconnect();
      socket2.disconnect();
      done();
    });
  });

  test('Les messages privés ne devraient pas être reçus par d\'autres', (done) => {
    const socket1 = createSocketClient(testUser1Token);
    const socket2 = createSocketClient(testUser2Token);

    // Créer un 3e utilisateur
    authManager.createUser('wstest3@example.com', 'password123', 'user', 'free', 'WS Test 3');
    const testUser3Token = authManager.createAuthToken('wstest3@example.com');
    const socket3 = createSocketClient(testUser3Token);

    let allConnected = false;
    const checkConnections = () => {
      if (socket1.connected && socket2.connected && socket3.connected && !allConnected) {
        allConnected = true;
        setTimeout(() => {
          // Socket1 envoie un DM à socket2 (socket3 ne devrait pas recevoir)
          socket1.emit('send_direct_message', {
            to: 'wstest2@example.com',
            message: 'Secret message'
          });
        }, 100);
      }
    };

    socket1.on('connect', checkConnections);
    socket2.on('connect', checkConnections);
    socket3.on('connect', checkConnections);

    // Socket3 ne devrait rien recevoir
    socket3.on('new_direct_message', () => {
      socket1.disconnect();
      socket2.disconnect();
      socket3.disconnect();
      done(new Error('Socket3 ne devrait pas recevoir le message'));
    });

    // Socket2 devrait recevoir
    socket2.on('new_direct_message', (data) => {
      expect(data.message.content).toBe('Secret message');

      // Attendre un peu pour s'assurer que socket3 ne reçoit rien
      setTimeout(() => {
        socket1.disconnect();
        socket2.disconnect();
        socket3.disconnect();
        done();
      }, 200);
    });
  });
});
