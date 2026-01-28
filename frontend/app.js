// Configuration
const API_BASE_URL = window.location.origin;

// ===================================
// SÉCURITÉ XSS - Échappement HTML
// ===================================

/**
 * Échappe les caractères HTML spéciaux pour prévenir les attaques XSS
 * @param {string} str - Chaîne à échapper
 * @returns {string} - Chaîne échappée
 */
function escapeHtml(str) {
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
function escapeAttr(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const VAD_CONFIG = {
  VOLUME_THRESHOLD: 0.015,     // Seuil de détection de voix (plus sensible)
  SILENCE_DURATION: 1000,      // Durée de silence pour arrêter (ms) - plus rapide
  MIN_RECORDING_DURATION: 600, // Durée minimale d'enregistrement (ms) - plus rapide
  RECORDING_INTERVAL: 80       // Intervalle d'analyse (ms) - plus réactif
};

// Configuration des notifications
const NOTIFICATION_CONFIG = {
  enabled: true,
  sound: true,
  desktop: true, // Notifications navigateur
  toastDuration: 4000 // Durée d'affichage du toast (ms)
};

// Tracker des messages non lus par groupe
const unreadMessages = {};

// Tracker des statuts en ligne/hors ligne des utilisateurs
const userStatuses = {}; // email -> { online: boolean, lastSeen: timestamp }

// Mode de connexion actuel ('email' ou 'token')
let loginMode = 'email';

// ===================================
// GESTION DU THÈME (DARK/LIGHT MODE)
// ===================================

// Initialiser le thème au démarrage
function initTheme() {
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
function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  const theme = isLight ? 'light' : 'dark';
  localStorage.setItem('theme', theme);
  updateThemeIcon(theme);

  // Animation de transition douce
  document.body.style.transition = 'background 0.3s ease, color 0.3s ease';
}

// Mettre à jour l'icône du bouton de thème
function updateThemeIcon(theme) {
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    themeBtn.textContent = theme === 'light' ? '☀️' : '🌙';
    themeBtn.title = theme === 'light' ? 'Mode sombre' : 'Mode clair';
  }
}

// ===================================
// GESTION DES THÈMES DE COULEUR
// ===================================

// Initialiser le thème de couleur au démarrage
function initColorTheme() {
  const savedColorTheme = localStorage.getItem('colorTheme') || 'green';
  applyColorTheme(savedColorTheme);
}

// Changer de thème de couleur
function changeColorTheme(colorTheme) {
  applyColorTheme(colorTheme);
  localStorage.setItem('colorTheme', colorTheme);

  // Fermer le menu
  const menu = document.getElementById('colorThemeMenu');
  if (menu) {
    menu.style.display = 'none';
  }
}

// Appliquer un thème de couleur
function applyColorTheme(colorTheme) {
  // Retirer tous les thèmes de couleur
  document.body.classList.remove('theme-green', 'theme-blue', 'theme-purple', 'theme-pink', 'theme-orange');

  // Appliquer le nouveau thème
  document.body.classList.add(`theme-${colorTheme}`);
}

// Toggle le menu de sélection de couleur
function toggleColorThemeMenu() {
  const menu = document.getElementById('colorThemeMenu');
  if (menu) {
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  }
}

// Fermer le menu quand on clique ailleurs
document.addEventListener('click', (event) => {
  const menu = document.getElementById('colorThemeMenu');
  const btn = document.getElementById('colorThemeBtn');

  if (menu && btn && !menu.contains(event.target) && !btn.contains(event.target)) {
    menu.style.display = 'none';
  }
});

// ===================================
// GESTION DES AVATARS
// ===================================

// Gérer la sélection d'un avatar
async function handleAvatarSelection(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Vérifier que c'est une image
  if (!file.type.startsWith('image/')) {
    showAvatarMessage('❌ Veuillez sélectionner une image', 'error');
    return;
  }

  // Vérifier la taille (5MB max)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    showAvatarMessage('❌ Image trop volumineuse. Taille maximale: 5MB', 'error');
    event.target.value = '';
    return;
  }

  // Upload de l'avatar
  try {
    showAvatarMessage('📤 Upload en cours...', 'info');

    const formData = new FormData();
    formData.append('avatar', file);

    const response = await fetch(`${API_BASE_URL}/api/upload-avatar`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.token}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    const result = await response.json();

    // Mettre à jour l'aperçu de l'avatar
    updateAvatarPreview(result.avatarUrl);

    // Mettre à jour le state
    if (state.user) {
      state.user.avatar = result.avatarUrl;
    }

    showAvatarMessage('✅ Photo de profil mise à jour !', 'success');

    // Clear input
    event.target.value = '';
  } catch (error) {
    console.error('Error uploading avatar:', error);
    showAvatarMessage('❌ Erreur lors de l\'upload', 'error');
  }
}

// Afficher un message pour l'avatar
function showAvatarMessage(message, type) {
  const messageDiv = document.getElementById('avatarMessage');
  if (!messageDiv) return;

  messageDiv.textContent = message;
  messageDiv.className = type === 'error' ? 'error-message' : (type === 'success' ? 'success-message' : '');
  messageDiv.classList.remove('hidden');

  if (type === 'success') {
    setTimeout(() => {
      messageDiv.classList.add('hidden');
    }, 3000);
  }
}

// Mettre à jour l'aperçu de l'avatar
function updateAvatarPreview(avatarUrl) {
  const preview = document.getElementById('profileAvatarPreview');
  if (!preview) return;

  if (avatarUrl) {
    const fullUrl = avatarUrl.startsWith('http') ? avatarUrl : `${API_BASE_URL}${avatarUrl}`;
    preview.innerHTML = `<img src="${fullUrl}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover;">`;
  } else {
    // Afficher initiales
    const initials = state.user && state.user.displayName ?
      state.user.displayName.substring(0, 2).toUpperCase() : '?';
    preview.textContent = initials;
  }
}

// Générer l'avatar HTML pour un utilisateur
function generateAvatarHTML(user, size = 40) {
  if (user.avatar) {
    const fullUrl = user.avatar.startsWith('http') ? user.avatar : `${API_BASE_URL}${user.avatar}`;
    return `<img src="${escapeAttr(fullUrl)}" alt="${escapeAttr(user.displayName || user.email)}" style="width: ${size}px; height: ${size}px; border-radius: 50%; object-fit: cover;">`;
  } else {
    // Avatar par défaut avec initiales
    const displayName = user.displayName || user.email || '';
    const initials = displayName.substring(0, 2).toUpperCase();
    return `<div style="width: ${size}px; height: ${size}px; border-radius: 50%; background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); display: flex; align-items: center; justify-content: center; font-size: ${size * 0.4}px; color: #fff; font-weight: bold;">${escapeHtml(initials)}</div>`;
  }
}

// ===================================
// GESTION DES MENTIONS @utilisateur
// ===================================

// Mettre en évidence les mentions dans un texte
function highlightMentions(text, mentions = []) {
  if (!text) return '';

  // IMPORTANT: Échapper le texte d'abord pour prévenir XSS
  const escapedText = escapeHtml(text);

  // Regex pour détecter les @mentions (sur le texte échappé)
  const mentionRegex = /@(\w+)/g;

  return escapedText.replace(mentionRegex, (match, username) => {
    // Style pour les mentions
    return `<span style="background: rgba(var(--accent-primary-rgb, 0, 255, 157), 0.2); color: var(--accent-primary); font-weight: bold; padding: 2px 4px; border-radius: 4px;">${match}</span>`;
  });
}

// Récupérer les membres du groupe actuel pour autocomplétion
function getCurrentGroupMembers() {
  if (!groupsData.currentGroup) return [];

  return groupsData.currentGroup.members.map(m => ({
    displayName: m.displayName,
    email: m.email
  }));
}

// ===================================
// GESTION DES STATUTS EN LIGNE/HORS LIGNE
// ===================================

// Récupérer les statuts depuis l'API
async function fetchUserStatuses() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/statuses`, {
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      Object.assign(userStatuses, data.statuses);
      console.log('📊 Statuts utilisateurs chargés:', Object.keys(userStatuses).length);
    }
  } catch (error) {
    console.error('Erreur lors du chargement des statuts:', error);
  }
}

// Générer l'indicateur de statut en ligne
function getOnlineIndicator(email) {
  const status = userStatuses[email];
  if (!status) {
    // Par défaut, considérer hors ligne
    return '<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #888; margin-right: 6px;" title="Hors ligne"></span>';
  }

  if (status.online) {
    return '<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #00ff9d; box-shadow: 0 0 4px #00ff9d; margin-right: 6px;" title="En ligne"></span>';
  } else {
    const lastSeenText = status.lastSeen ? formatLastSeen(status.lastSeen) : 'Hors ligne';
    return `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #888; margin-right: 6px;" title="${lastSeenText}"></span>`;
  }
}

// Formater le "dernière vue"
function formatLastSeen(timestamp) {
  if (!timestamp) return 'Hors ligne';

  const now = new Date();
  const lastSeen = new Date(timestamp);
  const diffMs = now - lastSeen;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'À l\'instant';
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays < 7) return `Il y a ${diffDays}j`;
  return 'Hors ligne';
}

// Rafraîchir les indicateurs en ligne dans l'interface
function refreshOnlineIndicators() {
  // Rafraîchir la liste des groupes si affichée
  if (groupsData.groups && groupsData.groups.length > 0) {
    displayGroups(groupsData.groups);
  }

  // Rafraîchir les conversations DM si affichées
  if (!document.getElementById('dmsPanel').classList.contains('hidden')) {
    loadDMConversations();
  }

  // Rafraîchir le titre du chat DM actuel si ouvert
  if (currentDMUser && !document.getElementById('dmChatPanel').classList.contains('hidden')) {
    const onlineIndicator = getOnlineIndicator(currentDMUser.email);
    document.getElementById('dmChatTitle').innerHTML = `💬 <span style="display: inline-flex; align-items: center;">${onlineIndicator}${escapeHtml(currentDMUser.displayName)}</span>`;
  }
}

// Configuration des langues
const LANGUAGES = {
  fr: { name: 'Français', flag: '🇫🇷', nativeName: 'Français', code: 'fr', voice: 'onyx' },
  en: { name: 'English', flag: '🇬🇧', nativeName: 'English', code: 'en', voice: 'alloy' },
  zh: { name: '中文', flag: '🇨🇳', nativeName: '中文', code: 'zh', voice: 'nova' },
  de: { name: 'Deutsch', flag: '🇩🇪', nativeName: 'Deutsch', code: 'de', voice: 'onyx' },
  es: { name: 'Español', flag: '🇪🇸', nativeName: 'Español', code: 'es', voice: 'onyx' },
  it: { name: 'Italiano', flag: '🇮🇹', nativeName: 'Italiano', code: 'it', voice: 'alloy' },
  pt: { name: 'Português', flag: '🇵🇹', nativeName: 'Português', code: 'pt', voice: 'shimmer' }
};

// Traductions de l'interface de sélection et pricing
const UI_TRANSLATIONS = {
  fr: {
    title: 'RealTranslate',
    subtitle: 'Choisissez vos langues de traduction',
    yourLanguage: '📱 Votre langue',
    targetLanguage: '🗣️ Langue à traduire',
    startButton: 'Commencer la traduction',
    // Interface principale
    friends: 'Amis',
    groups: 'Groupes',
    profile: 'Profil',
    logout: 'Déconnexion',
    // Amis
    friendsTitle: '👥 Amis',
    searchUsers: '🔍 Rechercher des utilisateurs',
    searchPlaceholder: 'Nom d\'affichage exact',
    searchButton: 'Rechercher',
    friendRequests: '📥 Demandes d\'ami reçues',
    myFriends: '✅ Mes amis',
    noRequests: 'Aucune demande d\'ami en attente',
    noPendingRequests: 'Aucune demande d\'ami en attente',
    noFriends: 'Aucun ami pour le moment. Recherchez des utilisateurs ci-dessus!',
    accept: 'Accepter',
    reject: 'Refuser',
    remove: 'Retirer',
    addFriend: 'Ajouter',
    minTwoChars: 'Entrez au moins 2 caractères',
    noUserFound: 'Aucun utilisateur trouvé avec ce nom',
    searchError: 'Erreur lors de la recherche',
    // Groupes
    groupsTitle: '💬 Groupes de discussion',
    createGroup: '➕ Créer un groupe',
    myGroups: '📋 Mes groupes',
    groupName: 'Nom du groupe',
    selectFriends: 'Sélectionner des amis à ajouter:',
    createButton: 'Créer le groupe',
    noGroups: 'Aucun groupe. Créez-en un ci-dessus!',
    noFriendsAddInTab: 'Vous n\'avez pas encore d\'amis. Ajoutez-en dans l\'onglet Amis!',
    members: 'membres',
    createdOn: 'Créé le',
    // Chat
    chatTitle: '💬',
    details: '⚙️ Détails',
    close: '✕ Fermer',
    typeMessage: 'Tapez votre message...',
    send: 'Envoyer',
    noMessages: 'Aucun message pour le moment. Soyez le premier à écrire!',
    listen: 'Écouter',
    copy: 'Copier',
    audioPlaybackError: 'Erreur lors de la lecture audio',
    copyError: 'Erreur lors de la copie',
    // Profil
    profileTitle: '⚙️ Mon Profil',
    accountInfo: '👤 Informations du compte',
    email: 'Email:',
    displayName: 'Nom d\'affichage:',
    subscription: 'Abonnement:',
    updateDisplayName: '✏️ Modifier le nom d\'affichage',
    newDisplayName: 'Nouveau nom d\'affichage',
    update: 'Mettre à jour',
    // Pricing
    'pricing-subtitle': 'Choisissez le plan adapté à vos besoins',
    'pricing-free-title': 'GRATUIT',
    'pricing-personnel-title': 'PERSONNEL',
    'pricing-premium-title': 'PREMIUM',
    'pricing-enterprise-title': 'ENTERPRISE',
    'pricing-per-month': '/mois',
    'pricing-popular': 'POPULAIRE',
    'pricing-transcriptions': 'transcriptions',
    'pricing-translations': 'traductions',
    'pricing-tts': 'synthèses vocales',
    'pricing-7-languages': '7 langues disponibles',
    'pricing-priority-support': 'Support prioritaire',
    'pricing-dedicated-support': 'Support dédié 24/7',
    'pricing-api-access': 'Accès API',
    'pricing-unlimited-transcriptions': 'Illimité transcriptions',
    'pricing-unlimited-translations': 'Illimité traductions',
    'pricing-unlimited-tts': 'Illimité synthèses vocales',
    'pricing-subscribe': 'S\'abonner',
    'pricing-payment-methods': 'Modes de paiement acceptés',
    'pricing-europe-region': 'Europe & International',
    'pricing-asia-region': 'Chine & Asie du Sud-Est',
    'pricing-faq': 'Questions fréquentes',
    'pricing-faq-q1': '🔹 Comment fonctionne l\'abonnement ?',
    'pricing-faq-a1': 'Votre abonnement est actif immédiatement après paiement et se renouvelle automatiquement chaque mois.',
    'pricing-faq-q2': '🔹 Puis-je annuler à tout moment ?',
    'pricing-faq-a2': 'Oui, vous pouvez annuler votre abonnement à tout moment. Vous conserverez l\'accès jusqu\'à la fin de la période payée.',
    'pricing-faq-q3': '🔹 Les quotas se reportent-ils ?',
    'pricing-faq-a3': 'Non, les quotas sont journaliers et se réinitialisent à minuit (heure UTC).'
  },
  en: {
    title: 'RealTranslate',
    subtitle: 'Choose your translation languages',
    yourLanguage: '📱 Your language',
    targetLanguage: '🗣️ Language to translate',
    startButton: 'Start translation',
    // Main interface
    friends: 'Friends',
    groups: 'Groups',
    profile: 'Profile',
    logout: 'Logout',
    // Friends
    friendsTitle: '👥 Friends',
    searchUsers: '🔍 Search users',
    searchPlaceholder: 'Exact display name',
    searchButton: 'Search',
    friendRequests: '📥 Friend requests',
    myFriends: '✅ My friends',
    noRequests: 'No pending friend requests',
    noPendingRequests: 'No pending friend requests',
    noFriends: 'No friends yet. Search for users above!',
    accept: 'Accept',
    reject: 'Reject',
    remove: 'Remove',
    addFriend: 'Add',
    minTwoChars: 'Enter at least 2 characters',
    noUserFound: 'No user found with that name',
    searchError: 'Error during search',
    // Groups
    groupsTitle: '💬 Discussion groups',
    createGroup: '➕ Create group',
    myGroups: '📋 My groups',
    groupName: 'Group name',
    selectFriends: 'Select friends to add:',
    createButton: 'Create group',
    noGroups: 'No groups. Create one above!',
    noFriendsAddInTab: 'You don\'t have any friends yet. Add some in the Friends tab!',
    members: 'members',
    createdOn: 'Created on',
    // Chat
    chatTitle: '💬',
    details: '⚙️ Details',
    close: '✕ Close',
    typeMessage: 'Type your message...',
    send: 'Send',
    noMessages: 'No messages yet. Be the first to write!',
    listen: 'Listen',
    copy: 'Copy',
    audioPlaybackError: 'Error playing audio',
    copyError: 'Error copying',
    // Profile
    profileTitle: '⚙️ My Profile',
    accountInfo: '👤 Account information',
    email: 'Email:',
    displayName: 'Display name:',
    subscription: 'Subscription:',
    updateDisplayName: '✏️ Change display name',
    newDisplayName: 'New display name',
    update: 'Update',
    // Pricing
    'pricing-subtitle': 'Choose the plan that fits your needs',
    'pricing-free-title': 'FREE',
    'pricing-personnel-title': 'PERSONAL',
    'pricing-premium-title': 'PREMIUM',
    'pricing-enterprise-title': 'ENTERPRISE',
    'pricing-per-month': '/month',
    'pricing-popular': 'POPULAR',
    'pricing-transcriptions': 'transcriptions',
    'pricing-translations': 'translations',
    'pricing-tts': 'text-to-speech',
    'pricing-7-languages': '7 languages available',
    'pricing-priority-support': 'Priority support',
    'pricing-dedicated-support': 'Dedicated 24/7 support',
    'pricing-api-access': 'API access',
    'pricing-unlimited-transcriptions': 'Unlimited transcriptions',
    'pricing-unlimited-translations': 'Unlimited translations',
    'pricing-unlimited-tts': 'Unlimited text-to-speech',
    'pricing-subscribe': 'Subscribe',
    'pricing-payment-methods': 'Accepted payment methods',
    'pricing-europe-region': 'Europe & International',
    'pricing-asia-region': 'China & Southeast Asia',
    'pricing-faq': 'Frequently asked questions',
    'pricing-faq-q1': '🔹 How does the subscription work?',
    'pricing-faq-a1': 'Your subscription is active immediately after payment and renews automatically every month.',
    'pricing-faq-q2': '🔹 Can I cancel anytime?',
    'pricing-faq-a2': 'Yes, you can cancel your subscription anytime. You\'ll keep access until the end of the paid period.',
    'pricing-faq-q3': '🔹 Do quotas carry over?',
    'pricing-faq-a3': 'No, quotas are daily and reset at midnight (UTC time).'
  },
  zh: {
    title: 'RealTranslate',
    subtitle: '选择您的翻译语言',
    yourLanguage: '📱 您的语言',
    targetLanguage: '🗣️ 翻译语言',
    startButton: '开始翻译',
    // 主界面
    friends: '好友',
    groups: '群组',
    profile: '个人资料',
    logout: '退出',
    // 好友
    friendsTitle: '👥 好友',
    searchUsers: '🔍 搜索用户',
    searchPlaceholder: '精确显示名称',
    searchButton: '搜索',
    friendRequests: '📥 好友请求',
    myFriends: '✅ 我的好友',
    noRequests: '没有待处理的好友请求',
    noPendingRequests: '没有待处理的好友请求',
    noFriends: '暂无好友。在上方搜索用户吧！',
    accept: '接受',
    reject: '拒绝',
    remove: '移除',
    addFriend: '添加',
    minTwoChars: '请输入至少2个字符',
    noUserFound: '未找到该用户',
    searchError: '搜索时出错',
    // 群组
    groupsTitle: '💬 讨论群组',
    createGroup: '➕ 创建群组',
    myGroups: '📋 我的群组',
    groupName: '群组名称',
    selectFriends: '选择要添加的好友:',
    createButton: '创建群组',
    noGroups: '没有群组。在上方创建一个吧！',
    noFriendsAddInTab: '您还没有好友。在好友标签中添加吧！',
    members: '成员',
    createdOn: '创建于',
    // 聊天
    chatTitle: '💬',
    details: '⚙️ 详情',
    close: '✕ 关闭',
    typeMessage: '输入您的消息...',
    send: '发送',
    noMessages: '暂无消息。成为第一个发言的人吧！',
    listen: '收听',
    copy: '复制',
    audioPlaybackError: '播放音频时出错',
    copyError: '复制时出错',
    // 个人资料
    profileTitle: '⚙️ 我的资料',
    accountInfo: '👤 账户信息',
    email: '邮箱:',
    displayName: '显示名称:',
    subscription: '订阅:',
    updateDisplayName: '✏️ 修改显示名称',
    newDisplayName: '新显示名称',
    update: '更新',
    // Pricing
    'pricing-subtitle': '选择适合您需求的套餐',
    'pricing-free-title': '免费',
    'pricing-personnel-title': '个人',
    'pricing-premium-title': '高级',
    'pricing-enterprise-title': '企业',
    'pricing-per-month': '/月',
    'pricing-popular': '热门',
    'pricing-transcriptions': '次转录',
    'pricing-translations': '次翻译',
    'pricing-tts': '次语音合成',
    'pricing-7-languages': '7种语言可用',
    'pricing-priority-support': '优先支持',
    'pricing-dedicated-support': '专属24/7支持',
    'pricing-api-access': 'API访问',
    'pricing-unlimited-transcriptions': '无限转录',
    'pricing-unlimited-translations': '无限翻译',
    'pricing-unlimited-tts': '无限语音合成',
    'pricing-subscribe': '订阅',
    'pricing-payment-methods': '接受的支付方式',
    'pricing-europe-region': '欧洲和国际',
    'pricing-asia-region': '中国和东南亚',
    'pricing-faq': '常见问题',
    'pricing-faq-q1': '🔹 订阅如何运作？',
    'pricing-faq-a1': '付款后立即激活订阅，每月自动续订。',
    'pricing-faq-q2': '🔹 我可以随时取消吗？',
    'pricing-faq-a2': '是的，您可以随时取消订阅。您将保留访问权限直到付费期结束。',
    'pricing-faq-q3': '🔹 配额会结转吗？',
    'pricing-faq-a3': '不会，配额是每日的，在午夜（UTC时间）重置。'
  },
  de: {
    title: 'RealTranslate',
    subtitle: 'Wählen Sie Ihre Übersetzungssprachen',
    yourLanguage: '📱 Ihre Sprache',
    targetLanguage: '🗣️ Sprache zum Übersetzen',
    startButton: 'Übersetzung starten',
    // Pricing
    'pricing-subtitle': 'Wählen Sie den Plan, der Ihren Bedürfnissen entspricht',
    'pricing-free-title': 'KOSTENLOS',
    'pricing-personnel-title': 'PERSÖNLICH',
    'pricing-premium-title': 'PREMIUM',
    'pricing-enterprise-title': 'ENTERPRISE',
    'pricing-per-month': '/Monat',
    'pricing-popular': 'BELIEBT',
    'pricing-transcriptions': 'Transkriptionen',
    'pricing-translations': 'Übersetzungen',
    'pricing-tts': 'Sprachsynthesen',
    'pricing-7-languages': '7 Sprachen verfügbar',
    'pricing-priority-support': 'Prioritäts-Support',
    'pricing-dedicated-support': 'Dedizierter 24/7-Support',
    'pricing-api-access': 'API-Zugang',
    'pricing-unlimited-transcriptions': 'Unbegrenzte Transkriptionen',
    'pricing-unlimited-translations': 'Unbegrenzte Übersetzungen',
    'pricing-unlimited-tts': 'Unbegrenzte Sprachsynthesen',
    'pricing-subscribe': 'Abonnieren',
    'pricing-payment-methods': 'Akzeptierte Zahlungsmethoden',
    'pricing-europe-region': 'Europa & International',
    'pricing-asia-region': 'China & Südostasien',
    'pricing-faq': 'Häufig gestellte Fragen',
    'pricing-faq-q1': '🔹 Wie funktioniert das Abonnement?',
    'pricing-faq-a1': 'Ihr Abonnement ist sofort nach der Zahlung aktiv und verlängert sich automatisch jeden Monat.',
    'pricing-faq-q2': '🔹 Kann ich jederzeit kündigen?',
    'pricing-faq-a2': 'Ja, Sie können Ihr Abonnement jederzeit kündigen. Sie behalten den Zugriff bis zum Ende des bezahlten Zeitraums.',
    'pricing-faq-q3': '🔹 Werden Kontingente übertragen?',
    'pricing-faq-a3': 'Nein, Kontingente sind täglich und werden um Mitternacht (UTC-Zeit) zurückgesetzt.'
  },
  es: {
    title: 'RealTranslate',
    subtitle: 'Elija sus idiomas de traducción',
    yourLanguage: '📱 Su idioma',
    targetLanguage: '🗣️ Idioma a traducir',
    startButton: 'Comenzar traducción',
    // Pricing
    'pricing-subtitle': 'Elija el plan que se adapte a sus necesidades',
    'pricing-free-title': 'GRATIS',
    'pricing-personnel-title': 'PERSONAL',
    'pricing-premium-title': 'PREMIUM',
    'pricing-enterprise-title': 'ENTERPRISE',
    'pricing-per-month': '/mes',
    'pricing-popular': 'POPULAR',
    'pricing-transcriptions': 'transcripciones',
    'pricing-translations': 'traducciones',
    'pricing-tts': 'síntesis de voz',
    'pricing-7-languages': '7 idiomas disponibles',
    'pricing-priority-support': 'Soporte prioritario',
    'pricing-dedicated-support': 'Soporte dedicado 24/7',
    'pricing-api-access': 'Acceso API',
    'pricing-unlimited-transcriptions': 'Transcripciones ilimitadas',
    'pricing-unlimited-translations': 'Traducciones ilimitadas',
    'pricing-unlimited-tts': 'Síntesis de voz ilimitada',
    'pricing-subscribe': 'Suscribirse',
    'pricing-payment-methods': 'Métodos de pago aceptados',
    'pricing-europe-region': 'Europa e Internacional',
    'pricing-asia-region': 'China y Sudeste Asiático',
    'pricing-faq': 'Preguntas frecuentes',
    'pricing-faq-q1': '🔹 ¿Cómo funciona la suscripción?',
    'pricing-faq-a1': 'Su suscripción está activa inmediatamente después del pago y se renueva automáticamente cada mes.',
    'pricing-faq-q2': '🔹 ¿Puedo cancelar en cualquier momento?',
    'pricing-faq-a2': 'Sí, puede cancelar su suscripción en cualquier momento. Mantendrá el acceso hasta el final del período pagado.',
    'pricing-faq-q3': '🔹 ¿Se acumulan las cuotas?',
    'pricing-faq-a3': 'No, las cuotas son diarias y se reinician a medianoche (hora UTC).'
  },
  it: {
    title: 'RealTranslate',
    subtitle: 'Scegli le tue lingue di traduzione',
    yourLanguage: '📱 La tua lingua',
    targetLanguage: '🗣️ Lingua da tradurre',
    startButton: 'Inizia traduzione',
    // Pricing
    'pricing-subtitle': 'Scegli il piano più adatto alle tue esigenze',
    'pricing-free-title': 'GRATUITO',
    'pricing-personnel-title': 'PERSONALE',
    'pricing-premium-title': 'PREMIUM',
    'pricing-enterprise-title': 'ENTERPRISE',
    'pricing-per-month': '/mese',
    'pricing-popular': 'POPOLARE',
    'pricing-transcriptions': 'trascrizioni',
    'pricing-translations': 'traduzioni',
    'pricing-tts': 'sintesi vocali',
    'pricing-7-languages': '7 lingue disponibili',
    'pricing-priority-support': 'Supporto prioritario',
    'pricing-dedicated-support': 'Supporto dedicato 24/7',
    'pricing-api-access': 'Accesso API',
    'pricing-unlimited-transcriptions': 'Trascrizioni illimitate',
    'pricing-unlimited-translations': 'Traduzioni illimitate',
    'pricing-unlimited-tts': 'Sintesi vocali illimitate',
    'pricing-subscribe': 'Iscriviti',
    'pricing-payment-methods': 'Metodi di pagamento accettati',
    'pricing-europe-region': 'Europa e Internazionale',
    'pricing-asia-region': 'Cina e Sud-est asiatico',
    'pricing-faq': 'Domande frequenti',
    'pricing-faq-q1': '🔹 Come funziona l\'abbonamento?',
    'pricing-faq-a1': 'Il tuo abbonamento è attivo immediatamente dopo il pagamento e si rinnova automaticamente ogni mese.',
    'pricing-faq-q2': '🔹 Posso annullare in qualsiasi momento?',
    'pricing-faq-a2': 'Sì, puoi annullare il tuo abbonamento in qualsiasi momento. Manterrai l\'accesso fino alla fine del periodo pagato.',
    'pricing-faq-q3': '🔹 I contingenti si accumulano?',
    'pricing-faq-a3': 'No, i contingenti sono giornalieri e si ripristinano a mezzanotte (ora UTC).'
  },
  pt: {
    title: 'RealTranslate',
    subtitle: 'Escolha seus idiomas de tradução',
    yourLanguage: '📱 Seu idioma',
    targetLanguage: '🗣️ Idioma para traduzir',
    startButton: 'Começar tradução',
    // Pricing
    'pricing-subtitle': 'Escolha o plano que se adapta às suas necessidades',
    'pricing-free-title': 'GRATUITO',
    'pricing-personnel-title': 'PESSOAL',
    'pricing-premium-title': 'PREMIUM',
    'pricing-enterprise-title': 'ENTERPRISE',
    'pricing-per-month': '/mês',
    'pricing-popular': 'POPULAR',
    'pricing-transcriptions': 'transcrições',
    'pricing-translations': 'traduções',
    'pricing-tts': 'sínteses de voz',
    'pricing-7-languages': '7 idiomas disponíveis',
    'pricing-priority-support': 'Suporte prioritário',
    'pricing-dedicated-support': 'Suporte dedicado 24/7',
    'pricing-api-access': 'Acesso API',
    'pricing-unlimited-transcriptions': 'Transcrições ilimitadas',
    'pricing-unlimited-translations': 'Traduções ilimitadas',
    'pricing-unlimited-tts': 'Sínteses de voz ilimitadas',
    'pricing-subscribe': 'Assinar',
    'pricing-payment-methods': 'Métodos de pagamento aceitos',
    'pricing-europe-region': 'Europa e Internacional',
    'pricing-asia-region': 'China e Sudeste Asiático',
    'pricing-faq': 'Perguntas frequentes',
    'pricing-faq-q1': '🔹 Como funciona a assinatura?',
    'pricing-faq-a1': 'Sua assinatura é ativada imediatamente após o pagamento e renova automaticamente todo mês.',
    'pricing-faq-q2': '🔹 Posso cancelar a qualquer momento?',
    'pricing-faq-a2': 'Sim, você pode cancelar sua assinatura a qualquer momento. Você manterá o acesso até o final do período pago.',
    'pricing-faq-q3': '🔹 As cotas são acumuladas?',
    'pricing-faq-a3': 'Não, as cotas são diárias e resetam à meia-noite (horário UTC).'
  }
};

