/**
 * @fileoverview Gestion des thèmes (dark/light mode et couleurs)
 * @module theme
 */

// Initialiser le thème au démarrage
export function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    updateThemeIcon('light');
  } else {
    document.body.classList.remove('light-theme');
    updateThemeIcon('dark');
  }
}

// Toggle entre dark et light mode
export function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  const theme = isLight ? 'light' : 'dark';
  localStorage.setItem('theme', theme);
  updateThemeIcon(theme);
  document.body.style.transition = 'background 0.3s ease, color 0.3s ease';
}

// Mettre à jour l'icône du bouton de thème
export function updateThemeIcon(theme) {
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    themeBtn.textContent = theme === 'light' ? '☀️' : '🌙';
    themeBtn.title = theme === 'light' ? 'Mode sombre' : 'Mode clair';
  }
}

// Initialiser le thème de couleur au démarrage
export function initColorTheme() {
  const savedColorTheme = localStorage.getItem('colorTheme') || 'green';
  applyColorTheme(savedColorTheme);
}

// Changer de thème de couleur
export function changeColorTheme(colorTheme) {
  applyColorTheme(colorTheme);
  localStorage.setItem('colorTheme', colorTheme);

  const menu = document.getElementById('colorThemeMenu');
  if (menu) {
    menu.style.display = 'none';
  }
}

// Appliquer un thème de couleur
export function applyColorTheme(colorTheme) {
  document.body.classList.remove('theme-green', 'theme-blue', 'theme-purple', 'theme-pink', 'theme-orange');
  document.body.classList.add(`theme-${colorTheme}`);
}

// Toggle le menu de sélection de couleur
export function toggleColorThemeMenu() {
  const menu = document.getElementById('colorThemeMenu');
  if (menu) {
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  }
}

// Initialiser les listeners pour fermer le menu
export function initThemeListeners() {
  document.addEventListener('click', (event) => {
    const menu = document.getElementById('colorThemeMenu');
    const btn = document.getElementById('colorThemeBtn');

    if (menu && btn && !menu.contains(event.target) && !btn.contains(event.target)) {
      menu.style.display = 'none';
    }
  });
}

// Exposer les fonctions globalement pour les onclick HTML
if (typeof window !== 'undefined') {
  window.toggleTheme = toggleTheme;
  window.changeColorTheme = changeColorTheme;
  window.toggleColorThemeMenu = toggleColorThemeMenu;
}

export default {
  initTheme,
  toggleTheme,
  updateThemeIcon,
  initColorTheme,
  changeColorTheme,
  applyColorTheme,
  toggleColorThemeMenu,
  initThemeListeners
};
