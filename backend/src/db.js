/**
 * Gestionnaire de pool de connexions SQLite
 * Fournit une interface centralisée pour accéder aux bases de données
 * avec gestion des connexions, transactions et performance
 */

import Database from 'better-sqlite3';
import { logger } from '../logger.js';
import {
  getDatabaseConfig,
  validateDatabasePaths,
  DB_PRAGMAS,
  POOL_CONFIG,
  DB_LIMITS,
  isTestEnvironment
} from './config/database.js';

/**
 * Pool de connexions SQLite
 * Gère plusieurs connexions pour améliorer les performances
 */
class DatabasePool {
  constructor(dbName = 'main') {
    this.dbName = dbName;
    this.config = getDatabaseConfig(dbName);
    this.connections = [];
    this.availableConnections = [];
    this.busyConnections = new Set();
    this.isInitialized = false;
  }

  /**
   * Initialise le pool de connexions
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('Database pool already initialized');
      return;
    }

    // Valider les chemins
    const validation = validateDatabasePaths();
    if (!validation.valid) {
      const error = new Error(`Database path validation failed: ${validation.errors.join(', ')}`);
      logger.error('Database validation error', { errors: validation.errors });
      throw error;
    }

    // Créer les connexions minimales
    for (let i = 0; i < POOL_CONFIG.min; i++) {
      const connection = this.createConnection();
      this.connections.push(connection);
      this.availableConnections.push(connection);
    }

    this.isInitialized = true;
    logger.info('Database pool initialized', {
      dbName: this.dbName,
      path: this.config.path,
      minConnections: POOL_CONFIG.min,
      maxConnections: POOL_CONFIG.max
    });
  }

  /**
   * Crée une nouvelle connexion SQLite
   * @returns {Database} Instance de connexion
   */
  createConnection() {
    try {
      const db = new Database(this.config.path, this.config.options);

      // Appliquer les pragmas
      Object.entries(DB_PRAGMAS).forEach(([key, value]) => {
        db.pragma(`${key} = ${value}`);
      });

      logger.info('New database connection created', {
        path: this.config.path,
        pragmas: Object.keys(DB_PRAGMAS)
      });

      return db;
    } catch (error) {
      logger.error('Error creating database connection', {
        path: this.config.path,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Acquiert une connexion du pool
   * @returns {Promise<Database>} Connexion disponible
   */
  async acquire() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startTime = Date.now();

    // Attendre qu'une connexion soit disponible
    while (this.availableConnections.length === 0) {
      // Créer une nouvelle connexion si on n'a pas atteint le maximum
      if (this.connections.length < POOL_CONFIG.max) {
        const connection = this.createConnection();
        this.connections.push(connection);
        this.availableConnections.push(connection);
        break;
      }

      // Timeout si on attend trop longtemps
      if (Date.now() - startTime > POOL_CONFIG.acquireTimeout) {
        throw new Error('Database pool acquire timeout');
      }

      // Attendre un peu avant de réessayer
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Récupérer une connexion disponible
    const connection = this.availableConnections.pop();
    this.busyConnections.add(connection);

    // Connection acquired (too verbose for info level)
    // logger.info('Connection acquired from pool', { ... });

    return connection;
  }

  /**
   * Libère une connexion vers le pool
   * @param {Database} connection - Connexion à libérer
   */
  release(connection) {
    if (!this.busyConnections.has(connection)) {
      logger.warn('Attempting to release connection not in busy set');
      return;
    }

    this.busyConnections.delete(connection);
    this.availableConnections.push(connection);

    // Connection released (too verbose for info level)
    // logger.info('Connection released to pool', { ... });
  }

  /**
   * Exécute une fonction avec une connexion du pool
   * @param {Function} fn - Fonction à exécuter
   * @returns {Promise<*>} Résultat de la fonction
   */
  async withConnection(fn) {
    const connection = await this.acquire();
    try {
      return await fn(connection);
    } finally {
      this.release(connection);
    }
  }

  /**
   * Ferme toutes les connexions du pool
   */
  async close() {
    logger.info('Closing database pool', {
      totalConnections: this.connections.length
    });

    for (const connection of this.connections) {
      try {
        connection.close();
      } catch (error) {
        logger.error('Error closing connection', { error: error.message });
      }
    }

    this.connections = [];
    this.availableConnections = [];
    this.busyConnections.clear();
    this.isInitialized = false;

    logger.info('Database pool closed');
  }

  /**
   * Obtient les statistiques du pool
   */
  getStats() {
    return {
      total: this.connections.length,
      available: this.availableConnections.length,
      busy: this.busyConnections.size,
      maxConnections: POOL_CONFIG.max,
      minConnections: POOL_CONFIG.min
    };
  }
}

/**
 * Instance globale du pool principal
 */
let mainPool = null;

/**
 * Initialise le pool de connexions principal
 * @param {string} dbName - Nom de la base ('main' ou 'test')
 */
export async function initializeDatabase(dbName = 'main') {
  if (mainPool) {
    logger.warn('Database already initialized');
    return mainPool;
  }

  mainPool = new DatabasePool(dbName);
  await mainPool.initialize();

  return mainPool;
}

/**
 * Obtient le pool principal
 * @returns {DatabasePool} Pool principal
 */
export function getPool() {
  if (!mainPool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return mainPool;
}

/**
 * Obtient une connexion du pool
 * @returns {Promise<Database>} Connexion disponible
 */
export async function getConnection() {
  const pool = getPool();
  return await pool.acquire();
}

/**
 * Libère une connexion vers le pool
 * @param {Database} connection - Connexion à libérer
 */
export function releaseConnection(connection) {
  const pool = getPool();
  pool.release(connection);
}

/**
 * Exécute une fonction avec une connexion du pool
 * @param {Function} fn - Fonction à exécuter
 * @returns {Promise<*>} Résultat de la fonction
 */
export async function withConnection(fn) {
  const pool = getPool();
  return await pool.withConnection(fn);
}

/**
 * Exécute une transaction SQLite avec retry en cas d'erreur SQLITE_BUSY
 * Cette version utilise BEGIN/COMMIT/ROLLBACK pour supporter les fonctions async
 * @param {Function} fn - Fonction (peut être async) à exécuter dans la transaction
 * @param {number} retries - Nombre de tentatives restantes
 * @returns {Promise<*>} Résultat de la transaction
 */
export async function transaction(fn, retries = DB_LIMITS.maxRetries) {
  return await withConnection(async (db) => {
    try {
      // Démarrer la transaction manuellement
      db.exec('BEGIN TRANSACTION');

      try {
        // Exécuter la fonction (peut être async)
        const result = await fn(db);

        // Committer si succès
        db.exec('COMMIT');

        return result;
      } catch (error) {
        // Rollback en cas d'erreur
        db.exec('ROLLBACK');
        throw error;
      }
    } catch (error) {
      // Retry en cas d'erreur SQLITE_BUSY
      if (error.code === 'SQLITE_BUSY' && retries > 0) {
        logger.warn('SQLITE_BUSY error, retrying...', {
          retriesLeft: retries - 1,
          delay: DB_LIMITS.retryDelay
        });
        await new Promise(resolve => setTimeout(resolve, DB_LIMITS.retryDelay));
        return await transaction(fn, retries - 1);
      }
      throw error;
    }
  });
}

/**
 * Exécute une requête simple (SELECT)
 * @param {string} sql - Requête SQL
 * @param {Array} params - Paramètres de la requête
 * @returns {Promise<Array>} Résultats
 */
export async function query(sql, params = []) {
  return await withConnection(async (db) => {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  });
}

/**
 * Exécute une requête et retourne un seul résultat
 * @param {string} sql - Requête SQL
 * @param {Array} params - Paramètres de la requête
 * @returns {Promise<object|undefined>} Premier résultat
 */
export async function queryOne(sql, params = []) {
  return await withConnection(async (db) => {
    const stmt = db.prepare(sql);
    return stmt.get(...params);
  });
}

/**
 * Exécute une requête de modification (INSERT, UPDATE, DELETE)
 * @param {string} sql - Requête SQL
 * @param {Array} params - Paramètres de la requête
 * @returns {Promise<object>} Informations sur l'exécution
 */
export async function execute(sql, params = []) {
  return await withConnection(async (db) => {
    const stmt = db.prepare(sql);
    return stmt.run(...params);
  });
}

/**
 * Exécute plusieurs statements SQL
 * @param {string} sql - Multiples statements SQL
 * @returns {Promise<void>}
 */
export async function exec(sql) {
  return await withConnection(async (db) => {
    return db.exec(sql);
  });
}

/**
 * Obtient les statistiques du pool
 * @returns {object} Statistiques
 */
export function getPoolStats() {
  const pool = getPool();
  return pool.getStats();
}

/**
 * Ferme toutes les connexions
 */
export async function closeDatabase() {
  if (mainPool) {
    await mainPool.close();
    mainPool = null;
  }
}

/**
 * Vérifie la santé de la base de données
 * @returns {Promise<boolean>} true si la DB est opérationnelle
 */
export async function healthCheck() {
  try {
    const result = await queryOne('SELECT 1 as health');
    return result && result.health === 1;
  } catch (error) {
    logger.error('Database health check failed', { error: error.message });
    return false;
  }
}

/**
 * Obtient la taille de la base de données
 * @returns {Promise<number>} Taille en octets
 */
export async function getDatabaseSize() {
  return await withConnection(async (db) => {
    const result = db.pragma('page_count', { simple: true });
    const pageSize = db.pragma('page_size', { simple: true });
    return result * pageSize;
  });
}

/**
 * Optimise la base de données (VACUUM)
 * ATTENTION : Cette opération peut être longue
 */
export async function optimize() {
  logger.info('Starting database optimization (VACUUM)');
  const startTime = Date.now();

  await exec('VACUUM');

  const duration = Date.now() - startTime;
  logger.info('Database optimization completed', { duration });
}

/**
 * Analyse les statistiques de la base de données
 */
export async function analyze() {
  logger.info('Analyzing database statistics');
  await exec('ANALYZE');
  logger.info('Database analysis completed');
}

/**
 * Obtient les informations sur le WAL (Write-Ahead Log)
 * @returns {Promise<object>} Informations WAL
 */
export async function getWALInfo() {
  return await withConnection(async (db) => {
    const checkpoint = db.pragma('wal_checkpoint(PASSIVE)', { simple: true });
    const walSize = db.pragma('page_count', { simple: true });

    return {
      checkpoint,
      walSize
    };
  });
}

/**
 * Effectue un checkpoint WAL
 * Force l'écriture des données du WAL vers la base principale
 */
export async function checkpoint() {
  logger.info('Performing WAL checkpoint');
  return await withConnection(async (db) => {
    return db.pragma('wal_checkpoint(RESTART)');
  });
}

// Export par défaut
export default {
  DatabasePool,
  initializeDatabase,
  getPool,
  getConnection,
  releaseConnection,
  withConnection,
  transaction,
  query,
  queryOne,
  execute,
  exec,
  getPoolStats,
  closeDatabase,
  healthCheck,
  getDatabaseSize,
  optimize,
  analyze,
  getWALInfo,
  checkpoint
};
