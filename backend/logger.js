import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Créer le répertoire de logs s'il n'existe pas
const LOG_DIR = path.join(__dirname, '../logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Types de logs
const LOG_TYPES = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  ACCESS: 'ACCESS',
  AUTH: 'AUTH',
  API: 'API'
};

// Fonction pour formater la date
function getTimestamp() {
  return new Date().toISOString();
}

// Fonction pour écrire dans un fichier de log
function writeToFile(filename, message) {
  const logFile = path.join(LOG_DIR, filename);
  const logMessage = `[${getTimestamp()}] ${message}\n`;

  try {
    fs.appendFileSync(logFile, logMessage);
  } catch (error) {
    console.error('Erreur écriture log:', error);
  }
}

// Fonction pour formater les logs
function formatLog(type, message, metadata = {}) {
  const meta = Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : '';
  return `[${type}] ${message} ${meta}`.trim();
}

// Logger principal
class Logger {
  // Log général
  info(message, metadata = {}) {
    const log = formatLog(LOG_TYPES.INFO, message, metadata);
    console.log(`ℹ️  ${log}`);
    writeToFile('app.log', log);
  }

  // Avertissements
  warn(message, metadata = {}) {
    const log = formatLog(LOG_TYPES.WARN, message, metadata);
    console.warn(`⚠️  ${log}`);
    writeToFile('app.log', log);
  }

  // Erreurs
  error(message, error = null, metadata = {}) {
    const errorDetails = error ? {
      message: error.message,
      stack: error.stack,
      ...metadata
    } : metadata;

    const log = formatLog(LOG_TYPES.ERROR, message, errorDetails);
    console.error(`❌ ${log}`);
    writeToFile('error.log', log);
    writeToFile('app.log', log);
  }

  // Logs d'accès (requêtes HTTP)
  access(req, res, duration) {
    const log = formatLog(LOG_TYPES.ACCESS, 'HTTP Request', {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      status: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id || 'anonymous'
    });

    writeToFile('access.log', log);
  }

  // Logs d'authentification
  auth(action, userId, success, metadata = {}) {
    const log = formatLog(LOG_TYPES.AUTH, action, {
      userId,
      success,
      ...metadata
    });

    console.log(`🔐 ${log}`);
    writeToFile('auth.log', log);
    writeToFile('app.log', log);
  }

  // Logs d'appels API externes
  api(service, action, success, metadata = {}) {
    const log = formatLog(LOG_TYPES.API, `${service} - ${action}`, {
      success,
      ...metadata
    });

    writeToFile('api.log', log);
  }
}

// Middleware Express pour logger les requêtes
function accessLoggerMiddleware(req, res, next) {
  const startTime = Date.now();

  // Logger après que la réponse soit envoyée
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.access(req, res, duration);
  });

  next();
}

// Configuration de la rotation des logs
const LOG_CONFIG = {
  maxSizeMB: 5,          // Rotation si le fichier dépasse 5MB
  maxAgeDays: 14,        // Garder les logs pendant 14 jours
  maxFiles: 50,          // Garder max 50 fichiers archivés
  rotateOnStartup: true  // Vérifier la rotation au démarrage
};

// Rotation des logs (fonction utilitaire)
function rotateLogs() {
  try {
    const files = fs.readdirSync(LOG_DIR);
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');

    files.forEach(file => {
      // Ne rotate que les fichiers .log principaux (pas les archives)
      if (file.endsWith('.log') && !file.includes('_20')) {
        const filePath = path.join(LOG_DIR, file);
        const stats = fs.statSync(filePath);
        const sizeInMB = stats.size / (1024 * 1024);

        // Rotation si le fichier dépasse la taille max
        if (sizeInMB > LOG_CONFIG.maxSizeMB) {
          const newName = file.replace('.log', `_${timestamp}_${timeStr}.log`);
          fs.renameSync(filePath, path.join(LOG_DIR, newName));
          console.log(`📁 Log rotated: ${file} -> ${newName} (${sizeInMB.toFixed(2)}MB)`);
        }
      }
    });
  } catch (error) {
    console.error('Erreur rotation logs:', error.message);
  }
}

// Nettoyer les vieux logs
function cleanOldLogs() {
  try {
    const files = fs.readdirSync(LOG_DIR);
    const now = Date.now();
    const maxAge = LOG_CONFIG.maxAgeDays * 24 * 60 * 60 * 1000;

    // Trier les fichiers archivés par date (les plus récents d'abord)
    const archivedFiles = files
      .filter(f => f.includes('_20') && f.endsWith('.log'))
      .map(f => ({
        name: f,
        path: path.join(LOG_DIR, f),
        mtime: fs.statSync(path.join(LOG_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.mtime - a.mtime);

    let deletedCount = 0;

    // Supprimer les fichiers trop vieux ou en excès
    archivedFiles.forEach((file, index) => {
      const age = now - file.mtime;
      const isTooOld = age > maxAge;
      const isExcess = index >= LOG_CONFIG.maxFiles;

      if (isTooOld || isExcess) {
        fs.unlinkSync(file.path);
        deletedCount++;
      }
    });

    if (deletedCount > 0) {
      console.log(`🗑️  ${deletedCount} vieux log(s) supprimé(s)`);
    }
  } catch (error) {
    console.error('Erreur nettoyage logs:', error.message);
  }
}

// Instance du logger
const logger = new Logger();

// Rotation des logs au démarrage et toutes les heures
if (LOG_CONFIG.rotateOnStartup) {
  rotateLogs();
  cleanOldLogs();
}
setInterval(rotateLogs, 60 * 60 * 1000); // Toutes les heures

// Nettoyage des vieux logs toutes les 6 heures
setInterval(cleanOldLogs, 6 * 60 * 60 * 1000);

export { logger, accessLoggerMiddleware, LOG_TYPES };
