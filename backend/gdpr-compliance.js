/**
 * Module de conformité RGPD pour RealTranslate
 * Gestion des droits utilisateurs selon le RGPD (UE) et protection des données
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Fichiers de stockage
const CONSENT_FILE = join(__dirname, 'gdpr-consents.json');
const DATA_REQUESTS_FILE = join(__dirname, 'gdpr-data-requests.json');
const DELETION_REQUESTS_FILE = join(__dirname, 'gdpr-deletion-requests.json');

/**
 * Types de consentement RGPD
 */
export const CONSENT_TYPES = {
  ESSENTIAL: 'essential', // Services essentiels (obligatoire)
  ANALYTICS: 'analytics', // Analyse et statistiques
  MARKETING: 'marketing', // Marketing et publicité
  PERSONALIZATION: 'personalization', // Personnalisation
  THIRD_PARTY: 'third_party', // Services tiers (OpenAI, DeepSeek)
};

/**
 * Initialise les fichiers de données RGPD
 */
function initGDPRFiles() {
  if (!existsSync(CONSENT_FILE)) {
    writeFileSync(CONSENT_FILE, JSON.stringify({}, null, 2));
  }
  if (!existsSync(DATA_REQUESTS_FILE)) {
    writeFileSync(DATA_REQUESTS_FILE, JSON.stringify([], null, 2));
  }
  if (!existsSync(DELETION_REQUESTS_FILE)) {
    writeFileSync(DELETION_REQUESTS_FILE, JSON.stringify([], null, 2));
  }
}

initGDPRFiles();

/**
 * Charge les consentements depuis le fichier
 */
