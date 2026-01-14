import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger, accessLoggerMiddleware } from './logger.js';
import {
  authManager,
  authMiddleware,
  requirePermission,
  requireAdmin,
  ROLES
} from './auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration multer pour l'upload audio
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(accessLoggerMiddleware); // Logger toutes les requêtes
app.use(express.static(join(__dirname, '../frontend')));

logger.info('RealTranslate Backend starting...');

// ===================================
// ROUTES D'AUTHENTIFICATION
// ===================================

// Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
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
  res.json({ user: req.user });
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
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier audio fourni' });
    }

    const { language } = req.body;
    logger.info('Transcription request', { userId: req.user.id, language });

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
    const { text, targetLanguage, sourceLanguage, provider } = req.body;

    if (!text || !targetLanguage) {
      return res.status(400).json({ error: 'Texte et langue cible requis' });
    }

    logger.info('Translation request', {
      userId: req.user.id,
      sourceLanguage: sourceLanguage || 'auto',
      targetLanguage,
      textLength: text.length
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
    const { text, voice = 'nova' } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Texte requis' });
    }

    logger.info('TTS request', { userId: req.user.id, voice, textLength: text.length });

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

// Servir le frontend
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  logger.info(`RealTranslate Backend démarré sur http://localhost:${PORT}`);
  logger.info('API endpoints disponibles');
  logger.info('Auth: POST /api/auth/login, /api/auth/logout, /api/auth/me');
  logger.info('Admin: POST /api/auth/users, GET /api/auth/users, DELETE /api/auth/users/:email');
  logger.info('API: POST /api/transcribe, /api/translate, /api/speak');
  logger.info('Public: GET /api/detect-region, /api/health');
  logger.info(`Auth ${process.env.DISABLE_AUTH === 'true' ? 'DISABLED' : 'ENABLED'}`);
});
