/**
 * @fileoverview Fonctions utilitaires
 * @module utils
 */

/**
 * Échappe les caractères HTML spéciaux pour prévenir les attaques XSS
 * @param {string} str - Chaîne à échapper
 * @returns {string} - Chaîne échappée
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/**
 * Échappe les attributs HTML (pour les valeurs d'attributs)
 * @param {string} str - Chaîne à échapper
 * @returns {string} - Chaîne échappée pour utilisation dans attributs
 */
export function escapeAttr(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Génère le HTML pour un avatar utilisateur
 * @param {Object} user - Objet utilisateur
 * @param {number} size - Taille en pixels
 * @returns {string} - HTML de l'avatar
 */
export function generateAvatarHTML(user, size = 40) {
  const API_BASE_URL = window.API_BASE_URL || window.location.origin;

  if (user.avatar) {
    const fullUrl = user.avatar.startsWith('http') ? user.avatar : `${API_BASE_URL}${user.avatar}`;
    return `<img src="${escapeAttr(fullUrl)}" alt="${escapeAttr(user.displayName || user.email)}" style="width: ${size}px; height: ${size}px; border-radius: 50%; object-fit: cover;">`;
  } else {
    const displayName = user.displayName || user.email || '';
    const initials = displayName.substring(0, 2).toUpperCase();
    return `<div style="width: ${size}px; height: ${size}px; border-radius: 50%; background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); display: flex; align-items: center; justify-content: center; font-size: ${size * 0.4}px; color: #fff; font-weight: bold;">${escapeHtml(initials)}</div>`;
  }
}

/**
 * Met en évidence les @mentions dans un texte
 * @param {string} text - Texte à traiter
 * @param {Array} mentions - Liste des mentions
 * @returns {string} - HTML avec mentions stylisées
 */
export function highlightMentions(text, mentions = []) {
  if (!text) return '';

  // Échapper le texte d'abord pour prévenir XSS
  const escapedText = escapeHtml(text);

  // Regex pour détecter les @mentions
  const mentionRegex = /@(\w+)/g;

  return escapedText.replace(mentionRegex, (match, username) => {
    return `<span style="background: rgba(var(--accent-primary-rgb, 0, 255, 157), 0.2); color: var(--accent-primary); font-weight: bold; padding: 2px 4px; border-radius: 4px;">${match}</span>`;
  });
}

/**
 * Formate une date relative (il y a X minutes, etc.)
 * @param {string|number} timestamp - Timestamp à formater
 * @returns {string} - Date formatée
 */
export function formatRelativeTime(timestamp) {
  const now = Date.now();
  const date = new Date(timestamp);
  const diff = now - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'À l\'instant';
  if (minutes < 60) return `Il y a ${minutes} min`;
  if (hours < 24) return `Il y a ${hours}h`;
  if (days < 7) return `Il y a ${days}j`;

  return date.toLocaleDateString();
}

/**
 * Formate la dernière connexion
 * @param {string|number} timestamp - Timestamp
 * @returns {string} - Texte formaté
 */
export function formatLastSeen(timestamp) {
  if (!timestamp) return '';

  const now = Date.now();
  const lastSeenDate = new Date(timestamp);
  const diffMs = now - lastSeenDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'En ligne';
  if (diffMins < 60) return `Vu il y a ${diffMins} min`;
  if (diffHours < 24) return `Vu il y a ${diffHours}h`;
  if (diffDays < 7) return `Vu il y a ${diffDays}j`;

  return `Vu le ${lastSeenDate.toLocaleDateString()}`;
}

/**
 * Génère un ID unique
 * @returns {string} - ID unique
 */
export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Debounce une fonction
 * @param {Function} func - Fonction à debouncer
 * @param {number} wait - Délai en ms
 * @returns {Function} - Fonction debouncée
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle une fonction
 * @param {Function} func - Fonction à throttler
 * @param {number} limit - Intervalle minimum en ms
 * @returns {Function} - Fonction throttlée
 */
export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

export default {
  escapeHtml,
  escapeAttr,
  generateAvatarHTML,
  highlightMentions,
  formatRelativeTime,
  formatLastSeen,
  generateId,
  debounce,
  throttle
};