// État global
let state = {
  isRecording: false,
  isSpeaking: false,
  mediaRecorder: null,
  audioContext: null,
  analyser: null,
  audioChunks: [],
  recordingStartTime: 0,
  lastSoundTime: 0,
  provider: 'openai',
  audioQueue: [], // Queue pour gérer les lectures TTS
  token: null,
  user: null,
  micEnabled: true,  // État du microphone
  ttsEnabled: true,   // État de la synthèose vocale
  lang1: null,  // Langue de l'utilisateur
  lang2: null,   // Langue de traduction
  mode: 'push-to-talk',  // Mode: 'realtime' ou 'push-to-talk' - PTT par défaut
  processingQueue: [],  // Queue de traitement des enregistrements
  isProcessingAPI: false  // Traitement API en cours
};

// Éléments DOM
const elements = {
  loginContainer: document.getElementById('loginContainer'),
  mainApp: document.getElementById('mainApp'),
  loginForm: document.getElementById('loginForm'),
  loginBtn: document.getElementById('loginBtn'),
  loginError: document.getElementById('loginError'),
  email: document.getElementById('email'),
  password: document.getElementById('password'),
  userInfo: document.getElementById('userInfo'),
  adminBtn: document.getElementById('adminBtn'),
  permissionModal: document.getElementById('permissionModal'),
  statusBar: document.getElementById('statusBar'),
  statusText: document.getElementById('statusText'),
  frContent: document.getElementById('frContent'),
  zhContent: document.getElementById('zhContent'),
  volumeBar: document.getElementById('volumeBar'),
  providerBadge: document.getElementById('providerBadge'),
  providerName: document.getElementById('providerName')
};

// ===================================
// AUTHENTIFICATION
// ===================================

// Vérifier si l'utilisateur est connecté
function checkAuth() {
  const token = localStorage.getItem('auth_token');
  const user = localStorage.getItem('auth_user');

  if (token && user) {
    state.token = token;
    state.user = JSON.parse(user);
    showApp();
    return true;
  }

  return false;
}

// Afficher l'application
function showApp() {
  elements.loginContainer.classList.add('hidden');

  // Afficher mainApp
  elements.mainApp.classList.remove('hidden');

  elements.userInfo.textContent = state.user.email;

  // Afficher le bouton admin si c'est un admin
  if (state.user.role === 'admin') {
    elements.adminBtn.classList.remove('hidden');
  }

  // Initialiser le badge provider avec la valeur par défaut
  elements.providerName.textContent = state.provider.toUpperCase();
  elements.providerBadge.classList.remove('hidden');

  // Demander la permission pour les notifications
  requestNotificationPermission();

  // Vérifier si l'utilisateur a déjà sélectionné ses langues et son mode
  const savedLang1 = localStorage.getItem('lang1');
  const savedLang2 = localStorage.getItem('lang2');
  const savedInterfaceMode = localStorage.getItem('interface_mode');

  if (savedLang1 && savedLang2 && savedInterfaceMode) {
    // L'utilisateur a déjà tout configuré, aller directement au mode
    state.lang1 = savedLang1;
    state.lang2 = savedLang2;

    if (savedInterfaceMode === 'translation') {
      startTranslation();
    } else if (savedInterfaceMode === 'communication') {
      startCommunication();
    } else {
      // Fallback: afficher interfaceChoice
      showInterfaceChoiceFromApp();
    }
  } else {
    // Première utilisation ou pas de config sauvegardée
    // Afficher interfaceChoice (menu principal)
    showInterfaceChoiceFromApp();
  }

  // Charger les statuts des utilisateurs
  fetchUserStatuses();
}

// Afficher interfaceChoice (menu principal) depuis l'app
function showInterfaceChoiceFromApp() {
  // Masquer tous les écrans
  document.getElementById('languageSelection').classList.add('hidden');
  document.getElementById('communicationHome').classList.add('hidden');

  // Afficher interfaceChoice (2 cartes)
  document.getElementById('interfaceChoice').classList.remove('hidden');

  // Afficher le bouton admin si nécessaire
  const adminBtn = document.getElementById('adminAccessBtn');
  if (adminBtn && state.user && state.user.role === 'admin') {
    adminBtn.style.display = 'inline-block';
  } else if (adminBtn) {
    adminBtn.style.display = 'none';
  }
}

// ===================================
// CONNEXION ET OAUTH
// ===================================

// OAuth Login Functions (stubs pour l'instant, à implémenter avec les clés API)
function loginWithGoogle() {
  // TODO: Implémenter OAuth Google
  // window.location.href = `${API_BASE_URL}/api/auth/google`;
  alert('🚧 Connexion Google à venir\nUtilisez l\'email/mot de passe pour le moment.');
}

function loginWithApple() {
  // TODO: Implémenter OAuth Apple
  // window.location.href = `${API_BASE_URL}/api/auth/apple`;
  alert('🚧 Connexion Apple à venir\nUtilisez l\'email/mot de passe pour le moment.');
}

function loginWithWeChat() {
  // TODO: Implémenter OAuth WeChat
  // window.location.href = `${API_BASE_URL}/api/auth/wechat`;
  alert('🚧 Connexion WeChat à venir\nUtilisez l\'email/mot de passe pour le moment.');
}

// Ouvrir la modal de login par token
function switchLoginMode(mode) {
  loginMode = mode;
  if (mode === 'token') {
    document.getElementById('tokenLoginModal').classList.remove('hidden');
  } else if (mode === 'email') {
    // Retour au formulaire email
    loginMode = 'email';
  } else if (mode === 'register') {
    // Basculer vers le formulaire d'inscription
    showRegisterForm();
  }
}

// Fermer la modal de login par token
function closeTokenModal() {
  document.getElementById('tokenLoginModal').classList.add('hidden');
  document.getElementById('accessTokenInput').value = '';
}

// Login avec token depuis la modal
async function loginWithToken() {
  const tokenInput = document.getElementById('accessTokenInput');
  const token = tokenInput.value.trim();

  if (!token) {
    alert('Veuillez entrer un jeton d\'accès');
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ accessToken: token })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erreur de connexion');
    }

    // Sauvegarder le token et l'utilisateur
    localStorage.setItem('auth_token', data.token);
    localStorage.setItem('auth_user', JSON.stringify(data.user));

    state.token = data.token;
    state.user = data.user;

    // Fermer la modal et afficher l'app
    closeTokenModal();
    showApp();

  } catch (error) {
    console.error('Erreur login token:', error);
    alert('❌ ' + error.message);
  }
}

async function login(email, password, accessToken) {
  try {
    elements.loginBtn.disabled = true;
    elements.loginBtn.textContent = 'Connexion...';
    elements.loginError.classList.add('hidden');

    // Préparer le body selon le mode de connexion
    const body = accessToken
      ? { accessToken }
      : { email, password };

    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erreur de connexion');
    }

    // Sauvegarder le token et l'utilisateur
    localStorage.setItem('auth_token', data.token);
    localStorage.setItem('auth_user', JSON.stringify(data.user));

    state.token = data.token;
    state.user = data.user;

    // Afficher l'application
    showApp();

  } catch (error) {
    console.error('Erreur login:', error);
    elements.loginError.textContent = error.message;
    elements.loginError.classList.remove('hidden');
    elements.loginBtn.disabled = false;
    elements.loginBtn.textContent = 'Se connecter';
  }
}

// Afficher le formulaire d'inscription
function showRegisterForm() {
  // Cacher le container de login, afficher celui d'inscription
  document.getElementById('loginContainer').classList.add('hidden');
  document.getElementById('registerContainer').classList.remove('hidden');
}

// Retour au formulaire de login
function backToLogin() {
  document.getElementById('registerContainer').classList.add('hidden');
  document.getElementById('loginContainer').classList.remove('hidden');
  loginMode = 'email';
}

// Inscription d'un nouvel utilisateur
async function register(email, password, displayName) {
  try {
    const registerBtn = document.getElementById('registerBtn');
    const registerError = document.getElementById('registerError');
    const registerSuccess = document.getElementById('registerSuccess');

    registerBtn.disabled = true;
    registerBtn.textContent = 'Inscription...';
    registerError.classList.add('hidden');
    registerSuccess.classList.add('hidden');

    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password, displayName })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erreur lors de l\'inscription');
    }

    // Afficher message de succès
    registerSuccess.textContent = '✅ Inscription réussie ! Veuillez vérifier votre email pour valider votre compte.';
    registerSuccess.classList.remove('hidden');

    // Réinitialiser le formulaire
    document.getElementById('registerForm').reset();

    registerBtn.disabled = false;
    registerBtn.textContent = 'S\'inscrire';

    // Retour au login après 3 secondes
    setTimeout(() => {
      backToLogin();
      registerSuccess.classList.add('hidden');
    }, 3000);

  } catch (error) {
    console.error('Erreur inscription:', error);
    const registerError = document.getElementById('registerError');
    const registerBtn = document.getElementById('registerBtn');

    registerError.textContent = error.message;
    registerError.classList.remove('hidden');
    registerBtn.disabled = false;
    registerBtn.textContent = 'S\'inscrire';
  }
}

// Afficher la page des tarifs
function showPricing() {
  document.getElementById('loginContainer').classList.add('hidden');
  document.getElementById('registerContainer').classList.add('hidden');
  document.getElementById('pricingContainer').classList.remove('hidden');
}

// Retour depuis les tarifs
function backFromPricing() {
  document.getElementById('pricingContainer').classList.add('hidden');
  if (loginMode === 'register' || document.getElementById('registerContainer').classList.contains('hidden') === false) {
    document.getElementById('registerContainer').classList.remove('hidden');
  } else {
    document.getElementById('loginContainer').classList.remove('hidden');
  }
}

// Déconnexion
async function logout() {
  try {
    // Révoquer le token côté serveur
    if (state.token) {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.token}`
        }
      });
    }
  } catch (error) {
    console.error('Erreur logout:', error);
  }

  // Nettoyer le localStorage
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');

  // Recharger la page
  window.location.reload();
}

// ===================================
// PANNEAU ADMIN
// ===================================

// Afficher le panneau admin
async function showAdminPanel() {
  const adminPanel = document.getElementById('adminPanel');
  adminPanel.classList.remove('hidden');
  await loadUsers();
}

// Fermer le panneau admin
function closeAdminPanel() {
  const adminPanel = document.getElementById('adminPanel');
  adminPanel.classList.add('hidden');
}

// Charger la liste des utilisateurs
async function loadUsers() {
  const container = document.getElementById('usersTableContainer');

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/users`, {
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });

    if (!response.ok) {
      throw new Error('Erreur lors du chargement des utilisateurs');
    }

    const data = await response.json();
    const users = data.users;

    // Créer le tableau HTML
    let html = `
      <table class="users-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Rôle</th>
            <th>Abonnement</th>
            <th>Créé le</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    users.forEach(user => {
      const createdDate = new Date(user.createdAt).toLocaleDateString('fr-FR');
      const isCurrentUser = user.email === state.user.email;

      // Afficher l'abonnement
      const subscription = user.subscription || { tier: 'free', status: 'active' };
      const tierColors = {
        free: '#888',
        personnel: '#4a9eff',
        premium: '#ffd43b',
        enterprise: '#00ff9d'
      };
      const tierIcons = {
        free: '🆓',
        personnel: '👤',
        premium: '⭐',
        enterprise: '💎'
      };

      const isProtected = user.email === 'admin@realtranslate.com';
      const canChangeRole = !isProtected && !isCurrentUser;

      html += `
        <tr>
          <td>${user.email} ${isCurrentUser ? '<span style="color: #00ff9d;">(vous)</span>' : ''}</td>
          <td>
            <span class="role-badge ${user.role}">${user.role}</span>
            ${canChangeRole ? `<button onclick="toggleUserRole('${user.email}', '${user.role}')" style="margin-left: 8px; background: rgba(0,255,157,0.2); border: 1px solid #00ff9d; color: #00ff9d; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 0.75em;" title="Changer le rôle">🔄</button>` : ''}
          </td>
          <td>
            <span style="color: ${tierColors[subscription.tier] || '#888'};">
              ${tierIcons[subscription.tier] || '🆓'} ${subscription.tier.toUpperCase()}
            </span>
          </td>
          <td>${createdDate}</td>
          <td>
            <button
              class="delete-user-btn"
              onclick="deleteUser('${user.email}')"
              ${isCurrentUser || isProtected ? 'disabled title="' + (isCurrentUser ? 'Vous ne pouvez pas vous supprimer' : 'Compte protégé') + '"' : ''}>
              🗑️ Supprimer
            </button>
          </td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    container.innerHTML = html;

  } catch (error) {
    console.error('Erreur chargement users:', error);
    container.innerHTML = `
      <div style="text-align: center; padding: 20px; color: #ff6b6b;">
        <p>❌ Erreur lors du chargement des utilisateurs</p>
      </div>
    `;
  }
}

// Créer un utilisateur
async function createUser() {
  const emailInput = document.getElementById('newUserEmail');
  const passwordInput = document.getElementById('newUserPassword');
  const roleSelect = document.getElementById('newUserRole');
  const createBtn = document.getElementById('createUserBtn');
  const messageDiv = document.getElementById('adminMessage');

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const role = roleSelect.value;

  if (!email || !password) {
    showAdminMessage('Veuillez remplir tous les champs', 'error');
    return;
  }

  try {
    createBtn.disabled = true;
    createBtn.textContent = 'Création...';

    const response = await fetch(`${API_BASE_URL}/api/auth/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ email, password, role })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erreur lors de la création');
    }

    // Succès
    showAdminMessage(`✅ Utilisateur ${email} créé avec succès !`, 'success');
    emailInput.value = '';
    passwordInput.value = '';
    roleSelect.value = 'user';

    // Recharger la liste
    await loadUsers();

  } catch (error) {
    console.error('Erreur création user:', error);
    showAdminMessage(`❌ ${error.message}`, 'error');
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = 'Créer';
  }
}

// Supprimer un utilisateur
async function deleteUser(email) {
  if (!confirm(`Êtes-vous sûr de vouloir supprimer l'utilisateur ${email} ?\n\nCette action est irréversible.`)) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/users/${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erreur lors de la suppression');
    }

    showAdminMessage(`✅ Utilisateur ${email} supprimé`, 'success');
    await loadUsers();

  } catch (error) {
    console.error('Erreur suppression user:', error);
    showAdminMessage(`❌ ${error.message}`, 'error');
  }
}

// Changer le rôle d'un utilisateur (admin <-> user)
async function toggleUserRole(email, currentRole) {
  const newRole = currentRole === 'admin' ? 'user' : 'admin';
  const roleText = newRole === 'admin' ? 'administrateur' : 'utilisateur';

  if (!confirm(`Voulez-vous changer le rôle de ${email} vers ${roleText} ?`)) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/users/${encodeURIComponent(email)}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ role: newRole })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erreur lors du changement de rôle');
    }

    showAdminMessage(`✅ Rôle de ${email} changé vers ${roleText}`, 'success');
    await loadUsers();

  } catch (error) {
    console.error('Erreur changement rôle:', error);
    showAdminMessage(`❌ ${error.message}`, 'error');
  }
}

// Afficher un message dans le panneau admin
function showAdminMessage(message, type) {
  const messageDiv = document.getElementById('adminMessage');
  messageDiv.className = type === 'success' ? 'success-message' : 'error-message';
  messageDiv.textContent = message;
  messageDiv.classList.remove('hidden');

  // Masquer après 5 secondes
  setTimeout(() => {
    messageDiv.classList.add('hidden');
  }, 5000);
}

// ===================================
// GESTION DES ONGLETS ADMIN
// ===================================

function switchAdminTab(tab) {
  // Masquer tous les onglets
  document.getElementById('adminTabUsers').style.display = 'none';
  document.getElementById('adminTabSubscriptions').style.display = 'none';
  document.getElementById('adminTabGroups').style.display = 'none';
  document.getElementById('adminTabLogs').style.display = 'none';

  // Réinitialiser les styles des boutons
  const buttons = ['tabUsers', 'tabSubscriptions', 'tabGroups', 'tabLogs'];
  buttons.forEach(btnId => {
    const btn = document.getElementById(btnId);
    btn.style.background = 'rgba(255,255,255,0.1)';
    btn.style.color = '#fff';
    btn.style.fontWeight = 'normal';
  });

  // Afficher l'onglet sélectionné et mettre en surbrillance le bouton
  if (tab === 'users') {
    document.getElementById('adminTabUsers').style.display = 'block';
    document.getElementById('tabUsers').style.background = '#00ff9d';
    document.getElementById('tabUsers').style.color = '#000';
    document.getElementById('tabUsers').style.fontWeight = 'bold';
  } else if (tab === 'subscriptions') {
    document.getElementById('adminTabSubscriptions').style.display = 'block';
    document.getElementById('tabSubscriptions').style.background = '#00ff9d';
    document.getElementById('tabSubscriptions').style.color = '#000';
    document.getElementById('tabSubscriptions').style.fontWeight = 'bold';
  } else if (tab === 'groups') {
    document.getElementById('adminTabGroups').style.display = 'block';
    document.getElementById('tabGroups').style.background = '#00ff9d';
    document.getElementById('tabGroups').style.color = '#000';
    document.getElementById('tabGroups').style.fontWeight = 'bold';
  } else if (tab === 'logs') {
    document.getElementById('adminTabLogs').style.display = 'block';
    document.getElementById('tabLogs').style.background = '#00ff9d';
    document.getElementById('tabLogs').style.color = '#000';
    document.getElementById('tabLogs').style.fontWeight = 'bold';
  }
}

