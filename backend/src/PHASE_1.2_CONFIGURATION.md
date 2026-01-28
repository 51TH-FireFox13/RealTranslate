# Phase 1.2 : Configuration Centralisée des Bases de Données

## 📋 Vue d'ensemble

Cette phase introduit un système de configuration centralisée pour la gestion des bases de données SQLite dans RealTranslate. L'objectif est de consolider toutes les configurations liées aux bases de données dans un seul endroit, facilitant ainsi la maintenance et les évolutions futures.

## 🎯 Objectifs

1. **Centraliser** toute la configuration des bases de données
2. **Standardiser** les paramètres de connexion et pragmas SQLite
3. **Optimiser** les performances avec un pool de connexions
4. **Faciliter** les tests avec des configurations spécifiques
5. **Améliorer** la maintenabilité du code

## 📁 Fichiers créés

### 1. `src/config/database.js`
Configuration centralisée comprenant :

- **DB_PATHS** : Chemins vers les différentes bases de données
  - `main` : Base de données principale (production/développement)
  - `test` : Base de données de test (en mémoire)
  - `backups` : Répertoire des backups

- **DB_OPTIONS** : Options de connexion SQLite (better-sqlite3)
  - `readonly` : Mode lecture seule (false par défaut)
  - `timeout` : Timeout des opérations (5s)
  - `verbose` : Logs des requêtes (en développement uniquement)

- **DB_PRAGMAS** : Paramètres d'optimisation SQLite
  - `journal_mode: WAL` : Write-Ahead Logging pour meilleures performances
  - `foreign_keys: ON` : Intégrité référentielle activée
  - `synchronous: NORMAL` : Compromis sécurité/performance
  - `cache_size: -2000` : 2MB de cache
  - `temp_store: MEMORY` : Tables temporaires en mémoire
  - `mmap_size: 30000000` : ~30MB pour memory-mapped I/O
  - `page_size: 4096` : Taille des pages (4KB)
  - `busy_timeout: 5000` : Timeout en cas de verrou (5s)

- **POOL_CONFIG** : Configuration du pool de connexions
  - `min: 1` : Nombre minimum de connexions
  - `max: 10` : Nombre maximum de connexions
  - `acquireTimeout: 30000` : Timeout pour obtenir une connexion (30s)
  - `idleTimeout: 30000` : Fermeture des connexions inactives (30s)

- **DB_LIMITS** : Limites et timeouts
  - `readTimeout: 5000` : Timeout lectures (5s)
  - `writeTimeout: 10000` : Timeout écritures (10s)
  - `maxRetries: 3` : Tentatives en cas d'erreur SQLITE_BUSY
  - `retryDelay: 100` : Délai entre tentatives (100ms)

- **BACKUP_CONFIG** : Configuration des backups
  - `enabled` : Active/désactive les backups automatiques
  - `interval` : Intervalle entre backups (24h)
  - `maxBackups: 7` : Nombre de backups conservés
  - `compress: true` : Compression des backups

### 2. `src/db.js`
Gestionnaire de pool de connexions comprenant :

#### Classe `DatabasePool`
- Gère un pool de connexions SQLite
- Crée/détruit les connexions selon la demande
- Maintient un nombre minimum de connexions ouvertes
- Limite le nombre maximum de connexions

#### Fonctions principales

**Initialisation**
```javascript
await initializeDatabase('main');  // Initialise le pool principal
```

**Gestion des connexions**
```javascript
// Obtenir une connexion
const connection = await getConnection();
// ... utiliser la connexion ...
releaseConnection(connection);

// Ou utiliser withConnection (recommandé)
await withConnection(async (db) => {
  // Utiliser db ici
  const result = db.prepare('SELECT * FROM users').all();
  return result;
});
```

**Transactions**
```javascript
await transaction(() => {
  // Code de la transaction
  // Rollback automatique en cas d'erreur
  // Commit automatique si succès
});
```

