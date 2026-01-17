import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { logger, accessLoggerMiddleware } from './logger.js';
import {
  authManager,
  authMiddleware,
  requirePermission,
  requireAdmin,
  ROLES,
  SUBSCRIPTION_TIERS
} from './auth.js';
import crypto from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*", // À restreindre en production
    methods: ["GET", "POST"]
  }
});
const PORT = process.env.PORT || 3000;

// Configuration multer pour l'upload audio
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
});

// Configuration multer pour l'upload de fichiers (chat)
const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const ext = file.originalname.split('.').pop();
    cb(null, `${uniqueSuffix}.${ext}`);
  }
});

const fileUpload = multer({
  storage: fileStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  fileFilter: (req, file, cb) => {
    // Types de fichiers autorisés
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|mp3|mp4|webm|ogg/;
    const extname = allowedTypes.test(file.originalname.toLowerCase().split('.').pop());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(accessLoggerMiddleware); // Logger toutes les requêtes
app.use(express.static(join(__dirname, '../frontend')));
app.use('/uploads', express.static(join(__dirname, 'uploads'))); // Servir les fichiers uploadés

logger.info('RealTranslate Backend starting...');

// ===================================
// GESTION DES GROUPES ET MESSAGES
// ===================================

// Structures de données en mémoire (à migrer vers DB plus tard)
const groups = {}; // groupId -> { id, name, creator, members: [{ email, displayName, role }], createdAt }
const messages = {}; // groupId -> [{ id, from, content, translations: {lang: text}, timestamp }]
const onlineUsers = {}; // socketId -> { email, displayName }
const userSockets = {}; // email -> Set of socketIds

// Charger les groupes depuis le fichier
const GROUPS_FILE = join(__dirname, 'groups.json');
const MESSAGES_FILE = join(__dirname, 'messages.json');

async function loadGroups() {
  try {
    const data = await fs.readFile(GROUPS_FILE, 'utf8');
    const loadedGroups = JSON.parse(data);
    Object.assign(groups, loadedGroups);
    logger.info('Groups loaded from file', { count: Object.keys(groups).length });
  } catch (error) {
    logger.info('No groups file found, starting fresh');
  }
}

async function saveGroups() {
  try {
    await fs.writeFile(GROUPS_FILE, JSON.stringify(groups, null, 2));
  } catch (error) {
    logger.error('Error saving groups', error);
  }
}

async function loadMessages() {
  try {
    const data = await fs.readFile(MESSAGES_FILE, 'utf8');
    const loadedMessages = JSON.parse(data);
    Object.assign(messages, loadedMessages);
    logger.info('Messages loaded from file', { groups: Object.keys(messages).length });
  } catch (error) {
    logger.info('No messages file found, starting fresh');
  }
}

async function saveMessages() {
  try {
    await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2));
  } catch (error) {
    logger.error('Error saving messages', error);
  }
}

// Charger au démarrage
await loadGroups();
await loadMessages();

// ===================================
// WEBSOCKET HANDLERS
// ===================================

// Fonction de traduction pour les messages de groupe
async function translateMessage(text, targetLang, provider = 'openai') {
  try {
    if (provider === 'deepseek') {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'user',
              content: `Translate the following text to ${targetLang}. Only output the translation, no explanations:\n\n${text}`
            }
          ]
        })
      });

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } else {
      // OpenAI GPT-4o-mini
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: `Translate the following text to ${targetLang}. Only output the translation, no explanations:\n\n${text}`
            }
          ]
        })
      });

      const data = await response.json();
      return data.choices[0].message.content.trim();
    }
  } catch (error) {
    logger.error('Translation error', error);
    return text; // Fallback au texte original
  }
}

// Socket.IO Authentication Middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const tokenData = authManager.verifyToken(token);
    if (!tokenData) {
      return next(new Error('Invalid or expired token'));
    }

    // Attacher les infos utilisateur au socket
    socket.userEmail = tokenData.email;
    socket.userId = tokenData.userId;

    const user = authManager.users[socket.userEmail];
    socket.displayName = user?.displayName || socket.userEmail;

    next();
  } catch (error) {
    logger.error('Socket auth error', error);
    next(new Error('Authentication failed'));
  }
});

