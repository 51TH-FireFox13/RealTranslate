/**
 * @fileoverview Gestion des notifications (toasts, sons, desktop)
 * @module notifications
 */

import { NOTIFICATION_CONFIG } from './config.js';

// Son de notification (base64 court bip)
const NOTIFICATION_SOUND_BASE64 = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkI+IgHhxb3OBlpWWkYp+c2ppcnyOmJiUjIF1amBbYXGCkZmZlpCDdmtgWFtpdIWSmZmWkIN1aV5YW2l1h5OZmZWQgnRoXVdaaXSHk5mZlY+CdGhdV1podIeTmZmVj4J0aF1XWmh0h5OZmZWPgnRoXVdaaHSHk5mZlY+CdGhdV1podIeTmZmVj4J0aF1XWmh0h5OZmZWPgnRoXVdaaHSHk5mZlY+CdGhdV1podIeTmQ==';

let notificationSound = null;

// Initialiser le son de notification
function initNotificationSound() {
  try {
    notificationSound = new Audio(NOTIFICATION_SOUND_BASE64);
    notificationSound.volume = 0.3;
  } catch (e) {
    console.warn('Could not initialize notification sound:', e);
  }
}

// Demander la permission pour les notifications desktop
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.log('Ce navigateur ne supporte pas les notifications desktop');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

// Jouer le son de notification
export function playNotificationSound() {
  if (!NOTIFICATION_CONFIG.sound) return;

  try {
    if (!notificationSound) {
      initNotificationSound();
    }

    if (notificationSound) {
      notificationSound.currentTime = 0;
      notificationSound.play().catch(e => {
        console.log('Cannot play notification sound (user interaction required)');
      });
    }
  } catch (error) {
    console.log('Error playing notification sound:', error);
  }
}

// Afficher un toast de notification
export function showNotificationToast(message, type = 'info') {
  if (!NOTIFICATION_CONFIG.enabled) return;

  // Créer le conteneur de toasts s'il n'existe pas
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 350px;
    `;
    document.body.appendChild(container);
  }

  // Créer le toast
  const toast = document.createElement('div');
  toast.className = `notification-toast toast-${type}`;
  toast.style.cssText = `
    background: ${type === 'error' ? 'rgba(255, 107, 107, 0.95)' : 'rgba(0, 255, 157, 0.95)'};
    color: ${type === 'error' ? '#fff' : '#000'};
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    justify-content: space-between;
    animation: slideIn 0.3s ease;
    font-weight: 500;
  `;

  toast.innerHTML = `
    <span>${message}</span>
    <button onclick="this.parentElement.remove()" style="background: none; border: none; cursor: pointer; margin-left: 10px; font-size: 16px;">✕</button>
  `;

  container.appendChild(toast);

  // Jouer le son
  playNotificationSound();

  // Supprimer après un délai
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, NOTIFICATION_CONFIG.toastDuration);
}

// Afficher une notification desktop
export function showDesktopNotification(title, body, data = {}) {
  if (!NOTIFICATION_CONFIG.desktop) return;

  if (Notification.permission === 'granted' && document.hidden) {
    const notification = new Notification(title, {
      body: body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: data.groupId || 'realtranslate',
      renotify: true
    });

    notification.onclick = function() {
      window.focus();
      if (data.groupId && typeof window.openGroupChat === 'function') {
        window.openGroupChat(data.groupId);
      }
      notification.close();
    };

    setTimeout(() => notification.close(), 5000);
  }
}

// Ajouter les styles d'animation au document
function addNotificationStyles() {
  if (document.getElementById('notification-styles')) return;

  const style = document.createElement('style');
  style.id = 'notification-styles';
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

// Initialiser le module
export function initNotifications() {
  addNotificationStyles();
  initNotificationSound();
  requestNotificationPermission();
}

// Exposer globalement
if (typeof window !== 'undefined') {
  window.showNotificationToast = showNotificationToast;
  window.showDesktopNotification = showDesktopNotification;
  window.playNotificationSound = playNotificationSound;
}

export default {
  requestNotificationPermission,
  playNotificationSound,
  showNotificationToast,
  showDesktopNotification,
  initNotifications
};