// Changer d'onglet dans le profil
function switchProfileTab(tab) {
  // Masquer tous les onglets
  document.getElementById('profileTabAccountContent').style.display = 'none';
  document.getElementById('profileTabPasswordContent').style.display = 'none';
  document.getElementById('profileTabHistoryContent').style.display = 'none';
  document.getElementById('profileTabDangerContent').style.display = 'none';

  // Réinitialiser les styles des boutons
  const buttons = ['profileTabAccount', 'profileTabPassword', 'profileTabHistory', 'profileTabDanger'];
  buttons.forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.style.background = 'rgba(255,255,255,0.1)';
      btn.style.color = '#fff';
      btn.style.fontWeight = 'normal';
    }
  });

  // Afficher l'onglet sélectionné et mettre en surbrillance le bouton
  if (tab === 'account') {
    document.getElementById('profileTabAccountContent').style.display = 'block';
    document.getElementById('profileTabAccount').style.background = '#00ff9d';
    document.getElementById('profileTabAccount').style.color = '#000';
    document.getElementById('profileTabAccount').style.fontWeight = 'bold';
  } else if (tab === 'password') {
    document.getElementById('profileTabPasswordContent').style.display = 'block';
    document.getElementById('profileTabPassword').style.background = '#00ff9d';
    document.getElementById('profileTabPassword').style.color = '#000';
    document.getElementById('profileTabPassword').style.fontWeight = 'bold';
  } else if (tab === 'history') {
    document.getElementById('profileTabHistoryContent').style.display = 'block';
    document.getElementById('profileTabHistory').style.background = '#00ff9d';
    document.getElementById('profileTabHistory').style.color = '#000';
    document.getElementById('profileTabHistory').style.fontWeight = 'bold';
  } else if (tab === 'danger') {
    document.getElementById('profileTabDangerContent').style.display = 'block';
    document.getElementById('profileTabDanger').style.background = '#00ff9d';
    document.getElementById('profileTabDanger').style.color = '#000';
    document.getElementById('profileTabDanger').style.fontWeight = 'bold';
  }
}

// ===================================
// VISUALISATION DES LOGS
// ===================================

// ===================================
// ADMIN - GESTION DES GROUPES
// ===================================

// Charger tous les groupes (admin only)
async function loadAllGroupsAdmin() {
  const container = document.getElementById('adminGroupsContainer');
  const filterType = document.getElementById('groupFilterType').value;

  try {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Chargement...</div>';

    const response = await fetch(`${API_BASE_URL}/api/admin/groups`, {
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });

    if (!response.ok) {
      throw new Error('Erreur lors du chargement');
    }

    const data = await response.json();
    let groupsToDisplay = data.groups || [];

    // Appliquer le filtre
    if (filterType === 'public') {
      groupsToDisplay = groupsToDisplay.filter(g => g.visibility === 'public');
    } else if (filterType === 'private') {
      groupsToDisplay = groupsToDisplay.filter(g => g.visibility === 'private');
    }

    // Mettre à jour les statistiques
    const totalGroups = data.groups.length;
    const publicGroups = data.groups.filter(g => g.visibility === 'public').length;
    const privateGroups = data.groups.filter(g => g.visibility === 'private').length;
    const totalMembers = data.groups.reduce((sum, g) => sum + g.memberCount, 0);

    document.getElementById('totalGroupsCount').textContent = totalGroups;
    document.getElementById('publicGroupsCount').textContent = publicGroups;
    document.getElementById('privateGroupsCount').textContent = privateGroups;
    document.getElementById('totalMembersCount').textContent = totalMembers;

    // Afficher les groupes
    displayAdminGroups(groupsToDisplay);

  } catch (error) {
    console.error('Error loading groups:', error);
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #ff6b6b;">❌ Erreur lors du chargement des groupes</div>';
  }
}

// Afficher les groupes dans l'interface admin
function displayAdminGroups(groups) {
  const container = document.getElementById('adminGroupsContainer');

  if (groups.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Aucun groupe trouvé</div>';
    return;
  }

  container.innerHTML = groups.map(group => {
    const visibilityIcon = group.visibility === 'public' ? '🌐' : '🔒';
    const createdDate = new Date(group.createdAt).toLocaleDateString('fr-FR');

    return `
      <div style="padding: 15px; background: rgba(255,255,255,0.05); border-radius: 10px; margin-bottom: 10px; border-left: 4px solid ${group.visibility === 'public' ? '#00ff9d' : '#64b4ff'};">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
          <div style="flex: 1;">
            <div style="font-weight: bold; color: #fff; font-size: 1.1em; margin-bottom: 5px;">
              ${visibilityIcon} ${escapeHtml(group.name)}
            </div>
            <div style="color: #888; font-size: 0.9em;">
              <span>👤 Créateur: ${escapeHtml(group.creator)}</span>
              <span style="margin-left: 15px;">👥 ${group.memberCount} membre(s)</span>
              <span style="margin-left: 15px;">📅 ${createdDate}</span>
            </div>
          </div>
          <div style="display: flex; gap: 10px;">
            <button onclick="viewGroupDetails('${escapeAttr(group.id)}')" style="padding: 8px 15px; background: rgba(100,180,255,0.2); border: 1px solid #64b4ff; color: #64b4ff; border-radius: 6px; cursor: pointer; font-size: 0.9em; transition: all 0.2s;" onmouseover="this.style.background='rgba(100,180,255,0.3)'" onmouseout="this.style.background='rgba(100,180,255,0.2)'">
              📊 Détails
            </button>
            <button onclick="deleteGroupAdmin('${escapeAttr(group.id)}', '${escapeAttr(group.name)}')" style="padding: 8px 15px; background: rgba(255,107,107,0.2); border: 1px solid #ff6b6b; color: #ff6b6b; border-radius: 6px; cursor: pointer; font-size: 0.9em; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,107,107,0.3)'" onmouseout="this.style.background='rgba(255,107,107,0.2)'">
              🗑️ Supprimer
            </button>
          </div>
        </div>
        <div style="font-size: 0.85em; color: #aaa;">
          ID: <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 3px; font-family: monospace;">${escapeHtml(group.id)}</code>
        </div>
      </div>
    `;
  }).join('');
}

// Voir les détails d'un groupe (admin)
async function viewGroupDetails(groupId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/groups/${groupId}`, {
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });

    if (!response.ok) {
      throw new Error('Erreur lors du chargement');
    }

    const data = await response.json();
    const group = data.group;

    // Afficher les détails dans une alerte formatée
    const membersList = group.members.map(m => `  - ${m.displayName || m.name} (${m.email})`).join('\n');

    alert(`Détails du groupe: ${group.name}\n\nID: ${group.id}\nVisibilité: ${group.visibility === 'public' ? '🌐 Public' : '🔒 Privé'}\nCréateur: ${group.creator}\nDate de création: ${new Date(group.createdAt).toLocaleString('fr-FR')}\n\nMembres (${group.members.length}):\n${membersList}\n\nMessages: ${group.messageCount || 0}`);

  } catch (error) {
    console.error('Error loading group details:', error);
    alert('❌ Erreur lors du chargement des détails du groupe');
  }
}

// Supprimer un groupe (admin)
async function deleteGroupAdmin(groupId, groupName) {
  if (!confirm(`⚠️ Êtes-vous sûr de vouloir supprimer le groupe "${groupName}" ?\n\nCette action est irréversible et supprimera:\n- Le groupe\n- Tous les messages du groupe\n- L'accès pour tous les membres`)) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/groups/${groupId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });

    const data = await response.json();

    if (response.ok) {
      alert(`✅ Groupe "${groupName}" supprimé avec succès`);
      loadAllGroupsAdmin(); // Recharger la liste
    } else {
      alert(`❌ ${data.error}`);
    }

  } catch (error) {
    console.error('Error deleting group:', error);
    alert('❌ Erreur lors de la suppression du groupe');
  }
}

// ===================================
// LOGS SYSTEM
// ===================================

// Variable globale pour stocker les logs actuels (pour export)
let currentLogs = [];

// Charger et afficher les logs
async function loadLogs() {
  const logType = document.getElementById('logType').value;
  const dateFilter = document.getElementById('logDateFilter').value;
  const container = document.getElementById('logsContainer');

  try {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;"><p>Chargement...</p></div>';

    const response = await fetch(`${API_BASE_URL}/api/auth/logs?type=${logType}&lines=500`, {
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });

    if (!response.ok) {
      throw new Error('Erreur lors du chargement des logs');
    }

    const data = await response.json();
    let filteredLines = data.lines;

    // Filtrer par date si spécifié
    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      filteredLines = data.lines.filter(line => {
        // Essayer d'extraire la date du log (format ISO ou autre)
        const dateMatch = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        if (dateMatch) {
          const logDate = new Date(dateMatch[0]);
          return logDate >= filterDate;
        }
        return true; // Garder les lignes sans date reconnaissable
      });
    }

    // Stocker pour export
    currentLogs = filteredLines;

    if (filteredLines.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;"><p>Aucun log disponible</p></div>';
      return;
    }

    // Afficher les logs avec coloration
    const logsHTML = filteredLines.map(line => {
      let color = '#fff';
      if (line.includes('[ERROR]')) color = '#ff6b6b';
      else if (line.includes('[WARN]')) color = '#ffd43b';
      else if (line.includes('[INFO]')) color = '#00ff9d';

      return `<div style="color: ${color}; margin-bottom: 5px; word-wrap: break-word;">${escapeHtml(line)}</div>`;
    }).join('');

    const filterInfo = dateFilter ? ` | Filtrés depuis ${new Date(dateFilter).toLocaleString('fr-FR')}` : '';
    container.innerHTML = `
      <div style="margin-bottom: 10px; color: #888; text-align: right;">
        Total: ${data.total} lignes | Affichage: ${filteredLines.length}${filterInfo}
      </div>
      ${logsHTML}
    `;

    // Scroll vers le bas
    container.scrollTop = container.scrollHeight;

  } catch (error) {
    console.error('Erreur chargement logs:', error);
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #ff6b6b;"><p>❌ Erreur lors du chargement des logs</p></div>';
  }
}

// Exporter les logs actuels
function exportLogs() {
  if (currentLogs.length === 0) {
    alert('Aucun log à exporter. Veuillez d\'abord charger les logs.');
    return;
  }

  const logType = document.getElementById('logType').value;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `realtranslate-${logType}-${timestamp}.log`;

  // Créer le contenu du fichier
  const content = currentLogs.join('\n');

  // Créer un blob et télécharger
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log(`✅ Export de ${currentLogs.length} lignes vers ${filename}`);
}

// Fonction utilitaire pour échapper le HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===================================
// GESTION DES ABONNEMENTS
// ===================================

// Mettre à jour l'abonnement d'un utilisateur
async function updateUserSubscription() {
  const email = document.getElementById('subscriptionEmail').value.trim();
  const tier = document.getElementById('subscriptionTier').value;
  const resultDiv = document.getElementById('subscriptionResult');

  if (!email) {
    resultDiv.innerHTML = '<p style="color: #ff6b6b;">⚠️ Veuillez entrer un email</p>';
    return;
  }

  try {
    resultDiv.innerHTML = '<p style="color: #888;">⏳ Mise à jour en cours...</p>';

    const response = await fetch(`${API_BASE_URL}/api/auth/subscription`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, tier })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur lors de la mise à jour');
    }

    const data = await response.json();
    resultDiv.innerHTML = '<p style="color: #00ff9d;">✅ Abonnement mis à jour avec succès</p>';

    // Réinitialiser les champs
    document.getElementById('subscriptionEmail').value = '';
    document.getElementById('subscriptionTier').value = 'free';

    // Recharger la liste des utilisateurs
    loadUsers();

    // Effacer le message après 3 secondes
    setTimeout(() => {
      resultDiv.innerHTML = '';
    }, 3000);

  } catch (error) {
    console.error('Erreur mise à jour abonnement:', error);
    resultDiv.innerHTML = `<p style="color: #ff6b6b;">❌ ${error.message}</p>`;
  }
}

// Supprimer l'abonnement d'un utilisateur (réinitialisation vers gratuit)
async function deleteUserSubscription() {
  const email = document.getElementById('subscriptionEmail').value.trim();
  const resultDiv = document.getElementById('subscriptionResult');

  if (!email) {
    resultDiv.innerHTML = '<p style="color: #ff6b6b;">⚠️ Veuillez entrer un email</p>';
    return;
  }

  if (!confirm(`Êtes-vous sûr de vouloir réinitialiser l'abonnement de ${email} vers le palier gratuit ?`)) {
    return;
  }

  try {
    resultDiv.innerHTML = '<p style="color: #888;">⏳ Réinitialisation en cours...</p>';

    const response = await fetch(`${API_BASE_URL}/api/auth/subscription`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, tier: 'free' })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur lors de la réinitialisation');
    }

    const data = await response.json();
    resultDiv.innerHTML = '<p style="color: #00ff9d;">✅ Abonnement réinitialisé vers Gratuit</p>';

    // Réinitialiser les champs
    document.getElementById('subscriptionEmail').value = '';
    document.getElementById('subscriptionTier').value = 'free';

    // Recharger la liste des utilisateurs
    loadUsers();

    // Effacer le message après 3 secondes
    setTimeout(() => {
      resultDiv.innerHTML = '';
    }, 3000);

  } catch (error) {
    console.error('Erreur réinitialisation abonnement:', error);
    resultDiv.innerHTML = `<p style="color: #ff6b6b;">❌ ${error.message}</p>`;
  }
}

// ===================================
// GESTION DES JETONS D'ACCÈS
// ===================================

