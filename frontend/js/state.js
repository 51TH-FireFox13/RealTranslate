/**
 * @fileoverview État global de l'application RealTranslate
 * @module state
 */

// Configuration de l'API
export const API_BASE_URL = window.location.origin;

// État global de l'application
export const state = {
  // Authentification
  user: null,
  token: null,
  isAuthenticated: false,

  // Langues sélectionnées
  lang1: 'fr',  // Langue de l'utilisateur
  lang2: 'en',  // Langue cible

  // Mode d'interface
  interfaceMode: null, // 'translation' ou 'communication'

  // Audio
  isRecording: false,
  isTTSEnabled: true,
  isVADMode: true, // true = VAD, false = PTT

  // Provider IA (openai ou deepseek)
  provider: 'openai',

  // Quotas
  quotas: null
};

// Données des groupes
export const groupsData = {
  myGroups: [],
  currentGroup: null,
  publicGroups: []
};

// Données des conversations DM
export const dmsData = {
  conversations: [],
  currentDM: null
};

// Données des amis
export const friendsData = {
  friends: [],
  pendingRequests: []
};

// Statuts en ligne des utilisateurs
export const onlineStatuses = {};

// Messages non lus par groupe
export const unreadMessages = {};

// File d'attente de traitement audio
export const processingQueue = [];

// Variables de chat
export let currentChatGroupId = null;
export let currentGroupMessages = [];
export let currentDMUser = null;

// Variables d'upload
export let selectedFile = null;
export let selectedDMFile = null;

// WebSocket
export let socket = null;

// Audio context et stream
export let audioContext = null;
export let mediaStream = null;
export let mediaRecorder = null;
export let analyser = null;

// Setters pour les variables exportées
export function setCurrentChatGroupId(id) {
  currentChatGroupId = id;
}

export function setCurrentGroupMessages(messages) {
  currentGroupMessages = messages;
}

export function setCurrentDMUser(user) {
  currentDMUser = user;
}

export function setSelectedFile(file) {
  selectedFile = file;
}

export function setSelectedDMFile(file) {
  selectedDMFile = file;
}

export function setSocket(s) {
  socket = s;
}

export function setAudioContext(ctx) {
  audioContext = ctx;
}

export function setMediaStream(stream) {
  mediaStream = stream;
}

export function setMediaRecorder(recorder) {
  mediaRecorder = recorder;
}

export function setAnalyser(a) {
  analyser = a;
}

// Fonction pour réinitialiser l'état
export function resetState() {
  state.user = null;
  state.token = null;
  state.isAuthenticated = false;
  state.interfaceMode = null;
  state.isRecording = false;

  groupsData.myGroups = [];
  groupsData.currentGroup = null;

  dmsData.conversations = [];
  dmsData.currentDM = null;

  friendsData.friends = [];
  friendsData.pendingRequests = [];
}

export default state;
