/**
 * @fileoverview Routes des services IA (transcription, traduction, synthèse vocale)
 * @module routes/api
 *
 * Ce module gère :
 * - Transcription audio (Whisper)
 * - Traduction de texte (OpenAI/DeepSeek)
 * - Synthèse vocale (TTS)
 * - Détection de région
 * - Health check
 */

import express from 'express';
import fetch from 'node-fetch';
import FormData from 'form-data';
import multer from 'multer';
import { logger } from '../utils/logger.js';
import { authManager, authMiddleware, requirePermission } from '../auth-sqlite.js';
import { transcribeLimiter, translateLimiter, speakLimiter } from '../middleware/ratelimit.middleware.js';

// Configuration multer pour l'upload audio
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
});

// ===================================
// FONCTIONS UTILITAIRES
// ===================================

/**
 * Détection de la région basée sur l'IP ou les headers
 */
function detectRegion(req) {
  const countryCode = req.headers['cf-ipcountry'] ||
                      req.headers['x-vercel-ip-country'] ||
                      req.headers['cloudfront-viewer-country'] || '';

  // Si l'utilisateur est en Chine, utiliser DeepSeek
  const isChina = countryCode === 'CN' ||
                  req.headers['accept-language']?.includes('zh-CN');

  return isChina ? 'deepseek' : 'openai';
}

/**
 * Configure les routes API IA
 * @param {Object} dependencies - Dépendances injectées
 * @returns {express.Router} Router Express configuré
 */
export default function apiRoutes(dependencies = {}) {
  const router = express.Router();

  // ===================================
  // DÉTECTION DE RÉGION
  // ===================================

  /**
   * GET /api/detect-region
   * Détecter le provider IA optimal selon la région (public)
   */
  router.get('/detect-region', (req, res) => {
    const provider = detectRegion(req);
    res.json({ provider });
  });

  // ===================================
  // TRANSCRIPTION AUDIO (WHISPER)
  // ===================================

  /**
   * POST /api/transcribe
   * Transcrire un fichier audio en texte
   * Rate limited: 10 req/min par utilisateur
   */
  router.post('/transcribe', authMiddleware, transcribeLimiter, requirePermission('transcribe'), upload.single('audio'), async (req, res) => {
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

  // ===================================
  // TRADUCTION DE TEXTE
  // ===================================

  /**
   * POST /api/translate
   * Traduire un texte dans une langue cible
   * Rate limited: 30 req/min par utilisateur
   */
  router.post('/translate', authMiddleware, translateLimiter, requirePermission('translate'), async (req, res) => {
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

  // ===================================
  // SYNTHÈSE VOCALE (TTS)
  // ===================================

  /**
   * POST /api/speak
   * Convertir du texte en audio
   * Rate limited: 15 req/min par utilisateur
   */
  router.post('/speak', authMiddleware, speakLimiter, requirePermission('speak'), async (req, res) => {
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

  // ===================================
  // HEALTH CHECK
  // ===================================

  /**
   * GET /api/health
   * Vérifier l'état du serveur et des APIs externes
   */
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      openai: !!process.env.OPENAI_API_KEY,
      deepseek: !!process.env.DEEPSEEK_API_KEY
    });
  });

  return router;
}
