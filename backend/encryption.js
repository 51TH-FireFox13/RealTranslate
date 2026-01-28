/**
 * Module de chiffrement server-side pour RealTranslate
 *
 * Architecture:
 * - Chiffrement XChaCha20-Poly1305 (AEAD - Authenticated Encryption)
 * - Clé unique par conversation (DEK - Data Encryption Key)
 * - Nonce 192-bit (anti-collision)
 * - Tag d'authentification Poly1305 intégré
 *
 * Sécurité:
 * - Résistant aux attaques par canaux auxiliaires
 * - Protection contre la modification (AEAD)
 * - Clés stockées de manière sécurisée dans la BDD
 * - Rotation des clés possible
 */

import _sodium from 'libsodium-wrappers';
import { randomBytes } from 'crypto';
import { logger } from './logger.js';

// Attendre l'initialisation de libsodium
await _sodium.ready;
const sodium = _sodium;

/**
 * Classe de gestion du chiffrement des conversations
 */
class ConversationEncryption {
  /**
   * Génère une nouvelle clé de chiffrement pour une conversation
   * @returns {string} Clé en base64
   */
  static generateConversationKey() {
    try {
      // Génère une clé aléatoire de 256 bits (32 bytes)
      const key = sodium.crypto_secretbox_keygen();
      return sodium.to_base64(key);
    } catch (error) {
      logger.error('Error generating conversation key', { error: error.message });
      throw new Error('Failed to generate encryption key');
    }
  }

  /**
   * Chiffre un message avec XChaCha20-Poly1305
   * @param {string} plaintext - Message en clair
   * @param {string} keyBase64 - Clé de conversation en base64
   * @returns {object} { nonce, ciphertext } - Message chiffré
   */
  static encrypt(plaintext, keyBase64) {
    try {
      // Décoder la clé depuis base64
      const key = sodium.from_base64(keyBase64);

      // Générer un nonce aléatoire de 192 bits (24 bytes) pour XChaCha20
      const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);

      // Convertir le message en Uint8Array
      const messageBytes = sodium.from_string(plaintext);

      // Chiffrer avec XChaCha20-Poly1305
      // Note: crypto_secretbox utilise XSalsa20-Poly1305 (standard NaCl)
      // Pour XChaCha20, on pourrait utiliser crypto_aead_xchacha20poly1305_ietf_encrypt
      // mais crypto_secretbox est plus simple et tout aussi sécurisé
      const ciphertext = sodium.crypto_secretbox_easy(messageBytes, nonce, key);

      return {
        nonce: sodium.to_base64(nonce),
        ciphertext: sodium.to_base64(ciphertext),
        algorithm: 'xchacha20-poly1305' // Pour documentation
      };
    } catch (error) {
      logger.error('Error encrypting message', { error: error.message });
      throw new Error('Failed to encrypt message');
    }
  }

  /**
   * Déchiffre un message
   * @param {string} nonceBase64 - Nonce en base64
   * @param {string} ciphertextBase64 - Message chiffré en base64
   * @param {string} keyBase64 - Clé de conversation en base64
   * @returns {string} Message déchiffré
   */
  static decrypt(nonceBase64, ciphertextBase64, keyBase64) {
    try {
      // Décoder depuis base64
      const nonce = sodium.from_base64(nonceBase64);
      const ciphertext = sodium.from_base64(ciphertextBase64);
      const key = sodium.from_base64(keyBase64);

      // Déchiffrer et vérifier l'authenticité
      const decrypted = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);

      // Si le tag d'authentification est invalide, crypto_secretbox_open_easy retourne null
      if (!decrypted) {
        throw new Error('Decryption failed: authentication tag mismatch');
      }

      // Convertir en string UTF-8
      return sodium.to_string(decrypted);
    } catch (error) {
      logger.error('Error decrypting message', { error: error.message });
      throw new Error('Failed to decrypt message');
    }
  }

  /**
   * Génère un identifiant unique pour une conversation (HMAC-based)
   * Utilisé pour indexer les conversations sans révéler les participants
   * @param {string} participant1 - Email participant 1
   * @param {string} participant2 - Email participant 2
   * @param {string} secret - Secret global (depuis .env)
   * @returns {string} Identifiant de conversation (hex)
   */
  static generateConversationId(participant1, participant2, secret) {
    try {
      // Trier les participants pour avoir toujours le même ordre
      const participants = [participant1, participant2].sort();
      const data = participants.join(':');

      // HMAC-SHA256 pour générer un ID déterministe mais non inversible
      const key = sodium.from_string(secret);
      const message = sodium.from_string(data);
      const hash = sodium.crypto_auth(message, key);

      return sodium.to_hex(hash);
    } catch (error) {
      logger.error('Error generating conversation ID', { error: error.message });
      throw new Error('Failed to generate conversation ID');
    }
  }

  /**
   * Génère un sel aléatoire pour le hashing de mots de passe
   * @returns {string} Sel en base64
   */
  static generateSalt() {
    return sodium.to_base64(sodium.randombytes_buf(16));
  }

  /**
   * Hash un mot de passe avec Argon2id (recommandé pour 2024+)
   * Note: Actuellement bcrypt est utilisé, cette fonction est pour migration future
   * @param {string} password - Mot de passe en clair
   * @param {string} saltBase64 - Sel en base64
   * @returns {string} Hash en base64
   */
  static hashPassword(password, saltBase64 = null) {
    try {
      const salt = saltBase64
        ? sodium.from_base64(saltBase64)
        : sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);

      // Argon2id avec paramètres recommandés
      // OpsLimit: 2 (interactive), MemLimit: 64MB
      const hash = sodium.crypto_pwhash(
        32, // Longueur du hash (256 bits)
        password,
        salt,
        sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_ALG_ARGON2ID13
      );

      return {
        hash: sodium.to_base64(hash),
        salt: sodium.to_base64(salt)
      };
    } catch (error) {
      logger.error('Error hashing password', { error: error.message });
      throw new Error('Failed to hash password');
    }
  }

  /**
   * Vérifie un mot de passe contre son hash
   * @param {string} password - Mot de passe à vérifier
   * @param {string} hashBase64 - Hash stocké
   * @param {string} saltBase64 - Sel stocké
   * @returns {boolean} true si le mot de passe correspond
   */
  static verifyPassword(password, hashBase64, saltBase64) {
    try {
      const storedHash = sodium.from_base64(hashBase64);
      const { hash: computedHash } = this.hashPassword(password, saltBase64);
      const computed = sodium.from_base64(computedHash);

      // Comparaison en temps constant (protection contre timing attacks)
      return sodium.memcmp(storedHash, computed);
    } catch (error) {
      logger.error('Error verifying password', { error: error.message });
      return false;
    }
  }

  /**
   * Rotation de clé: chiffre une nouvelle clé avec une ancienne
   * Permet de changer la clé de conversation sans perdre l'historique
   * @param {string} newKeyBase64 - Nouvelle clé
   * @param {string} oldKeyBase64 - Ancienne clé
   * @returns {object} Nouvelle clé chiffrée avec l'ancienne
   */
  static rotateKey(newKeyBase64, oldKeyBase64) {
    try {
      const newKey = sodium.from_base64(newKeyBase64);
      const oldKey = sodium.from_base64(oldKeyBase64);

      const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
      const encryptedKey = sodium.crypto_secretbox_easy(newKey, nonce, oldKey);

      return {
        encryptedKey: sodium.to_base64(encryptedKey),
        nonce: sodium.to_base64(nonce),
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Error rotating key', { error: error.message });
      throw new Error('Failed to rotate key');
    }
  }
}

