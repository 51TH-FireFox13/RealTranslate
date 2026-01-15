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

// Rotation des logs (fonction utilitaire)
function rotateLogs() {
  const files = fs.readdirSync(LOG_DIR);
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  files.forEach(file => {
    if (file.endsWith('.log')) {
      const filePath = path.join(LOG_DIR, file);
      const stats = fs.statSync(filePath);
      const sizeInMB = stats.size / (1024 * 1024);

      // Rotation si le fichier dépasse 10MB
      if (sizeInMB > 10) {
        const newName = file.replace('.log', `_${timestamp}.log`);
        fs.renameSync(filePath, path.join(LOG_DIR, newName));
        logger.info(`Log rotated: ${file} -> ${newName}`);
      }
    }
  });
}

// Nettoyer les vieux logs (garder 30 jours)
function cleanOldLogs(days = 30) {
  const files = fs.readdirSync(LOG_DIR);
  const now = Date.now();
  const maxAge = days * 24 * 60 * 60 * 1000;

  files.forEach(file => {
    const filePath = path.join(LOG_DIR, file);
    const stats = fs.statSync(filePath);
    const age = now - stats.mtime.getTime();

    if (age > maxAge) {
      fs.unlinkSync(filePath);
      console.log(`🗑️  Log supprimé: ${file}`);
    }
  });
}

// Instance du logger
const logger = new Logger();

// Rotation des logs au démarrage et toutes les heures
rotateLogs();
setInterval(rotateLogs, 60 * 60 * 1000);

// Nettoyage des vieux logs quotidiennement
setInterval(() => cleanOldLogs(30), 24 * 60 * 60 * 1000);

export { logger, accessLoggerMiddleware, LOG_TYPES };
