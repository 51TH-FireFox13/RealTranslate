/**
 * @fileoverview Router principal - Point d'entrée pour toutes les routes API
 * @module routes/index
 *
 * Ce module centralise l'enregistrement de tous les routers de l'application.
 * Il permet une organisation modulaire et une meilleure maintenabilité du code.
 */

import express from 'express';

// Import des routers modulaires
import authRoutes, { subscriptionPublicRoutes, csrfRoute } from './auth.routes.js';
import usersRoutes from './users.routes.js';
import groupsRoutes from './groups.routes.js';
import messagesRoutes from './messages.routes.js';
import apiRoutes from './api.routes.js';
import paymentsRoutes from './payments.routes.js';
import uploadRoutes from './upload.routes.js';
import friendsRoutes from './friends.routes.js';
import adminRoutes from './admin.routes.js';

/**
 * Configure et retourne le router principal avec tous les sous-routers montés
 * @param {Object} dependencies - Dépendances nécessaires aux routes
 * @param {Object} dependencies.io - Instance Socket.IO
 * @param {Object} dependencies.db - Instance de la base de données
 * @returns {express.Router} Router Express configuré
 */
export function setupRoutes(dependencies) {
  const router = express.Router();

  // Montage des routers par domaine fonctionnel
  // Chaque router gère un aspect spécifique de l'application

  // Authentification et gestion de session
  router.use('/auth', authRoutes(dependencies));

  // Routes d'abonnement (publiques, sans préfixe /auth)
  router.use('/subscription', subscriptionPublicRoutes(dependencies));

  // Route CSRF token
  router.use('/', csrfRoute(dependencies));

  // Gestion des utilisateurs et profils
  router.use('/', usersRoutes(dependencies));

  // Gestion des groupes et membres
  router.use('/groups', groupsRoutes(dependencies));

  // Messages, DMs et historique
  router.use('/', messagesRoutes(dependencies));

  // Services IA (transcription, traduction, synthèse vocale)
  router.use('/', apiRoutes(dependencies));

  // Système de paiements (Stripe, PayPal, WeChat)
  router.use('/', paymentsRoutes(dependencies));

  // Upload de fichiers et avatars
  router.use('/', uploadRoutes(dependencies));

  // Système d'amis
  router.use('/friends', friendsRoutes(dependencies));

  // Routes administrateur
  router.use('/admin', adminRoutes(dependencies));

  return router;
}

export default setupRoutes;