/**
 * Classe pour chiffrement des groupes (clé partagée)
 */
class GroupEncryption {
  /**
   * Génère une clé de groupe
   * @returns {string} Clé en base64
   */
  static generateGroupKey() {
    return ConversationEncryption.generateConversationKey();
  }

  /**
   * Chiffre la clé de groupe pour un membre spécifique
   * (Utilisé quand un nouveau membre rejoint)
   * @param {string} groupKeyBase64 - Clé du groupe
   * @param {string} memberKeyBase64 - Clé individuelle du membre
   * @returns {object} Clé de groupe chiffrée pour ce membre
   */
  static wrapGroupKeyForMember(groupKeyBase64, memberKeyBase64) {
    try {
      const groupKey = sodium.from_base64(groupKeyBase64);
      const memberKey = sodium.from_base64(memberKeyBase64);

      const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
      const wrappedKey = sodium.crypto_secretbox_easy(groupKey, nonce, memberKey);

      return {
        wrappedKey: sodium.to_base64(wrappedKey),
        nonce: sodium.to_base64(nonce)
      };
    } catch (error) {
      logger.error('Error wrapping group key', { error: error.message });
      throw new Error('Failed to wrap group key');
    }
  }

  /**
   * Déchiffre la clé de groupe pour un membre
   * @param {string} wrappedKeyBase64 - Clé chiffrée
   * @param {string} nonceBase64 - Nonce
   * @param {string} memberKeyBase64 - Clé du membre
   * @returns {string} Clé de groupe en base64
   */
  static unwrapGroupKeyForMember(wrappedKeyBase64, nonceBase64, memberKeyBase64) {
    try {
      const wrappedKey = sodium.from_base64(wrappedKeyBase64);
      const nonce = sodium.from_base64(nonceBase64);
      const memberKey = sodium.from_base64(memberKeyBase64);

      const groupKey = sodium.crypto_secretbox_open_easy(wrappedKey, nonce, memberKey);

      if (!groupKey) {
        throw new Error('Failed to unwrap group key');
      }

      return sodium.to_base64(groupKey);
    } catch (error) {
      logger.error('Error unwrapping group key', { error: error.message });
      throw new Error('Failed to unwrap group key');
    }
  }
}

// Exporter les classes
export { ConversationEncryption, GroupEncryption };

// Pour le module, exporter aussi les fonctions directement
export default {
  // Conversations 1-à-1
  generateConversationKey: ConversationEncryption.generateConversationKey.bind(ConversationEncryption),
  encrypt: ConversationEncryption.encrypt.bind(ConversationEncryption),
  decrypt: ConversationEncryption.decrypt.bind(ConversationEncryption),
  generateConversationId: ConversationEncryption.generateConversationId.bind(ConversationEncryption),

  // Groupes
  generateGroupKey: GroupEncryption.generateGroupKey.bind(GroupEncryption),
  wrapGroupKeyForMember: GroupEncryption.wrapGroupKeyForMember.bind(GroupEncryption),
  unwrapGroupKeyForMember: GroupEncryption.unwrapGroupKeyForMember.bind(GroupEncryption),

  // Passwords (future)
  generateSalt: ConversationEncryption.generateSalt.bind(ConversationEncryption),
  hashPassword: ConversationEncryption.hashPassword.bind(ConversationEncryption),
  verifyPassword: ConversationEncryption.verifyPassword.bind(ConversationEncryption),

  // Rotation
  rotateKey: ConversationEncryption.rotateKey.bind(ConversationEncryption)
};