// Générer un jeton d'accès
async function generateAccessToken() {
  const tier = document.getElementById('tokenTier').value;
  const maxUses = parseInt(document.getElementById('tokenMaxUses').value);
  const expiresInDays = parseInt(document.getElementById('tokenExpiryDays').value);
  const description = document.getElementById('tokenDescription').value.trim();
  const resultDiv = document.getElementById('tokenResult');

  try {
    resultDiv.innerHTML = '<p style="color: #888;">⏳ Génération en cours...</p>';

    const response = await fetch(`${API_BASE_URL}/api/auth/access-token/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tier, maxUses, expiresInDays, description })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur lors de la génération');
    }

    const data = await response.json();
    const token = data.accessToken.token;

    resultDiv.innerHTML = `
      <div style="background: rgba(0,255,157,0.1); border: 1px solid #00ff9d; border-radius: 8px; padding: 15px;">
        <p style="color: #00ff9d; margin-bottom: 10px;">✅ Jeton généré avec succès !</p>
        <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px; margin-bottom: 10px; word-break: break-all; font-family: 'Courier New', monospace; font-size: 0.9em;">
          ${token}
        </div>
        <button onclick="navigator.clipboard.writeText('${token}')" style="padding: 8px 15px; background: #00ff9d; color: #000; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
          📋 Copier le jeton
        </button>
      </div>
    `;

    // Réinitialiser les champs
    document.getElementById('tokenMaxUses').value = '1';
    document.getElementById('tokenExpiryDays').value = '30';
    document.getElementById('tokenDescription').value = '';
    document.getElementById('tokenTier').value = 'free';

    // Recharger la liste des jetons
    loadAccessTokens();

  } catch (error) {
    console.error('Erreur génération jeton:', error);
    resultDiv.innerHTML = `<p style="color: #ff6b6b;">❌ ${error.message}</p>`;
  }
}

// Charger la liste des jetons d'accès
async function loadAccessTokens() {
  const container = document.getElementById('tokensListContainer');

  try {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;"><p>Chargement...</p></div>';

    const response = await fetch(`${API_BASE_URL}/api/auth/access-tokens`, {
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });

    if (!response.ok) {
      throw new Error('Erreur lors du chargement des jetons');
    }

    const data = await response.json();
    const tokens = data.tokens;

    if (tokens.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;"><p>Aucun jeton généré</p></div>';
      return;
    }

    // Afficher les jetons
    const tokensHTML = tokens.map(token => {
      const statusColors = {
        active: '#00ff9d',
        exhausted: '#ffd43b',
        expired: '#888',
        revoked: '#ff6b6b'
      };

      const expiresDate = new Date(token.expiresAt).toLocaleDateString('fr-FR');
      const createdDate = new Date(token.createdAt).toLocaleDateString('fr-FR');

      return `
        <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 12px; margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
            <div style="flex: 1;">
              <div style="font-family: 'Courier New', monospace; font-size: 0.85em; color: #fff; word-break: break-all; margin-bottom: 5px;">
                ${token.token}
              </div>
              ${token.description ? `<div style="color: #888; font-size: 0.85em; margin-bottom: 5px;">${escapeHtml(token.description)}</div>` : ''}
              <div style="display: flex; gap: 15px; flex-wrap: wrap; font-size: 0.85em;">
                <span style="color: ${statusColors[token.status]};">● ${token.status.toUpperCase()}</span>
                <span style="color: #888;">Palier: ${token.tier.toUpperCase()}</span>
                <span style="color: #888;">Utilisé: ${token.usedCount}/${token.maxUses}</span>
                <span style="color: #888;">Créé: ${createdDate}</span>
                <span style="color: #888;">Expire: ${expiresDate}</span>
              </div>
            </div>
            ${token.status === 'active' ? `
              <button onclick="revokeAccessToken('${token.token}')" style="padding: 6px 12px; background: #ff6b6b; color: #fff; border: none; border-radius: 5px; cursor: pointer; font-size: 0.85em; margin-left: 10px;">
                🗑️ Révoquer
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = tokensHTML;

  } catch (error) {
    console.error('Erreur chargement jetons:', error);
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #ff6b6b;"><p>❌ Erreur lors du chargement des jetons</p></div>';
  }
}

// Révoquer un jeton d'accès
async function revokeAccessToken(token) {
  if (!confirm('Êtes-vous sûr de vouloir révoquer ce jeton ?')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/access-token/${encodeURIComponent(token)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur lors de la révocation');
    }

    // Recharger la liste
    loadAccessTokens();

  } catch (error) {
    console.error('Erreur révocation jeton:', error);
    alert(`Erreur: ${error.message}`);
  }
}

// Gestionnaire de formulaire de connexion
elements.loginForm.addEventListener('submit', (e) => {
  e.preventDefault();

  if (loginMode === 'email') {
    const email = elements.email.value;
    const password = elements.password.value;
    login(email, password);
  } else {
    const accessToken = document.getElementById('accessTokenInput').value.trim();
    if (!accessToken) {
      elements.loginError.textContent = 'Veuillez entrer un jeton d\'accès';
      elements.loginError.classList.remove('hidden');
      return;
    }
    login(null, null, accessToken);
  }
});

// Gestionnaire de formulaire d'inscription
document.getElementById('registerForm').addEventListener('submit', (e) => {
  e.preventDefault();

  const displayName = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const passwordConfirm = document.getElementById('registerPasswordConfirm').value;

  // Validation
  if (!displayName || !email || !password || !passwordConfirm) {
    document.getElementById('registerError').textContent = 'Tous les champs sont requis';
    document.getElementById('registerError').classList.remove('hidden');
    return;
  }

  if (password.length < 6) {
    document.getElementById('registerError').textContent = 'Le mot de passe doit contenir au moins 6 caractères';
    document.getElementById('registerError').classList.remove('hidden');
    return;
  }

  if (password !== passwordConfirm) {
    document.getElementById('registerError').textContent = 'Les mots de passe ne correspondent pas';
    document.getElementById('registerError').classList.remove('hidden');
    return;
  }

  // Appeler la fonction d'inscription
  register(email, password, displayName);
});

// ===================================
// SÉLECTION DE LANGUES
// ===================================

// Détecter la langue du navigateur
// Variable globale pour stocker la langue de l'interface
let currentUILang = 'en';

function detectBrowserLanguage() {
  const browserLang = navigator.language || navigator.userLanguage;
  const langCode = browserLang.split('-')[0].toLowerCase();

  // Vérifier si la langue est supportée dans les traductions UI
  if (UI_TRANSLATIONS[langCode]) {
    currentUILang = langCode;
    return langCode;
  }

  // Fallback vers anglais
  currentUILang = 'en';
  return 'en';
}

// Fonction helper pour traduire un texte
function t(key) {
  return UI_TRANSLATIONS[currentUILang]?.[key] || UI_TRANSLATIONS['en']?.[key] || key;
}

// Appliquer les traductions UI à tous les éléments de l'interface
function applyUITranslations() {
  // Détecter la langue
  detectBrowserLanguage();

  // Header navigation
  const friendsBtn = document.getElementById('friendsBtn');
  const groupsBtn = document.getElementById('groupsBtn');
  const profileBtn = document.getElementById('profileBtn');
  const logoutBtn = document.querySelector('.logout-btn');

  if (friendsBtn) friendsBtn.innerHTML = `👥 ${t('friends')}`;
  if (groupsBtn) groupsBtn.innerHTML = `💬 ${t('groups')}`;
  if (profileBtn) profileBtn.innerHTML = `⚙️ ${t('profile')}`;
  if (logoutBtn) logoutBtn.textContent = `↗ ${t('logout')}`;

  // Friends Panel - Headers
  const friendsPanelTitle = document.querySelector('#friendsPanel .admin-header h2');
  if (friendsPanelTitle) friendsPanelTitle.textContent = t('friendsTitle');

  const searchUsersTitle = document.getElementById('searchUsersTitle');
  if (searchUsersTitle) searchUsersTitle.textContent = t('searchUsers');

  const searchUsersBtn = document.getElementById('searchUsersBtn');
  if (searchUsersBtn) searchUsersBtn.textContent = t('searchButton');

  const searchUserInput = document.getElementById('searchUserInput');
  if (searchUserInput) searchUserInput.placeholder = t('searchPlaceholder');

  // Groups Panel - Headers
  const groupsPanelTitle = document.querySelector('#groupsPanel .admin-header h2');
  if (groupsPanelTitle) groupsPanelTitle.textContent = t('groupsTitle');

  // Profile Panel - Headers
  const profilePanelTitle = document.querySelector('#profilePanel .admin-header h2');
  if (profilePanelTitle) profilePanelTitle.textContent = t('profileTitle');

  // Chat interface
  const chatMessageInput = document.getElementById('chatMessageInput');
  if (chatMessageInput) chatMessageInput.placeholder = t('typeMessage');

  const chatSendBtn = document.getElementById('chatSendBtn');
  if (chatSendBtn) chatSendBtn.textContent = t('send');

  // Close buttons
  document.querySelectorAll('.close-admin-btn').forEach(btn => {
    btn.textContent = `✕ ${t('close')}`;
  });
}

// ===================================
// SYSTÈME DE NOTIFICATIONS
// ===================================

// Demander la permission pour les notifications navigateur
function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('Ce navigateur ne supporte pas les notifications desktop');
    NOTIFICATION_CONFIG.desktop = false;
    return;
  }

  if (Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
      console.log(`🔔 Permission notifications: ${permission}`);
      NOTIFICATION_CONFIG.desktop = (permission === 'granted');
    });
  } else if (Notification.permission === 'granted') {
    NOTIFICATION_CONFIG.desktop = true;
  } else {
    NOTIFICATION_CONFIG.desktop = false;
  }
}

// Jouer un son de notification
function playNotificationSound() {
  if (!NOTIFICATION_CONFIG.sound) return;

  try {
    // Créer un son simple avec Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800; // Fréquence en Hz
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    console.warn('Impossible de jouer le son de notification:', error);
  }
}

// Afficher une notification toast dans l'UI
function showNotificationToast(message) {
  if (!NOTIFICATION_CONFIG.enabled) return;

  // Créer ou réutiliser le conteneur de toast
  let toastContainer = document.getElementById('notificationToastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'notificationToastContainer';
    toastContainer.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 10000;
      max-width: 400px;
    `;
    document.body.appendChild(toastContainer);
  }

  // Créer le toast
  const toast = document.createElement('div');
  toast.style.cssText = `
    background: linear-gradient(135deg, #00ff9d, #00a2ff);
    color: #000;
    padding: 16px 20px;
    border-radius: 12px;
    margin-bottom: 10px;
    box-shadow: 0 8px 32px rgba(0, 255, 157, 0.3);
    animation: slideInRight 0.3s ease-out;
    font-weight: 600;
    font-size: 0.95em;
    cursor: pointer;
    transition: transform 0.2s, opacity 0.3s;
  `;
  toast.textContent = `🔔 ${message}`;

  // Animation CSS
  if (!document.getElementById('notificationToastStyles')) {
    const style = document.createElement('style');
    style.id = 'notificationToastStyles';
    style.textContent = `
      @keyframes slideInRight {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes slideOutRight {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Hover effect
  toast.addEventListener('mouseenter', () => {
    toast.style.transform = 'scale(1.02)';
  });
  toast.addEventListener('mouseleave', () => {
    toast.style.transform = 'scale(1)';
  });

  // Click to dismiss
  toast.addEventListener('click', () => {
    toast.style.animation = 'slideOutRight 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  });

  toastContainer.appendChild(toast);

  // Auto-remove après durée configurée
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.animation = 'slideOutRight 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }
  }, NOTIFICATION_CONFIG.toastDuration);
}

// Afficher une notification navigateur
function showDesktopNotification(title, body, groupId) {
  if (!NOTIFICATION_CONFIG.desktop || Notification.permission !== 'granted') {
    return;
  }

  try {
    const notification = new Notification(title, {
      body: body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: `group-${groupId}`, // Permet de grouper les notifications
      requireInteraction: false,
      silent: true // On joue notre propre son
    });

    notification.onclick = () => {
      window.focus();
      // Ouvrir le groupe si possible
      if (groupId && typeof openGroupChat === 'function') {
        openGroupChat(groupId);
      }
      notification.close();
    };

    // Auto-close après 5 secondes
    setTimeout(() => notification.close(), 5000);
  } catch (error) {
    console.warn('Erreur notification desktop:', error);
  }
}

// Incrémenter le compteur de messages non lus
function incrementUnreadCount(groupId) {
  if (!unreadMessages[groupId]) {
    unreadMessages[groupId] = 0;
  }
  unreadMessages[groupId]++;
  updateGroupBadges();
}

// Réinitialiser le compteur pour un groupe
function clearUnreadCount(groupId) {
  unreadMessages[groupId] = 0;
  updateGroupBadges();
}

// Mettre à jour les badges sur la liste des groupes
function updateGroupBadges() {
  // Cette fonction sera appelée pour mettre à jour l'UI des groupes
  // Elle sera implémentée dans displayGroupsList()
  if (typeof displayGroupsList === 'function' && groupsData.groups) {
    displayGroupsList(groupsData.groups);
  }
}

// ===================================
// RECHERCHE DANS L'HISTORIQUE
// ===================================

// Stocker tous les messages du groupe actuel
let currentGroupMessages = [];

// Rechercher dans les messages
function searchMessages() {
  const searchInput = document.getElementById('chatSearchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  const resultsCount = document.getElementById('searchResultsCount');

  if (!searchInput) return;

  const searchTerm = searchInput.value.trim().toLowerCase();

  if (searchTerm.length === 0) {
    // Afficher tous les messages
    displayMessages(currentGroupMessages);
    clearBtn.style.display = 'none';
    resultsCount.style.display = 'none';
    return;
  }

  // Afficher le bouton clear
  clearBtn.style.display = 'block';

  // Filtrer les messages
  const userLang = state.lang1;
  const filteredMessages = currentGroupMessages.filter(msg => {
    const translation = msg.translations[userLang] || msg.content;
    return translation.toLowerCase().includes(searchTerm) ||
           msg.fromDisplayName.toLowerCase().includes(searchTerm);
  });

  // Afficher les résultats filtrés avec highlight
  displaySearchResults(filteredMessages, searchTerm);

  // Afficher le compteur
  resultsCount.textContent = `${filteredMessages.length} résultat${filteredMessages.length > 1 ? 's' : ''}`;
  resultsCount.style.display = 'block';
}

// Afficher les résultats de recherche avec highlight
function displaySearchResults(messages, searchTerm) {
  const container = document.getElementById('chatMessagesContent');
  const userLang = state.lang1;

  if (messages.length === 0) {
    container.innerHTML = `<p style="color: #888; text-align: center;">Aucun message trouvé pour "${searchTerm}"</p>`;
    return;
  }

  container.innerHTML = messages.map(msg => {
    let translation = msg.translations[userLang] || msg.content;
    const isOwnMessage = msg.from === state.user.email;

    // Highlight le terme de recherche (case insensitive)
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    const highlightedText = translation.replace(regex, '<mark style="background: #ffeb3b; color: #000; padding: 2px 4px; border-radius: 3px;">$1</mark>');

    return `
      <div style="margin-bottom: 16px; display: flex; flex-direction: column; align-items: ${isOwnMessage ? 'flex-end' : 'flex-start'};" data-message-id="${msg.id}">
        <div style="position: relative; display: inline-block; max-width: 70%;">
          <div style="background: ${isOwnMessage ? '#00ff9d' : 'rgba(255,255,255,0.1)'}; color: ${isOwnMessage ? '#000' : '#fff'}; padding: 10px 14px; border-radius: 12px; word-wrap: break-word;">
            <div style="font-weight: bold; font-size: 0.85em; margin-bottom: 4px; opacity: 0.8;">${msg.fromDisplayName}</div>
            ${msg.fileInfo ? '' : `<div>${highlightedText}</div>`}
            ${msg.fileInfo ? generateFileDisplay(msg.fileInfo) : ''}
            ${msg.fileInfo && translation ? `<div style="margin-top: 8px;">${highlightedText}</div>` : ''}
            <div style="font-size: 0.75em; margin-top: 4px; opacity: 0.6;">${new Date(msg.timestamp).toLocaleTimeString()}</div>
          </div>
          <div style="display: flex; gap: 8px; margin-top: 4px; justify-content: ${isOwnMessage ? 'flex-end' : 'flex-start'}; flex-wrap: wrap;">
            ${!msg.fileInfo ? `<button onclick="playMessageAudio('${translation.replace(/'/g, "\\'")}', '${userLang}')" style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 0.85em;" title="${t('listen')}">🔊</button>` : ''}
            ${!msg.fileInfo ? `<button onclick="copyMessage('${translation.replace(/'/g, "\\'")}', '${msg.id || Date.now()}')" style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 0.85em;" title="${t('copy')}">📋</button>` : ''}
            ${generateReactionButtons(msg.id)}
            ${isOwnMessage ? `<button onclick="deleteMessage('${msg.id}')" style="background: rgba(255,107,107,0.2); border: 1px solid #ff6b6b; color: #ff6b6b; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 0.85em;" title="Supprimer">🗑️</button>` : ''}
          </div>
          ${generateReactionsDisplay(msg.reactions, msg.id)}
        </div>
      </div>
    `;
  }).join('');

  // Scroll vers le bas
  container.scrollTop = container.scrollHeight;
}

// Effacer la recherche
function clearSearch() {
  const searchInput = document.getElementById('chatSearchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  const resultsCount = document.getElementById('searchResultsCount');

  if (searchInput) {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    resultsCount.style.display = 'none';
    displayMessages(currentGroupMessages);
  }
}

// ===================================
// SUPPRESSION DE MESSAGES
// ===================================

// Supprimer un message
function deleteMessage(messageId) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer ce message ? Cette action est irréversible.')) {
    return;
  }

  if (!socket || !socket.connected || !currentChatGroupId) {
    alert('❌ Non connecté au serveur');
    return;
  }

  socket.emit('delete_message', {
    groupId: currentChatGroupId,
    messageId: messageId
  });
}

// Supprimer un message du DOM
function removeMessageFromDOM(messageId) {
  const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
  if (messageElement) {
    messageElement.style.transition = 'opacity 0.3s, transform 0.3s';
    messageElement.style.opacity = '0';
    messageElement.style.transform = 'scale(0.8)';

    setTimeout(() => {
      messageElement.remove();

      // Retirer aussi de currentGroupMessages
      currentGroupMessages = currentGroupMessages.filter(m => m.id !== messageId);

      // Si plus de messages, afficher le placeholder
      const container = document.getElementById('chatMessagesContent');
      if (container && container.children.length === 0) {
        container.innerHTML = `<p style="color: #888; text-align: center;">${t('noMessages')}</p>`;
      }
    }, 300);
  }
}

// ===================================
// RÉACTIONS SUR LES MESSAGES
// ===================================

// Emojis disponibles pour les réactions
const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢'];

// Générer l'HTML des boutons de réaction
function generateReactionButtons(messageId) {
  return REACTION_EMOJIS.map(emoji => `
    <button onclick="toggleReaction('${messageId}', '${emoji}')" style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.15); padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 1em; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.4)'" onmouseout="this.style.background='rgba(0,0,0,0.2)'" title="Réagir avec ${emoji}">
      ${emoji}
    </button>
  `).join('');
}

// Générer l'HTML d'affichage des réactions existantes
function generateReactionsDisplay(reactions, messageId) {
  if (!reactions || Object.keys(reactions).length === 0) {
    return '';
  }

  return `
    <div class="reactions-display" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
      ${Object.entries(reactions).map(([emoji, users]) => {
        if (users.length === 0) return '';

        const hasReacted = users.some(u => u.email === state.user.email);
        const usersList = users.map(u => u.displayName).join(', ');

        return `
          <button onclick="toggleReaction('${messageId}', '${emoji}')" style="background: ${hasReacted ? 'rgba(0, 255, 157, 0.2)' : 'rgba(0,0,0,0.3)'}; border: 1px solid ${hasReacted ? '#00ff9d' : 'rgba(255,255,255,0.2)'}; color: #fff; padding: 4px 10px; border-radius: 12px; cursor: pointer; font-size: 0.9em; display: flex; align-items: center; gap: 4px; transition: all 0.2s;" title="${usersList}">
            <span>${emoji}</span>
            <span style="font-size: 0.85em; font-weight: bold;">${users.length}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

// Toggle une réaction sur un message
function toggleReaction(messageId, emoji) {
  if (!socket || !socket.connected || !currentChatGroupId) {
    alert('❌ Non connecté au serveur');
    return;
  }

  socket.emit('toggle_reaction', {
    groupId: currentChatGroupId,
    messageId: messageId,
    emoji: emoji
  });
}

// Mettre à jour l'affichage des réactions d'un message
function updateMessageReactions(messageId, reactions) {
  // Trouver le message dans le DOM
  const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!messageElement) {
    console.warn(`Message ${messageId} not found in DOM`);
    return;
  }

  // Trouver ou créer le conteneur des réactions
  let reactionsContainer = messageElement.querySelector('.reactions-display');

  if (!reactionsContainer) {
    // Créer le conteneur s'il n'existe pas
    const messageInner = messageElement.querySelector('div > div');
    if (messageInner) {
      reactionsContainer = document.createElement('div');
      reactionsContainer.className = 'reactions-display';
      messageInner.parentElement.appendChild(reactionsContainer);
    }
  }

  if (reactionsContainer) {
    // Régénérer l'HTML des réactions
    reactionsContainer.innerHTML = generateReactionsDisplay(reactions, messageId);
  }
}

// ===================================
// INDICATEUR "EN TRAIN D'ÉCRIRE..."
// ===================================

// Variables pour l'indicateur typing
let typingTimeout = null;
let isCurrentlyTyping = false;
const TYPING_TIMEOUT_MS = 3000; // Timeout après 3 secondes sans frappe

// Afficher l'indicateur "en train d'écrire..."
function showTypingIndicator(displayName) {
  const indicator = document.getElementById('typingIndicator');
  const text = document.getElementById('typingIndicatorText');

  if (indicator && text) {
    text.textContent = `${displayName} est en train d'écrire`;
    indicator.style.display = 'block';

    // Scroll vers le bas pour voir l'indicateur
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }
}

// Cacher l'indicateur "en train d'écrire..."
function hideTypingIndicator() {
  const indicator = document.getElementById('typingIndicator');
  if (indicator) {
    indicator.style.display = 'none';
  }
}

// Émettre l'événement "user_typing" au serveur
function emitTypingEvent(isTyping) {
  if (!socket || !socket.connected || !currentChatGroupId) {
    return;
  }

  socket.emit('user_typing', {
    groupId: currentChatGroupId,
    isTyping: isTyping
  });
}

// Handler pour la frappe dans l'input du chat
function handleChatInput() {
  if (!currentChatGroupId) return;

  // Si on n'était pas en train de taper, signaler qu'on commence
  if (!isCurrentlyTyping) {
    isCurrentlyTyping = true;
    emitTypingEvent(true);
  }

  // Clear le timeout précédent
  if (typingTimeout) {
    clearTimeout(typingTimeout);
  }

  // Définir un nouveau timeout pour arrêter le signal après 3 secondes
  typingTimeout = setTimeout(() => {
    isCurrentlyTyping = false;
    emitTypingEvent(false);
  }, TYPING_TIMEOUT_MS);
}

// ===================================
// PARTAGE DE FICHIERS/IMAGES
// ===================================

let selectedFile = null;

// Gérer la sélection d'un fichier
function handleFileSelection(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Vérifier la taille (25MB max)
  const maxSize = 25 * 1024 * 1024; // 25MB
  if (file.size > maxSize) {
    alert('❌ Fichier trop volumineux. Taille maximale: 25MB');
    event.target.value = '';
    return;
  }

  selectedFile = file;

  // Afficher la prévisualisation
  const previewArea = document.getElementById('filePreviewArea');
  const previewName = document.getElementById('filePreviewName');

  const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
  previewName.textContent = `📎 ${file.name} (${sizeInMB} MB)`;
  previewArea.style.display = 'block';

  // Clear the input
  event.target.value = '';
}

// Annuler la sélection de fichier
function cancelFileSelection() {
  selectedFile = null;
  const previewArea = document.getElementById('filePreviewArea');
  previewArea.style.display = 'none';
  document.getElementById('chatFileInput').value = '';
}

// Upload du fichier vers le serveur
async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`${API_BASE_URL}/api/upload-file`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.token}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    const fileInfo = await response.json();
    return fileInfo;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

// Générer l'affichage d'un fichier dans un message
function generateFileDisplay(fileInfo) {
  if (!fileInfo) return '';

  const isImage = fileInfo.mimeType && fileInfo.mimeType.startsWith('image/');
  const fileUrl = `${API_BASE_URL}${fileInfo.url}`;

  if (isImage) {
    return `
      <div style="margin-top: 8px;">
        <a href="${fileUrl}" target="_blank">
          <img src="${fileUrl}" alt="${fileInfo.originalName}" style="max-width: 300px; max-height: 300px; border-radius: 8px; cursor: pointer;">
        </a>
        <div style="font-size: 0.85em; margin-top: 4px; opacity: 0.7;">📷 ${fileInfo.originalName}</div>
      </div>
    `;
  } else {
    // Fichier non-image
    const sizeInMB = (fileInfo.size / (1024 * 1024)).toFixed(2);
    let icon = '📄';
    if (fileInfo.mimeType) {
      if (fileInfo.mimeType.includes('pdf')) icon = '📕';
      else if (fileInfo.mimeType.includes('audio')) icon = '🎵';
      else if (fileInfo.mimeType.includes('video')) icon = '🎬';
      else if (fileInfo.mimeType.includes('text')) icon = '📝';
    }

    return `
      <div style="margin-top: 8px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid rgba(255,255,255,0.2);">
        <a href="${fileUrl}" target="_blank" download="${fileInfo.originalName}" style="color: #00ff9d; text-decoration: none; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 1.5em;">${icon}</span>
          <div style="flex: 1;">
            <div>${fileInfo.originalName}</div>
            <div style="font-size: 0.8em; opacity: 0.7;">${sizeInMB} MB</div>
          </div>
          <span>⬇️</span>
        </a>
      </div>
    `;
  }
}

// Initialiser l'écran de sélection de langues
function initLanguageSelection() {
  // Vérifier si les langues sont déjà sélectionnées (localStorage)
  const savedLang1 = localStorage.getItem('lang1');
  const savedLang2 = localStorage.getItem('lang2');
  const savedInterfaceMode = localStorage.getItem('interface_mode');

  if (savedLang1 && savedLang2 && LANGUAGES[savedLang1] && LANGUAGES[savedLang2]) {
    state.lang1 = savedLang1;
    state.lang2 = savedLang2;

    // Si un mode d'interface est sauvegardé, aller directement à ce mode
    if (savedInterfaceMode === 'translation') {
      startTranslation();
      return;
    } else if (savedInterfaceMode === 'communication') {
      startCommunication();
      return;
    } else {
      // Sinon, afficher le choix d'interface
      showInterfaceChoice();
      return;
    }
  }

  // Détecter la langue du navigateur
  const detectedLang = detectBrowserLanguage();

  // Traduire l'interface de sélection
  const translations = UI_TRANSLATIONS[detectedLang] || UI_TRANSLATIONS['fr'];

  // Mettre à jour les textes de l'interface
  const langSelectionTitle = document.querySelector('#languageSelection .lang-box h2');
  const langSelectionSubtitle = document.querySelector('#languageSelection .lang-box > p');
  const yourLangTitle = document.querySelector('#languageSelection .lang-step:first-of-type h3');
  const targetLangTitle = document.querySelector('#lang2Section h3');
  const startButton = document.getElementById('langContinueBtn');

  if (langSelectionTitle) langSelectionTitle.textContent = `🌍 ${translations.title}`;
  if (langSelectionSubtitle) langSelectionSubtitle.textContent = translations.subtitle;
  if (yourLangTitle) yourLangTitle.textContent = translations.yourLanguage;
  if (targetLangTitle) targetLangTitle.textContent = translations.targetLanguage;
  if (startButton) startButton.textContent = translations.startButton;

  // Afficher l'écran de sélection
  document.getElementById('languageSelection').classList.remove('hidden');

  // Pré-sélectionner la langue du navigateur
  const detectedFlag = document.querySelector(`#lang1Grid .lang-flag[data-lang="${detectedLang}"]`);
  if (detectedFlag) {
    detectedFlag.classList.add('suggested');
  }
}

// Sélectionner la première langue (langue de l'utilisateur)
function selectLang1(langCode) {
  if (!LANGUAGES[langCode]) return;

  state.lang1 = langCode;

  // Mettre à jour l'interface
  document.querySelectorAll('#lang1Grid .lang-flag').forEach(el => {
    el.classList.remove('selected', 'suggested');
  });
  document.querySelector(`#lang1Grid .lang-flag[data-lang="${langCode}"]`).classList.add('selected');

  // Afficher la deuxième étape
  document.getElementById('lang2Section').style.display = 'block';

  // Peupler la grille de la langue 2 (exclure la langue 1)
  const lang2Grid = document.getElementById('lang2Grid');
  lang2Grid.innerHTML = '';

  Object.keys(LANGUAGES).forEach(code => {
    if (code !== langCode) {
      const lang = LANGUAGES[code];
      const div = document.createElement('div');
      div.className = 'lang-flag';
      div.setAttribute('data-lang', code);
      div.onclick = () => selectLang2(code);
      div.innerHTML = `
        <div class="flag-emoji">${lang.flag}</div>
        <div class="flag-name">${lang.nativeName}</div>
      `;
      lang2Grid.appendChild(div);
    }
  });

  // Scroll vers la section 2
  document.getElementById('lang2Section').scrollIntoView({ behavior: 'smooth' });
}

// Sélectionner la deuxième langue (langue de traduction)
function selectLang2(langCode) {
  if (!LANGUAGES[langCode]) return;

  state.lang2 = langCode;

  // Mettre à jour l'interface
  document.querySelectorAll('#lang2Grid .lang-flag').forEach(el => {
    el.classList.remove('selected');
  });
  document.querySelector(`#lang2Grid .lang-flag[data-lang="${langCode}"]`).classList.add('selected');

  // Activer le bouton continuer
  document.getElementById('langContinueBtn').disabled = false;
}

// ===================================
// NAVIGATION ENTRE LES ÉCRANS (Étapes B et C)
// ===================================

// Sauvegarder la préférence de langue sur le serveur
async function saveLanguagePreferenceToServer(language) {
  if (!state.user) return;

  try {
    const response = await fetch('/api/profile/language', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ language })
    });

    if (!response.ok) {
      console.error('Failed to save language preference to server');
    }
  } catch (error) {
    console.error('Error saving language preference:', error);
  }
}

// Afficher l'écran de choix d'interface (Étape C)
function showInterfaceChoice() {
  if (!state.lang1 || !state.lang2) return;

  // Sauvegarder les langues dans localStorage
  localStorage.setItem('lang1', state.lang1);
  localStorage.setItem('lang2', state.lang2);

  // Sauvegarder lang1 (langue préférée) sur le serveur si l'utilisateur est connecté
  if (state.user) {
    saveLanguagePreferenceToServer(state.lang1);
  }

  // Afficher le bouton Admin uniquement pour les admins
  const adminBtn = document.getElementById('adminAccessBtn');
  if (adminBtn && state.user && state.user.role === 'admin') {
    adminBtn.style.display = 'inline-block';
  } else if (adminBtn) {
    adminBtn.style.display = 'none';
  }

  // Masquer la sélection de langues et afficher le choix d'interface
  document.getElementById('languageSelection').classList.add('hidden');
  document.getElementById('interfaceChoice').classList.remove('hidden');
}

// Retour vers la sélection de langues
function backToLanguageSelection() {
  document.getElementById('interfaceChoice').classList.add('hidden');
  document.getElementById('languageSelection').classList.remove('hidden');
}

// Sélectionner un mode d'interface
function selectInterfaceMode(mode) {
  // Sauvegarder le mode choisi
  localStorage.setItem('interface_mode', mode);

  // Vérifier si les langues sont déjà configurées
  const savedLang1 = localStorage.getItem('lang1');
  const savedLang2 = localStorage.getItem('lang2');

  if (savedLang1 && savedLang2 && LANGUAGES[savedLang1] && LANGUAGES[savedLang2]) {
    // Langues déjà configurées, lancer directement le mode
    state.lang1 = savedLang1;
    state.lang2 = savedLang2;

    if (mode === 'translation') {
      startTranslation();
    } else if (mode === 'communication') {
      startCommunication();
    }
  } else {
    // Langues pas encore configurées, afficher la sélection de langues d'abord
    document.getElementById('interfaceChoice').classList.add('hidden');
    document.getElementById('languageSelection').classList.remove('hidden');
  }
}

// Démarrer l'interface de traduction simple
function startTranslation() {
  // Masquer le choix d'interface
  document.getElementById('interfaceChoice').classList.add('hidden');

  // Appliquer les paramètres de langue
  applyLanguageSettings();

  // Charger les quotas utilisateur
  loadUserQuotas();

  // Initialiser le mode switch UI pour refléter le mode par défaut (PTT)
  initializeModeUI();

  // Initialiser les dots indicateurs (mobile)
  setTimeout(() => {
    if (typeof initPageIndicators === 'function') {
      initPageIndicators();
    }
  }, 100);

  // Demander la permission microphone
  setTimeout(() => {
    elements.permissionModal.classList.remove('hidden');
  }, 500);
}

// Démarrer l'interface de communication
function startCommunication() {
  // Masquer le choix d'interface
  document.getElementById('interfaceChoice').classList.add('hidden');

  // Afficher l'interface Communication Home
  document.getElementById('communicationHome').classList.remove('hidden');

  // Appliquer les paramètres de langue (basique, juste pour les messages)
  applyLanguageSettings();

  // Mettre à jour l'en-tête avec les infos utilisateur
  updateCommunicationHomeHeader();

  // Initialiser Socket.IO pour la communication
  initializeSocket();

  // Charger les groupes et conversations pour la page d'accueil
  loadCommunicationData();

  // Ne pas demander la permission micro pour l'instant (pas besoin en mode chat)
  console.log('🚀 Mode Communication activé');
}

// Mettre à jour l'en-tête de l'interface Communication Home
function updateCommunicationHomeHeader() {
  // Mettre à jour la langue affichée
  const lang = LANGUAGES[state.lang1];
  if (lang) {
    const langDisplay = document.getElementById('commLangDisplay');
    if (langDisplay) {
      langDisplay.innerHTML = `${lang.flag} ${lang.nativeName}`;
    }
  }

  // Mettre à jour les informations utilisateur
  if (state.user) {
    const userNameEl = document.getElementById('commUserName');
    const userAvatarEl = document.getElementById('commUserAvatar');

    if (userNameEl) {
      userNameEl.textContent = state.user.displayName || 'Utilisateur';
    }

    if (userAvatarEl) {
      userAvatarEl.innerHTML = generateAvatarHTML(state.user, 32);
    }
  }
}

