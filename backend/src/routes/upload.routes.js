/**
 * @fileoverview Routes d'upload de fichiers
 * @module routes/upload
 *
 * Ce module gère :
 * - Upload de fichiers pour le chat
 * - Upload d'avatars utilisateurs
 */

import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { authManager, authMiddleware } from '../auth-sqlite.js';
import { uploadLimiter } from '../middleware/ratelimit.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration multer pour l'upload de fichiers (chat)
const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, join(dirname(dirname(__dirname)), 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const ext = file.originalname.split('.').pop();
    cb(null, `${uniqueSuffix}.${ext}`);
  }
});

const fileUpload = multer({
  storage: fileStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  fileFilter: (req, file, cb) => {
    // Types de fichiers autorisés
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|mp3|mp4|webm|ogg/;
    const extname = allowedTypes.test(file.originalname.toLowerCase().split('.').pop());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé'));
    }
  }
});

// Configuration multer pour les avatars (images uniquement, 5MB max)
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, join(dirname(dirname(__dirname)), 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `avatar-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const ext = file.originalname.split('.').pop();
    cb(null, `${uniqueSuffix}.${ext}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    // Seulement les images
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(file.originalname.toLowerCase().split('.').pop());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé. Utilisez JPG, PNG, GIF ou WebP.'));
    }
  }
});

/**
 * Configure les routes d'upload
 * @param {Object} dependencies - Dépendances injectées
 * @returns {express.Router} Router Express configuré
 */
export default function uploadRoutes(dependencies = {}) {
  const router = express.Router();

  /**
   * POST /api/upload-file
   * Upload de fichier pour le chat
   * Rate limited: 20 uploads/5min par utilisateur
   */
  router.post('/upload-file', authMiddleware, uploadLimiter, fileUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier fourni' });
      }

      const fileUrl = `/uploads/${req.file.filename}`;
      const fileInfo = {
        url: fileUrl,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size
      };

      logger.info('File uploaded successfully', {
        user: req.user.email,
        fileName: req.file.originalname,
        size: req.file.size
      });

      res.json(fileInfo);
    } catch (error) {
      logger.error('Error uploading file', error);
      res.status(500).json({ error: 'Erreur lors de l\'upload du fichier' });
    }
  });

  /**
   * POST /api/upload-avatar
   * Upload d'avatar utilisateur
   * Rate limited: 20 uploads/5min par utilisateur
   */
  router.post('/upload-avatar', authMiddleware, uploadLimiter, avatarUpload.single('avatar'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Aucune image fournie' });
      }

      const avatarUrl = `/uploads/${req.file.filename}`;
      const userEmail = req.user.email;
      const user = authManager.users[userEmail];

      if (!user) {
        return res.status(404).json({ error: 'Utilisateur introuvable' });
      }

      // Sauvegarder l'URL de l'avatar dans le profil utilisateur
      user.avatar = avatarUrl;
      // Note: saveUsers() est un no-op dans la version SQLite (auto-persisted)

      logger.info('Avatar uploaded successfully', {
        user: userEmail,
        avatarUrl
      });

      res.json({
        success: true,
        avatarUrl,
        message: 'Avatar mis à jour avec succès'
      });
    } catch (error) {
      logger.error('Error uploading avatar', error);
      res.status(500).json({ error: 'Erreur lors de l\'upload de l\'avatar' });
    }
  });

  return router;
}
