/**
 * Middlewares de gestion d'erreurs centralisée
 * Capture et formate toutes les erreurs de l'application
 */

import { logger } from '../../logger.js';

/**
 * Classes d'erreurs personnalisées
 */

/**
 * Erreur HTTP de base
 */
export class HttpError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Erreur 400 - Bad Request
 */
export class BadRequestError extends HttpError {
  constructor(message = 'Bad Request', details = null) {
    super(400, message, details);
    this.name = 'BadRequestError';
  }
}

/**
 * Erreur 401 - Unauthorized
 */
export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized', details = null) {
    super(401, message, details);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Erreur 403 - Forbidden
 */
export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden', details = null) {
    super(403, message, details);
    this.name = 'ForbiddenError';
  }
}

/**
 * Erreur 404 - Not Found
 */
export class NotFoundError extends HttpError {
  constructor(message = 'Not Found', details = null) {
    super(404, message, details);
    this.name = 'NotFoundError';
  }
}

/**
 * Erreur 409 - Conflict
 */
export class ConflictError extends HttpError {
  constructor(message = 'Conflict', details = null) {
    super(409, message, details);
    this.name = 'ConflictError';
  }
}

/**
 * Erreur 429 - Too Many Requests
 */
export class TooManyRequestsError extends HttpError {
  constructor(message = 'Too Many Requests', retryAfter = null) {
    super(429, message, { retryAfter });
    this.name = 'TooManyRequestsError';
  }
}

/**
 * Erreur 500 - Internal Server Error
 */
export class InternalServerError extends HttpError {
  constructor(message = 'Internal Server Error', details = null) {
    super(500, message, details);
    this.name = 'InternalServerError';
  }
}

/**
 * Middleware de gestion d'erreurs global
 * Capture toutes les erreurs et les formate en JSON
 *
 * IMPORTANT: Doit être le dernier middleware ajouté à l'application
 *
 * Usage:
 *   app.use(errorHandler);
 */
export function errorHandler(err, req, res, next) {
  // Log de l'erreur
  const errorLog = {
    name: err.name,
    message: err.message,
    statusCode: err.statusCode || 500,
    method: req.method,
    path: req.path,
    ip: req.ip,
    user: req.user?.email
  };

  // Inclure la stack trace en développement
  if (process.env.NODE_ENV === 'development') {
    errorLog.stack = err.stack;
  }

  // Logger selon la sévérité
  if (err.statusCode >= 500 || !err.statusCode) {
    logger.error('Server error', errorLog);
  } else if (err.statusCode >= 400) {
    logger.warn('Client error', errorLog);
  } else {
    logger.info('Request error', errorLog);
  }

  // Préparer la réponse
  const response = {
    error: err.message || 'Internal Server Error',
    statusCode: err.statusCode || 500
  };

  // Inclure les détails si disponibles
  if (err.details) {
    response.details = err.details;
  }

  // Inclure la stack trace en développement
  if (process.env.NODE_ENV === 'development' && err.stack) {
    response.stack = err.stack.split('\n');
  }

  // Envoyer la réponse
  res.status(err.statusCode || 500).json(response);
}

/**
 * Middleware de gestion des routes non trouvées (404)
 * À placer avant le errorHandler
 *
 * Usage:
 *   app.use(notFoundHandler);
 *   app.use(errorHandler);
 */
export function notFoundHandler(req, res, next) {
  const error = new NotFoundError(`Route not found: ${req.method} ${req.path}`);
  next(error);
}

/**
 * Wrapper async pour les route handlers
 * Capture automatiquement les erreurs des fonctions async
 *
 * Usage:
 *   app.get('/api/data', asyncHandler(async (req, res) => {
 *     const data = await fetchData();
 *     res.json(data);
 *   }));
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Middleware de validation des données de requête
 * Vérifie qu'un objet de données est valide selon un schéma
 *
 * @param {Object} schema - Schéma de validation { field: { required: boolean, type: string } }
 * @param {string} source - Source des données ('body', 'params', 'query')
 * @returns {Function} Middleware
 *
 * Usage:
 *   app.post('/api/users', validate({
 *     email: { required: true, type: 'string' },
 *     age: { required: false, type: 'number' }
 *   }, 'body'), (req, res) => { ... })
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source];
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];

      // Vérifier si requis
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`Field '${field}' is required`);
        continue;
      }

      // Skip validation si non requis et pas de valeur
      if (!rules.required && (value === undefined || value === null)) {
        continue;
      }

      // Vérifier le type
      if (rules.type) {
        const actualType = typeof value;
        if (actualType !== rules.type) {
          errors.push(`Field '${field}' must be of type ${rules.type}, got ${actualType}`);
        }
      }

      // Vérifier la longueur min/max (pour strings)
      if (typeof value === 'string') {
        if (rules.minLength && value.length < rules.minLength) {
          errors.push(`Field '${field}' must be at least ${rules.minLength} characters`);
        }
        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(`Field '${field}' must be at most ${rules.maxLength} characters`);
        }
      }

      // Vérifier min/max (pour numbers)
      if (typeof value === 'number') {
        if (rules.min !== undefined && value < rules.min) {
          errors.push(`Field '${field}' must be at least ${rules.min}`);
        }
        if (rules.max !== undefined && value > rules.max) {
          errors.push(`Field '${field}' must be at most ${rules.max}`);
        }
      }

      // Pattern (regex)
      if (rules.pattern && typeof value === 'string') {
        if (!rules.pattern.test(value)) {
          errors.push(`Field '${field}' does not match required pattern`);
        }
      }

      // Validation personnalisée
      if (rules.custom) {
        const customError = rules.custom(value, data);
        if (customError) {
          errors.push(customError);
        }
      }
    }

    if (errors.length > 0) {
      return next(new BadRequestError('Validation failed', { errors }));
    }

    next();
  };
}

/**
 * Middleware de sanitization des données
 * Supprime les champs non autorisés d'un objet
 *
 * @param {string[]} allowedFields - Champs autorisés
 * @param {string} source - Source des données ('body', 'params', 'query')
 * @returns {Function} Middleware
 *
 * Usage:
 *   app.post('/api/users', sanitize(['email', 'name'], 'body'), (req, res) => { ... })
 */
export function sanitize(allowedFields, source = 'body') {
  return (req, res, next) => {
    const data = req[source];

    if (!data || typeof data !== 'object') {
      return next();
    }

    // Supprimer les champs non autorisés
    const sanitized = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        sanitized[field] = data[field];
      }
    }

    req[source] = sanitized;
    next();
  };
}

/**
 * Middleware de timeout pour les requêtes
 * Annule les requêtes qui prennent trop de temps
 *
 * @param {number} ms - Timeout en millisecondes
 * @returns {Function} Middleware
 *
 * Usage:
 *   app.post('/api/slow-operation', timeout(30000), (req, res) => { ... })
 */
export function timeout(ms) {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      const error = new HttpError(408, 'Request timeout', { timeout: ms });
      next(error);
    }, ms);

    // Nettoyer le timer quand la réponse est envoyée
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));

    next();
  };
}

export default {
  // Error classes
  HttpError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError,
  InternalServerError,

  // Middlewares
  errorHandler,
  notFoundHandler,
  asyncHandler,
  validate,
  sanitize,
  timeout
};