// Charger les données pour l'interface Communication Home
async function loadCommunicationData() {
  try {
    // Charger les groupes
    const groupsResponse = await fetch(`${API_BASE_URL}/api/groups`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const groupsData = await groupsResponse.json();
    displayCommunicationGroups(groupsData.groups || []);

    // Charger les conversations DM
    const dmsResponse = await fetch(`${API_BASE_URL}/api/dms`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const dmsData = await dmsResponse.json();
    displayCommunicationDMs(dmsData.conversations || []);
  } catch (error) {
    console.error('Error loading communication data:', error);
    document.getElementById('commGroupsList').innerHTML = '<p style="color: #ff6b6b;">❌ Erreur de chargement</p>';
    document.getElementById('commDMsList').innerHTML = '<p style="color: #ff6b6b;">❌ Erreur de chargement</p>';
  }
}

// Afficher les groupes dans l'interface Communication Home
function displayCommunicationGroups(groups) {
  const container = document.getElementById('commGroupsList');

  if (groups.length === 0) {
    container.innerHTML = '<p class="comm-empty-message">Aucun groupe pour le moment.<br>Créez votre premier groupe ou rejoignez-en un !</p>';
    return;
  }

  container.innerHTML = groups.map(group => {
    const unreadCount = unreadMessages[group.id] || 0;
    const badgeHTML = unreadCount > 0 ? `
      <div style="position: absolute; top: 8px; right: 8px; background: linear-gradient(135deg, #ff6b6b, #ff9d00); color: #fff; border-radius: 12px; padding: 4px 10px; font-size: 0.75em; font-weight: bold; box-shadow: 0 2px 8px rgba(255,107,107,0.4);">
        ${unreadCount > 99 ? '99+' : unreadCount}
      </div>
    ` : '';

    const visibilityIcon = group.visibility === 'public' ? '🌐' : '🔒';
    const visibilityText = group.visibility === 'public' ? 'Public' : 'Privé';

    return `
      <div class="comm-group-item" onclick="openGroupChat('${escapeAttr(group.id)}')">
        ${badgeHTML}
        <div class="group-name">
          <span title="${visibilityText}">${visibilityIcon}</span> ${escapeHtml(group.name)}
        </div>
        <div class="group-info">
          👥 ${group.members.length} membre${group.members.length > 1 ? 's' : ''}
        </div>
        <div class="group-date">
          📅 Créé le ${new Date(group.createdAt).toLocaleDateString()}
        </div>
      </div>
    `;
  }).join('');
}

// Afficher les conversations DM dans l'interface Communication Home
function displayCommunicationDMs(conversations) {
  const container = document.getElementById('commDMsList');

  if (conversations.length === 0) {
    container.innerHTML = '<p class="comm-empty-message">Aucune conversation.<br>Envoyez un message à un ami pour démarrer !</p>';
    return;
  }

  container.innerHTML = conversations.map(conv => {
    const lastMsg = conv.lastMessage;
    const lastMsgText = lastMsg ? (lastMsg.content.substring(0, 40) + (lastMsg.content.length > 40 ? '...' : '')) : 'Nouvelle conversation';
    const lastMsgTime = lastMsg ? new Date(lastMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const onlineIndicator = getOnlineIndicator(conv.otherUser.email);

    return `
      <div class="comm-dm-item" onclick="openDMChat('${escapeAttr(conv.otherUser.email)}')">
        <div class="dm-container">
          <div class="dm-avatar">
            ${generateAvatarHTML(conv.otherUser, 50)}
          </div>
          <div class="dm-content">
            <div class="dm-name">
              ${onlineIndicator}${escapeHtml(conv.otherUser.displayName)}
            </div>
            <div class="dm-message">${escapeHtml(lastMsgText)}</div>
          </div>
          <div class="dm-time">${lastMsgTime}</div>
        </div>
      </div>
    `;
  }).join('');
}

// Afficher les paramètres de communication
function showCommunicationSettings() {
  // Afficher le panneau de profil qui contient les paramètres
  showProfilePanel();
}

// Réinitialiser le choix d'interface (retour à l'écran de sélection)
function resetInterfaceChoice() {
  // Masquer l'interface Communication Home
  document.getElementById('communicationHome').classList.add('hidden');

  // Masquer tous les panneaux et modales de l'interface de traduction
  const panelsToHide = [
    'groupChatPanel', 'dmChatPanel', 'groupsPanel', 'dmsPanel',
    'friendsPanel', 'profilePanel', 'adminPanel', 'settingsPanel',
    'permissionModal'
  ];
  panelsToHide.forEach(panelId => {
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add('hidden');
  });

  // Arrêter l'enregistrement audio si actif
  if (state.isRecording) {
    stopRecording();
  }

  // Effacer le choix d'interface du localStorage
  localStorage.removeItem('interface_mode');

  // Retourner à l'écran de choix d'interface
  document.getElementById('interfaceChoice').classList.remove('hidden');

  console.log('↩️ Retour au choix d\'interface');
}

// Retourner à la page d'accueil Communication
function backToCommunicationHome() {
  // Masquer tous les panneaux de chat
  document.getElementById('groupChatPanel').classList.add('hidden');
  document.getElementById('dmChatPanel').classList.add('hidden');
  document.getElementById('groupsPanel').classList.add('hidden');
  document.getElementById('dmsPanel').classList.add('hidden');

  // Afficher la page d'accueil Communication
  document.getElementById('communicationHome').classList.remove('hidden');

  // Recharger les données pour avoir les infos à jour
  loadCommunicationData();

  console.log('🏠 Retour à la page d\'accueil Communication');
}

// Initialiser l'interface du mode (PTT/Temps Réel)
function initializeModeUI() {
  const modeSwitch = document.getElementById('modeSwitch');
  const modeSwitchMobile = document.getElementById('modeSwitchMobile');
  const pushToTalkBtn = document.getElementById('pushToTalkBtn');
  const pushToTalkBtnMobile = document.getElementById('pushToTalkBtnMobile');
  const micBtn = document.getElementById('micBtn');
  const micBtnMobile = document.getElementById('micBtnMobile');

  if (state.mode === 'push-to-talk') {
    // Desktop
    if (modeSwitch) modeSwitch.classList.add('push-to-talk');
    if (pushToTalkBtn) pushToTalkBtn.classList.remove('hidden');
    if (micBtn) micBtn.style.opacity = '0.3';

    // Mobile
    if (modeSwitchMobile) modeSwitchMobile.classList.add('push-to-talk');
    if (pushToTalkBtnMobile) pushToTalkBtnMobile.classList.remove('hidden');
    if (micBtnMobile) micBtnMobile.style.opacity = '0.3';
  } else {
    // Mode temps réel (par défaut dans l'HTML)
    if (modeSwitch) modeSwitch.classList.remove('push-to-talk');
    if (pushToTalkBtn) pushToTalkBtn.classList.add('hidden');
    if (micBtn) micBtn.style.opacity = '1';

    if (modeSwitchMobile) modeSwitchMobile.classList.remove('push-to-talk');
    if (pushToTalkBtnMobile) pushToTalkBtnMobile.classList.add('hidden');
    if (micBtnMobile) micBtnMobile.style.opacity = '1';
  }
}

// ===================================
// GESTION PAGE PRICING
// ===================================

function showPricingPage() {
  document.getElementById('languageSelection').classList.add('hidden');
  document.getElementById('pricingPage').classList.remove('hidden');

  // Traduire la page selon la langue du navigateur
  const detectedLang = detectBrowserLanguage();
  const lang = UI_TRANSLATIONS[detectedLang] ? detectedLang : 'en';

  // Appliquer les traductions
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const translation = UI_TRANSLATIONS[lang][key];
    if (translation) {
      if (element.tagName === 'BUTTON' || element.tagName === 'INPUT') {
        element.textContent = translation;
      } else {
        element.innerHTML = translation;
      }
    }
  });
}

function hidePricingPage() {
  document.getElementById('pricingPage').classList.add('hidden');
  document.getElementById('interfaceChoice').classList.remove('hidden');
}

async function subscribePlan(tier) {
  // Vérifier que l'utilisateur est connecté
  if (!state.user) {
    alert('Veuillez vous connecter pour souscrire à un abonnement.');
    return;
  }

  try {
    // Afficher un indicateur de chargement
    const button = event?.target;
    if (button) {
      button.disabled = true;
      button.textContent = 'Chargement...';
    }

    // Créer une session Checkout Stripe
    const response = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: JSON.stringify({ tier })
    });

    const data = await response.json();

    if (response.ok && data.url) {
      // Rediriger vers Stripe Checkout
      window.location.href = data.url;
    } else {
      throw new Error(data.error || 'Échec de la création de la session de paiement');
    }
  } catch (error) {
    console.error('Erreur lors de la souscription:', error);
    alert('Erreur: ' + error.message);

    // Réinitialiser le bouton
    const button = event?.target;
    if (button) {
      button.disabled = false;
      button.textContent = 'S\'abonner';
    }
  }
}

function detectUserRegion() {
  // Détecter la région par la langue/timezone
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (timezone.includes('Asia') || timezone.includes('China') || timezone.includes('Hong_Kong')) {
    return 'asia';
  }
  return 'europe';
}

// ===================================
// COMPTEUR DE QUOTAS
// ===================================

let userQuotas = null;

async function loadUserQuotas() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/subscription/info`, {
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      userQuotas = data.subscription.quotas;
      updateQuotasDisplay();
    }
  } catch (error) {
    console.error('Erreur chargement quotas:', error);
  }
}

function updateQuotasDisplay() {
  if (!userQuotas) return;

  // Créer ou mettre à jour le compteur de quotas
  let quotasDiv = document.getElementById('quotasCounter');

  if (!quotasDiv) {
    // Créer le compteur
    quotasDiv = document.createElement('div');
    quotasDiv.id = 'quotasCounter';
    quotasDiv.style.cssText = `
      position: fixed;
      bottom: 5px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(15px);
      color: #fff;
      padding: 6px 12px;
      border-radius: 15px;
      font-size: 0.75em;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
      z-index: 998;
      white-space: nowrap;
      border: 1px solid rgba(255, 255, 255, 0.1);
    `;

    document.body.appendChild(quotasDiv);
  }

  // Calculer les pourcentages
  const transcribePercent = userQuotas.transcribe.limit === -1 ? 100 :
    ((userQuotas.transcribe.limit - userQuotas.transcribe.used) / userQuotas.transcribe.limit) * 100;
  const translatePercent = userQuotas.translate.limit === -1 ? 100 :
    ((userQuotas.translate.limit - userQuotas.translate.used) / userQuotas.translate.limit) * 100;
  const speakPercent = userQuotas.speak.limit === -1 ? 100 :
    ((userQuotas.speak.limit - userQuotas.speak.used) / userQuotas.speak.limit) * 100;

  // Déterminer les couleurs
  const getColor = (percent) => {
    if (percent > 50) return '#00ff9d';
    if (percent > 20) return '#ffd43b';
    return '#ff6b6b';
  };

  // Afficher les quotas
  const transcribeDisplay = userQuotas.transcribe.limit === -1 ? '∞' :
    `${userQuotas.transcribe.limit - userQuotas.transcribe.used}/${userQuotas.transcribe.limit}`;
  const translateDisplay = userQuotas.translate.limit === -1 ? '∞' :
    `${userQuotas.translate.limit - userQuotas.translate.used}/${userQuotas.translate.limit}`;
  const speakDisplay = userQuotas.speak.limit === -1 ? '∞' :
    `${userQuotas.speak.limit - userQuotas.speak.used}/${userQuotas.speak.limit}`;

  // Format ultra-compact horizontal pour mobile et desktop
  quotasDiv.innerHTML = `
    <span style="font-weight: 600; margin-right: 8px;">QUOTAS :</span>
    <span style="color: ${getColor(transcribePercent)}; margin-right: 10px;">🎤 ${transcribeDisplay}</span>
    <span style="color: ${getColor(translatePercent)}; margin-right: 10px;">📄 ${translateDisplay}</span>
    <span style="color: ${getColor(speakPercent)};">🔊 ${speakDisplay}</span>
  `;
}

// Fonction pour décrémenter un quota localement (mise à jour optimiste)
function decrementQuota(action) {
  if (userQuotas && userQuotas[action]) {
    if (userQuotas[action].limit !== -1) {
      userQuotas[action].used++;
    }
    updateQuotasDisplay();
  }
}

// Appliquer les paramètres de langue à l'interface
function applyLanguageSettings() {
  const lang1 = LANGUAGES[state.lang1];
  const lang2 = LANGUAGES[state.lang2];

  // Appliquer les traductions UI
  applyUITranslations();

  // Mettre à jour le sous-titre dynamique
  const subtitle = document.getElementById('appSubtitle');
  if (subtitle) {
    subtitle.textContent = `Traduction en Temps Réel • ${lang1.nativeName} ↔ ${lang2.nativeName}`;
  }

  // Mettre à jour les drapeaux et noms des panneaux (nouveaux IDs)
  const flag1 = document.getElementById('flag1');
  const flag2 = document.getElementById('flag2');
  const langName1 = document.getElementById('langName1');
  const langName2 = document.getElementById('langName2');

  if (flag1) flag1.textContent = lang1.flag;
  if (flag2) flag2.textContent = lang2.flag;
  if (langName1) langName1.textContent = lang1.nativeName;
  if (langName2) langName2.textContent = lang2.nativeName;

  // Compatibilité avec anciens sélecteurs (si présents)
  const panel1Header = document.querySelector('.panel:first-child h2');
  const panel2Header = document.querySelector('.panel:last-child h2');

  if (panel1Header && !langName1) {
    panel1Header.textContent = `${lang1.flag} ${lang1.nativeName}`;
  }

  if (panel2Header && !langName2) {
    panel2Header.textContent = `${lang2.flag} ${lang2.nativeName}`;
  }

  console.log(`🌐 Langues configurées: ${state.lang1} ↔ ${state.lang2}`);
}

// Réinitialiser la sélection de langues
function resetLanguageSelection() {
  localStorage.removeItem('lang1');
  localStorage.removeItem('lang2');
  state.lang1 = null;
  state.lang2 = null;
  window.location.reload();
}

// ===================================
// CONTRÔLES MICRO & TTS
// ===================================

// Activer/désactiver le microphone
function toggleMicrophone() {
  state.micEnabled = !state.micEnabled;

  // Boutons desktop
  const micBtn = document.getElementById('micBtn');
  const micIcon = document.getElementById('micIcon');
  const micText = document.getElementById('micText');

  // Boutons mobile
  const micBtnMobile = document.getElementById('micBtnMobile');
  const micIconMobile = document.getElementById('micIconMobile');

  if (state.micEnabled) {
    // Desktop
    if (micBtn) {
      micBtn.classList.add('active');
      micBtn.classList.remove('muted');
    }
    if (micIcon) micIcon.textContent = '🎤';
    if (micText) micText.textContent = 'Micro ON';

    // Mobile
    if (micBtnMobile) {
      micBtnMobile.classList.add('active');
      micBtnMobile.classList.remove('muted');
    }
    if (micIconMobile) micIconMobile.textContent = '🎤';

    updateStatus('listening', '🎧 Prêt à écouter...');

    // Afficher le VU-mètre
    const vuMeter = document.getElementById('vuMeter');
    if (vuMeter) vuMeter.classList.remove('hidden');
  } else {
    // Desktop
    if (micBtn) {
      micBtn.classList.remove('active');
      micBtn.classList.add('muted');
    }
    if (micIcon) micIcon.textContent = '🎤';
    if (micText) micText.textContent = 'Micro OFF';

    // Mobile
    if (micBtnMobile) {
      micBtnMobile.classList.remove('active');
      micBtnMobile.classList.add('muted');
    }
    if (micIconMobile) micIconMobile.textContent = '🎤';

    updateStatus('idle', '🔇 Microphone désactivé');

    // Masquer le VU-mètre
    const vuMeter = document.getElementById('vuMeter');
    if (vuMeter) vuMeter.classList.add('hidden');

    // Arrêter l'enregistrement en cours si nécessaire
    if (state.isRecording) {
      stopRecording();
    }
  }
}

// Activer/désactiver le TTS
function toggleTTS() {
  state.ttsEnabled = !state.ttsEnabled;

  // Boutons desktop
  const ttsBtn = document.getElementById('ttsBtn');
  const ttsIcon = document.getElementById('ttsIcon');
  const ttsText = document.getElementById('ttsText');

  // Boutons mobile
  const ttsBtnMobile = document.getElementById('ttsBtnMobile');
  const ttsIconMobile = document.getElementById('ttsIconMobile');

  if (state.ttsEnabled) {
    // Desktop
    if (ttsBtn) {
      ttsBtn.classList.add('active');
      ttsBtn.classList.remove('muted');
    }
    if (ttsIcon) ttsIcon.textContent = '🔊';
    if (ttsText) ttsText.textContent = 'Audio ON';

    // Mobile
    if (ttsBtnMobile) {
      ttsBtnMobile.classList.add('active');
      ttsBtnMobile.classList.remove('muted');
    }
    if (ttsIconMobile) ttsIconMobile.textContent = '🔊';
  } else {
    // Desktop
    if (ttsBtn) {
      ttsBtn.classList.remove('active');
      ttsBtn.classList.add('muted');
    }
    if (ttsIcon) ttsIcon.textContent = '🔇';
    if (ttsText) ttsText.textContent = 'Audio OFF';

    // Mobile
    if (ttsBtnMobile) {
      ttsBtnMobile.classList.remove('active');
      ttsBtnMobile.classList.add('muted');
    }
    if (ttsIconMobile) ttsIconMobile.textContent = '🔇';
  }
}

// Basculer entre mode temps réel et push-to-talk
function toggleMode() {
  // Éléments desktop
  const modeSwitch = document.getElementById('modeSwitch');
  const pushToTalkBtn = document.getElementById('pushToTalkBtn');
  const micBtn = document.getElementById('micBtn');

  // Éléments mobile
  const modeSwitchMobile = document.getElementById('modeSwitchMobile');
  const pushToTalkBtnMobile = document.getElementById('pushToTalkBtnMobile');
  const micBtnMobile = document.getElementById('micBtnMobile');

  if (state.mode === 'realtime') {
    // Passer en mode push-to-talk
    state.mode = 'push-to-talk';

    // Desktop
    if (modeSwitch) modeSwitch.classList.add('push-to-talk');
    if (pushToTalkBtn) pushToTalkBtn.classList.remove('hidden');
    if (micBtn) {
      micBtn.style.opacity = '0.3';
      micBtn.style.pointerEvents = 'none';
    }

    // Mobile
    if (modeSwitchMobile) modeSwitchMobile.classList.add('push-to-talk');
    if (pushToTalkBtnMobile) pushToTalkBtnMobile.classList.remove('hidden');
    if (micBtnMobile) {
      micBtnMobile.style.opacity = '0.3';
      micBtnMobile.style.pointerEvents = 'none';
    }

    // Désactiver le micro automatique
    if (state.isRecording) {
      stopRecording();
    }

    console.log('🔴 Mode Push-to-Talk activé');
  } else {
    // Passer en mode temps réel
    state.mode = 'realtime';

    // Desktop
    if (modeSwitch) modeSwitch.classList.remove('push-to-talk');
    if (pushToTalkBtn) pushToTalkBtn.classList.add('hidden');
    if (micBtn) {
      micBtn.style.opacity = '1';
      micBtn.style.pointerEvents = 'auto';
    }

    // Mobile
    if (modeSwitchMobile) modeSwitchMobile.classList.remove('push-to-talk');
    if (pushToTalkBtnMobile) pushToTalkBtnMobile.classList.add('hidden');
    if (micBtnMobile) {
      micBtnMobile.style.opacity = '1';
      micBtnMobile.style.pointerEvents = 'auto';
    }

    console.log('🟢 Mode Temps Réel activé');
  }
}

// Détection du provider (OpenAI ou DeepSeek)
async function detectProvider() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/detect-region`);
    const data = await response.json();
    state.provider = data.provider || 'openai'; // Fallback sur openai
    elements.providerName.textContent = state.provider.toUpperCase();
    elements.providerBadge.classList.remove('hidden');
    console.log('Provider détecté:', state.provider);
  } catch (error) {
    console.error('Erreur détection provider:', error);
    state.provider = 'openai'; // Fallback
  }
}

// Mise à jour du statut visuel
function updateStatus(status, text) {
  elements.statusBar.className = `status-bar ${status}`;
  elements.statusText.textContent = text;
}

// Ajout d'un message dans le panneau
function addMessage(panel, text) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message';

  // Créer le conteneur du texte (sélectionnable)
  const textSpan = document.createElement('span');
  textSpan.className = 'message-text';
  textSpan.textContent = text;
  textSpan.style.userSelect = 'text';
  textSpan.style.cursor = 'text';

  // Créer le bouton de copie
  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.innerHTML = '📋';
  copyBtn.title = 'Copier le message';
  copyBtn.onclick = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.innerHTML = '✓';
      setTimeout(() => {
        copyBtn.innerHTML = '📋';
      }, 1500);
    }).catch(err => {
      console.error('Erreur copie:', err);
    });
  };

  messageDiv.appendChild(textSpan);
  messageDiv.appendChild(copyBtn);

  // Déterminer le panneau approprié (lang1 ou lang2)
  let contentElement;
  if (panel === 'lang1' || panel === state.lang1) {
    contentElement = elements.frContent; // Premier panneau
  } else if (panel === 'lang2' || panel === state.lang2) {
    contentElement = elements.zhContent; // Deuxième panneau
  }

  if (contentElement) {
    contentElement.appendChild(messageDiv);
    contentElement.scrollTop = contentElement.scrollHeight;
  }
}

// Analyse du volume audio (VAD)
function analyzeVolume() {
  if (!state.analyser) return 0;

  const bufferLength = state.analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  state.analyser.getByteTimeDomainData(dataArray);

  // Calcul du RMS (Root Mean Square) pour le volume
  let sum = 0;
  for (let i = 0; i < bufferLength; i++) {
    const normalized = (dataArray[i] - 128) / 128;
    sum += normalized * normalized;
  }
  const rms = Math.sqrt(sum / bufferLength);

  // Mise à jour de l'indicateur visuel (si l'élément existe)
  if (elements.volumeBar) {
    const volumePercent = Math.min(100, rms * 1000);
    elements.volumeBar.style.width = `${volumePercent}%`;
  }

  // Mettre à jour le VU-mètre
  updateVUMeter(rms);

  return rms;
}

// Mettre à jour le VU-mètre visuel (ligne horizontale)
function updateVUMeter(volume) {
  const vuMeter = document.getElementById('vuMeter');
  if (!vuMeter) return;

  // Convertir le volume (0-1) en pourcentage (0-100%)
  const volumePercent = Math.min(100, volume * 1000);

  // Mettre à jour la largeur de la barre via une variable CSS
  vuMeter.style.setProperty('--vu-width', `${volumePercent}%`);

  // Animer si le volume est détecté
  if (volumePercent > 10) {
    vuMeter.classList.add('active');
  } else {
    vuMeter.classList.remove('active');
  }
}

// Détection automatique de la voix (VAD Loop)
function vadLoop() {
  const volume = analyzeVolume();

  // Ne pas enregistrer si le micro est désactivé OU en mode push-to-talk
  // IMPORTANT: On ne bloque PLUS sur isSpeaking pour permettre l'écoute continue
  if (!state.micEnabled || state.mode === 'push-to-talk') {
    setTimeout(vadLoop, VAD_CONFIG.RECORDING_INTERVAL);
    return;
  }

  const now = Date.now();

  // Détection de voix
  if (volume > VAD_CONFIG.VOLUME_THRESHOLD) {
    state.lastSoundTime = now;

    // Démarrer l'enregistrement si pas déjà en cours
    if (!state.isRecording) {
      startRecording();
    }
  }

  // Détection de silence
  if (state.isRecording) {
    const silenceDuration = now - state.lastSoundTime;
    const recordingDuration = now - state.recordingStartTime;

    // Arrêter si silence détecté ET durée minimale atteinte
    if (silenceDuration > VAD_CONFIG.SILENCE_DURATION &&
        recordingDuration > VAD_CONFIG.MIN_RECORDING_DURATION) {
      stopRecording();
    }
  }

  // Continuer la boucle
  setTimeout(vadLoop, VAD_CONFIG.RECORDING_INTERVAL);
}

// Démarrer l'enregistrement
function startRecording() {
  if (state.isRecording || state.isSpeaking || !state.micEnabled) return;

  console.log('🎤 Début enregistrement');
  state.isRecording = true;
  state.audioChunks = [];
  state.recordingStartTime = Date.now();
  state.lastSoundTime = Date.now();

  updateStatus('listening', '🎤 Écoute en cours...');

  state.mediaRecorder.start();
}

