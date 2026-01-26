/**
 * @fileoverview Service AI - Gestion des appels aux APIs d'intelligence artificielle
 * @module services/ai
 *
 * Ce service centralise les appels à OpenAI et DeepSeek pour :
 * - Traduction de texte (GPT-4o-mini / DeepSeek)
 * - Transcription audio (Whisper)
 * - Synthèse vocale (TTS)
 */

import fetch from 'node-fetch';
import { logger } from '../../logger.js';
import FormData from 'form-data';

/**
 * Traduit un texte vers une langue cible
 * @param {string} text - Texte à traduire
 * @param {string} targetLang - Langue cible (ex: 'fr', 'en', 'zh')
 * @param {string} provider - Provider à utiliser ('openai' ou 'deepseek')
 * @returns {Promise<string>} - Texte traduit
 */
export async function translateText(text, targetLang, provider = 'openai') {
  try {
    if (!text || !targetLang) {
      throw new Error('Text and targetLang are required');
    }

    if (provider === 'deepseek') {
      return await translateWithDeepSeek(text, targetLang);
    } else {
      return await translateWithOpenAI(text, targetLang);
    }
  } catch (error) {
    logger.error('Translation error', { error: error.message, provider, targetLang });
    return text; // Fallback au texte original
  }
}

/**
 * Traduction via OpenAI GPT-4o-mini
 * @private
 */
async function translateWithOpenAI(text, targetLang) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages: [{
        role: 'system',
        content: `Tu es un traducteur expert. Traduis le texte suivant en ${targetLang} de manière naturelle et fluide. Réponds UNIQUEMENT avec la traduction, sans explications.`
      }, {
        role: 'user',
        content: text
      }]
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorData}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || text;
}

/**
 * Traduction via DeepSeek
 * @private
 */
async function translateWithDeepSeek(text, targetLang) {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      temperature: 0.3,
      messages: [{
        role: 'system',
        content: `Tu es un traducteur expert. Traduis le texte suivant en ${targetLang} de manière naturelle et fluide. Réponds UNIQUEMENT avec la traduction, sans explications.`
      }, {
        role: 'user',
        content: text
      }]
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`DeepSeek API error ${response.status}: ${errorData}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || text;
}

/**
 * Transcrit un fichier audio en texte via Whisper (OpenAI ou DeepSeek)
 * @param {Buffer} audioBuffer - Buffer audio
 * @param {string} filename - Nom du fichier
 * @param {string} provider - Provider à utiliser ('openai' ou 'deepseek')
 * @returns {Promise<string>} - Texte transcrit
 */
export async function transcribeAudio(audioBuffer, filename, provider = 'openai') {
  try {
    if (!audioBuffer || !filename) {
      throw new Error('AudioBuffer and filename are required');
    }

    if (provider === 'deepseek') {
      return await transcribeWithDeepSeek(audioBuffer, filename);
    } else {
      return await transcribeWithOpenAI(audioBuffer, filename);
    }
  } catch (error) {
    logger.error('Transcription error', { error: error.message, provider, filename });
    throw error;
  }
}

/**
 * Transcription via OpenAI Whisper
 * @private
 */
async function transcribeWithOpenAI(audioBuffer, filename) {
  const formData = new FormData();
  formData.append('file', audioBuffer, {
    filename: filename,
    contentType: 'audio/webm'
  });
  formData.append('model', 'whisper-1');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      ...formData.getHeaders()
    },
    body: formData
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenAI Whisper error ${response.status}: ${errorData}`);
  }

  const data = await response.json();
  return data.text;
}

/**
 * Transcription via DeepSeek (si disponible)
 * @private
 */
async function transcribeWithDeepSeek(audioBuffer, filename) {
  // Note: DeepSeek pourrait ne pas avoir d'API Whisper
  // Fallback sur OpenAI si nécessaire
  logger.warn('DeepSeek transcription not implemented, falling back to OpenAI');
  return await transcribeWithOpenAI(audioBuffer, filename);
}

/**
 * Synthèse vocale (Text-to-Speech) via OpenAI TTS
 * @param {string} text - Texte à synthétiser
 * @param {string} voice - Voix à utiliser (alloy, echo, fable, onyx, nova, shimmer)
 * @param {string} provider - Provider à utiliser (seul 'openai' supporté pour l'instant)
 * @returns {Promise<Buffer>} - Audio buffer
 */
export async function synthesizeSpeech(text, voice = 'alloy', provider = 'openai') {
  try {
    if (!text) {
      throw new Error('Text is required for speech synthesis');
    }

    if (provider !== 'openai') {
      logger.warn(`Provider ${provider} not supported for TTS, using OpenAI`);
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: voice,
        input: text
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`OpenAI TTS error ${response.status}: ${errorData}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    logger.error('Speech synthesis error', { error: error.message, voice });
    throw error;
  }
}

/**
 * Détecte la région/provider recommandé basé sur l'IP ou la config
 * @param {string} ip - Adresse IP (optionnelle)
 * @returns {Promise<string>} - Provider recommandé ('openai' ou 'deepseek')
 */
export async function detectRecommendedProvider(ip = null) {
  try {
    // Logique simple : si DeepSeek API key existe, c'est disponible
    if (process.env.DEEPSEEK_API_KEY) {
      // Possibilité d'ajouter détection IP pour Chine
      return 'deepseek';
    }
    return 'openai';
  } catch (error) {
    logger.error('Provider detection error', error);
    return 'openai'; // Fallback
  }
}

/**
 * Vérifie si un provider est disponible (clé API configurée)
 * @param {string} provider - Provider à vérifier
 * @returns {boolean}
 */
export function isProviderAvailable(provider) {
  if (provider === 'openai') {
    return !!process.env.OPENAI_API_KEY;
  } else if (provider === 'deepseek') {
    return !!process.env.DEEPSEEK_API_KEY;
  }
  return false;
}

export default {
  translateText,
  transcribeAudio,
  synthesizeSpeech,
  detectRecommendedProvider,
  isProviderAvailable
};
