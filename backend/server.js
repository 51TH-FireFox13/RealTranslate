import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
app.use(express.static(join(__dirname, '../frontend')));

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

// Endpoint de détection de région
app.get('/api/detect-region', (req, res) => {
  const provider = detectRegion(req);
  res.json({ provider });
});

// Endpoint de transcription (Whisper)
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier audio fourni' });
    }

    const { language } = req.body;

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
      console.error('Whisper API error:', error);
      return res.status(response.status).json({ error: 'Erreur de transcription' });
    }

    const data = await response.json();
    res.json({ text: data.text });

  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la transcription' });
  }
});

// Endpoint de traduction
app.post('/api/translate', async (req, res) => {
  try {
    const { text, targetLanguage, provider } = req.body;

    if (!text || !targetLanguage) {
      return res.status(400).json({ error: 'Texte et langue cible requis' });
    }

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

    const targetLangName = targetLanguage === 'zh' ? '中文（简体中文）' : 'français';

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
          content: `Tu es un traducteur expert. Traduis le texte suivant en ${targetLangName} de manière naturelle et fluide. Réponds UNIQUEMENT avec la traduction, sans explications.`
        }, {
          role: 'user',
          content: text
        }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Translation API error:', error);
      return res.status(response.status).json({ error: 'Erreur de traduction' });
    }

    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content?.trim() || text;

    res.json({ translatedText, provider: useProvider });

  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la traduction' });
  }
});

// Endpoint TTS (Text-to-Speech)
app.post('/api/speak', async (req, res) => {
  try {
    const { text, voice = 'nova' } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Texte requis' });
    }

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
      console.error('TTS API error:', error);
      return res.status(response.status).json({ error: 'Erreur TTS' });
    }

    // Renvoyer le stream audio directement
    res.setHeader('Content-Type', 'audio/mpeg');
    response.body.pipe(res);

  } catch (error) {
    console.error('TTS error:', error);
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
  console.log(`🚀 RealTranslate Backend démarré sur http://localhost:${PORT}`);
  console.log(`📡 API endpoints disponibles :`);
  console.log(`   - POST /api/transcribe`);
  console.log(`   - POST /api/translate`);
  console.log(`   - POST /api/speak`);
  console.log(`   - GET  /api/detect-region`);
  console.log(`   - GET  /api/health`);
});
