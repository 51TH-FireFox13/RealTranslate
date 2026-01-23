/**
 * Tests d'authentification
 * Couvre: Création utilisateur, login, JWT, quotas
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Chemin de la base de test
const TEST_DB = path.join(__dirname, '..', 'test-realtranslate.db');

// Créer une app de test
let app;
let authManager;
let db;

beforeAll(async () => {
  // Supprimer la DB de test si elle existe
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }

  // Importer dynamiquement pour éviter l'initialisation avant le setup
  process.env.DB_FILE = TEST_DB;

  const { initDatabase } = await import('../database.js');
  const authModule = await import('../auth-sqlite.js');

  db = initDatabase();
  authManager = authModule.authManager;

  // Créer une mini-app Express pour les tests
  app = express();
  app.use(express.json());

  // Routes de test
  app.post('/api/auth/register', (req, res) => {
    const { email, password, displayName } = req.body;
    const result = authManager.createUser(email, password, 'user', 'free', displayName);

    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.status(400).json({ error: result.message });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const result = authManager.verifyUser(email, password);

    if (result.success) {
      const token = authManager.createAuthToken(email);
      res.json({
        success: true,
        token,
        user: {
          email: result.user.email,
          displayName: result.user.displayName,
          role: result.user.role,
          subscriptionTier: result.user.subscriptionTier
        }
      });
    } else {
      res.status(401).json({ error: result.message });
    }
  });

  app.get('/api/auth/me', authModule.authMiddleware, (req, res) => {
    res.json({
      email: req.user.email,
      displayName: req.user.displayName,
      role: req.user.role,
      subscriptionTier: req.user.subscriptionTier
    });
  });

  app.get('/api/auth/quota', authModule.authMiddleware, (req, res) => {
    const quota = authManager.getUserQuota(req.user.email);
    res.json(quota);
  });
});

afterAll(() => {
  // Nettoyer la DB de test
  if (db) {
    db.close();
  }
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }
});

describe('Authentification - Création utilisateur', () => {
  test('Devrait créer un utilisateur avec succès', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123',
        displayName: 'Test User'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('Ne devrait pas créer un utilisateur en double', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password456',
        displayName: 'Test User 2'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('existe déjà');
  });

  test('Admin par défaut devrait exister', () => {
    const adminUser = authManager.users['admin@realtranslate.com'];
    expect(adminUser).toBeDefined();
    expect(adminUser.role).toBe('admin');
    expect(adminUser.subscriptionTier).toBe('admin');
  });
});

describe('Authentification - Login', () => {
  test('Devrait se connecter avec des identifiants valides', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.token).toBeDefined();
    expect(response.body.user.email).toBe('test@example.com');
    expect(response.body.user.displayName).toBe('Test User');
  });

  test('Ne devrait pas se connecter avec un mauvais mot de passe', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'wrongpassword'
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('incorrect');
  });

  test('Ne devrait pas se connecter avec un email inexistant', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'password123'
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('introuvable');
  });
});

describe('Authentification - JWT Token', () => {
  let validToken;

  test('Devrait obtenir un token valide après login', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });

    validToken = response.body.token;
    expect(validToken).toBeDefined();
    expect(typeof validToken).toBe('string');
    expect(validToken.length).toBeGreaterThan(20);
  });

  test('Devrait accéder à une route protégée avec un token valide', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${validToken}`);

    expect(response.status).toBe(200);
    expect(response.body.email).toBe('test@example.com');
    expect(response.body.displayName).toBe('Test User');
  });

  test('Ne devrait pas accéder sans token', async () => {
    const response = await request(app)
      .get('/api/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Token manquant');
  });

  test('Ne devrait pas accéder avec un token invalide', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid_token_123');

    expect(response.status).toBe(401);
  });
});

describe('Quotas - Utilisateur Free', () => {
  let userToken;

  beforeAll(async () => {
    // Créer un utilisateur free
    await request(app)
      .post('/api/auth/register')
      .send({
        email: 'freeuser@example.com',
        password: 'password123',
        displayName: 'Free User'
      });

    // Se connecter
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'freeuser@example.com',
        password: 'password123'
      });

    userToken = response.body.token;
  });

  test('Devrait avoir les quotas Free par défaut', async () => {
    const response = await request(app)
      .get('/api/auth/quota')
      .set('Authorization', `Bearer ${userToken}`);

    expect(response.status).toBe(200);
    expect(response.body.tier).toBe('free');
    expect(response.body.quotas).toEqual({
      transcribe: 50,
      translate: 250,
      speak: 50
    });
  });

  test('Usage devrait être initialisé à 0', async () => {
    const response = await request(app)
      .get('/api/auth/quota')
      .set('Authorization', `Bearer ${userToken}`);

    expect(response.body.usage).toEqual({
      transcribe: 0,
      translate: 0,
      speak: 0
    });
  });

  test('checkQuota devrait retourner true pour utilisateur sous limite', () => {
    const canTranscribe = authManager.checkQuota('freeuser@example.com', 'transcribe');
    const canTranslate = authManager.checkQuota('freeuser@example.com', 'translate');
    const canSpeak = authManager.checkQuota('freeuser@example.com', 'speak');

    expect(canTranscribe).toBe(true);
    expect(canTranslate).toBe(true);
    expect(canSpeak).toBe(true);
  });

  test('incrementQuota devrait augmenter l\'usage', () => {
    // Obtenir l'usage initial
    const userBefore = authManager.users['freeuser@example.com'];
    const initialTranscribe = userBefore.quotaUsage.transcribe || 0;
    const initialTranslate = userBefore.quotaUsage.translate || 0;

    // Incrémenter les quotas
    authManager.incrementQuota('freeuser@example.com', 'transcribe');
    authManager.incrementQuota('freeuser@example.com', 'transcribe');
    authManager.incrementQuota('freeuser@example.com', 'translate');

    // Récupérer l'utilisateur à nouveau pour voir les changements
    const userAfter = authManager.users['freeuser@example.com'];
    expect(userAfter.quotaUsage.transcribe).toBe(initialTranscribe + 2);
    expect(userAfter.quotaUsage.translate).toBe(initialTranslate + 1);
  });
});

describe('Quotas - Admin illimité', () => {
  test('Admin devrait avoir des quotas illimités', () => {
    const quota = authManager.getUserQuota('admin@realtranslate.com');

    expect(quota.tier).toBe('admin');
    expect(quota.quotas.transcribe).toBe(-1);
    expect(quota.quotas.translate).toBe(-1);
    expect(quota.quotas.speak).toBe(-1);
  });

  test('checkQuota devrait toujours retourner true pour admin', () => {
    const canTranscribe = authManager.checkQuota('admin@realtranslate.com', 'transcribe');
    const canTranslate = authManager.checkQuota('admin@realtranslate.com', 'translate');
    const canSpeak = authManager.checkQuota('admin@realtranslate.com', 'speak');

    expect(canTranscribe).toBe(true);
    expect(canTranslate).toBe(true);
    expect(canSpeak).toBe(true);
  });
});

describe('Mise à jour abonnement', () => {
  test('Devrait mettre à jour le tier d\'un utilisateur', () => {
    const result = authManager.updateUserSubscription('freeuser@example.com', 'premium', 'active');

    expect(result.success).toBe(true);

    const user = authManager.users['freeuser@example.com'];
    expect(user.subscriptionTier).toBe('premium');
    expect(user.subscriptionStatus).toBe('active');
  });

  test('Les quotas devraient refléter le nouveau tier', () => {
    const quota = authManager.getUserQuota('freeuser@example.com');

    expect(quota.tier).toBe('premium');
    expect(quota.quotas).toEqual({
      transcribe: 500,
      translate: 2500,
      speak: 500
    });
  });
});