// Arrêter l'enregistrement
function stopRecording() {
  if (!state.isRecording) return;

  console.log('⏸️ Arrêt enregistrement');
  state.isRecording = false;

  if (state.mediaRecorder.state === 'recording') {
    state.mediaRecorder.stop();
  }
}

// ===================================
// SYSTÈME DE QUEUE DE TRAITEMENT (DUPLEX)
// ===================================

// Ajouter un enregistrement à la queue de traitement
function addToProcessingQueue(audioBlob) {
  console.log(`📥 Ajout à la queue (taille actuelle: ${state.processingQueue.length})`);
  state.processingQueue.push(audioBlob);

  // Démarrer le traitement si pas déjà en cours
  if (!state.isProcessingAPI) {
    processNextInQueue();
  }
}

// Traiter le prochain élément de la queue
async function processNextInQueue() {
  if (state.processingQueue.length === 0) {
    state.isProcessingAPI = false;
    console.log('✅ Queue vide, traitement terminé');
    return;
  }

  state.isProcessingAPI = true;
  const audioBlob = state.processingQueue.shift();

  console.log(`🔄 Traitement (reste dans queue: ${state.processingQueue.length})`);

  try {
    await processAudio(audioBlob);
  } catch (error) {
    console.error('❌ Erreur traitement audio:', error);
  }

  // Continuer avec le suivant
  processNextInQueue();
}

// Traitement de l'audio enregistré
async function processAudio(audioBlob) {
  // Vérifier la taille du blob
  if (audioBlob.size < 1000) {
    console.log('⚠️ Audio trop court, ignoré');
    return;
  }

  updateStatus('translating', '🔄 Traduction en cours...');

  try {
    // 1. Transcription avec Whisper
    const transcription = await transcribeAudio(audioBlob);
    decrementQuota('transcribe'); // Décrémenter le quota transcription

    if (!transcription || transcription.length < 2) {
      console.log('⚠️ Transcription vide ou trop courte');
      updateStatus('listening', '🎧 Prêt à écouter...');
      return;
    }

    console.log('📝 Transcription:', transcription);

    // 2. Détection de la langue source basée sur les langues sélectionnées
    let sourceLang = state.lang1;
    let targetLang = state.lang2;

    // Détection intelligente: vérifier si c'est la langue 1 ou 2 qui a été parlée
    const hasChineseChars = /[\u4e00-\u9fff]/.test(transcription);

    // Si une des langues est le chinois, utiliser la détection des caractères chinois
    if (state.lang1 === 'zh' || state.lang2 === 'zh') {
      if (hasChineseChars) {
        sourceLang = 'zh';
        targetLang = sourceLang === state.lang1 ? state.lang2 : state.lang1;
      } else {
        sourceLang = state.lang1 === 'zh' ? state.lang2 : state.lang1;
        targetLang = sourceLang === state.lang1 ? state.lang2 : state.lang1;
      }
    } else {
      // Pour les autres langues, on assume que c'est lang1 qui parle
      sourceLang = state.lang1;
      targetLang = state.lang2;
    }

    console.log(`🔍 Langue détectée: ${sourceLang} → ${targetLang}`);

    // 3. Traduction (avec instruction stricte de ne traduire qu'entre les 2 langues)
    const translation = await translateText(transcription, targetLang, sourceLang);
    decrementQuota('translate'); // Décrémenter le quota traduction
    console.log('🌐 Traduction:', translation);

    // 4. Affichage dans les panneaux appropriés
    if (sourceLang === state.lang1) {
      addMessage('lang1', transcription);
      addMessage('lang2', translation);
    } else {
      addMessage('lang2', transcription);
      addMessage('lang1', translation);
    }

    // 4.5. Sauvegarder dans l'historique (en arrière-plan, sans bloquer)
    saveToHistory(transcription, translation, sourceLang, targetLang).catch(err => {
      console.error('⚠️ Erreur sauvegarde historique:', err);
    });

    // 5. Text-to-Speech de la traduction (si activé)
    if (state.ttsEnabled) {
      updateStatus('speaking', '🔊 Lecture audio...');
      await speakText(translation, targetLang);
      decrementQuota('speak'); // Décrémenter le quota TTS
    } else {
      updateStatus('listening', '🎧 Prêt à écouter...');
    }

  } catch (error) {
    console.error('❌ Erreur traitement:', error);
    updateStatus('idle', '⚠️ Erreur de traitement');
    setTimeout(() => {
      updateStatus('listening', '🎧 Prêt à écouter...');
    }, 2000);
  }
}

// Transcription audio avec Whisper
async function transcribeAudio(audioBlob) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'audio.webm');

  const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${state.token}`
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Erreur transcription: ${response.statusText}`);
  }

  const data = await response.json();
  return data.text?.trim();
}

// Traduction du texte
async function translateText(text, targetLanguage, sourceLanguage = null) {
  const response = await fetch(`${API_BASE_URL}/api/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.token}`
    },
    body: JSON.stringify({
      text,
      targetLanguage,
      sourceLanguage,  // Ajout de la langue source
      provider: state.provider
    })
  });

  if (!response.ok) {
    throw new Error(`Erreur traduction: ${response.statusText}`);
  }

  const data = await response.json();
  return data.translatedText;
}

// Sauvegarder une traduction dans l'historique
async function saveToHistory(original, translated, sourceLang, targetLang) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/history/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({
        original,
        translated,
        sourceLang,
        targetLang
      })
    });

    if (!response.ok) {
      console.warn('Échec sauvegarde historique:', response.statusText);
    }
  } catch (error) {
    console.error('Erreur sauvegarde historique:', error);
  }
}

// Créer un élément audio réutilisable pour iOS
const audioElement = new Audio();
audioElement.preload = 'auto';

// Text-to-Speech (compatible iOS)
async function speakText(text, language) {
  state.isSpeaking = true;

  // Choisir la voix selon la langue depuis la configuration
  const voice = LANGUAGES[language]?.voice || 'alloy';

  try {
    const response = await fetch(`${API_BASE_URL}/api/speak`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ text, voice })
    });

    if (!response.ok) {
      throw new Error(`Erreur TTS: ${response.statusText}`);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        URL.revokeObjectURL(audioUrl);
        audioElement.removeEventListener('ended', onEnded);
        audioElement.removeEventListener('error', onError);
      };

      const onEnded = () => {
        state.isSpeaking = false;
        updateStatus('listening', '🎧 Prêt à écouter...');
        cleanup();
        resolve();
      };

      const onError = (error) => {
        state.isSpeaking = false;
        updateStatus('listening', '🎧 Prêt à écouter...');
        cleanup();
        reject(error);
      };

      audioElement.addEventListener('ended', onEnded);
      audioElement.addEventListener('error', onError);

      // iOS fix: définir la source et jouer immédiatement
      audioElement.src = audioUrl;
      audioElement.load();

      // Tenter de jouer avec gestion des promesses (iOS nécessite ça)
      const playPromise = audioElement.play();

      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.error('Erreur playback audio:', error);
          // Sur iOS, si autoplay échoue, on continue quand même
          state.isSpeaking = false;
          updateStatus('listening', '🎧 Prêt à écouter...');
          cleanup();
          reject(error);
        });
      }
    });

  } catch (error) {
    state.isSpeaking = false;
    updateStatus('listening', '🎧 Prêt à écouter...');
    throw error;
  }
}

// Initialisation du microphone et du système audio
async function initializeAudio() {
  try {
    // Obtenir l'accès au microphone
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000
      }
    });

    // Configuration de l'analyseur audio (VAD)
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 2048;
    state.analyser.smoothingTimeConstant = 0.8;

    const source = state.audioContext.createMediaStreamSource(stream);
    source.connect(state.analyser);

    // Configuration du MediaRecorder
    state.mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    state.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        state.audioChunks.push(event.data);
      }
    };

    state.mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
      state.audioChunks = [];

      // Ajouter à la queue au lieu de traiter immédiatement
      addToProcessingQueue(audioBlob);
    };

    // Tout est prêt
    elements.permissionModal.classList.add('hidden');
    updateStatus('listening', '🎧 Prêt à écouter...');

    // Afficher le VU-mètre
    const vuMeter = document.getElementById('vuMeter');
    if (vuMeter) {
      vuMeter.classList.remove('hidden');
    }

    // Démarrer la boucle VAD
    vadLoop();

    // Initialiser le bouton push-to-talk
    initPushToTalk();

    console.log('✅ Système audio initialisé');

  } catch (error) {
    console.error('❌ Erreur initialisation audio:', error);
    updateStatus('idle', '⚠️ Erreur microphone');
  }
}

// Initialiser les événements push-to-talk
function initPushToTalk() {
  const pushToTalkBtn = document.getElementById('pushToTalkBtn');
  const pushToTalkBtnMobile = document.getElementById('pushToTalkBtnMobile');

  // Fonction de début d'enregistrement
  const startPTT = (e) => {
    e.preventDefault();
    if (state.mode !== 'push-to-talk' || state.isRecording || state.isSpeaking) return;

    if (pushToTalkBtn) pushToTalkBtn.classList.add('recording');
    if (pushToTalkBtnMobile) pushToTalkBtnMobile.classList.add('recording');
    startRecording();
    updateStatus('listening', '🎤 Enregistrement...');
  };

  // Fonction de fin d'enregistrement
  const stopPTT = (e) => {
    e.preventDefault();
    if (state.mode !== 'push-to-talk' || !state.isRecording) return;

    if (pushToTalkBtn) pushToTalkBtn.classList.remove('recording');
    if (pushToTalkBtnMobile) pushToTalkBtnMobile.classList.remove('recording');
    stopRecording();
  };

  // Desktop events
  if (pushToTalkBtn) {
    pushToTalkBtn.addEventListener('mousedown', startPTT);
    pushToTalkBtn.addEventListener('mouseup', stopPTT);
    pushToTalkBtn.addEventListener('mouseleave', stopPTT);

    // Mobile touch events
    pushToTalkBtn.addEventListener('touchstart', startPTT);
    pushToTalkBtn.addEventListener('touchend', stopPTT);
    pushToTalkBtn.addEventListener('touchcancel', stopPTT);
  }

  // Mobile button events
  if (pushToTalkBtnMobile) {
    pushToTalkBtnMobile.addEventListener('mousedown', startPTT);
    pushToTalkBtnMobile.addEventListener('mouseup', stopPTT);
    pushToTalkBtnMobile.addEventListener('mouseleave', stopPTT);

    pushToTalkBtnMobile.addEventListener('touchstart', startPTT);
    pushToTalkBtnMobile.addEventListener('touchend', stopPTT);
    pushToTalkBtnMobile.addEventListener('touchcancel', stopPTT);
  }

  console.log('✅ Push-to-Talk initialisé');
}

// Demande de permission microphone
async function requestMicrophonePermission() {
  await detectProvider();

  // iOS Audio Context unlock - nécessaire pour iOS
  if (state.audioContext && state.audioContext.state === 'suspended') {
    await state.audioContext.resume();
  }

  // iOS Audio Element unlock - jouer un son silencieux pour débloquer l'audio
  try {
    audioElement.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    await audioElement.play();
    audioElement.pause();
    audioElement.currentTime = 0;
    console.log('✅ iOS audio débloqué');
  } catch (e) {
    console.log('⚠️ Impossible de débloquer audio iOS:', e);
  }

  await initializeAudio();
}

// ===================================
// GESTION DU PROFIL UTILISATEUR
// ===================================

// Afficher le panneau profil
async function showProfilePanel() {
  const profilePanel = document.getElementById('profilePanel');
  profilePanel.classList.remove('hidden');

  // Charger les informations du profil
  document.getElementById('profileEmail').textContent = state.user.email;
  document.getElementById('profileDisplayName').textContent = state.user.displayName || state.user.email.split('@')[0];

  // Charger et afficher l'avatar
  updateAvatarPreview(state.user.avatar);

  // Charger l'abonnement et les quotas
  try {
    const response = await fetch(`${API_BASE_URL}/api/subscription/info`, {
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      const sub = data.subscription;

      // Afficher le palier
      const tierIcons = { free: '🆓', personnel: '👤', premium: '⭐', enterprise: '💎', admin: '👑' };
      const tierNames = { free: 'Gratuit', personnel: 'Personnel', premium: 'Premium', enterprise: 'Enterprise', admin: 'Admin' };
      document.getElementById('profileTier').textContent =
        `${tierIcons[sub.tier] || '📦'} ${tierNames[sub.tier] || sub.tier.toUpperCase()}`;

      // Afficher les quotas
      const quotasDiv = document.getElementById('profileQuotas');
      if (sub.quotas.transcribe.limit === -1) {
        quotasDiv.innerHTML = '✨ Quotas illimités';
      } else {
        quotasDiv.innerHTML = `
          🎤 Transcriptions: ${sub.quotas.transcribe.limit - sub.quotas.transcribe.used}/${sub.quotas.transcribe.limit} restants<br>
          🔄 Traductions: ${sub.quotas.translate.limit - sub.quotas.translate.used}/${sub.quotas.translate.limit} restants<br>
          🔊 TTS: ${sub.quotas.speak.limit - sub.quotas.speak.used}/${sub.quotas.speak.limit} restants
        `;
      }
    }
  } catch (error) {
    console.error('Erreur chargement quotas:', error);
    document.getElementById('profileQuotas').textContent = 'Erreur chargement des quotas';
  }
}

// Fermer le panneau profil
function closeProfilePanel() {
  const profilePanel = document.getElementById('profilePanel');
  profilePanel.classList.add('hidden');

  // Réinitialiser les formulaires
  document.getElementById('currentPassword').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('confirmNewPassword').value = '';
  document.getElementById('deleteAccountPassword').value = '';
  document.getElementById('historyContainer').style.display = 'none';
}

// Changer le mot de passe
async function changePassword() {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmNewPassword = document.getElementById('confirmNewPassword').value;
  const messageDiv = document.getElementById('changePasswordMessage');

  if (!currentPassword || !newPassword || !confirmNewPassword) {
    messageDiv.className = 'error-message';
    messageDiv.textContent = '⚠️ Tous les champs sont requis';
    messageDiv.classList.remove('hidden');
    return;
  }

  if (newPassword !== confirmNewPassword) {
    messageDiv.className = 'error-message';
    messageDiv.textContent = '⚠️ Les nouveaux mots de passe ne correspondent pas';
    messageDiv.classList.remove('hidden');
    return;
  }

  if (newPassword.length < 6) {
    messageDiv.className = 'error-message';
    messageDiv.textContent = '⚠️ Le mot de passe doit contenir au moins 6 caractères';
    messageDiv.classList.remove('hidden');
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erreur lors du changement de mot de passe');
    }

    messageDiv.className = 'success-message';
    if (data.historyCleared) {
      messageDiv.textContent = '✅ Mot de passe modifié avec succès. ⚠️ Votre historique de traductions a été supprimé pour des raisons de sécurité (le cryptage utilise votre mot de passe).';
    } else {
      messageDiv.textContent = '✅ Mot de passe modifié avec succès';
    }
    messageDiv.classList.remove('hidden');

    // Réinitialiser les champs
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';

    // Masquer le message après 3 secondes
    setTimeout(() => {
      messageDiv.classList.add('hidden');
    }, 3000);

  } catch (error) {
    console.error('Erreur changement mot de passe:', error);
    messageDiv.className = 'error-message';
    messageDiv.textContent = `❌ ${error.message}`;
    messageDiv.classList.remove('hidden');
  }
}

// Voir l'historique
async function viewHistory() {
  const historyContainer = document.getElementById('historyContainer');
  const historyContent = document.getElementById('historyContent');

  try {
    historyContent.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;"><p>Chargement...</p></div>';
    historyContainer.style.display = 'block';

    const response = await fetch(`${API_BASE_URL}/api/history`, {
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });

    if (!response.ok) {
      throw new Error('Erreur lors de la récupération de l\'historique');
    }

    const data = await response.json();
    const history = data.history;

    if (!history || history.length === 0) {
      historyContent.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;"><p>Aucun historique</p></div>';
      return;
    }

    // Afficher l'historique (du plus récent au plus ancien)
    const historyHTML = history.reverse().map(item => {
      const date = new Date(item.timestamp).toLocaleString('fr-FR');
      const sourceLangName = LANGUAGES[item.sourceLang]?.nativeName || item.sourceLang;
      const targetLangName = LANGUAGES[item.targetLang]?.nativeName || item.targetLang;

      return `
        <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin-bottom: 10px;">
          <div style="color: #888; font-size: 0.85em; margin-bottom: 5px;">${date} • ${sourceLangName} → ${targetLangName}</div>
          <div style="color: #fff; margin-bottom: 5px;"><strong>Original:</strong> ${escapeHtml(item.original)}</div>
          <div style="color: #00ff9d;"><strong>Traduction:</strong> ${escapeHtml(item.translated)}</div>
        </div>
      `;
    }).join('');

    historyContent.innerHTML = `
      <div style="margin-bottom: 10px; text-align: right; color: #888; font-size: 0.9em;">
        Total: ${history.length} traductions
      </div>
      ${historyHTML}
    `;

  } catch (error) {
    console.error('Erreur récupération historique:', error);
    historyContent.innerHTML = '<div style="text-align: center; padding: 20px; color: #ff6b6b;"><p>❌ Erreur lors du chargement</p></div>';
  }
}

// Supprimer l'historique
async function deleteHistory() {
  if (!confirm('Êtes-vous sûr de vouloir supprimer tout votre historique de traductions ?\n\nCette action est irréversible.')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/history`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });

    if (!response.ok) {
      throw new Error('Erreur lors de la suppression de l\'historique');
    }

    alert('✅ Historique supprimé avec succès');

    // Masquer le conteneur d'historique
    document.getElementById('historyContainer').style.display = 'none';

  } catch (error) {
    console.error('Erreur suppression historique:', error);
    alert(`❌ ${error.message}`);
  }
}

// Supprimer le compte
async function deleteAccount() {
  const password = document.getElementById('deleteAccountPassword').value;
  const messageDiv = document.getElementById('deleteAccountMessage');

  if (!password) {
    messageDiv.className = 'error-message';
    messageDiv.textContent = '⚠️ Veuillez entrer votre mot de passe';
    messageDiv.classList.remove('hidden');
    return;
  }

  if (!confirm('⚠️ ATTENTION ⚠️\n\nÊtes-vous absolument sûr de vouloir supprimer votre compte ?\n\nToutes vos données seront définitivement supprimées :\n- Votre compte utilisateur\n- Votre historique de traductions\n- Votre abonnement\n\nCette action est IRRÉVERSIBLE.\n\nTapez OUI pour confirmer')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erreur lors de la suppression du compte');
    }

    alert('✅ Votre compte a été supprimé avec succès.\n\nVous allez être déconnecté.');

    // Déconnecter et recharger
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    window.location.reload();

  } catch (error) {
    console.error('Erreur suppression compte:', error);
    messageDiv.className = 'error-message';
    messageDiv.textContent = `❌ ${error.message}`;
    messageDiv.classList.remove('hidden');
  }
}

// Initialisation au chargement
window.addEventListener('load', () => {
  console.log('🚀 RealTranslate chargé');

  // Détecter la langue du navigateur pour l'interface
  detectBrowserLanguage();
  console.log(`🌐 Langue détectée: ${currentUILang}`);

  // Vérifier si l'utilisateur est déjà connecté
  // Si pas de token, la page de connexion est déjà visible par défaut
  checkAuth();
});

// Gestion du réveil de l'application (mobile/iOS)
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && state.audioContext) {
    await state.audioContext.resume();
    console.log('🔊 Audio Context resumed');
  }
});

// iOS: reprendre le contexte audio sur tout click/touch
document.addEventListener('touchstart', async () => {
  if (state.audioContext && state.audioContext.state === 'suspended') {
    await state.audioContext.resume();
  }
}, { once: true });

// Gestion du resize - rafraîchir l'affichage des quotas
window.addEventListener('resize', () => {
  updateQuotasDisplay();
});

// ===================================
// GESTION DU PROFIL - DISPLAYNAME
// ===================================

async function updateDisplayName() {
  const newDisplayName = document.getElementById('newDisplayName').value;
  const messageDiv = document.getElementById('displayNameMessage');

  if (!newDisplayName || newDisplayName.trim().length < 2) {
    messageDiv.textContent = '❌ Le nom doit contenir au moins 2 caractères';
    messageDiv.style.color = '#ff6b6b';
    messageDiv.classList.remove('hidden');
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/profile/displayname`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ displayName: newDisplayName })
    });

    const data = await response.json();

    if (response.ok) {
      messageDiv.textContent = `✅ Nom d'affichage mis à jour: ${data.displayName}`;
      messageDiv.style.color = '#00ff9d';
      messageDiv.classList.remove('hidden');

      document.getElementById('profileDisplayName').textContent = data.displayName;
      document.getElementById('newDisplayName').value = '';

      // Rafraîchir les infos du profil
      setTimeout(() => {
        messageDiv.classList.add('hidden');
      }, 3000);
    } else {
      messageDiv.textContent = `❌ ${data.error}`;
      messageDiv.style.color = '#ff6b6b';
      messageDiv.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error updating display name:', error);
    messageDiv.textContent = '❌ Erreur lors de la mise à jour';
    messageDiv.style.color = '#ff6b6b';
    messageDiv.classList.remove('hidden');
  }
}

// ===================================
// GESTION DES AMIS
// ===================================

let friendsData = {
  friends: [],
  requests: []
};

function showFriendsPanel() {
  document.getElementById('friendsPanel').classList.remove('hidden');
  loadFriendsData();
}

function closeFriendsPanel() {
  document.getElementById('friendsPanel').classList.add('hidden');
}