**Requêtes simplifiées**
```javascript
// SELECT multiple
const users = await query('SELECT * FROM users WHERE role = ?', ['admin']);

// SELECT single
const user = await queryOne('SELECT * FROM users WHERE email = ?', ['test@example.com']);

// INSERT/UPDATE/DELETE
await execute('INSERT INTO users (email, name) VALUES (?, ?)', ['test@example.com', 'Test']);

// Multiples statements
await exec('CREATE TABLE test (id INTEGER); INSERT INTO test VALUES (1);');
```

**Utilitaires**
```javascript
// Vérifier la santé de la DB
const isHealthy = await healthCheck();

// Obtenir la taille de la DB
const size = await getDatabaseSize();

// Optimiser (VACUUM)
await optimize();

// Analyser les statistiques
await analyze();

// Checkpoint WAL
await checkpoint();

// Stats du pool
const stats = getPoolStats();
// { total: 3, available: 2, busy: 1, maxConnections: 10, minConnections: 1 }
```

## 🔧 Variables d'environnement

Ajoutées dans `.env.template` :

```bash
# Database Configuration
DATABASE_PATH=./realtranslate.db
DB_POOL_MAX=10
DB_BACKUP_ENABLED=true
DB_BACKUP_PATH=./backups
```

## 📊 Avantages

### 1. **Performance**
- Pool de connexions : réutilisation des connexions
- Pragmas optimisés : WAL mode, cache, mmap
- Retry automatique : gestion des SQLITE_BUSY

### 2. **Maintenabilité**
- Configuration centralisée : un seul endroit à modifier
- Séparation des responsabilités : config vs logique
- Documentation intégrée

### 3. **Fiabilité**
- Validation des chemins : vérification au démarrage
- Health checks : surveillance de la santé de la DB
- Transactions sécurisées : rollback automatique

### 4. **Flexibilité**
- Support multi-environnements : dev, test, prod
- Configuration par variables d'env : personnalisation facile
- Extensible : ajout de nouvelles DBs simple

## 🧪 Tests

Pour tester la configuration :

```javascript
import { initializeDatabase, healthCheck, getPoolStats } from './src/db.js';

// Initialiser
await initializeDatabase('test');

// Vérifier la santé
const healthy = await healthCheck();
console.log('Database healthy:', healthy);

// Vérifier les stats du pool
const stats = getPoolStats();
console.log('Pool stats:', stats);
```

## 🚀 Migration depuis l'ancien système

L'ancien système (`database.js`) utilise une connexion globale unique :
```javascript
let db;
export const usersDB = {
  getAll() {
    const stmt = db.prepare('SELECT * FROM users');
    return stmt.all();
  }
};
```

Le nouveau système utilise le pool :
```javascript
import { withConnection } from './db.js';

export const usersDB = {
  async getAll() {
    return await withConnection(async (db) => {
      const stmt = db.prepare('SELECT * FROM users');
      return stmt.all();
    });
  }
};
```

**Note** : La migration complète sera effectuée dans les phases suivantes.

## 📝 Bonnes pratiques

1. **Toujours utiliser `withConnection`** : libération automatique
2. **Utiliser `transaction`** pour les opérations multi-étapes
3. **Ne pas stocker** les connexions : les obtenir/libérer à la demande
4. **Gérer les erreurs** : try/catch autour des opérations DB
5. **Monitorer les stats** : vérifier régulièrement `getPoolStats()`

## ⚠️ Points d'attention

1. **WAL Mode** : Fichiers supplémentaires créés (-wal, -shm)
2. **Pool Size** : Ajuster `DB_POOL_MAX` selon les besoins
3. **Backups** : Activer en production (`DB_BACKUP_ENABLED=true`)
4. **Memory** : Chaque connexion consomme de la mémoire

## 🔜 Prochaines étapes

**Phase 1.3** : Migration du code existant pour utiliser la nouvelle configuration
- Adapter `database.js` pour utiliser le pool
- Migrer les routes API
- Mettre à jour les tests
- Valider les performances

## 📚 Références

- [better-sqlite3 Documentation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- [SQLite Pragmas](https://www.sqlite.org/pragma.html)
- [SQLite WAL Mode](https://www.sqlite.org/wal.html)
- [Connection Pooling Patterns](https://en.wikipedia.org/wiki/Connection_pool)
