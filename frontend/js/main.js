/**
 * @fileoverview Point d'entrée principal - Charge et initialise tous les modules
 * @module main
 *
 * Ce fichier sert de point d'entrée pour l'architecture modulaire.
 * Il importe tous les modules et expose les fonctions nécessaires globalement
 * pour maintenir la compatibilité avec les handlers onclick dans le HTML.
 */

// Import des modules
import { state, API_BASE_URL, groupsData, dmsData, friendsData, onlineStatuses, unreadMessages } from './state.js';
import { escapeHtml, escapeAttr, generateAvatarHTML, highlightMentions, formatLastSeen, debounce } from './utils.js';
import { VAD_CONFIG, NOTIFICATION_CONFIG, LANGUAGES, UI_TRANSLATIONS, REACTION_EMOJIS } from './config.js';
import { initTheme, toggleTheme, initColorTheme, changeColorTheme, toggleColorThemeMenu, initThemeListeners } from './theme.js';
import { initNotifications, showNotificationToast, showDesktopNotification, playNotificationSound } from './notifications.js';

// ===================================
// EXPOSITION GLOBALE DES MODULES
// ===================================

// Exposer l'état global
window.state = state;
window.API_BASE_URL = API_BASE_URL;
window.groupsData = groupsData;
window.dmsData = dmsData;
window.friendsData = friendsData;
window.onlineStatuses = onlineStatuses;
window.unreadMessages = unreadMessages;

// Exposer les utilitaires
window.escapeHtml = escapeHtml;
window.escapeAttr = escapeAttr;
window.generateAvatarHTML = generateAvatarHTML;
window.highlightMentions = highlightMentions;
window.formatLastSeen = formatLastSeen;
window.debounce = debounce;

// Exposer la configuration
window.VAD_CONFIG = VAD_CONFIG;
window.NOTIFICATION_CONFIG = NOTIFICATION_CONFIG;
window.LANGUAGES = LANGUAGES;
window.UI_TRANSLATIONS = UI_TRANSLATIONS;
window.REACTION_EMOJIS = REACTION_EMOJIS;

// Exposer les fonctions de thème
window.initTheme = initTheme;
window.toggleTheme = toggleTheme;
window.initColorTheme = initColorTheme;
window.changeColorTheme = changeColorTheme;
window.toggleColorThemeMenu = toggleColorThemeMenu;

// Exposer les notifications
window.showNotificationToast = showNotificationToast;
window.showDesktopNotification = showDesktopNotification;
window.playNotificationSound = playNotificationSound;

// ===================================
// INITIALISATION AU CHARGEMENT
// ===================================

/**
 * Initialise tous les modules au chargement de la page
 */
function initializeModules() {
  console.log('🚀 Initializing RealTranslate modules...');

  // Thèmes
  initTheme();
  initColorTheme();
  initThemeListeners();

  // Notifications
  initNotifications();

  console.log('✅ Modules initialized successfully');
}

// Attendre que le DOM soit chargé
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeModules);
} else {
  initializeModules();
}

// ===================================
// EXPORTS
// ===================================

export {
  // State
  state,
  API_BASE_URL,
  groupsData,
  dmsData,
  friendsData,

  // Utils
  escapeHtml,
  escapeAttr,
  generateAvatarHTML,
  highlightMentions,

  // Config
  VAD_CONFIG,
  NOTIFICATION_CONFIG,
  LANGUAGES,
  UI_TRANSLATIONS,

  // Theme
  initTheme,
  toggleTheme,
  changeColorTheme,

  // Notifications
  showNotificationToast,
  showDesktopNotification
};

export default {
  state,
  initializeModules
};