async function loadFriendsData() {
  try {
    // Charger les amis
    const friendsResponse = await fetch(`${API_BASE_URL}/api/friends`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const friendsData = await friendsResponse.json();

    // Charger les demandes
    const requestsResponse = await fetch(`${API_BASE_URL}/api/friends/requests`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const requestsData = await requestsResponse.json();

    displayFriendRequests(requestsData.requests || []);
    displayFriendsList(friendsData.friends || []);

    friendsData.friends = friendsData.friends || [];
    friendsData.requests = requestsData.requests || [];
  } catch (error) {
    console.error('Error loading friends data:', error);
  }
}

function displayFriendRequests(requests) {
  const container = document.getElementById('friendRequestsContent');

  if (requests.length === 0) {
    container.innerHTML = `<p style="color: #888;">${t('noPendingRequests')}</p>`;
    return;
  }

  container.innerHTML = requests.map(req => `
    <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="color: #fff; font-weight: bold;">${escapeHtml(req.fromDisplayName)}</div>
        <div style="color: #888; font-size: 0.85em;">${escapeHtml(req.from)}</div>
        <div style="color: #666; font-size: 0.8em; margin-top: 4px;">${new Date(req.sentAt).toLocaleDateString()}</div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button onclick="acceptFriendRequest('${escapeAttr(req.from)}')" style="background: #00ff9d; color: #000; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold;">✓ ${t('accept')}</button>
        <button onclick="rejectFriendRequest('${escapeAttr(req.from)}')" style="background: #ff6b6b; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">✕ ${t('reject')}</button>
      </div>
    </div>
  `).join('');
}

function displayFriendsList(friends) {
  const container = document.getElementById('friendsListContent');

  if (friends.length === 0) {
    container.innerHTML = `<p style="color: #888;">${t('noFriends')}</p>`;
    return;
  }

  container.innerHTML = friends.map(friend => `
    <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="color: #fff; font-weight: bold;">${escapeHtml(friend.displayName)}</div>
        <div style="color: #888; font-size: 0.85em;">${escapeHtml(friend.email)}</div>
      </div>
      <button onclick="removeFriend('${escapeAttr(friend.email)}')" style="background: #ff6b6b; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">${t('remove')}</button>
    </div>
  `).join('');
}

async function searchUsers() {
  const searchTerm = document.getElementById('searchUserInput').value;
  const resultsDiv = document.getElementById('searchResults');
  const contentDiv = document.getElementById('searchResultsContent');

  if (!searchTerm || searchTerm.trim().length < 2) {
    contentDiv.innerHTML = `<p style="color: #888;">${t('minTwoChars')}</p>`;
    resultsDiv.style.display = 'block';
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/friends/search?q=${encodeURIComponent(searchTerm)}`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await response.json();

    if (data.users && data.users.length > 0) {
      contentDiv.innerHTML = data.users.map(user => `
        <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="color: #fff; font-weight: bold;">${escapeHtml(user.displayName)}</div>
            <div style="color: #888; font-size: 0.85em;">${escapeHtml(user.email)}</div>
          </div>
          <button onclick="sendFriendRequest('${escapeAttr(user.email)}')" style="background: #00ff9d; color: #000; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold;">+ ${t('addFriend')}</button>
        </div>
      `).join('');
    } else {
      contentDiv.innerHTML = `<p style="color: #888;">${t('noUserFound')}</p>`;
    }

    resultsDiv.style.display = 'block';
  } catch (error) {
    console.error('Error searching users:', error);
    contentDiv.innerHTML = `<p style="color: #ff6b6b;">${t('searchError')}</p>`;
    resultsDiv.style.display = 'block';
  }
}

async function sendFriendRequest(toEmail) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/friends/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ toEmail })
    });

    const data = await response.json();

    if (response.ok) {
      alert(`✅ ${data.message}`);
    } else {
      alert(`❌ ${data.error}`);
    }
  } catch (error) {
    console.error('Error sending friend request:', error);
    alert('❌ Erreur lors de l\'envoi de la demande');
  }
}

async function acceptFriendRequest(fromEmail) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/friends/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ fromEmail })
    });

    const data = await response.json();

    if (response.ok) {
      alert(`✅ ${data.message}`);
      loadFriendsData(); // Rafraîchir
    } else {
      alert(`❌ ${data.error}`);
    }
  } catch (error) {
    console.error('Error accepting friend request:', error);
    alert('❌ Erreur');
  }
}

async function rejectFriendRequest(fromEmail) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/friends/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ fromEmail })
    });

    const data = await response.json();

    if (response.ok) {
      loadFriendsData(); // Rafraîchir
    } else {
      alert(`❌ ${data.error}`);
    }
  } catch (error) {
    console.error('Error rejecting friend request:', error);
  }
}

async function removeFriend(friendEmail) {
  if (!confirm('Êtes-vous sûr de vouloir retirer cet ami ?')) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/friends/${friendEmail}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    const data = await response.json();

    if (response.ok) {
      loadFriendsData(); // Rafraîchir
    } else {
      alert(`❌ ${data.error}`);
    }
  } catch (error) {
    console.error('Error removing friend:', error);
  }
}

// ===================================
// GESTION DES GROUPES
// ===================================

let groupsData = {
  groups: [],
  currentGroup: null
};

function showGroupsPanel() {
  // En mode Communication ou non, afficher le panneau latéral
  document.getElementById('groupsPanel').classList.remove('hidden');
  loadGroupsData();
}

function closeGroupsPanel() {
  document.getElementById('groupsPanel').classList.add('hidden');
}

// ===================================
// PANNEAU MESSAGES PRIVÉS (DM)
// ===================================

let currentDMUser = null;
let selectedDMFile = null;
let currentDMMessages = [];

// Afficher le panneau des DMs
function showDMsPanel() {
  // Si en mode Communication, ouvrir la modal de sélection d'utilisateur
  const interfaceMode = localStorage.getItem('interface_mode');
  if (interfaceMode === 'communication') {
    showNewDMModal();
    return;
  }

  // Sinon, afficher le panneau latéral traditionnel
  document.getElementById('dmsPanel').classList.remove('hidden');
  loadDMConversations();
}

// Fermer le panneau des DMs
function closeDMsPanel() {
  document.getElementById('dmsPanel').classList.add('hidden');
}

// Afficher la modal de sélection d'utilisateur pour nouveau DM
function showNewDMModal() {
  document.getElementById('newDMModal').classList.remove('hidden');
  loadUsersList();
}

// Fermer la modal de sélection d'utilisateur
function closeNewDMModal() {
  document.getElementById('newDMModal').classList.add('hidden');
}

// Charger la liste des utilisateurs pour nouveau DM
async function loadUsersList() {
  const content = document.getElementById('userSelectionContent');

  try {
    content.innerHTML = '<div style="text-align: center; padding: 20px;">Chargement...</div>';

    const response = await fetch(`${API_BASE_URL}/api/users/list`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (!response.ok) {
      throw new Error('Failed to load users');
    }

    const data = await response.json();

    if (data.users.length === 0) {
      content.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Aucun utilisateur disponible</div>';
      return;
    }

    // Afficher la liste des utilisateurs
    let html = '<div style="display: flex; flex-direction: column; gap: 10px;">';

    for (const user of data.users) {
      const avatarUrl = user.avatar || '/icon-192.png';
      const roleIcon = user.role === 'admin' ? '👑' : '';

      html += `
        <div style="display: flex; align-items: center; gap: 15px; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; cursor: pointer; transition: background 0.2s;"
             onclick="startDMWithUser('${user.email}')"
             onmouseover="this.style.background='rgba(255,255,255,0.1)'"
             onmouseout="this.style.background='rgba(255,255,255,0.05)'">
          <img src="${avatarUrl}" alt="Avatar" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
          <div style="flex: 1;">
            <div style="font-weight: bold; color: var(--accent-primary);">${roleIcon} ${user.name}</div>
            <div style="font-size: 0.85em; color: #888;">${user.email}</div>
          </div>
          <div style="color: var(--accent-secondary); font-size: 1.2em;">→</div>
        </div>
      `;
    }

    html += '</div>';
    content.innerHTML = html;

  } catch (error) {
    logger.error('Error loading users list', error);
    content.innerHTML = '<div style="text-align: center; padding: 20px; color: #f44;">Erreur lors du chargement des utilisateurs</div>';
  }
}

// Démarrer une conversation DM avec un utilisateur
async function startDMWithUser(recipientEmail) {
  try {
    // Fermer la modal
    closeNewDMModal();

    // Ouvrir le chat DM avec cet utilisateur
    await openDMChat(recipientEmail);

  } catch (error) {
    console.error('Error starting DM', error);
    alert('Erreur lors du démarrage de la conversation');
  }
}

// Charger les conversations DM
async function loadDMConversations() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/dms`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (!response.ok) {
      throw new Error('Failed to load conversations');
    }

    const data = await response.json();
    displayDMsList(data.conversations || []);
  } catch (error) {
    console.error('Error loading DM conversations:', error);
    document.getElementById('dmsListContent').innerHTML = '<p style="color: #ff6b6b;">❌ Erreur de chargement</p>';
  }
}

// Afficher la liste des conversations
function displayDMsList(conversations) {
  const container = document.getElementById('dmsListContent');

  if (conversations.length === 0) {
    container.innerHTML = '<p style="color: #888;">Aucune conversation. Envoyez un message à un ami pour démarrer !</p>';
    return;
  }

  container.innerHTML = conversations.map(conv => {
    const lastMsg = conv.lastMessage;
    const lastMsgText = lastMsg ? (lastMsg.content.substring(0, 50) + (lastMsg.content.length > 50 ? '...' : '')) : 'Nouvelle conversation';
    const lastMsgTime = lastMsg ? new Date(lastMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const onlineIndicator = getOnlineIndicator(conv.otherUser.email);

    return `
      <div onclick="openDMChat('${escapeAttr(conv.otherUser.email)}')" style="padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 50px; height: 50px; position: relative;">
            ${generateAvatarHTML(conv.otherUser, 50)}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: bold; color: #fff; margin-bottom: 4px; display: flex; align-items: center;">
              ${onlineIndicator}${escapeHtml(conv.otherUser.displayName)}
            </div>
            <div style="color: #888; font-size: 0.9em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(lastMsgText)}</div>
          </div>
          <div style="color: #888; font-size: 0.85em; white-space: nowrap;">${lastMsgTime}</div>
        </div>
      </div>
    `;
  }).join('');
}

// Ouvrir une conversation DM
async function openDMChat(userEmail) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/dms/${userEmail}`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (!response.ok) {
      throw new Error('Failed to load conversation');
    }

    const data = await response.json();

    currentDMUser = data.otherUser;
    currentDMMessages = data.messages || [];

    // Afficher le panel de chat DM
    document.getElementById('dmChatPanel').classList.remove('hidden');
    document.getElementById('dmsPanel').classList.add('hidden');
    document.getElementById('communicationHome').classList.add('hidden');

    // Mise à jour de l'UI
    const onlineIndicator = getOnlineIndicator(currentDMUser.email);
    document.getElementById('dmChatTitle').innerHTML = `💬 <span style="display: inline-flex; align-items: center;">${onlineIndicator}${escapeHtml(currentDMUser.displayName)}</span>`;
    document.getElementById('dmUserName').textContent = currentDMUser.displayName;
    document.getElementById('dmUserEmail').textContent = currentDMUser.email;
    document.getElementById('dmUserAvatar').innerHTML = generateAvatarHTML(currentDMUser, 40);

    // Afficher les messages
    displayDMMessages(currentDMMessages);

  } catch (error) {
    console.error('Error opening DM chat:', error);
    alert('❌ Erreur lors de l\'ouverture de la conversation');
  }
}

// Fermer le panel de chat DM
function closeDMChatPanel() {
  document.getElementById('dmChatPanel').classList.add('hidden');
  currentDMUser = null;
  currentDMMessages = [];
  document.getElementById('dmMessageInput').value = '';
  if (selectedDMFile) {
    cancelDMFileSelection();
  }
  // Retourner à la liste des DMs
  showDMsPanel();
}

// Afficher les messages DM
function displayDMMessages(messages) {
  const container = document.getElementById('dmMessagesContent');
  const userLang = state.lang1;

  if (messages.length === 0) {
    container.innerHTML = '<p style="color: #888; text-align: center;">Aucun message. Commencez la conversation !</p>';
    return;
  }

  container.innerHTML = messages.map(msg => {
    const translation = msg.translations[userLang] || msg.content;
    const isOwnMessage = msg.from === state.user.email;

    return `
      <div style="margin-bottom: 16px; display: flex; flex-direction: column; align-items: ${isOwnMessage ? 'flex-end' : 'flex-start'};">
        <div style="display: inline-block; max-width: 70%;">
          <div style="background: ${isOwnMessage ? 'var(--message-bg-own)' : 'var(--message-bg-other)'}; color: ${isOwnMessage ? 'var(--message-text-own)' : 'var(--message-text-other)'}; padding: 10px 14px; border-radius: 12px; word-wrap: break-word;">
            ${msg.fileInfo ? '' : `<div>${escapeHtml(translation)}</div>`}
            ${msg.fileInfo ? generateFileDisplay(msg.fileInfo) : ''}
            ${msg.fileInfo && translation ? `<div style="margin-top: 8px;">${escapeHtml(translation)}</div>` : ''}
            <div style="font-size: 0.75em; margin-top: 4px; opacity: 0.6;">${new Date(msg.timestamp).toLocaleTimeString()}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Scroll vers le bas
  container.scrollTop = container.scrollHeight;
}

// Envoyer un message DM
async function sendDM() {
  const input = document.getElementById('dmMessageInput');
  const content = input.value.trim();

  if (!content && !selectedDMFile) return;
  if (!currentDMUser) return;

  if (!socket || !socket.connected) {
    alert('❌ Non connecté au serveur');
    return;
  }

  let fileInfo = null;

  // Upload du fichier si sélectionné
  if (selectedDMFile) {
    try {
      const sendBtn = document.getElementById('dmSendBtn');
      sendBtn.disabled = true;
      sendBtn.textContent = '📤 Envoi...';

      fileInfo = await uploadFile(selectedDMFile);

      sendBtn.disabled = false;
      sendBtn.textContent = 'Envoyer';
    } catch (error) {
      alert('❌ Erreur lors de l\'envoi du fichier');
      const sendBtn = document.getElementById('dmSendBtn');
      sendBtn.disabled = false;
      sendBtn.textContent = 'Envoyer';
      return;
    }
  }

  // Envoyer via Socket.IO
  socket.emit('send_dm', {
    toEmail: currentDMUser.email,
    content: content || (selectedDMFile ? selectedDMFile.name : ''),
    userLang: state.lang1,
    fileInfo: fileInfo
  });

  input.value = '';

  // Réinitialiser fichier
  if (selectedDMFile) {
    cancelDMFileSelection();
  }
}

// Gestion du typing dans DM
let dmTypingTimeout = null;
let isDMTyping = false;

function handleDMTyping() {
  if (!currentDMUser) return;
  // À implémenter plus tard avec Socket.IO typing indicator
}

// Sélection fichier DM
function handleDMFileSelection(event) {
  const file = event.target.files[0];
  if (!file) return;

  const maxSize = 25 * 1024 * 1024;
  if (file.size > maxSize) {
    alert('❌ Fichier trop volumineux. Taille maximale: 25MB');
    event.target.value = '';
    return;
  }

  selectedDMFile = file;

  const previewArea = document.getElementById('dmFilePreviewArea');
  const previewName = document.getElementById('dmFilePreviewName');

  const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
  previewName.textContent = `📎 ${file.name} (${sizeInMB} MB)`;
  previewArea.style.display = 'block';

  event.target.value = '';
}

// Annuler sélection fichier DM
function cancelDMFileSelection() {
  selectedDMFile = null;
  const previewArea = document.getElementById('dmFilePreviewArea');
  previewArea.style.display = 'none';
  document.getElementById('dmFileInput').value = '';
}

async function loadGroupsData() {
  try {
    // Charger les groupes
    const groupsResponse = await fetch(`${API_BASE_URL}/api/groups`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await groupsResponse.json();

    groupsData.groups = data.groups || [];
    displayGroupsList(groupsData.groups);

    // Charger les amis pour la sélection
    const friendsResponse = await fetch(`${API_BASE_URL}/api/friends`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const friendsData = await friendsResponse.json();
    displayFriendsSelection(friendsData.friends || []);
  } catch (error) {
    console.error('Error loading groups:', error);
  }
}

function displayFriendsSelection(friends) {
  const container = document.getElementById('friendsSelectionList');

  if (friends.length === 0) {
    container.innerHTML = `<p style="color: #888;">${t('noFriendsAddInTab')}</p>`;
    return;
  }

  container.innerHTML = friends.map(friend => `
    <label style="display: flex; align-items: center; padding: 8px; cursor: pointer; border-radius: 6px; margin-bottom: 8px; background: rgba(255,255,255,0.03);" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
      <input type="checkbox" value="${escapeAttr(friend.email)}" style="margin-right: 10px; width: 18px; height: 18px; cursor: pointer;">
      <div>
        <div style="color: #fff;">${escapeHtml(friend.displayName)}</div>
        <div style="color: #666; font-size: 0.8em;">${escapeHtml(friend.email)}</div>
      </div>
    </label>
  `).join('');
}

function displayGroupsList(groups) {
  const container = document.getElementById('groupsListContent');

  if (groups.length === 0) {
    container.innerHTML = `<p style="color: #888;">${t('noGroups')}</p>`;
    return;
  }

  container.innerHTML = groups.map(group => {
    const unreadCount = unreadMessages[group.id] || 0;
    const badgeHTML = unreadCount > 0 ? `
      <div style="position: absolute; top: 8px; right: 8px; background: linear-gradient(135deg, #ff6b6b, #ff9d00); color: #fff; border-radius: 12px; padding: 4px 10px; font-size: 0.75em; font-weight: bold; box-shadow: 0 2px 8px rgba(255,107,107,0.4);">
        ${unreadCount > 99 ? '99+' : unreadCount}
      </div>
    ` : '';

    // Icône de visibilité
    const visibilityIcon = group.visibility === 'public' ? '🌐' : '🔒';
    const visibilityText = group.visibility === 'public' ? 'Public' : 'Privé';

    return `
      <div style="position: relative; background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin-bottom: 10px; cursor: pointer; transition: all 0.2s;" onclick="openGroupChat('${escapeAttr(group.id)}')" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
        ${badgeHTML}
        <div style="color: #fff; font-weight: bold; margin-bottom: 4px;">
          <span title="${visibilityText}">${visibilityIcon}</span> ${escapeHtml(group.name)}
        </div>
        <div style="color: #888; font-size: 0.85em;">${group.members.length} ${t('members')}</div>
        <div style="color: #666; font-size: 0.8em; margin-top: 4px;">${t('createdOn')} ${new Date(group.createdAt).toLocaleDateString()}</div>
      </div>
    `;
  }).join('');
}

async function createGroup() {
  const groupName = document.getElementById('groupName').value;
  const messageDiv = document.getElementById('createGroupMessage');

  if (!groupName || groupName.trim().length < 2) {
    messageDiv.textContent = '❌ Le nom du groupe doit contenir au moins 2 caractères';
    messageDiv.style.color = '#ff6b6b';
    messageDiv.classList.remove('hidden');
    return;
  }

  // Récupérer la visibilité sélectionnée
  const visibilityRadio = document.querySelector('input[name="groupVisibility"]:checked');
  const visibility = visibilityRadio ? visibilityRadio.value : 'private';

  // Récupérer les amis sélectionnés
  const checkboxes = document.querySelectorAll('#friendsSelectionList input[type="checkbox"]:checked');
  const memberEmails = Array.from(checkboxes).map(cb => cb.value);

  if (memberEmails.length === 0) {
    messageDiv.textContent = '❌ Sélectionnez au moins un ami à ajouter au groupe';
    messageDiv.style.color = '#ff6b6b';
    messageDiv.classList.remove('hidden');
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ name: groupName, memberEmails, visibility })
    });

    const data = await response.json();

    if (response.ok) {
      messageDiv.textContent = `✅ Groupe "${data.group.name}" créé avec succès!`;
      messageDiv.style.color = '#00ff9d';
      messageDiv.classList.remove('hidden');

      document.getElementById('groupName').value = '';
      document.querySelectorAll('#friendsSelectionList input[type="checkbox"]').forEach(cb => cb.checked = false);

      loadGroupsData(); // Rafraîchir

      setTimeout(() => {
        messageDiv.classList.add('hidden');
      }, 3000);
    } else {
      messageDiv.textContent = `❌ ${data.error}`;
      messageDiv.style.color = '#ff6b6b';
      messageDiv.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error creating group:', error);
    messageDiv.textContent = '❌ Erreur lors de la création du groupe';
    messageDiv.style.color = '#ff6b6b';
    messageDiv.classList.remove('hidden');
  }
}

// Parcourir les groupes publics
async function browsePublicGroups() {
  const container = document.getElementById('publicGroupsContainer');
  const content = document.getElementById('publicGroupsContent');

  container.classList.remove('hidden');
  content.innerHTML = '<p style="color: #888;">Chargement des groupes publics...</p>';

  try {
    const response = await fetch(`${API_BASE_URL}/api/groups/public`, {
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });

    if (!response.ok) {
      throw new Error('Erreur lors du chargement');
    }

    const data = await response.json();
    displayPublicGroups(data.groups || []);
  } catch (error) {
    console.error('Error browsing public groups:', error);
    content.innerHTML = '<p style="color: #ff6b6b;">❌ Erreur lors du chargement des groupes publics</p>';
  }
}

// Afficher les groupes publics
function displayPublicGroups(groups) {
  const content = document.getElementById('publicGroupsContent');

  if (groups.length === 0) {
    content.innerHTML = '<p style="color: #888;">Aucun groupe public disponible pour le moment.</p>';
    return;
  }

  content.innerHTML = groups.map(group => {
    const buttonHtml = group.isMember
      ? `<button disabled style="background: #888; cursor: not-allowed; padding: 6px 12px; border: none; border-radius: 6px; color: #fff; font-size: 0.85em;">✓ Déjà membre</button>`
      : `<button onclick="joinPublicGroup('${escapeAttr(group.id)}')" style="background: #00ff9d; cursor: pointer; padding: 6px 12px; border: none; border-radius: 6px; color: #000; font-weight: bold; font-size: 0.85em;">➕ Rejoindre</button>`;

    return `
      <div style="padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: bold; color: #fff; margin-bottom: 4px;">🌐 ${escapeHtml(group.name)}</div>
          <div style="color: #888; font-size: 0.85em;">${group.memberCount} membre(s)</div>
        </div>
        ${buttonHtml}
      </div>
    `;
  }).join('');
}

// Rejoindre un groupe public
async function joinPublicGroup(groupId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}/join`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });

    const data = await response.json();

    if (response.ok) {
      showNotificationToast(`✅ Vous avez rejoint le groupe "${data.group.name}"!`);
      browsePublicGroups(); // Rafraîchir la liste
      loadGroupsData(); // Rafraîchir mes groupes
    } else {
      alert(`❌ ${data.error}`);
    }
  } catch (error) {
    console.error('Error joining group:', error);
    alert('❌ Erreur lors de la tentative de rejoindre le groupe');
  }
}

// ===================================
// GESTION DE L'ARCHIVAGE
// ===================================

// Archiver/Désarchiver un groupe
async function archiveGroup(groupId, archived = true) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}/archive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ archived })
    });

    if (response.ok) {
      const action = archived ? 'archivé' : 'désarchivé';
      showNotificationToast(`✅ Groupe ${action}`);

      // Fermer le panel de chat et rafraîchir la liste
      closeGroupChatPanel();
      loadGroupsData();
    } else {
      alert('❌ Erreur lors de l\'archivage');
    }
  } catch (error) {
    console.error('Error archiving group:', error);
    alert('❌ Erreur lors de l\'archivage du groupe');
  }
}

// Archiver/Désarchiver une conversation DM
async function archiveDM(conversationId, archived = true) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/dms/${conversationId}/archive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ archived })
    });

    if (response.ok) {
      const action = archived ? 'archivée' : 'désarchivée';
      showNotificationToast(`✅ Conversation ${action}`);

      // Fermer le panel de chat et rafraîchir la liste
      closeDMChatPanel();
      showDMsPanel();
    } else {
      alert('❌ Erreur lors de l\'archivage');
    }
  } catch (error) {
    console.error('Error archiving DM:', error);
    alert('❌ Erreur lors de l\'archivage de la conversation');
  }
}

// Archiver la conversation DM actuelle
function archiveCurrentDM() {
  if (!currentDMUser) return;

  // Générer le conversationId (même logique que le backend)
  const emails = [state.user.email, currentDMUser.email].sort();
  const conversationId = emails.join('|||');

  archiveDM(conversationId);
}

// Afficher les groupes archivés
async function showArchivedGroups() {
  const container = document.getElementById('archivedGroupsContainer');
  const content = document.getElementById('archivedGroupsContent');

  container.classList.remove('hidden');
  content.innerHTML = '<p style="color: #888;">Chargement...</p>';

  try {
    const response = await fetch(`${API_BASE_URL}/api/groups/archived/list`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (!response.ok) throw new Error('Erreur');

    const data = await response.json();
    displayArchivedGroups(data.groups || []);
  } catch (error) {
    console.error('Error loading archived groups:', error);
    content.innerHTML = '<p style="color: #ff6b6b;">❌ Erreur de chargement</p>';
  }
}

// Afficher la liste des groupes archivés
function displayArchivedGroups(groups) {
  const content = document.getElementById('archivedGroupsContent');

  if (groups.length === 0) {
    content.innerHTML = '<p style="color: #888;">Aucun groupe archivé</p>';
    return;
  }

  content.innerHTML = groups.map(group => `
    <div style="padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-weight: bold; color: #fff; margin-bottom: 4px;">📦 ${escapeHtml(group.name)}</div>
        <div style="color: #888; font-size: 0.85em;">${group.members.length} membre(s)</div>
      </div>
      <button onclick="archiveGroup('${escapeAttr(group.id)}', false)" style="background: #00ff9d; cursor: pointer; padding: 6px 12px; border: none; border-radius: 6px; color: #000; font-weight: bold; font-size: 0.85em;">↩️ Restaurer</button>
    </div>
  `).join('');
}

// Afficher les DMs archivés
async function showArchivedDMs() {
  const container = document.getElementById('archivedDMsContainer');
  const content = document.getElementById('archivedDMsContent');

  container.classList.remove('hidden');
  content.innerHTML = '<p style="color: #888;">Chargement...</p>';

  try {
    const response = await fetch(`${API_BASE_URL}/api/dms/archived/list`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (!response.ok) throw new Error('Erreur');

    const data = await response.json();
    displayArchivedDMs(data.conversations || []);
  } catch (error) {
    console.error('Error loading archived DMs:', error);
    content.innerHTML = '<p style="color: #ff6b6b;">❌ Erreur de chargement</p>';
  }
}

// Afficher la liste des DMs archivés
function displayArchivedDMs(conversations) {
  const content = document.getElementById('archivedDMsContent');

  if (conversations.length === 0) {
    content.innerHTML = '<p style="color: #888;">Aucune conversation archivée</p>';
    return;
  }

  content.innerHTML = conversations.map(conv => `
    <div style="padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
      <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
        <div style="width: 40px; height: 40px;">
          ${generateAvatarHTML(conv.otherUser, 40)}
        </div>
        <div>
          <div style="font-weight: bold; color: #fff; margin-bottom: 4px;">📦 ${escapeHtml(conv.otherUser.displayName)}</div>
          <div style="color: #888; font-size: 0.85em;">${escapeHtml(conv.otherUser.email)}</div>
        </div>
      </div>
      <button onclick="archiveDM('${escapeAttr(conv.conversationId)}', false)" style="background: #00ff9d; cursor: pointer; padding: 6px 12px; border: none; border-radius: 6px; color: #000; font-weight: bold; font-size: 0.85em;">↩️ Restaurer</button>
    </div>
  `).join('');
}

// ===================================
// SOCKET.IO ET CHAT EN TEMPS RÉEL
// ===================================

let socket = null;
let currentChatGroupId = null;

function initializeSocket() {
  if (socket && socket.connected) return;

  // Charger Socket.IO depuis CDN
  if (!window.io) {
    const script = document.createElement('script');
    script.src = '/socket.io/socket.io.js';
    script.onload = connectSocket;
    document.head.appendChild(script);
  } else {
    connectSocket();
  }
}

function connectSocket() {
  socket = io({
    auth: {
      token: state.token
    }
  });

  socket.on('connect', () => {
    console.log('✅ Socket.IO connected');
  });

  socket.on('disconnect', () => {
    console.log('❌ Socket.IO disconnected');
  });

  socket.on('new_message', (message) => {
    console.log('📨 New message:', message);

    // Si le message est dans le groupe actuellement ouvert
    if (currentChatGroupId === message.groupId) {
      appendMessage(message);
    } else {
      // Message d'un autre groupe → Afficher notification

      // Incrémenter le compteur de messages non lus
      incrementUnreadCount(message.groupId);

      // Trouver le nom du groupe
      const group = groupsData.groups.find(g => g.id === message.groupId);
      const groupName = group ? group.name : 'Groupe';

      // Ne pas notifier pour ses propres messages
      if (message.from !== state.user.email) {
        // Notification toast
        showNotificationToast(`${message.fromDisplayName} dans ${groupName}`);

        // Notification desktop
        const translation = message.translations[state.lang1] || message.content;
        showDesktopNotification(
          `${groupName} - ${message.fromDisplayName}`,
          translation.substring(0, 100), // Limiter la longueur
          message.groupId
        );

        // Son de notification
        playNotificationSound();
      }
    }
  });

  socket.on('group_history', ({ groupId, messages }) => {
    console.log(`📚 Loaded ${messages.length} messages for group ${groupId}`);
    displayMessages(messages);
  });

  // Indicateur "en train d'écrire..."
  socket.on('user_typing', ({ groupId, displayName, isTyping }) => {
    // Afficher uniquement si c'est le groupe actuellement ouvert
    if (groupId === currentChatGroupId) {
      if (isTyping) {
        showTypingIndicator(displayName);

        // Auto-hide après 5 secondes au cas où on ne reçoit pas de "stop typing"
        setTimeout(() => {
          hideTypingIndicator();
        }, 5000);
      } else {
        hideTypingIndicator();
      }
    }
  });

  // Mise à jour des réactions sur un message
  socket.on('message_reaction_updated', ({ groupId, messageId, reactions }) => {
    // Mettre à jour uniquement si c'est le groupe actuellement ouvert
    if (groupId === currentChatGroupId) {
      updateMessageReactions(messageId, reactions);
    }
  });

  // Message supprimé
  socket.on('message_deleted', ({ groupId, messageId }) => {
    // Supprimer uniquement si c'est le groupe actuellement ouvert
    if (groupId === currentChatGroupId) {
      removeMessageFromDOM(messageId);
    }
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
    alert(`❌ ${error.message}`);
  });

  // ===================================
  // LISTENERS SOCKET.IO POUR MENTIONS
  // ===================================

  // Notification quand on est mentionné
  socket.on('user_mentioned', ({ groupId, messageId, mentionedBy, groupName }) => {
    console.log(`🔔 Vous avez été mentionné par ${mentionedBy} dans ${groupName}`);

    // Afficher une notification spéciale pour mention
    showNotificationToast(`🎯 ${mentionedBy} vous a mentionné dans ${groupName}`);
    playNotificationSound();

    // Notification desktop si autorisée
    if (NOTIFICATION_CONFIG.desktop && Notification.permission === 'granted') {
      showDesktopNotification(
        `${mentionedBy} vous a mentionné`,
        `Dans le groupe ${groupName}`,
        groupId
      );
    }
  });

  // ===================================
  // LISTENERS SOCKET.IO POUR STATUTS
  // ===================================

  // Changement de statut en ligne/hors ligne
  socket.on('user_status_changed', ({ email, displayName, online, lastSeen }) => {
    console.log(`📡 Statut changé: ${displayName} est maintenant ${online ? 'en ligne' : 'hors ligne'}`);

    // Mettre à jour le statut local
    userStatuses[email] = { online, lastSeen };

    // Rafraîchir l'affichage des groupes et DMs
    refreshOnlineIndicators();
  });

  // ===================================
  // LISTENERS SOCKET.IO POUR DMS
  // ===================================

  // Réception d'un nouveau message DM
  socket.on('new_dm', (message) => {
    console.log('💬 New DM received:', message);

    // Si c'est pour la conversation actuelle
    if (currentDMUser && (message.from === currentDMUser.email || message.to === currentDMUser.email)) {
      currentDMMessages.push(message);
      displayDMMessages(currentDMMessages);
    } else {
      // Notification pour DM d'une autre conversation
      const fromUser = message.from === state.user.email ? message.to : message.from;
      showNotificationToast(`💬 Nouveau message de ${message.fromDisplayName}`);
      playNotificationSound();
    }
  });

  // Confirmation d'envoi de DM
  socket.on('dm_sent', (message) => {
    console.log('✅ DM sent successfully:', message);

    // Ajouter le message à la liste si dans la bonne conversation
    if (currentDMUser && message.to === currentDMUser.email) {
      currentDMMessages.push(message);
      displayDMMessages(currentDMMessages);
    }
  });
}

async function openGroupChat(groupId) {
  try {
    // Charger les détails du groupe
    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await response.json();

    if (!response.ok) {
      alert(`❌ ${data.error}`);
      return;
    }

    groupsData.currentGroup = data.group;
    currentChatGroupId = groupId;

    // Réinitialiser le compteur de messages non lus
    clearUnreadCount(groupId);

    // Initialiser Socket.IO si pas déjà fait
    if (!socket || !socket.connected) {
      initializeSocket();
    }

    // Rejoindre le groupe
    socket.emit('join_group', { groupId });

    // Afficher le panneau de chat
    document.getElementById('groupChatPanel').classList.remove('hidden');
    document.getElementById('groupsPanel').classList.add('hidden');
    document.getElementById('communicationHome').classList.add('hidden');

    document.getElementById('groupChatTitle').textContent = `💬 ${data.group.name}`;
    document.getElementById('groupMembersCount').textContent = `${data.group.members.length} ${t('members')}`;

    // Ajouter le listener pour l'indicateur "en train d'écrire..."
    const chatInput = document.getElementById('chatMessageInput');
    if (chatInput) {
      // Enlever les anciens listeners pour éviter les doublons
      chatInput.removeEventListener('input', handleChatInput);
      // Ajouter le nouveau listener
      chatInput.addEventListener('input', handleChatInput);
    }

    // Charger l'historique
    const messagesResponse = await fetch(`${API_BASE_URL}/api/groups/${groupId}/messages`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const messagesData = await messagesResponse.json();
    displayMessages(messagesData.messages || []);
  } catch (error) {
    console.error('Error opening group chat:', error);
    alert('❌ Erreur lors de l\'ouverture du chat');
  }
}

function closeGroupChatPanel() {
  document.getElementById('groupChatPanel').classList.add('hidden');

  // Arrêter le signal "en train d'écrire..." et cacher l'indicateur
  if (isCurrentlyTyping) {
    isCurrentlyTyping = false;
    emitTypingEvent(false);
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
  }
  hideTypingIndicator();

  // Effacer la recherche
  clearSearch();
  currentGroupMessages = [];

  if (currentChatGroupId && socket) {
    socket.emit('leave_group', { groupId: currentChatGroupId });
  }

  currentChatGroupId = null;
}

function displayMessages(messages) {
  // Stocker les messages pour la recherche
  currentGroupMessages = messages;

  const container = document.getElementById('chatMessagesContent');
  const userLang = state.lang1; // Langue préférée de l'utilisateur

  if (messages.length === 0) {
    container.innerHTML = `<p style="color: #888; text-align: center;">${t('noMessages')}</p>`;
    return;
  }

  container.innerHTML = messages.map(msg => {
    const translation = msg.translations[userLang] || msg.content;
    const highlightedTranslation = highlightMentions(translation, msg.mentions);
    const isOwnMessage = msg.from === state.user.email;

    return `
      <div style="margin-bottom: 16px; display: flex; flex-direction: column; align-items: ${isOwnMessage ? 'flex-end' : 'flex-start'};" data-message-id="${escapeAttr(msg.id)}">
        <div style="position: relative; display: inline-block; max-width: 70%;">
          <div style="background: ${isOwnMessage ? '#00ff9d' : 'rgba(255,255,255,0.1)'}; color: ${isOwnMessage ? '#000' : '#fff'}; padding: 10px 14px; border-radius: 12px; word-wrap: break-word;">
            <div style="font-weight: bold; font-size: 0.85em; margin-bottom: 4px; opacity: 0.8;">${escapeHtml(msg.fromDisplayName)}</div>
            ${msg.fileInfo ? '' : `<div>${highlightedTranslation}</div>`}
            ${msg.fileInfo ? generateFileDisplay(msg.fileInfo) : ''}
            ${msg.fileInfo && translation ? `<div style="margin-top: 8px;">${highlightedTranslation}</div>` : ''}
            <div style="font-size: 0.75em; margin-top: 4px; opacity: 0.6;">${new Date(msg.timestamp).toLocaleTimeString()}</div>
          </div>
          <div style="display: flex; gap: 8px; margin-top: 4px; justify-content: ${isOwnMessage ? 'flex-end' : 'flex-start'}; flex-wrap: wrap;">
            ${!msg.fileInfo ? `<button onclick="playMessageAudio('${escapeAttr(translation)}', '${userLang}')" style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 0.85em;" title="${t('listen')}">🔊</button>` : ''}
            ${!msg.fileInfo ? `<button onclick="copyMessage('${escapeAttr(translation)}', '${escapeAttr(msg.id || Date.now())}')" style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 0.85em;" title="${t('copy')}">📋</button>` : ''}
            ${generateReactionButtons(msg.id)}
            ${isOwnMessage ? `<button onclick="deleteMessage('${escapeAttr(msg.id)}')" style="background: rgba(255,107,107,0.2); border: 1px solid #ff6b6b; color: #ff6b6b; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 0.85em;" title="Supprimer">🗑️</button>` : ''}
          </div>
          ${generateReactionsDisplay(msg.reactions, msg.id)}
        </div>
      </div>
    `;
  }).join('');

  // Scroll vers le bas
  container.scrollTop = container.scrollHeight;
}

function appendMessage(message) {
  // Ajouter le message à la liste pour la recherche
  currentGroupMessages.push(message);

  const container = document.getElementById('chatMessagesContent');
  const userLang = state.lang1;
  const translation = message.translations[userLang] || message.content;
  const highlightedTranslation = highlightMentions(translation, message.mentions);
  const isOwnMessage = message.from === state.user.email;

  const messageHTML = `
    <div style="margin-bottom: 16px; display: flex; flex-direction: column; align-items: ${isOwnMessage ? 'flex-end' : 'flex-start'};" data-message-id="${escapeAttr(message.id)}">
      <div style="position: relative; display: inline-block; max-width: 70%;">
        <div style="background: ${isOwnMessage ? '#00ff9d' : 'rgba(255,255,255,0.1)'}; color: ${isOwnMessage ? '#000' : '#fff'}; padding: 10px 14px; border-radius: 12px; word-wrap: break-word;">
          <div style="font-weight: bold; font-size: 0.85em; margin-bottom: 4px; opacity: 0.8;">${escapeHtml(message.fromDisplayName)}</div>
          ${message.fileInfo ? '' : `<div>${highlightedTranslation}</div>`}
          ${message.fileInfo ? generateFileDisplay(message.fileInfo) : ''}
          ${message.fileInfo && highlightedTranslation ? `<div style="margin-top: 8px;">${highlightedTranslation}</div>` : ''}
          <div style="font-size: 0.75em; margin-top: 4px; opacity: 0.6;">${new Date(message.timestamp).toLocaleTimeString()}</div>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 4px; justify-content: ${isOwnMessage ? 'flex-end' : 'flex-start'}; flex-wrap: wrap;">
          ${!message.fileInfo ? `<button onclick="playMessageAudio('${escapeAttr(translation)}', '${userLang}')" style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 0.85em;" title="${t('listen')}">🔊</button>` : ''}
          ${!message.fileInfo ? `<button onclick="copyMessage('${escapeAttr(translation)}', '${escapeAttr(message.id || Date.now())}')" style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 0.85em;" title="${t('copy')}">📋</button>` : ''}
          ${generateReactionButtons(message.id)}
          ${isOwnMessage ? `<button onclick="deleteMessage('${escapeAttr(message.id)}')" style="background: rgba(255,107,107,0.2); border: 1px solid #ff6b6b; color: #ff6b6b; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 0.85em;" title="Supprimer">🗑️</button>` : ''}
        </div>
        ${generateReactionsDisplay(message.reactions, message.id)}
      </div>
    </div>
  `;

  if (container.innerHTML.includes(t('noMessages'))) {
    container.innerHTML = messageHTML;
  } else {
    container.innerHTML += messageHTML;
  }

  // Scroll vers le bas
  container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById('chatMessageInput');
  const content = input.value.trim();

  // Vérifier qu'il y a soit du texte soit un fichier
  if (!content && !selectedFile) return;

  if (!socket || !socket.connected) {
    alert('❌ Non connecté au serveur. Reconnexion...');
    initializeSocket();
    return;
  }

  // Arrêter le signal "en train d'écrire..."
  if (isCurrentlyTyping) {
    isCurrentlyTyping = false;
    emitTypingEvent(false);
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
  }

  let fileInfo = null;

  // Si un fichier est sélectionné, l'uploader d'abord
  if (selectedFile) {
    try {
      const sendBtn = document.getElementById('chatSendBtn');
      sendBtn.disabled = true;
      sendBtn.textContent = '📤 Envoi...';

      fileInfo = await uploadFile(selectedFile);

      sendBtn.disabled = false;
      sendBtn.textContent = 'Envoyer';
    } catch (error) {
      alert('❌ Erreur lors de l\'envoi du fichier');
      const sendBtn = document.getElementById('chatSendBtn');
      sendBtn.disabled = false;
      sendBtn.textContent = 'Envoyer';
      return;
    }
  }

  socket.emit('send_message', {
    groupId: currentChatGroupId,
    content: content || (selectedFile ? selectedFile.name : ''),
    userLang: state.lang1, // Langue de l'utilisateur
    fileInfo: fileInfo
  });

  input.value = '';

  // Réinitialiser la sélection de fichier
  if (selectedFile) {
    cancelFileSelection();
  }
}

function showGroupDetails() {
  if (!groupsData.currentGroup) return;

  const group = groupsData.currentGroup;
  const membersList = group.members.map(m =>
    `${m.displayName} (${m.email}) - ${m.role === 'admin' ? '👑 Admin' : '👤 Membre'}`
  ).join('\n');

  alert(`📋 Détails du groupe:\n\nNom: ${group.name}\nMembres (${group.members.length}):\n${membersList}\n\nCréé le: ${new Date(group.createdAt).toLocaleString()}`);
}

// ===================================
// PTT POUR CHAT DE GROUPE
// ===================================

let chatPTTState = {
  isRecording: false,
  mediaRecorder: null,
  audioChunks: [],
  stream: null
};

async function startChatPTT(event) {
  if (event) event.preventDefault();

  if (chatPTTState.isRecording) return;

  const pttBtn = document.getElementById('chatPttBtn');
  pttBtn.style.background = '#00ff9d';
  pttBtn.textContent = '⏺️';

  try {
    // Réutiliser le stream audio existant ou en créer un nouveau
    if (!chatPTTState.stream) {
      chatPTTState.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    }

    chatPTTState.audioChunks = [];
    chatPTTState.mediaRecorder = new MediaRecorder(chatPTTState.stream);

    chatPTTState.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chatPTTState.audioChunks.push(e.data);
      }
    };

    chatPTTState.mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(chatPTTState.audioChunks, { type: 'audio/webm' });

      // Vérifier la taille minimale
      if (audioBlob.size > 1000) {
        await processChatAudio(audioBlob);
      } else {
        console.log('⚠️ Audio trop court, ignoré');
      }

      // Reset du bouton
      const pttBtn = document.getElementById('chatPttBtn');
      if (pttBtn) {
        pttBtn.style.background = '#ff6b6b';
        pttBtn.textContent = '🎤';
      }
    };

    chatPTTState.isRecording = true;
    chatPTTState.mediaRecorder.start();
    console.log('🎤 Enregistrement PTT chat démarré');

  } catch (error) {
    console.error('Erreur démarrage PTT chat:', error);
    alert('❌ Impossible d\'accéder au microphone');

    const pttBtn = document.getElementById('chatPttBtn');
    if (pttBtn) {
      pttBtn.style.background = '#ff6b6b';
      pttBtn.textContent = '🎤';
    }
  }
}

function stopChatPTT(event) {
  if (event) event.preventDefault();

  if (!chatPTTState.isRecording) return;

  chatPTTState.isRecording = false;

  if (chatPTTState.mediaRecorder && chatPTTState.mediaRecorder.state === 'recording') {
    chatPTTState.mediaRecorder.stop();
    console.log('⏹️ Enregistrement PTT chat arrêté');
  }
}

async function processChatAudio(audioBlob) {
  const pttBtn = document.getElementById('chatPttBtn');
  pttBtn.textContent = '⏳';
  pttBtn.style.background = '#ffc107';

  try {
    // 1. Transcription avec Whisper
    console.log('📝 Transcription de l\'audio...');
    const transcription = await transcribeAudio(audioBlob);

    if (!transcription || transcription.trim().length < 2) {
      console.log('⚠️ Transcription vide ou trop courte');
      pttBtn.textContent = '🎤';
      pttBtn.style.background = '#ff6b6b';
      return;
    }

    console.log('✅ Transcription:', transcription);

    // 2. Envoyer le message transcrit
    if (!socket || !socket.connected) {
      alert('❌ Non connecté au serveur');
      return;
    }

    socket.emit('send_message', {
      groupId: currentChatGroupId,
      content: transcription,
      userLang: state.lang1 // Langue de l'utilisateur
    });

    console.log('📤 Message vocal envoyé:', transcription);

  } catch (error) {
    console.error('❌ Erreur traitement audio chat:', error);
    alert('❌ Erreur lors de la transcription');
  } finally {
    // Reset du bouton
    pttBtn.textContent = '🎤';
    pttBtn.style.background = '#ff6b6b';
  }
}

// ===================================
// ACTIONS SUR LES MESSAGES
// ===================================

// Écouter un message (TTS)
async function playMessageAudio(text, language) {
  if (!text || text.trim().length === 0) {
    console.warn('Texte vide, lecture audio ignorée');
    return;
  }

  try {
    // Décrémenter le quota
    decrementQuota('speak');

    // Utiliser la fonction speakText existante
    await speakText(text, language);

    console.log('✅ Lecture audio terminée');
  } catch (error) {
    console.error('❌ Erreur lecture audio du message:', error);
    alert(`❌ ${t('audioPlaybackError') || 'Erreur lors de la lecture audio'}`);
  }
}

// Copier un message dans le presse-papier
async function copyMessage(text, messageId) {
  if (!text || text.trim().length === 0) {
    console.warn('Texte vide, copie ignorée');
    return;
  }

  try {
    // Utiliser l'API Clipboard moderne si disponible
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback pour navigateurs plus anciens
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      try {
        document.execCommand('copy');
        textArea.remove();
      } catch (err) {
        textArea.remove();
        throw err;
      }
    }

    console.log('✅ Message copié:', text.substring(0, 50));

    // Feedback visuel temporaire (optionnel)
    // Vous pouvez ajouter un petit toast ou changer l'icône temporairement

  } catch (error) {
    console.error('❌ Erreur copie du message:', error);
    alert(`❌ ${t('copyError') || 'Erreur lors de la copie'}`);
  }
}

// Initialiser les thèmes au chargement de la page
initTheme();
initColorTheme();

// Charger Socket.IO après connexion
if (state.token) {
  setTimeout(() => {
    initializeSocket();
  }, 1000);
}

// ===================================
// PWA - SERVICE WORKER
// ===================================

// Enregistrer le service worker pour PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('✅ Service Worker enregistré:', registration.scope);

        // Vérifier les mises à jour
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('🔄 Nouvelle version du Service Worker détectée');

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Nouvelle version disponible
              console.log('🆕 Nouvelle version disponible');
              // Optionnel: Afficher une notification à l'utilisateur
              if (confirm('Une nouvelle version de RealTranslate est disponible. Recharger maintenant ?')) {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
                window.location.reload();
              }
            }
          });
        });
      })
      .catch((error) => {
        console.error('❌ Erreur enregistrement Service Worker:', error);
      });
  });

  // Recharger quand le SW prend le contrôle
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('🔄 Service Worker activé, rechargement...');
    window.location.reload();
  });
}

// Détecter si l'app est installée (PWA)
window.addEventListener('appinstalled', () => {
  console.log('✅ RealTranslate installé comme PWA');
});

// Bouton d'installation PWA (optionnel)
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  console.log('💡 Installation PWA disponible');
  // On pourrait afficher un bouton "Installer l'app" ici
});

// ===================================
// GESTION DU RETOUR STRIPE CHECKOUT
// ===================================

// Vérifier les paramètres URL pour les retours Stripe
function checkStripePaymentStatus() {
  const urlParams = new URLSearchParams(window.location.search);
  const paymentStatus = urlParams.get('payment');
  const sessionId = urlParams.get('session_id');

  if (paymentStatus === 'success' && sessionId) {
    // Paiement réussi
    console.log('✅ Paiement Stripe réussi, session:', sessionId);

    // Afficher un message de succès
    setTimeout(() => {
      alert('✅ Paiement réussi ! Votre abonnement a été activé.\n\nMerci de votre confiance ! 🎉');

      // Nettoyer l'URL
      window.history.replaceState({}, document.title, window.location.pathname);

      // Recharger les informations utilisateur
      if (currentUser) {
        loadUserInfo();
      }
    }, 500);
  } else if (paymentStatus === 'cancelled') {
    // Paiement annulé
    console.log('❌ Paiement Stripe annulé');

    setTimeout(() => {
      alert('❌ Paiement annulé.\n\nVous pouvez réessayer à tout moment depuis la page des tarifs.');

      // Nettoyer l'URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }, 500);
  }
}

// Appeler au chargement de la page
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkStripePaymentStatus);
} else {
  checkStripePaymentStatus();
}

// ===================================
// GESTION DES DOTS INDICATEURS (MOBILE)
// ===================================

// Initialiser la gestion des dots pour le scroll horizontal mobile
function initPageIndicators() {
  const container = document.querySelector('.container');
  const dots = document.querySelectorAll('.page-dot');

  if (!container || !dots.length) return;

  // Mettre à jour les dots en fonction du scroll
  function updateDots() {
    const scrollLeft = container.scrollLeft;
    const containerWidth = container.offsetWidth;
    const currentPage = Math.round(scrollLeft / containerWidth);

    dots.forEach((dot, index) => {
      if (index === currentPage) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  }

  // Écouter le scroll
  container.addEventListener('scroll', updateDots);

  // Permettre de cliquer sur les dots pour naviguer
  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      const containerWidth = container.offsetWidth;
      container.scrollTo({
        left: index * containerWidth,
        behavior: 'smooth'
      });
    });
  });
}

// Initialiser au chargement et après connexion
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initPageIndicators, 100);
  });
} else {
  setTimeout(initPageIndicators, 100);
}
