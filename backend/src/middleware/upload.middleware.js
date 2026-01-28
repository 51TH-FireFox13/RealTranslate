/**
 * Middlewares de gestion d'upload de fichiers
 * Configure Multer pour différents types d'uploads
 */

import multer from 'multer';
import crypto from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Répertoire d'uploads
const UPLOADS_DIR = join(__dirname, '../../uploads');

// Créer le répertoire s'il n'existe pas
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
  logger.info('Created uploads directory', { path: UPLOADS_DIR });
}

/**
 * Configuration des limites d'upload
 */
export const UPLOAD_LIMITS = {
  // Taille maximale par fichier
  maxFileSize: 25 * 1024 * 1024, // 25MB

  // Nombre maximum de fichiers par requête
  maxFiles: 10,

  // Taille maximale du corps de la requête
  maxFieldsSize: 30 * 1024 * 1024, // 30MB
};

/**
 * Types de fichiers autorisés (par catégorie)
 */
export const ALLOWED_FILE_TYPES = {
  // Images
  images: {
    extensions: /jpeg|jpg|png|gif|webp|svg/i,
    mimetypes: /image\/(jpeg|jpg|png|gif|webp|svg\+xml)/i
  },

  // Documents
  documents: {
    extensions: /pdf|doc|docx|txt|md|rtf/i,
    mimetypes: /application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)|text\/(plain|markdown)/i
  },

  // Audio
  audio: {
    extensions: /mp3|wav|ogg|m4a|webm|mpeg/i,
    mimetypes: /audio\/(mp3|wav|ogg|m4a|webm|mpeg)/i
  },

  // Vidéo
  video: {
    extensions: /mp4|webm|ogg|mov|avi/i,
    mimetypes: /video\/(mp4|webm|ogg|quicktime|x-msvideo)/i
  },

  // Tous les fichiers supportés
  all: {
    extensions: /jpeg|jpg|png|gif|webp|pdf|doc|docx|txt|md|mp3|wav|ogg|m4a|mp4|webm|mov/i,
    mimetypes: /image\/|audio\/|video\/|application\/(pdf|msword)|text\//i
  }
};

/**
 * Filtre de fichiers par type
 * @param {string} category - Catégorie de fichiers autorisés
 * @returns {Function} Filtre Multer
 */
function createFileFilter(category = 'all') {
  const allowedTypes = ALLOWED_FILE_TYPES[category] || ALLOWED_FILE_TYPES.all;

  return (req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    const extMatch = allowedTypes.extensions.test(ext);
    const mimeMatch = allowedTypes.mimetypes.test(file.mimetype);

    if (extMatch && mimeMatch) {
      cb(null, true);
    } else {
      logger.warn('File type not allowed', {
        filename: file.originalname,
        mimetype: file.mimetype,
        category
      });
      cb(new Error(`File type not allowed. Allowed: ${category}`));
    }
  };
}

/**
 * Génère un nom de fichier unique
 * @param {string} originalname - Nom original du fichier
 * @returns {string} Nom de fichier unique
 */
function generateUniqueFilename(originalname) {
  const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const ext = originalname.split('.').pop();
  return `${uniqueSuffix}.${ext}`;
}

/**
 * Storage pour les fichiers sur disque
 */
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const filename = generateUniqueFilename(file.originalname);
    cb(null, filename);
  }
});

/**
 * Middleware d'upload en mémoire (pour traitement immédiat)
 * Utilisé pour audio/vidéo qui sont envoyés directement à OpenAI
 *
 * Usage:
 *   app.post('/api/transcribe', uploadMemory.single('audio'), (req, res) => { ... })
 */
export const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: UPLOAD_LIMITS.maxFileSize
  },
  fileFilter: createFileFilter('audio')
});

/**
 * Middleware d'upload sur disque (pour stockage permanent)
 * Utilisé pour fichiers de chat, avatars, etc.
 *
 * Usage:
 *   app.post('/api/upload', uploadDisk.single('file'), (req, res) => { ... })
 */
export const uploadDisk = multer({
  storage: diskStorage,
  limits: {
    fileSize: UPLOAD_LIMITS.maxFileSize,
    files: UPLOAD_LIMITS.maxFiles
  },
  fileFilter: createFileFilter('all')
});

/**
 * Middleware d'upload pour images uniquement
 *
 * Usage:
 *   app.post('/api/avatar', uploadImage.single('avatar'), (req, res) => { ... })
 */
export const uploadImage = multer({
  storage: diskStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max pour images
  },
  fileFilter: createFileFilter('images')
});

/**
 * Middleware d'upload pour audio uniquement
 *
 * Usage:
 *   app.post('/api/audio', uploadAudio.single('audio'), (req, res) => { ... })
 */
export const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: UPLOAD_LIMITS.maxFileSize
  },
  fileFilter: createFileFilter('audio')
});

/**
 * Middleware d'upload pour documents uniquement
 *
 * Usage:
 *   app.post('/api/documents', uploadDocument.single('doc'), (req, res) => { ... })
 */
export const uploadDocument = multer({
  storage: diskStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max pour documents
  },
  fileFilter: createFileFilter('documents')
});

/**
 * Middleware de gestion d'erreurs d'upload
 * À utiliser après les routes d'upload
 *
 * Usage:
 *   app.post('/api/upload', uploadDisk.single('file'), handleUploadError, (req, res) => { ... })
 */
export function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    // Erreur Multer (taille, nombre de fichiers, etc.)
    logger.error('Multer error', {
      code: err.code,
      field: err.field,
      message: err.message
    });

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'File too large',
        maxSize: UPLOAD_LIMITS.maxFileSize,
        message: `Maximum file size is ${UPLOAD_LIMITS.maxFileSize / 1024 / 1024}MB`
      });
    }

    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Too many files',
        maxFiles: UPLOAD_LIMITS.maxFiles
      });
    }

    return res.status(400).json({
      error: 'Upload error',
      code: err.code,
      message: err.message
    });
  }

  if (err) {
    // Autre erreur (type de fichier, etc.)
    logger.error('Upload error', { error: err.message });
    return res.status(400).json({
      error: 'Invalid file',
      message: err.message
    });
  }

  next();
}

/**
 * Middleware de validation post-upload
 * Vérifie qu'un fichier a bien été uploadé
 *
 * Usage:
 *   app.post('/api/upload', uploadDisk.single('file'), validateUpload, (req, res) => { ... })
 */
export function validateUpload(req, res, next) {
  if (!req.file && !req.files) {
    return res.status(400).json({
      error: 'No file uploaded',
      message: 'Please upload a file'
    });
  }

  next();
}

/**
 * Obtient l'URL publique d'un fichier uploadé
 * @param {string} filename - Nom du fichier
 * @returns {string} URL publique
 */
export function getFileUrl(filename) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  return `${baseUrl}/uploads/${filename}`;
}

/**
 * Obtient le chemin complet d'un fichier uploadé
 * @param {string} filename - Nom du fichier
 * @returns {string} Chemin complet
 */
export function getFilePath(filename) {
  return join(UPLOADS_DIR, filename);
}

export default {
  uploadMemory,
  uploadDisk,
  uploadImage,
  uploadAudio,
  uploadDocument,
  handleUploadError,
  validateUpload,
  getFileUrl,
  getFilePath,
  UPLOAD_LIMITS,
  ALLOWED_FILE_TYPES,
  UPLOADS_DIR
};
