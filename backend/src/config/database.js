/**
 * Configuration centralisée pour les bases de données SQLite
 * Gère les chemins, options et paramètres de connexion pour toutes les bases de données
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configuration des chemins de bases de données
 */
export const DB_PATHS = {
  // Base de données principale (users, groups, messages, etc.)
  main: process.env.DATABASE_PATH || join(__dirname, '../../realtranslate.db'),

  // Base de données de test (utilisée par les tests unitaires)
  test: process.env.DB_FILE || ':memory:',

  // Répertoire pour les backups
  backups: process.env.DB_BACKUP_PATH || join(__dirname, '../../backups')
};

/**
 * Options de connexion SQLite pour better-sqlite3
 * @see https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#new-databasepath-options
 */
export const DB_OPTIONS = {
  // Options de connexion
  readonly: false,
  fileMustExist: false,
  timeout: 5000, // 5 secondes
  verbose: process.env.NODE_ENV === 'development' ? console.log : null,

  // Options de performance
  nativeBinding: undefined // Auto-détection du binding natif
};

/**
 * Configuration des pragmas SQLite
 * Ces paramètres optimisent les performances et la sécurité
 */
export const DB_PRAGMAS = {
  // Write-Ahead Logging : améliore les performances en lecture/écriture
  // Permet les lectures pendant les écritures
  journal_mode: 'WAL',

  // Active l'intégrité référentielle (FOREIGN KEYS)
  foreign_keys: 'ON',

  // Synchronisation : NORMAL est un bon compromis sécurité/performance
  // FULL = plus sûr mais plus lent, OFF = plus rapide mais moins sûr
  synchronous: 'NORMAL',

  // Cache size : -2000 = 2MB de cache (négatif = taille en KB)
  cache_size: -2000,

  // Temp store : mémoire pour les tables temporaires
  temp_store: 'MEMORY',

  // Mmap size : utilise memory-mapped I/O pour améliorer les performances
  // 30000000 = ~30MB
  mmap_size: 30000000,

  // Page size : taille des pages en octets (4096 = 4KB)
  // Doit être une puissance de 2 entre 512 et 65536
  page_size: 4096,

  // Locking mode : NORMAL permet plusieurs connexions
  // EXCLUSIVE = une seule connexion (plus rapide mais moins flexible)
  locking_mode: 'NORMAL',

  // Busy timeout : temps d'attente avant d'abandonner en cas de verrou
  busy_timeout: 5000 // 5 secondes
};

/**
 * Configuration du pool de connexions
 * Pour gérer plusieurs connexions simultanées
 */
export const POOL_CONFIG = {
  // Nombre minimum de connexions maintenues ouvertes
  min: 1,

  // Nombre maximum de connexions simultanées
  max: process.env.DB_POOL_MAX || 10,

  // Temps d'attente max pour obtenir une connexion (ms)
  acquireTimeout: 30000, // 30 secondes

  // Temps avant de fermer une connexion inactive (ms)
  idleTimeout: 30000, // 30 secondes

  // Vérifier les connexions avant de les utiliser
  testOnBorrow: true
};

/**
 * Configuration des timeouts et limites
 */
export const DB_LIMITS = {
  // Timeout pour les requêtes de lecture (ms)
  readTimeout: 5000,

  // Timeout pour les requêtes d'écriture (ms)
  writeTimeout: 10000,

  // Nombre de tentatives en cas d'erreur SQLITE_BUSY
  maxRetries: 3,

  // Délai entre les tentatives (ms)
  retryDelay: 100,

  // Taille maximale d'un statement préparé en cache
  maxPreparedStatements: 100
};

/**
 * Configuration de la stratégie de backup
 */
export const BACKUP_CONFIG = {
  // Active les backups automatiques
  enabled: process.env.DB_BACKUP_ENABLED === 'true',

  // Intervalle entre les backups (ms)
  interval: 24 * 60 * 60 * 1000, // 24 heures

  // Nombre maximum de backups à conserver
  maxBackups: 7,

  // Compression des backups
  compress: true
};

/**
 * Valide et normalise les chemins de base de données
 */
export function validateDatabasePaths() {
  const errors = [];

  // Vérifier que le répertoire parent du DB principal existe
  if (DB_PATHS.main !== ':memory:') {
    const dbDir = dirname(DB_PATHS.main);
    if (!existsSync(dbDir)) {
      try {
        mkdirSync(dbDir, { recursive: true });
      } catch (error) {
        errors.push(`Cannot create database directory: ${dbDir} - ${error.message}`);
      }
    }
  }

  // Créer le répertoire de backups si nécessaire
  if (BACKUP_CONFIG.enabled && !existsSync(DB_PATHS.backups)) {
    try {
      mkdirSync(DB_PATHS.backups, { recursive: true });
    } catch (error) {
      errors.push(`Cannot create backup directory: ${DB_PATHS.backups} - ${error.message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Retourne la configuration complète pour une base de données
 * @param {string} dbName - Nom de la base ('main' ou 'test')
 * @returns {object} Configuration complète
 */
export function getDatabaseConfig(dbName = 'main') {
  const path = DB_PATHS[dbName] || DB_PATHS.main;

  return {
    path,
    options: DB_OPTIONS,
    pragmas: DB_PRAGMAS,
    pool: POOL_CONFIG,
    limits: DB_LIMITS,
    backup: BACKUP_CONFIG
  };
}

/**
 * Helpers pour les environnements
 */
export const isTestEnvironment = () => process.env.NODE_ENV === 'test';
export const isDevelopment = () => process.env.NODE_ENV === 'development';
export const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Configuration par défaut exportée
 */
export default {
  DB_PATHS,
  DB_OPTIONS,
  DB_PRAGMAS,
  POOL_CONFIG,
  DB_LIMITS,
  BACKUP_CONFIG,
  validateDatabasePaths,
  getDatabaseConfig,
  isTestEnvironment,
  isDevelopment,
  isProduction
};