// Gestion des connexions WebSocket
io.on('connection', (socket) => {
  const userEmail = socket.userEmail;
  const displayName = socket.displayName;

  logger.info(`WebSocket connected: ${userEmail} (${socket.id})`);

  // Enregistrer le socket de l'utilisateur
  onlineUsers[socket.id] = { email: userEmail, displayName };

  if (!userSockets[userEmail]) {
    userSockets[userEmail] = new Set();
  }
  userSockets[userEmail].add(socket.id);

  // Rejoindre les rooms des groupes de l'utilisateur
  const user = authManager.users[userEmail];
  if (user && user.groups) {
    user.groups.forEach(groupId => {
      socket.join(groupId);
      logger.info(`${userEmail} joined room ${groupId}`);
    });
  }

  // Envoyer un message de groupe
  socket.on('send_message', async (data) => {
    try {
      const { groupId, content, userLang, fileInfo } = data;
      const group = groups[groupId];

      if (!group) {
        socket.emit('error', { message: 'Groupe introuvable' });
        return;
      }

      // Vérifier que l'utilisateur est membre
      const isMember = group.members.some(m => m.email === userEmail);
      if (!isMember) {
        socket.emit('error', { message: 'Accès refusé' });
        return;
      }

      // Créer le message
      const messageId = `msg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const message = {
        id: messageId,
        groupId,
        from: userEmail,
        fromDisplayName: displayName,
        content,
        originalLang: userLang,
        translations: {
          [userLang]: content // Langue originale
        },
        timestamp: new Date().toISOString()
      };

      // Ajouter les informations du fichier si présent
      if (fileInfo) {
        message.fileInfo = fileInfo;
      }

      // Traduire vers toutes les langues des membres du groupe
      const targetLangs = new Set();
      group.members.forEach(member => {
        const memberUser = authManager.users[member.email];
        if (memberUser && memberUser.preferredLang) {
          targetLangs.add(memberUser.preferredLang);
        }
      });

      // Ajouter quelques langues communes si pas de préférences
      if (targetLangs.size === 0) {
        targetLangs.add('en');
        targetLangs.add('fr');
        targetLangs.add('zh');
      }

      // Traduire en parallèle
      const translationPromises = Array.from(targetLangs)
        .filter(lang => lang !== userLang)
        .map(async (lang) => {
          const translation = await translateMessage(content, lang);
          message.translations[lang] = translation;
        });

      await Promise.all(translationPromises);

      // Sauvegarder le message
      if (!messages[groupId]) {
        messages[groupId] = [];
      }
      messages[groupId].push(message);
      await saveMessages();

      // Diffuser à tous les membres du groupe
      io.to(groupId).emit('new_message', message);

      logger.info(`Message sent in group ${groupId} by ${userEmail}`, { messageId });

    } catch (error) {
      logger.error('Error sending message', error);
      socket.emit('error', { message: 'Erreur lors de l\'envoi du message' });
    }
  });

  // Indicateur "en train d'écrire..."
  socket.on('user_typing', (data) => {
    try {
      const { groupId, isTyping } = data;
      const group = groups[groupId];

      if (!group) {
        return;
      }

      // Vérifier que l'utilisateur est membre
      const isMember = group.members.some(m => m.email === userEmail);
      if (!isMember) {
        return;
      }

      // Diffuser l'état "typing" aux autres membres du groupe
      socket.to(groupId).emit('user_typing', {
        groupId,
        userEmail,
        displayName,
        isTyping
      });

    } catch (error) {
      logger.error('Error broadcasting typing indicator', error);
    }
  });

  // Ajouter/retirer une réaction sur un message
  socket.on('toggle_reaction', async (data) => {
    try {
      const { groupId, messageId, emoji } = data;
      const group = groups[groupId];

      if (!group) {
        socket.emit('error', { message: 'Groupe introuvable' });
        return;
      }

      // Vérifier que l'utilisateur est membre
      const isMember = group.members.some(m => m.email === userEmail);
      if (!isMember) {
        socket.emit('error', { message: 'Accès refusé' });
        return;
      }

      // Trouver le message
      const groupMessages = messages[groupId] || [];
      const message = groupMessages.find(m => m.id === messageId);

      if (!message) {
        socket.emit('error', { message: 'Message introuvable' });
        return;
      }

      // Initialiser les réactions si elles n'existent pas
      if (!message.reactions) {
        message.reactions = {};
      }

      // Initialiser la réaction pour cet emoji si elle n'existe pas
      if (!message.reactions[emoji]) {
        message.reactions[emoji] = [];
      }

      // Vérifier si l'utilisateur a déjà réagi avec cet emoji
      const reactionIndex = message.reactions[emoji].findIndex(r => r.email === userEmail);

      if (reactionIndex !== -1) {
        // Retirer la réaction
        message.reactions[emoji].splice(reactionIndex, 1);

        // Supprimer l'emoji s'il n'y a plus de réactions
        if (message.reactions[emoji].length === 0) {
          delete message.reactions[emoji];
        }
      } else {
        // Ajouter la réaction
        message.reactions[emoji].push({
          email: userEmail,
          displayName: displayName,
          timestamp: new Date().toISOString()
        });
      }

      // Sauvegarder les messages
      await saveMessages();

      // Diffuser la mise à jour à tous les membres du groupe
      io.to(groupId).emit('message_reaction_updated', {
        groupId,
        messageId,
        reactions: message.reactions
      });

      logger.info(`Reaction ${emoji} toggled on message ${messageId} by ${userEmail}`);

    } catch (error) {
      logger.error('Error toggling reaction', error);
      socket.emit('error', { message: 'Erreur lors de l\'ajout de la réaction' });
    }
  });

  // Supprimer un message
  socket.on('delete_message', async (data) => {
    try {
      const { groupId, messageId } = data;
      const group = groups[groupId];

      if (!group) {
        socket.emit('error', { message: 'Groupe introuvable' });
        return;
      }

      // Vérifier que l'utilisateur est membre
      const isMember = group.members.some(m => m.email === userEmail);
      if (!isMember) {
        socket.emit('error', { message: 'Accès refusé' });
        return;
      }

      // Trouver le message
      const groupMessages = messages[groupId] || [];
      const messageIndex = groupMessages.findIndex(m => m.id === messageId);

      if (messageIndex === -1) {
        socket.emit('error', { message: 'Message introuvable' });
        return;
      }

      const message = groupMessages[messageIndex];

      // Vérifier que l'utilisateur est l'auteur du message ou admin du groupe
      const isAuthor = message.from === userEmail;
      const isGroupAdmin = group.members.find(m => m.email === userEmail && m.role === 'admin');

      if (!isAuthor && !isGroupAdmin) {
        socket.emit('error', { message: 'Vous n\'avez pas la permission de supprimer ce message' });
        return;
      }

      // Supprimer le message
      messages[groupId].splice(messageIndex, 1);

      // Sauvegarder
      await saveMessages();

      // Diffuser la suppression à tous les membres du groupe
      io.to(groupId).emit('message_deleted', {
        groupId,
        messageId
      });

      logger.info(`Message ${messageId} deleted from group ${groupId} by ${userEmail}`);

    } catch (error) {
      logger.error('Error deleting message', error);
      socket.emit('error', { message: 'Erreur lors de la suppression du message' });
    }
  });

  // Rejoindre un groupe
  socket.on('join_group', (data) => {
    const { groupId } = data;
    const group = groups[groupId];

    if (!group) {
      socket.emit('error', { message: 'Groupe introuvable' });
      return;
    }

    // Vérifier que l'utilisateur est membre
    const isMember = group.members.some(m => m.email === userEmail);
    if (!isMember) {
      socket.emit('error', { message: 'Accès refusé' });
      return;
    }

    socket.join(groupId);
    logger.info(`${userEmail} joined group ${groupId}`);

    // Envoyer l'historique des messages
    const groupMessages = messages[groupId] || [];
    socket.emit('group_history', { groupId, messages: groupMessages });
  });

  // Quitter un groupe
  socket.on('leave_group', (data) => {
    const { groupId } = data;
    socket.leave(groupId);
    logger.info(`${userEmail} left group ${groupId}`);
  });

  // Déconnexion
  socket.on('disconnect', () => {
    logger.info(`WebSocket disconnected: ${userEmail} (${socket.id})`);

    delete onlineUsers[socket.id];

    if (userSockets[userEmail]) {
      userSockets[userEmail].delete(socket.id);
      if (userSockets[userEmail].size === 0) {
        delete userSockets[userEmail];
      }
    }
  });
});

// ===================================
// FONCTIONS DE CRYPTAGE POUR L'HISTORIQUE
// ===================================

// Dériver une clé de cryptage à partir du passwordHash
function deriveEncryptionKey(passwordHash) {
  // Utiliser le passwordHash comme base pour dériver une clé
  // PBKDF2 avec un salt fixe (le passwordHash lui-même est déjà un hash sécurisé)
  return crypto.pbkdf2Sync(passwordHash, 'realtranslate-history-salt', 10000, 32, 'sha256');
}

// Crypter l'historique avec une clé dérivée du passwordHash
function encryptHistory(history, passwordHash) {
  const key = deriveEncryptionKey(passwordHash);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  const jsonData = JSON.stringify(history);
  let encrypted = cipher.update(jsonData, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  // Retourner IV + données cryptées
  return iv.toString('base64') + ':' + encrypted;
}

// Décrypter l'historique avec une clé dérivée du passwordHash
function decryptHistory(encryptedData, passwordHash) {
  try {
    const key = deriveEncryptionKey(passwordHash);
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'base64');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (error) {
    logger.error('Erreur décryptage historique', error);
    return [];
  }
}

// ===================================
// ROUTES D'AUTHENTIFICATION
// ===================================

// Login (email/password ou access token)
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password, accessToken } = req.body;

    // Login avec jeton d'accès
    if (accessToken) {
      const result = authManager.authenticateWithAccessToken(accessToken);

      if (!result.success) {
        return res.status(401).json({ error: result.message });
      }

      return res.json({
        success: true,
        token: result.token,
        user: result.user
      });
    }

    // Login classique email/password
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe ou jeton d\'accès requis' });
    }

    const result = authManager.authenticate(email, password);

    if (!result.success) {
      return res.status(401).json({ error: result.message });
    }

    res.json({
      success: true,
      token: result.token,
      user: result.user
    });
  } catch (error) {
    logger.error('Login error', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer un utilisateur (admin uniquement)
app.post('/api/auth/users', authMiddleware, requireAdmin, (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const result = authManager.createUser(email, password, role || ROLES.USER);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({ success: true, user: result.user });
  } catch (error) {
    logger.error('Create user error', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Lister les utilisateurs (admin uniquement)
app.get('/api/auth/users', authMiddleware, requireAdmin, (req, res) => {
  try {
    const users = authManager.listUsers();
    res.json({ users });
  } catch (error) {
    logger.error('List users error', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un utilisateur (admin uniquement)
app.delete('/api/auth/users/:email', authMiddleware, requireAdmin, (req, res) => {
  try {
    const { email } = req.params;
    const result = authManager.deleteUser(email);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Delete user error', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Logout (révoquer le token)
app.post('/api/auth/logout', authMiddleware, (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      authManager.revokeToken(token);
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('Logout error', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Obtenir l'utilisateur actuel
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const subscriptionInfo = authManager.getSubscriptionInfo(req.user.email);
  res.json({
    user: {
      ...req.user,
      subscription: subscriptionInfo
    }
  });
});

// Changer le mot de passe
app.post('/api/auth/change-password', authMiddleware, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userEmail = req.user.email;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Mots de passe requis' });
    }

    const user = Object.values(authManager.users).find(u => u.email === userEmail);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Vérifier que l'utilisateur a un passwordHash (pas un guest)
    if (!user.passwordHash) {
      return res.status(400).json({ error: 'Changement de mot de passe non disponible pour les utilisateurs invités' });
    }

    // Vérifier le mot de passe actuel
    const currentPasswordHash = authManager.hashPassword(currentPassword);
    if (user.passwordHash !== currentPasswordHash) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }

    // IMPORTANT: Supprimer l'historique car le passwordHash change
    // (l'historique est crypté avec une clé dérivée du passwordHash)
    const hadHistory = !!user.historyEncrypted;
    delete user.historyEncrypted;

    // Mettre à jour le mot de passe
    user.passwordHash = authManager.hashPassword(newPassword);

    authManager.saveUsers();
    logger.info(`Mot de passe changé pour ${userEmail}${hadHistory ? ' (historique supprimé)' : ''}`);

    res.json({
      success: true,
      message: 'Mot de passe modifié avec succès',
      historyCleared: hadHistory
    });
  } catch (error) {
    logger.error('Erreur changement mot de passe', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer son propre compte
app.delete('/api/auth/me', authMiddleware, (req, res) => {
  try {
    const userEmail = req.user.email;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Mot de passe requis pour confirmation' });
    }

    const user = Object.values(authManager.users).find(u => u.email === userEmail);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Vérifier que l'utilisateur a un passwordHash (pas un guest)
    if (!user.passwordHash) {
      return res.status(400).json({ error: 'Suppression de compte non disponible pour les utilisateurs invités' });
    }

    // Vérifier le mot de passe
    const passwordHash = authManager.hashPassword(password);
    if (user.passwordHash !== passwordHash) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    // Supprimer l'utilisateur de l'objet
    delete authManager.users[user.id];
    authManager.saveUsers();

    // Révoquer tous les tokens de cet utilisateur
    Object.keys(authManager.tokens).forEach(token => {
      if (authManager.tokens[token].email === userEmail) {
        delete authManager.tokens[token];
      }
    });
    authManager.saveTokens();

    logger.info(`Compte supprimé: ${userEmail}`);
    res.json({ success: true, message: 'Compte supprimé avec succès' });

  } catch (error) {
    logger.error('Erreur suppression compte', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mettre à jour l'abonnement d'un utilisateur (admin uniquement)
app.post('/api/auth/subscription', authMiddleware, requireAdmin, (req, res) => {
  try {
    const { email, tier, expiresAt } = req.body;

    if (!email || !tier) {
      return res.status(400).json({ error: 'Email et palier requis' });
    }

    const result = authManager.updateSubscription(email, tier, expiresAt);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({ success: true, user: result.user });
  } catch (error) {
    logger.error('Update subscription error', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Obtenir les paliers d'abonnement disponibles
app.get('/api/subscription/tiers', (req, res) => {
  res.json({ tiers: Object.values(SUBSCRIPTION_TIERS) });
});

// Obtenir les informations d'abonnement de l'utilisateur actuel
app.get('/api/subscription/info', authMiddleware, (req, res) => {
  try {
    const info = authManager.getSubscriptionInfo(req.user.email);
    res.json({ subscription: info });
  } catch (error) {
    logger.error('Get subscription info error', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ===================================
// ROUTES JETONS D'ACCÈS (ACCESS TOKENS)
// ===================================

// Générer un jeton d'accès (admin uniquement)
app.post('/api/auth/access-token/generate', authMiddleware, requireAdmin, (req, res) => {
  try {
    const { tier = 'free', expiresInDays = 30, maxUses = 1, description = '' } = req.body;

    const accessToken = authManager.generateAccessToken(tier, expiresInDays, maxUses, description);

    res.json({
      success: true,
      accessToken
    });
  } catch (error) {
    logger.error('Generate access token error', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Lister les jetons d'accès (admin uniquement)
app.get('/api/auth/access-tokens', authMiddleware, requireAdmin, (req, res) => {
  try {
    const tokens = authManager.listAccessTokens();
    res.json({ tokens });
  } catch (error) {
    logger.error('List access tokens error', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Révoquer un jeton d'accès (admin uniquement)
app.delete('/api/auth/access-token/:token', authMiddleware, requireAdmin, (req, res) => {
  try {
    const { token } = req.params;
    const result = authManager.revokeAccessToken(token);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Revoke access token error', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les logs (admin uniquement)
app.get('/api/auth/logs', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { type = 'app', lines = 100 } = req.query;
    const logDir = join(__dirname, '../logs');

    const validTypes = ['app', 'error', 'access', 'auth', 'api'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Type de log invalide' });
    }

    const logFile = join(logDir, `${type}.log`);

    try {
      const content = await fs.readFile(logFile, 'utf-8');
      const logLines = content.trim().split('\n');
      const recentLines = logLines.slice(-parseInt(lines));

      res.json({
        type,
        lines: recentLines,
        total: logLines.length
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.json({
          type,
          lines: [],
          total: 0,
          message: 'Fichier de log non trouvé'
        });
      } else {
        throw error;
      }
    }
  } catch (error) {
    logger.error('Erreur récupération logs', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ===================================
// GESTION DE L'HISTORIQUE DES TRADUCTIONS
// ===================================

// Sauvegarder une traduction dans l'historique (crypté)
app.post('/api/history/save', authMiddleware, async (req, res) => {
  try {
    const { original, translated, sourceLang, targetLang } = req.body;
    const userEmail = req.user.email;
    const user = Object.values(authManager.users).find(u => u.email === userEmail);

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Vérifier que l'utilisateur a un passwordHash (pas un guest)
    if (!user.passwordHash) {
      return res.status(400).json({ error: 'Historique non disponible pour les utilisateurs invités' });
    }

    // Décrypter l'historique existant
    let history = [];
    if (user.historyEncrypted) {
      history = decryptHistory(user.historyEncrypted, user.passwordHash);
    }

    // Ajouter la nouvelle traduction
    history.push({
      timestamp: new Date().toISOString(),
      original,
      translated,
      sourceLang,
      targetLang
    });

    // Limiter l'historique à 1000 entrées (FIFO)
    if (history.length > 1000) {
      history = history.slice(-1000);
    }

    // Crypter et sauvegarder
    user.historyEncrypted = encryptHistory(history, user.passwordHash);
    authManager.saveUsers();

    logger.info(`Historique sauvegardé pour ${userEmail}`);
    res.json({ success: true, count: history.length });

  } catch (error) {
    logger.error('Erreur sauvegarde historique', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer l'historique des traductions (décrypté)
app.get('/api/history', authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const user = Object.values(authManager.users).find(u => u.email === userEmail);

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Vérifier que l'utilisateur a un passwordHash (pas un guest)
    if (!user.passwordHash) {
      return res.json({ history: [] });
    }

    // Décrypter et retourner l'historique
    const history = user.historyEncrypted ? decryptHistory(user.historyEncrypted, user.passwordHash) : [];
    res.json({ history });

  } catch (error) {
    logger.error('Erreur récupération historique', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer l'historique des traductions
app.delete('/api/history', authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const user = Object.values(authManager.users).find(u => u.email === userEmail);

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Supprimer l'historique crypté
    delete user.historyEncrypted;
    authManager.saveUsers();

    logger.info(`Historique supprimé pour ${userEmail}`);
    res.json({ success: true, message: 'Historique supprimé' });

  } catch (error) {
    logger.error('Erreur suppression historique', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ===================================
// ROUTES API (avec authentification)
// ===================================

// Détection de la région basée sur l'IP ou les headers
function detectRegion(req) {
  const countryCode = req.headers['cf-ipcountry'] ||
                      req.headers['x-vercel-ip-country'] ||
                      req.headers['cloudfront-viewer-country'] || '';

  // Si l'utilisateur est en Chine, utiliser DeepSeek
  const isChina = countryCode === 'CN' ||
                  req.headers['accept-language']?.includes('zh-CN');

  return isChina ? 'deepseek' : 'openai';
}

// Endpoint de détection de région (public)
app.get('/api/detect-region', (req, res) => {
  const provider = detectRegion(req);
  res.json({ provider });
});

// Endpoint de transcription (Whisper) - Nécessite authentification
app.post('/api/transcribe', authMiddleware, requirePermission('transcribe'), upload.single('audio'), async (req, res) => {
  try {
    // Vérifier le quota
    const quotaCheck = authManager.consumeQuota(req.user.email, 'transcribe');
    if (!quotaCheck.allowed) {
      logger.auth('Quota exceeded', req.user.id, false, { action: 'transcribe' });
      return res.status(429).json({
        error: quotaCheck.message,
        resetAt: quotaCheck.resetAt
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier audio fourni' });
    }

    const { language } = req.body;
    logger.info('Transcription request', { userId: req.user.id, language, quotaRemaining: quotaCheck.remaining });

    // Créer le FormData pour Whisper
    const formData = new FormData();
    formData.append('model', 'whisper-1');
    formData.append('file', req.file.buffer, {
      filename: 'audio.webm',
      contentType: req.file.mimetype
    });

    if (language) {
      formData.append('language', language);
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Whisper API error', null, { error, userId: req.user.id });
      logger.api('OpenAI Whisper', 'transcribe', false, { status: response.status });
      return res.status(response.status).json({ error: 'Erreur de transcription' });
    }

    const data = await response.json();
    logger.api('OpenAI Whisper', 'transcribe', true, { userId: req.user.id });
    res.json({ text: data.text });

  } catch (error) {
    logger.error('Transcription error', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Erreur serveur lors de la transcription' });
  }
});

// Endpoint de traduction - Nécessite authentification
app.post('/api/translate', authMiddleware, requirePermission('translate'), async (req, res) => {
  try {
    // Vérifier le quota
    const quotaCheck = authManager.consumeQuota(req.user.email, 'translate');
    if (!quotaCheck.allowed) {
      logger.auth('Quota exceeded', req.user.id, false, { action: 'translate' });
      return res.status(429).json({
        error: quotaCheck.message,
        resetAt: quotaCheck.resetAt
      });
    }

    const { text, targetLanguage, sourceLanguage, provider } = req.body;

    if (!text || !targetLanguage) {
      return res.status(400).json({ error: 'Texte et langue cible requis' });
    }

    logger.info('Translation request', {
      userId: req.user.id,
      sourceLanguage: sourceLanguage || 'auto',
      targetLanguage,
      textLength: text.length,
      quotaRemaining: quotaCheck.remaining
    });

    // Déterminer le provider si non spécifié
    const useProvider = provider || detectRegion(req);

    let apiUrl, apiKey, model;

    if (useProvider === 'deepseek') {
      apiUrl = 'https://api.deepseek.com/v1/chat/completions';
      apiKey = process.env.DEEPSEEK_API_KEY;
      model = 'deepseek-chat';
    } else {
      apiUrl = 'https://api.openai.com/v1/chat/completions';
      apiKey = process.env.OPENAI_API_KEY;
      model = 'gpt-4o-mini';
    }

    // Mapping des noms de langues
    const langNames = {
      'fr': 'français',
      'zh': '中文（简体中文）',
      'en': 'English',
      'de': 'Deutsch',
      'es': 'Español',
      'it': 'Italiano',
      'pt': 'Português'
    };

    const targetLangName = langNames[targetLanguage] || targetLanguage;
    const sourceLangName = sourceLanguage ? langNames[sourceLanguage] : null;

    // Instruction stricte pour contraindre la traduction
    let systemPrompt;
    if (sourceLangName && targetLangName) {
      systemPrompt = `Tu es un traducteur expert ${sourceLangName} ↔ ${targetLangName}.
Tu dois UNIQUEMENT traduire le texte de ${sourceLangName} vers ${targetLangName}.
NE traduis JAMAIS vers une autre langue.
Si le texte n'est pas en ${sourceLangName}, indique simplement "❌ Langue non reconnue".
Réponds UNIQUEMENT avec la traduction, sans explications.`;
    } else {
      systemPrompt = `Tu es un traducteur expert. Traduis le texte suivant en ${targetLangName} de manière naturelle et fluide. Réponds UNIQUEMENT avec la traduction, sans explications.`;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [{
          role: 'system',
          content: systemPrompt
        }, {
          role: 'user',
          content: text
        }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Translation API error', null, { error, provider: useProvider, userId: req.user.id });
      logger.api(useProvider === 'deepseek' ? 'DeepSeek' : 'OpenAI', 'translate', false, { status: response.status });
      return res.status(response.status).json({ error: 'Erreur de traduction' });
    }

    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content?.trim() || text;

    logger.api(useProvider === 'deepseek' ? 'DeepSeek' : 'OpenAI', 'translate', true, {
      userId: req.user.id,
      targetLanguage
    });

    res.json({ translatedText, provider: useProvider });

  } catch (error) {
    logger.error('Translation error', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Erreur serveur lors de la traduction' });
  }
});

// Endpoint TTS (Text-to-Speech) - Nécessite authentification
app.post('/api/speak', authMiddleware, requirePermission('speak'), async (req, res) => {
  try {
    // Vérifier le quota
    const quotaCheck = authManager.consumeQuota(req.user.email, 'speak');
    if (!quotaCheck.allowed) {
      logger.auth('Quota exceeded', req.user.id, false, { action: 'speak' });
      return res.status(429).json({
        error: quotaCheck.message,
        resetAt: quotaCheck.resetAt
      });
    }

    const { text, voice = 'nova' } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Texte requis' });
    }

    logger.info('TTS request', { userId: req.user.id, voice, textLength: text.length, quotaRemaining: quotaCheck.remaining });

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: voice, // nova, alloy, echo, fable, onyx, shimmer
        input: text,
        speed: 1.0
      })
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('TTS API error', null, { error, userId: req.user.id });
      logger.api('OpenAI TTS', 'speak', false, { status: response.status });
      return res.status(response.status).json({ error: 'Erreur TTS' });
    }

    logger.api('OpenAI TTS', 'speak', true, { userId: req.user.id, voice });

    // Renvoyer le stream audio directement
    res.setHeader('Content-Type', 'audio/mpeg');
    response.body.pipe(res);

  } catch (error) {
    logger.error('TTS error', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Erreur serveur lors du TTS' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    openai: !!process.env.OPENAI_API_KEY,
    deepseek: !!process.env.DEEPSEEK_API_KEY
  });
});

// ===================================
// WEBHOOKS PAIEMENT
// ===================================

// Webhook PayPal
app.post('/api/webhook/paypal', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // TODO: Vérifier la signature PayPal IPN
    const event = JSON.parse(req.body.toString());

    logger.info('PayPal webhook received', event);

    if (event.event_type === 'PAYMENT.SALE.COMPLETED') {
      const email = event.resource.custom; // Email passé en custom field
      const amount = parseFloat(event.resource.amount.total);

      // Déterminer le tier en fonction du montant
      let tier = 'free';
      if (amount >= 49.99) tier = 'enterprise';
      else if (amount >= 9.99) tier = 'premium';

      // Activer l'abonnement pour 30 jours
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const result = authManager.updateSubscription(email, tier, expiresAt);

      if (result.success) {
        logger.info('Subscription activated via PayPal', { email, tier, amount });
      } else {
        logger.error('Failed to activate subscription', { email, error: result.message });
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('PayPal webhook error', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Webhook WeChat Pay
app.post('/api/webhook/wechat', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // TODO: Vérifier la signature WeChat Pay
    const event = JSON.parse(req.body.toString());

    logger.info('WeChat Pay webhook received', event);

    if (event.event_type === 'TRANSACTION.SUCCESS') {
      const email = event.out_trade_no; // Email passé dans out_trade_no
      const amount = parseFloat(event.amount.total) / 100; // WeChat en centimes

      // Déterminer le tier en fonction du montant
      let tier = 'free';
      if (amount >= 49.99) tier = 'enterprise';
      else if (amount >= 9.99) tier = 'premium';

      // Activer l'abonnement pour 30 jours
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const result = authManager.updateSubscription(email, tier, expiresAt);

      if (result.success) {
        logger.info('Subscription activated via WeChat Pay', { email, tier, amount });
      } else {
        logger.error('Failed to activate subscription', { email, error: result.message });
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('WeChat Pay webhook error', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ===================================
// GESTION AUTOMATIQUE DES ABONNEMENTS EXPIRÉS
// ===================================

function checkExpiredSubscriptions() {
  const users = authManager.listUsers();
  const now = new Date();

  users.forEach(user => {
    const subscription = user.subscription;

    if (subscription && subscription.expiresAt && subscription.status === 'active') {
      const expiresAt = new Date(subscription.expiresAt);

      if (expiresAt < now) {
        // L'abonnement a expiré, réinitialiser vers gratuit
        logger.info('Subscription expired, downgrading to free', { email: user.email, tier: subscription.tier });

        authManager.updateSubscription(user.email, 'free', null);
      }
    }
  });
}

// Vérifier toutes les heures
setInterval(checkExpiredSubscriptions, 60 * 60 * 1000);

// Vérifier au démarrage
checkExpiredSubscriptions();

// ===================================
// ROUTES API - FICHIERS
// ===================================

// Upload de fichier pour le chat
app.post('/api/upload-file', authMiddleware, fileUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const fileInfo = {
      url: fileUrl,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size
    };

    logger.info('File uploaded successfully', {
      user: req.user.email,
      fileName: req.file.originalname,
      size: req.file.size
    });

    res.json(fileInfo);
  } catch (error) {
    logger.error('Error uploading file', error);
    res.status(500).json({ error: 'Erreur lors de l\'upload du fichier' });
  }
});

// Configuration multer pour les avatars (images uniquement, 5MB max)
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `avatar-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const ext = file.originalname.split('.').pop();
    cb(null, `${uniqueSuffix}.${ext}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    // Seulement les images
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(file.originalname.toLowerCase().split('.').pop());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé. Utilisez JPG, PNG, GIF ou WebP.'));
    }
  }
});

// Upload d'avatar
app.post('/api/upload-avatar', authMiddleware, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucune image fournie' });
    }

    const avatarUrl = `/uploads/${req.file.filename}`;
    const userEmail = req.user.email;
    const user = authManager.users[userEmail];

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    // Sauvegarder l'URL de l'avatar dans le profil utilisateur
    user.avatar = avatarUrl;
    await authManager.saveUsers();

    logger.info('Avatar uploaded successfully', {
      user: userEmail,
      avatarUrl
    });

    res.json({
      success: true,
      avatarUrl,
      message: 'Avatar mis à jour avec succès'
    });
  } catch (error) {
    logger.error('Error uploading avatar', error);
    res.status(500).json({ error: 'Erreur lors de l\'upload de l\'avatar' });
  }
});

// ===================================
// ROUTES API - GROUPES
// ===================================

// Créer un groupe
app.post('/api/groups', authMiddleware, async (req, res) => {
  try {
    const { name, memberEmails } = req.body;
    const creatorEmail = req.user.email;
    const creator = authManager.users[creatorEmail];

    if (!name || !memberEmails || !Array.isArray(memberEmails)) {
      return res.status(400).json({ error: 'Nom et membres requis' });
    }

    // Créer le groupe
    const groupId = `group-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const members = [
      { email: creatorEmail, displayName: creator.displayName, role: 'admin' }
    ];

    // Ajouter les membres (seulement les amis)
    for (const memberEmail of memberEmails) {
      if (memberEmail === creatorEmail) continue;

      const member = authManager.users[memberEmail];
      if (!member) continue;

      // Vérifier que c'est un ami
      if (creator.friends && creator.friends.includes(memberEmail)) {
        members.push({
          email: memberEmail,
          displayName: member.displayName,
          role: 'member'
        });

        // Ajouter le groupe à la liste des groupes de l'utilisateur
        if (!member.groups) member.groups = [];
        member.groups.push(groupId);
      }
    }

    groups[groupId] = {
      id: groupId,
      name,
      creator: creatorEmail,
      members,
      createdAt: new Date().toISOString()
    };

    messages[groupId] = [];

    // Ajouter à la liste des groupes du créateur
    if (!creator.groups) creator.groups = [];
    creator.groups.push(groupId);

    await saveGroups();
    authManager.saveUsers();

    logger.info(`Group created: ${groupId} by ${creatorEmail}`, { name, memberCount: members.length });
    res.json({ success: true, group: groups[groupId] });

  } catch (error) {
    logger.error('Error creating group', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Obtenir les groupes de l'utilisateur
app.get('/api/groups', authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const user = authManager.users[userEmail];

    if (!user.groups) {
      return res.json({ groups: [] });
    }

    const userGroups = user.groups
      .map(groupId => groups[groupId])
      .filter(g => g); // Filtrer les groupes supprimés

    res.json({ groups: userGroups });

  } catch (error) {
    logger.error('Error getting groups', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Obtenir les détails d'un groupe
app.get('/api/groups/:groupId', authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userEmail = req.user.email;
    const group = groups[groupId];

    if (!group) {
      return res.status(404).json({ error: 'Groupe introuvable' });
    }

    // Vérifier que l'utilisateur est membre
    const isMember = group.members.some(m => m.email === userEmail);
    if (!isMember) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    res.json({ group });

  } catch (error) {
    logger.error('Error getting group', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Obtenir les messages d'un groupe
app.get('/api/groups/:groupId/messages', authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userEmail = req.user.email;
    const group = groups[groupId];

    if (!group) {
      return res.status(404).json({ error: 'Groupe introuvable' });
    }

    // Vérifier que l'utilisateur est membre
    const isMember = group.members.some(m => m.email === userEmail);
    if (!isMember) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const groupMessages = messages[groupId] || [];
    res.json({ messages: groupMessages });

  } catch (error) {
    logger.error('Error getting messages', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Ajouter un membre au groupe
app.post('/api/groups/:groupId/members', authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { memberEmail } = req.body;
    const userEmail = req.user.email;
    const group = groups[groupId];

    if (!group) {
      return res.status(404).json({ error: 'Groupe introuvable' });
    }

    // Vérifier que l'utilisateur est admin
    const userMember = group.members.find(m => m.email === userEmail);
    if (!userMember || userMember.role !== 'admin') {
      return res.status(403).json({ error: 'Seuls les admins peuvent ajouter des membres' });
    }

    // Vérifier que le nouveau membre existe et est ami
    const newMember = authManager.users[memberEmail];
    if (!newMember) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    const user = authManager.users[userEmail];
    if (!user.friends || !user.friends.includes(memberEmail)) {
      return res.status(400).json({ error: 'Seuls vos amis peuvent être ajoutés' });
    }

    // Vérifier si déjà membre
    if (group.members.some(m => m.email === memberEmail)) {
      return res.status(400).json({ error: 'Déjà membre du groupe' });
    }

    // Ajouter le membre
    group.members.push({
      email: memberEmail,
      displayName: newMember.displayName,
      role: 'member'
    });

    if (!newMember.groups) newMember.groups = [];
    newMember.groups.push(groupId);

    await saveGroups();
    authManager.saveUsers();

    logger.info(`Member added to group: ${memberEmail} -> ${groupId}`);
    res.json({ success: true, group });

  } catch (error) {
    logger.error('Error adding member', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Retirer un membre du groupe
app.delete('/api/groups/:groupId/members/:memberEmail', authMiddleware, async (req, res) => {
  try {
    const { groupId, memberEmail } = req.params;
    const userEmail = req.user.email;
    const group = groups[groupId];

    if (!group) {
      return res.status(404).json({ error: 'Groupe introuvable' });
    }

    // Vérifier que l'utilisateur est admin
    const userMember = group.members.find(m => m.email === userEmail);
    if (!userMember || userMember.role !== 'admin') {
      return res.status(403).json({ error: 'Seuls les admins peuvent retirer des membres' });
    }

    // Ne pas retirer le créateur
    if (memberEmail === group.creator) {
      return res.status(400).json({ error: 'Impossible de retirer le créateur' });
    }

    // Retirer le membre
    group.members = group.members.filter(m => m.email !== memberEmail);

    const member = authManager.users[memberEmail];
    if (member && member.groups) {
      member.groups = member.groups.filter(g => g !== groupId);
    }

    await saveGroups();
    authManager.saveUsers();

    logger.info(`Member removed from group: ${memberEmail} <- ${groupId}`);
    res.json({ success: true });

  } catch (error) {
    logger.error('Error removing member', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ===================================
// ROUTES API - PROFIL ET AMIS
// ===================================

// Mettre à jour le displayName
app.put('/api/profile/displayname', authMiddleware, async (req, res) => {
  try {
    const { displayName } = req.body;
    const userEmail = req.user.email;

    if (!displayName) {
      return res.status(400).json({ error: 'DisplayName requis' });
    }

    const result = authManager.updateDisplayName(userEmail, displayName);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    logger.info(`DisplayName updated for ${userEmail}`, { displayName });
    res.json({ success: true, displayName: result.displayName });

  } catch (error) {
    logger.error('Erreur mise à jour displayName', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Rechercher des utilisateurs par displayName
app.get('/api/friends/search', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Paramètre de recherche requis' });
    }

    const results = authManager.searchUsersByDisplayName(q);
    res.json({ users: results });

  } catch (error) {
    logger.error('Erreur recherche utilisateurs', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Envoyer une demande d'ami
app.post('/api/friends/request', authMiddleware, async (req, res) => {
  try {
    const { toEmail } = req.body;
    const fromEmail = req.user.email;

    if (!toEmail) {
      return res.status(400).json({ error: 'Email destinataire requis' });
    }

    const result = authManager.sendFriendRequest(fromEmail, toEmail);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    logger.info(`Friend request sent from ${fromEmail} to ${toEmail}`);
    res.json({ success: true, message: result.message });

  } catch (error) {
    logger.error('Erreur envoi demande ami', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Accepter une demande d'ami
app.post('/api/friends/accept', authMiddleware, async (req, res) => {
  try {
    const { fromEmail } = req.body;
    const userEmail = req.user.email;

    if (!fromEmail) {
      return res.status(400).json({ error: 'Email requis' });
    }

    const result = authManager.acceptFriendRequest(userEmail, fromEmail);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    logger.info(`Friend request accepted by ${userEmail} from ${fromEmail}`);
    res.json({ success: true, message: result.message });

  } catch (error) {
    logger.error('Erreur acceptation ami', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Rejeter une demande d'ami
app.post('/api/friends/reject', authMiddleware, async (req, res) => {
  try {
    const { fromEmail } = req.body;
    const userEmail = req.user.email;

    if (!fromEmail) {
      return res.status(400).json({ error: 'Email requis' });
    }

    const result = authManager.rejectFriendRequest(userEmail, fromEmail);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    logger.info(`Friend request rejected by ${userEmail} from ${fromEmail}`);
    res.json({ success: true, message: result.message });

  } catch (error) {
    logger.error('Erreur rejet ami', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un ami
app.delete('/api/friends/:friendEmail', authMiddleware, async (req, res) => {
  try {
    const { friendEmail } = req.params;
    const userEmail = req.user.email;

    const result = authManager.removeFriend(userEmail, friendEmail);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    logger.info(`Friend removed by ${userEmail}: ${friendEmail}`);
    res.json({ success: true, message: result.message });

  } catch (error) {
    logger.error('Erreur suppression ami', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Obtenir la liste des amis
app.get('/api/friends', authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const friends = authManager.getFriends(userEmail);

    res.json({ friends });

  } catch (error) {
    logger.error('Erreur récupération amis', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Obtenir les demandes d'ami en attente
app.get('/api/friends/requests', authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const requests = authManager.getFriendRequests(userEmail);

    res.json({ requests });

  } catch (error) {
    logger.error('Erreur récupération demandes ami', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Servir le frontend
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../frontend/index.html'));
});

httpServer.listen(PORT, () => {
  logger.info(`RealTranslate Backend démarré sur http://localhost:${PORT}`);
  logger.info('WebSocket server ready');
  logger.info('API endpoints disponibles');
  logger.info('Auth: POST /api/auth/login, /api/auth/logout, /api/auth/me');
  logger.info('Admin: POST /api/auth/users, GET /api/auth/users, DELETE /api/auth/users/:email');
  logger.info('Subscriptions: POST /api/webhook/paypal, /api/webhook/wechat');
  logger.info('API: POST /api/transcribe, /api/translate, /api/speak');
  logger.info('Public: GET /api/detect-region, /api/health');
  logger.info(`Auth ${process.env.DISABLE_AUTH === 'true' ? 'DISABLED' : 'ENABLED'}`);
  logger.info('✅ Subscription expiration check enabled (every hour)');
});