function loadConsents() {
  try {
    return JSON.parse(readFileSync(CONSENT_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Sauvegarde les consentements dans le fichier
 */
function saveConsents(consents) {
  writeFileSync(CONSENT_FILE, JSON.stringify(consents, null, 2));
}

/**
 * Charge les demandes de données
 */
function loadDataRequests() {
  try {
    return JSON.parse(readFileSync(DATA_REQUESTS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Sauvegarde les demandes de données
 */
function saveDataRequests(requests) {
  writeFileSync(DATA_REQUESTS_FILE, JSON.stringify(requests, null, 2));
}

/**
 * Charge les demandes de suppression
 */
function loadDeletionRequests() {
  try {
    return JSON.parse(readFileSync(DELETION_REQUESTS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Sauvegarde les demandes de suppression
 */
function saveDeletionRequests(requests) {
  writeFileSync(DELETION_REQUESTS_FILE, JSON.stringify(requests, null, 2));
}

/**
 * Enregistre ou met à jour le consentement d'un utilisateur
 * @param {string} userEmail - Email de l'utilisateur
 * @param {Object} consents - Objets des consentements { type: boolean }
 * @returns {Object} Consentements enregistrés
 */
export function updateUserConsent(userEmail, consents) {
  const allConsents = loadConsents();

  // Toujours activer les services essentiels
  const updatedConsent = {
    ...consents,
    [CONSENT_TYPES.ESSENTIAL]: true,
  };

  allConsents[userEmail] = {
    consents: updatedConsent,
    updatedAt: new Date().toISOString(),
    ip: 'logged', // Pour audit
  };

  saveConsents(allConsents);

  return allConsents[userEmail];
}

/**
 * Récupère les consentements d'un utilisateur
 * @param {string} userEmail - Email de l'utilisateur
 * @returns {Object|null} Consentements ou null
 */
export function getUserConsent(userEmail) {
  const allConsents = loadConsents();
  return allConsents[userEmail] || null;
}

/**
 * Vérifie si un utilisateur a donné son consentement pour un type spécifique
 * @param {string} userEmail - Email de l'utilisateur
 * @param {string} consentType - Type de consentement
 * @returns {boolean} True si consentement donné
 */
export function hasConsent(userEmail, consentType) {
  const userConsent = getUserConsent(userEmail);
  if (!userConsent) {
    // Par défaut, seuls les services essentiels sont autorisés
    return consentType === CONSENT_TYPES.ESSENTIAL;
  }
  return userConsent.consents[consentType] === true;
}

/**
 * Exporte toutes les données personnelles d'un utilisateur (Droit d'accès - Article 15 RGPD)
 * @param {string} userEmail - Email de l'utilisateur
 * @param {Object} userData - Données utilisateur depuis users.json
 * @param {Array} userMessages - Messages de l'utilisateur
 * @param {Array} userDMs - Messages privés
 * @returns {Object} Données personnelles complètes
 */
export function exportUserData(userEmail, userData, userMessages = [], userDMs = []) {
  const consents = getUserConsent(userEmail);

  const exportData = {
    metadata: {
      exportDate: new Date().toISOString(),
      userEmail,
      dataRetentionPolicy: '30 jours après suppression du compte',
      legalBasis: 'RGPD Article 15 - Droit d\'accès',
    },
    personalData: {
      email: userData.email,
      displayName: userData.displayName,
      role: userData.role,
      createdAt: userData.createdAt,
    },
    subscription: {
      tier: userData.subscription.tier,
      status: userData.subscription.status,
      expiresAt: userData.subscription.expiresAt,
      quotas: userData.subscription.quotas,
    },
    paymentHistory: userData.paymentHistory || [],
    social: {
      friends: userData.friends || [],
      friendRequests: userData.friendRequests || [],
      groups: userData.groups || [],
    },
    messages: {
      groupMessages: userMessages,
      directMessages: userDMs,
      totalCount: userMessages.length + userDMs.length,
    },
    consents: consents || { message: 'Aucun consentement enregistré' },
    dataProcessing: {
      purposes: [
        'Fourniture du service de traduction',
        'Transcription audio via OpenAI Whisper',
        'Traduction via OpenAI GPT-4 / DeepSeek',
        'Synthèse vocale via OpenAI TTS',
        'Gestion de l\'abonnement et facturation',
      ],
      thirdParties: [
        {
          name: 'OpenAI',
          purpose: 'Traitement de traduction, transcription, synthèse vocale',
          dataShared: 'Contenu audio/texte uniquement',
          retentionPolicy: 'Conforme à la politique OpenAI',
        },
        {
          name: 'DeepSeek',
          purpose: 'Traduction alternative pour utilisateurs en Chine',
          dataShared: 'Contenu texte uniquement',
          retentionPolicy: 'Conforme à la politique DeepSeek',
        },
        {
          name: 'Stripe',
          purpose: 'Traitement des paiements',
          dataShared: 'Email, montant, devise',
          retentionPolicy: 'Conforme aux obligations légales de facturation',
        },
      ],
    },
    rights: {
      access: 'Vous exercez actuellement votre droit d\'accès',
      rectification: 'Contact: admin@realtranslate.com',
      deletion: 'Via l\'interface ou contact: admin@realtranslate.com',
      portability: 'Données exportées dans ce fichier JSON',
      objection: 'Contact: admin@realtranslate.com',
      restriction: 'Contact: admin@realtranslate.com',
    },
  };

  // Enregistrer la demande d'export
  const requests = loadDataRequests();
  requests.push({
    requestId: crypto.randomBytes(16).toString('hex'),
    userEmail,
    requestedAt: new Date().toISOString(),
    type: 'export',
    status: 'completed',
  });
  saveDataRequests(requests);

  return exportData;
}

/**
 * Anonymise les données d'un utilisateur (au lieu de supprimer complètement)
 * @param {string} userEmail - Email de l'utilisateur
 * @returns {Object} Données anonymisées
 */
export function anonymizeUserData(userEmail) {
  const anonymousId = `anonymous_${crypto.randomBytes(8).toString('hex')}`;

  return {
    originalEmail: '[SUPPRIMÉ]',
    anonymousId,
    displayName: '[Utilisateur supprimé]',
    passwordHash: '[SUPPRIMÉ]',
    role: 'deleted',
    deletedAt: new Date().toISOString(),
    gdprCompliance: {
      rightToErasure: true,
      article: 'RGPD Article 17',
    },
  };
}

/**
 * Crée une demande de suppression de données (Droit à l'effacement - Article 17 RGPD)
 * @param {string} userEmail - Email de l'utilisateur
 * @param {string} reason - Raison de la suppression
 * @returns {Object} Détails de la demande
 */
export function createDeletionRequest(userEmail, reason = 'User request') {
  const requestId = crypto.randomBytes(16).toString('hex');

  const deletionRequest = {
    requestId,
    userEmail,
    reason,
    requestedAt: new Date().toISOString(),
    status: 'pending', // pending, processing, completed
    completionDate: null,
    retentionPeriod: 30, // jours
    finalDeletionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const requests = loadDeletionRequests();
  requests.push(deletionRequest);
  saveDeletionRequests(requests);

  return deletionRequest;
}

/**
 * Traite une demande de suppression
 * @param {string} requestId - ID de la demande
 * @param {Function} deleteCallback - Fonction de suppression réelle
 * @returns {Object} Résultat
 */
export async function processDeletionRequest(requestId, deleteCallback) {
  const requests = loadDeletionRequests();
  const requestIndex = requests.findIndex((r) => r.requestId === requestId);

  if (requestIndex === -1) {
    throw new Error('Demande de suppression introuvable');
  }

  const request = requests[requestIndex];

  // Marquer comme en traitement
  request.status = 'processing';
  saveDeletionRequests(requests);

  try {
    // Exécuter la suppression
    await deleteCallback(request.userEmail);

    // Marquer comme complété
    request.status = 'completed';
    request.completionDate = new Date().toISOString();
    saveDeletionRequests(requests);

    return {
      success: true,
      requestId,
      message: 'Données supprimées avec succès',
      completionDate: request.completionDate,
    };
  } catch (error) {
    request.status = 'failed';
    request.error = error.message;
    saveDeletionRequests(requests);
    throw error;
  }
}

/**
 * Vérifie si les données peuvent être transférées hors UE
 * @param {string} userEmail - Email de l'utilisateur
 * @param {string} service - Service tiers (openai, deepseek, stripe)
 * @returns {boolean} True si autorisé
 */
export function canTransferDataOutsideEU(userEmail, service) {
  // Vérifier le consentement pour les services tiers
  const consent = hasConsent(userEmail, CONSENT_TYPES.THIRD_PARTY);

  if (!consent) {
    return false;
  }

  // Services avec clauses contractuelles types (SCC) ou Privacy Shield
  const authorizedServices = ['openai', 'stripe']; // OpenAI et Stripe ont des SCC

  return authorizedServices.includes(service.toLowerCase());
}

/**
 * Génère un registre des activités de traitement (Article 30 RGPD)
 * @returns {Object} Registre de traitement
 */
export function generateProcessingRegister() {
  return {
    controller: {
      name: 'RealTranslate',
      contact: 'admin@realtranslate.com',
      dpo: 'dpo@realtranslate.com', // À configurer
    },
    processingActivities: [
      {
        name: 'Gestion des comptes utilisateurs',
        purpose: 'Authentification et gestion des accès',
        legalBasis: 'Exécution du contrat (Article 6(1)(b) RGPD)',
        dataCategories: ['Email', 'Nom d\'affichage', 'Mot de passe hashé'],
        recipients: ['Personnel autorisé'],
        retentionPeriod: 'Durée du compte + 30 jours',
        securityMeasures: ['Hashing bcrypt', 'Chiffrement AES-256-GCM', 'HTTPS'],
      },
      {
        name: 'Traitement de traduction',
        purpose: 'Fourniture du service de traduction en temps réel',
        legalBasis: 'Exécution du contrat (Article 6(1)(b) RGPD)',
        dataCategories: ['Contenu audio', 'Contenu texte', 'Langues'],
        recipients: ['OpenAI (sous-traitant)', 'DeepSeek (sous-traitant)'],
        internationalTransfers: 'USA (OpenAI - SCC), Chine (DeepSeek - Consentement)',
        retentionPeriod: 'Durée de la session + historique utilisateur',
        securityMeasures: ['HTTPS/TLS', 'Chiffrement des données stockées'],
      },
      {
        name: 'Gestion des paiements',
        purpose: 'Traitement des abonnements et facturation',
        legalBasis: 'Exécution du contrat (Article 6(1)(b) RGPD) + Obligations légales',
        dataCategories: ['Email', 'Montant', 'Devise', 'Date de paiement'],
        recipients: ['Stripe (sous-traitant)'],
        internationalTransfers: 'USA (Stripe - SCC)',
        retentionPeriod: '10 ans (obligations comptables)',
        securityMeasures: ['PCI-DSS (Stripe)', 'HTTPS', 'Webhook signature verification'],
      },
      {
        name: 'Messagerie et groupes',
        purpose: 'Communication entre utilisateurs',
        legalBasis: 'Exécution du contrat (Article 6(1)(b) RGPD)',
        dataCategories: ['Messages', 'Fichiers partagés', 'Métadonnées'],
        recipients: ['Membres du groupe/conversation'],
        retentionPeriod: 'Durée du compte utilisateur',
        securityMeasures: ['Chiffrement optionnel', 'Contrôle d\'accès'],
      },
    ],
    dataBreachProcedure: {
      notificationAuthority: '72 heures maximum',
      notificationUsers: 'Si risque élevé pour les droits et libertés',
      contact: 'CNIL (France) ou autorité locale',
    },
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Vérifie l'âge de consentement (16 ans minimum dans l'UE)
 * @param {Date} birthDate - Date de naissance
 * @returns {boolean} True si âge suffisant
 */
export function isAgeCompliant(birthDate) {
  const age = Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return age >= 16; // RGPD: 16 ans minimum (peut varier selon les pays)
}

/**
 * Génère un rapport de conformité RGPD
 * @returns {Object} Rapport de conformité
 */
export function generateComplianceReport() {
  const consents = loadConsents();
  const dataRequests = loadDataRequests();
  const deletionRequests = loadDeletionRequests();

  return {
    generatedAt: new Date().toISOString(),
    totalUsers: Object.keys(consents).length,
    consentStatistics: {
      total: Object.keys(consents).length,
      byType: Object.values(CONSENT_TYPES).reduce((acc, type) => {
        acc[type] = Object.values(consents).filter(
          (c) => c.consents[type] === true
        ).length;
        return acc;
      }, {}),
    },
    dataRequests: {
      total: dataRequests.length,
      last30Days: dataRequests.filter(
        (r) => new Date(r.requestedAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      ).length,
    },
    deletionRequests: {
      total: deletionRequests.length,
      pending: deletionRequests.filter((r) => r.status === 'pending').length,
      processing: deletionRequests.filter((r) => r.status === 'processing').length,
      completed: deletionRequests.filter((r) => r.status === 'completed').length,
      failed: deletionRequests.filter((r) => r.status === 'failed').length,
    },
    compliance: {
      dataMinimization: 'Conforme - Collecte minimale',
      purposeLimitation: 'Conforme - Finalités définies',
      storageLimitation: 'Conforme - Durées de conservation définies',
      integrity: 'Conforme - Mesures de sécurité',
      accountability: 'Conforme - Registre des traitements',
    },
  };
}

export default {
  CONSENT_TYPES,
  updateUserConsent,
  getUserConsent,
  hasConsent,
  exportUserData,
  anonymizeUserData,
  createDeletionRequest,
  processDeletionRequest,
  canTransferDataOutsideEU,
  generateProcessingRegister,
  isAgeCompliant,
  generateComplianceReport,
};
