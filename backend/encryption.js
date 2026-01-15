/**
 * Module de cryptage pour l'historique des traductions
 * Utilise AES-256-GCM pour garantir la confidentialité
 */

import crypto from 'crypto';

// Constantes de cryptage
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
export const SALT_LENGTH = 64;

/**
 * Dérive une clé de cryptage depuis le mot de passe utilisateur
 * @param {string} password - Mot de passe de l'utilisateur
 * @param {Buffer} salt - Sel unique pour l'utilisateur
 * @returns {Buffer} Clé de cryptage dérivée
 */
export function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256');
}

/**
 * Génère un sel unique pour un utilisateur
 * @returns {Buffer} Sel aléatoire
 */
export function generateSalt() {
  return crypto.randomBytes(SALT_LENGTH);
}

/**
 * Crypte les données d'historique
 * @param {Object} data - Données à crypter (objet JSON)
 * @param {string} password - Mot de passe de l'utilisateur
 * @param {Buffer} salt - Sel de l'utilisateur
 * @returns {string} Données cryptées en base64
 */
export function encrypt(data, password, salt) {
  try {
    // Convertir l'objet en JSON
    const jsonData = JSON.stringify(data);

    // Dériver la clé depuis le mot de passe
    const key = deriveKey(password, salt);

    // Générer un IV aléatoire
    const iv = crypto.randomBytes(IV_LENGTH);

    // Créer le cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Crypter les données
    let encrypted = cipher.update(jsonData, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Récupérer le tag d'authentification
    const authTag = cipher.getAuthTag();

    // Combiner IV + authTag + données cryptées
    const result = Buffer.concat([
      iv,
      authTag,
      Buffer.from(encrypted, 'base64')
    ]);

    return result.toString('base64');

  } catch (error) {
    console.error('Erreur lors du cryptage:', error);
    throw new Error('Échec du cryptage des données');
  }
}

/**
 * Décrypte les données d'historique
 * @param {string} encryptedData - Données cryptées en base64
 * @param {string} password - Mot de passe de l'utilisateur
 * @param {Buffer} salt - Sel de l'utilisateur
 * @returns {Object} Données décryptées (objet JSON)
 */
export function decrypt(encryptedData, password, salt) {
  try {
    // Convertir depuis base64
    const buffer = Buffer.from(encryptedData, 'base64');

    // Extraire IV, authTag et données cryptées
    const iv = buffer.slice(0, IV_LENGTH);
    const authTag = buffer.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buffer.slice(IV_LENGTH + AUTH_TAG_LENGTH);

    // Dériver la clé depuis le mot de passe
    const key = deriveKey(password, salt);

    // Créer le decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Décrypter les données
    let decrypted = decipher.update(encrypted.toString('base64'), 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    // Parser le JSON
    return JSON.parse(decrypted);

  } catch (error) {
    console.error('Erreur lors du décryptage:', error);
    throw new Error('Échec du décryptage des données');
  }
}

/**
 * Hache un mot de passe avec bcrypt
 * (pour stocker le mot de passe de manière sécurisée)
 * @param {string} password - Mot de passe en clair
 * @returns {string} Hash du mot de passe
 */
export function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}
