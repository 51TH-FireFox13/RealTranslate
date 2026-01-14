// Configuration
const API_BASE_URL = window.location.origin;
const VAD_CONFIG = {
  VOLUME_THRESHOLD: 0.015,     // Seuil de détection de voix (plus sensible)
  SILENCE_DURATION: 1000,      // Durée de silence pour arrêter (ms) - plus rapide
  MIN_RECORDING_DURATION: 600, // Durée minimale d'enregistrement (ms) - plus rapide
  RECORDING_INTERVAL: 80       // Intervalle d'analyse (ms) - plus réactif
};

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

// Traductions de l'interface de sélection
const UI_TRANSLATIONS = {
  fr: {
    title: 'RealTranslate',
    subtitle: 'Choisissez vos langues de traduction',
    yourLanguage: '📱 Votre langue',
    targetLanguage: '🗣️ Langue à traduire',
    startButton: 'Commencer la traduction'
  },
  en: {
    title: 'RealTranslate',
    subtitle: 'Choose your translation languages',
    yourLanguage: '📱 Your language',
    targetLanguage: '🗣️ Language to translate',
    startButton: 'Start translation'
  },
  zh: {
    title: 'RealTranslate',
    subtitle: '选择您的翻译语言',
    yourLanguage: '📱 您的语言',
    targetLanguage: '🗣️ 翻译语言',
    startButton: '开始翻译'
  },
  de: {
    title: 'RealTranslate',
    subtitle: 'Wählen Sie Ihre Übersetzungssprachen',
    yourLanguage: '📱 Ihre Sprache',
    targetLanguage: '🗣️ Sprache zum Übersetzen',
    startButton: 'Übersetzung starten'
  },
  es: {
    title: 'RealTranslate',
    subtitle: 'Elija sus idiomas de traducción',
    yourLanguage: '📱 Su idioma',
    targetLanguage: '🗣️ Idioma a traducir',
    startButton: 'Comenzar traducción'
  },
  it: {
    title: 'RealTranslate',
    subtitle: 'Scegli le tue lingue di traduzione',
    yourLanguage: '📱 La tua lingua',
    targetLanguage: '🗣️ Lingua da tradurre',
    startButton: 'Inizia traduzione'
  },
  pt: {
    title: 'RealTranslate',
    subtitle: 'Escolha seus idiomas de tradução',
    yourLanguage: '📱 Seu idioma',
    targetLanguage: '🗣️ Idioma para traduzir',
    startButton: 'Começar tradução'
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
  ttsEnabled: true,   // État de la synthèse vocale
  lang1: null,  // Langue de l'utilisateur
  lang2: null,   // Langue de traduction
  mode: 'realtime'  // Mode: 'realtime' ou 'push-to-talk'
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
  elements.mainApp.classList.remove('hidden');
  elements.userInfo.textContent = state.user.email;

  // Afficher le bouton admin si c'est un admin
  if (state.user.role === 'admin') {
    elements.adminBtn.classList.remove('hidden');
  }

  // Initialiser le badge provider avec la valeur par défaut
  elements.providerName.textContent = state.provider.toUpperCase();
  elements.providerBadge.classList.remove('hidden');

  // Initialiser la sélection de langues
  initLanguageSelection();
}

// Connexion
async function login(email, password) {
  try {
    elements.loginBtn.disabled = true;
    elements.loginBtn.textContent = 'Connexion...';
    elements.loginError.classList.add('hidden');

    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
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
            <th>Créé le</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    users.forEach(user => {
      const createdDate = new Date(user.createdAt).toLocaleDateString('fr-FR');
      const isCurrentUser = user.email === state.user.email;

      html += `
        <tr>
          <td>${user.email} ${isCurrentUser ? '<span style="color: #00ff9d;">(vous)</span>' : ''}</td>
          <td><span class="role-badge ${user.role}">${user.role}</span></td>
          <td>${createdDate}</td>
          <td>
            <button
              class="delete-user-btn"
              onclick="deleteUser('${user.email}')"
              ${isCurrentUser ? 'disabled title="Vous ne pouvez pas vous supprimer"' : ''}>
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

// Gestionnaire de formulaire de connexion
elements.loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  login(elements.email.value, elements.password.value);
});

// ===================================
// SÉLECTION DE LANGUES
// ===================================

// Détecter la langue du navigateur
function detectBrowserLanguage() {
  const browserLang = navigator.language || navigator.userLanguage;
  const langCode = browserLang.split('-')[0].toLowerCase();

  // Vérifier si la langue est supportée
  if (LANGUAGES[langCode]) {
    return langCode;
  }

  // Par défaut: français
  return 'fr';
}

// Initialiser l'écran de sélection de langues
function initLanguageSelection() {
  // Vérifier si les langues sont déjà sélectionnées (localStorage)
  const savedLang1 = localStorage.getItem('lang1');
  const savedLang2 = localStorage.getItem('lang2');

  if (savedLang1 && savedLang2 && LANGUAGES[savedLang1] && LANGUAGES[savedLang2]) {
    state.lang1 = savedLang1;
    state.lang2 = savedLang2;
    applyLanguageSettings();
    return;
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

// Démarrer la traduction avec les langues sélectionnées
function startTranslation() {
  if (!state.lang1 || !state.lang2) return;

  // Sauvegarder les langues dans localStorage
  localStorage.setItem('lang1', state.lang1);
  localStorage.setItem('lang2', state.lang2);

  // Masquer l'écran de sélection
  document.getElementById('languageSelection').classList.add('hidden');

  // Appliquer les paramètres de langue
  applyLanguageSettings();

  // Demander la permission microphone
  setTimeout(() => {
    elements.permissionModal.classList.remove('hidden');
  }, 500);
}

// Appliquer les paramètres de langue à l'interface
function applyLanguageSettings() {
  const lang1 = LANGUAGES[state.lang1];
  const lang2 = LANGUAGES[state.lang2];

  // Mettre à jour les en-têtes des panneaux
  const panel1Header = document.querySelector('.panel:first-child h2');
  const panel2Header = document.querySelector('.panel:last-child h2');

  if (panel1Header) {
    panel1Header.textContent = `${lang1.flag} ${lang1.nativeName}`;
  }

  if (panel2Header) {
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

  const micBtn = document.getElementById('micBtn');
  const micIcon = document.getElementById('micIcon');
  const micText = document.getElementById('micText');

  if (state.micEnabled) {
    micBtn.classList.add('active');
    micBtn.classList.remove('muted');
    micIcon.textContent = '🎤';
    micText.textContent = 'Micro ON';
    updateStatus('listening', '🎧 Prêt à écouter...');
  } else {
    micBtn.classList.remove('active');
    micBtn.classList.add('muted');
    micIcon.textContent = '🎤';
    micText.textContent = 'Micro OFF';
    updateStatus('idle', '🔇 Microphone désactivé');

    // Arrêter l'enregistrement en cours si nécessaire
    if (state.isRecording) {
      stopRecording();
    }
  }
}

// Activer/désactiver le TTS
function toggleTTS() {
  state.ttsEnabled = !state.ttsEnabled;

  const ttsBtn = document.getElementById('ttsBtn');
  const ttsIcon = document.getElementById('ttsIcon');
  const ttsText = document.getElementById('ttsText');

  if (state.ttsEnabled) {
    ttsBtn.classList.add('active');
    ttsBtn.classList.remove('muted');
    ttsIcon.textContent = '🔊';
    ttsText.textContent = 'Audio ON';
  } else {
    ttsBtn.classList.remove('active');
    ttsBtn.classList.add('muted');
    ttsIcon.textContent = '🔇';
    ttsText.textContent = 'Audio OFF';
  }
}

// Basculer entre mode temps réel et push-to-talk
function toggleMode() {
  const modeSwitch = document.getElementById('modeSwitch');
  const pushToTalkBtn = document.getElementById('pushToTalkBtn');
  const micBtn = document.getElementById('micBtn');

  if (state.mode === 'realtime') {
    // Passer en mode push-to-talk
    state.mode = 'push-to-talk';
    modeSwitch.classList.add('push-to-talk');
    pushToTalkBtn.classList.remove('hidden');

    // Désactiver le micro automatique
    if (state.isRecording) {
      stopRecording();
    }

    // Masquer le bouton micro
    micBtn.style.opacity = '0.3';
    micBtn.style.pointerEvents = 'none';

    console.log('🔴 Mode Push-to-Talk activé');
  } else {
    // Passer en mode temps réel
    state.mode = 'realtime';
    modeSwitch.classList.remove('push-to-talk');
    pushToTalkBtn.classList.add('hidden');

    // Réactiver le bouton micro
    micBtn.style.opacity = '1';
    micBtn.style.pointerEvents = 'auto';

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
  messageDiv.textContent = text;

  // Déterminer le panneau approprié
  let contentElement;
  if (panel === 'lang1' || panel === state.lang1 || panel === 'fr') {
    contentElement = elements.frContent;
  } else if (panel === 'lang2' || panel === state.lang2 || panel === 'zh') {
    contentElement = elements.zhContent;
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

  // Mise à jour de l'indicateur visuel
  const volumePercent = Math.min(100, rms * 1000);
  elements.volumeBar.style.width = `${volumePercent}%`;

  return rms;
}

// Détection automatique de la voix (VAD Loop)
function vadLoop() {
  const volume = analyzeVolume();

  // Ne pas enregistrer si le micro est désactivé OU en mode push-to-talk
  if (!state.micEnabled || state.isSpeaking || state.mode === 'push-to-talk') {
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

// Traitement de l'audio enregistré
async function processAudio(audioBlob) {
  // Vérifier la taille du blob
  if (audioBlob.size < 1000) {
    console.log('⚠️ Audio trop court, ignoré');
    updateStatus('listening', '🎧 Prêt à écouter...');
    return;
  }

  updateStatus('translating', '🔄 Traduction en cours...');

  try {
    // 1. Transcription avec Whisper
    const transcription = await transcribeAudio(audioBlob);

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
    console.log('🌐 Traduction:', translation);

    // 4. Affichage dans les panneaux appropriés
    if (sourceLang === state.lang1) {
      addMessage('lang1', transcription);
      addMessage('lang2', translation);
    } else {
      addMessage('lang2', transcription);
      addMessage('lang1', translation);
    }

    // 5. Text-to-Speech de la traduction (si activé)
    if (state.ttsEnabled) {
      updateStatus('speaking', '🔊 Lecture audio...');
      await speakText(translation, targetLang);
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
      await processAudio(audioBlob);
    };

    // Tout est prêt
    elements.permissionModal.classList.add('hidden');
    updateStatus('listening', '🎧 Prêt à écouter...');

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

  // Fonction de début d'enregistrement
  const startPTT = (e) => {
    e.preventDefault();
    if (state.mode !== 'push-to-talk' || state.isRecording || state.isSpeaking) return;

    pushToTalkBtn.classList.add('recording');
    startRecording();
    updateStatus('listening', '🎤 Enregistrement...');
  };

  // Fonction de fin d'enregistrement
  const stopPTT = (e) => {
    e.preventDefault();
    if (state.mode !== 'push-to-talk' || !state.isRecording) return;

    pushToTalkBtn.classList.remove('recording');
    stopRecording();
  };

  // Desktop events
  pushToTalkBtn.addEventListener('mousedown', startPTT);
  pushToTalkBtn.addEventListener('mouseup', stopPTT);
  pushToTalkBtn.addEventListener('mouseleave', stopPTT);

  // Mobile touch events
  pushToTalkBtn.addEventListener('touchstart', startPTT);
  pushToTalkBtn.addEventListener('touchend', stopPTT);
  pushToTalkBtn.addEventListener('touchcancel', stopPTT);

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

// Initialisation au chargement
window.addEventListener('load', () => {
  console.log('🚀 RealTranslate chargé');

  // Vérifier si l'utilisateur est déjà connecté
  if (!checkAuth()) {
    // Afficher l'écran de connexion
    elements.loginContainer.classList.remove('hidden');
  }
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
