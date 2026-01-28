import crypto from 'crypto';
import https from 'https';
import { logger } from './utils/logger.js';

/**
 * Vérifie la signature d'un webhook PayPal IPN (Instant Payment Notification)
 *
 * PayPal IPN verification process:
 * 1. Réenvoyer le message reçu à PayPal avec cmd=_notify-validate
 * 2. PayPal répond avec "VERIFIED" ou "INVALID"
 *
 * @param {string} rawBody - Corps de la requête brut
 * @param {boolean} useSandbox - Utiliser le sandbox PayPal (défaut: false)
 * @returns {Promise<boolean>} true si vérifié, false sinon
 */
export async function verifyPayPalIPN(rawBody, useSandbox = false) {
  return new Promise((resolve, reject) => {
    try {
      // Ajouter cmd=_notify-validate au body
      const verifyBody = 'cmd=_notify-validate&' + rawBody;

      // Endpoint PayPal (sandbox ou production)
      const paypalUrl = useSandbox
        ? 'ipnpb.sandbox.paypal.com'
        : 'ipnpb.paypal.com';

      const options = {
        hostname: paypalUrl,
        port: 443,
        path: '/cgi-bin/webscr',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(verifyBody),
          'User-Agent': 'RealTranslate-PayPal-IPN-Verification',
        },
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          const isVerified = responseData === 'VERIFIED';

          if (isVerified) {
            logger.info('PayPal IPN signature verified successfully');
          } else {
            logger.warn('PayPal IPN signature verification failed', {
              response: responseData
            });
          }

          resolve(isVerified);
        });
      });

      req.on('error', (error) => {
        logger.error('PayPal IPN verification request error', {
          error: error.message
        });
        reject(error);
      });

      req.write(verifyBody);
      req.end();

    } catch (error) {
      logger.error('PayPal IPN verification error', {
        error: error.message
      });
      reject(error);
    }
  });
}

/**
 * Vérifie la signature d'un webhook WeChat Pay
 *
 * WeChat Pay signature verification:
 * 1. Construire la chaîne de signature selon l'ordre spécifique
 * 2. Calculer HMAC-SHA256 avec la clé API
 * 3. Convertir en uppercase et comparer
 *
 * @param {object} data - Données du webhook WeChat
 * @param {string} signature - Signature reçue dans le webhook
 * @param {string} apiKey - Clé API WeChat Pay (WECHAT_API_KEY)
 * @returns {boolean} true si vérifié, false sinon
 */
export function verifyWeChatSignature(data, signature, apiKey) {
  try {
    if (!signature || !apiKey) {
      logger.warn('WeChat Pay signature or API key missing');
      return false;
    }

    // Étape 1: Trier les paramètres par ordre alphabétique (sauf 'sign')
    const sortedParams = Object.keys(data)
      .filter(key => key !== 'sign' && data[key] !== undefined && data[key] !== '')
      .sort()
      .map(key => `${key}=${data[key]}`)
      .join('&');

    // Étape 2: Ajouter la clé API à la fin
    const stringToSign = `${sortedParams}&key=${apiKey}`;

    // Étape 3: Calculer le hash MD5 ou SHA256 selon la version de l'API
    // WeChat Pay utilise généralement MD5 pour l'ancien protocole
    // et HMAC-SHA256 pour le nouveau (v3)
    const calculatedSignature = crypto
      .createHash('md5')
      .update(stringToSign, 'utf8')
      .digest('hex')
      .toUpperCase();

    const isValid = calculatedSignature === signature.toUpperCase();

    if (isValid) {
      logger.info('WeChat Pay signature verified successfully');
    } else {
      logger.warn('WeChat Pay signature verification failed', {
        expected: calculatedSignature,
        received: signature.toUpperCase(),
      });
    }

    return isValid;

  } catch (error) {
    logger.error('WeChat Pay signature verification error', {
      error: error.message
    });
    return false;
  }
}

/**
 * Vérifie la signature d'un webhook WeChat Pay v3 (nouveau protocole)
 *
 * WeChat Pay v3 utilise un protocole de signature différent basé sur
 * le certificat et la clé privée de la plateforme WeChat.
 *
 * @param {string} timestamp - Timestamp du webhook (header Wechatpay-Timestamp)
 * @param {string} nonce - Nonce aléatoire (header Wechatpay-Nonce)
 * @param {string} body - Corps de la requête brut
 * @param {string} signature - Signature reçue (header Wechatpay-Signature)
 * @param {string} serialNo - Numéro de série du certificat (header Wechatpay-Serial)
 * @param {string} apiV3Key - Clé API v3 pour déchiffrer le contenu
 * @returns {boolean} true si vérifié, false sinon
 */
export function verifyWeChatV3Signature(timestamp, nonce, body, signature, serialNo, apiV3Key) {
  try {
    if (!timestamp || !nonce || !signature || !apiV3Key) {
      logger.warn('WeChat Pay v3 signature verification: missing required parameters');
      return false;
    }

    // Construction de la chaîne à signer pour v3
    // Format: timestamp\nnonce\nbody\n
    const stringToSign = `${timestamp}\n${nonce}\n${body}\n`;

    // Pour une vérification complète de WeChat Pay v3, il faudrait:
    // 1. Télécharger le certificat de plateforme WeChat
    // 2. Vérifier la signature avec la clé publique du certificat
    //
    // Pour l'instant, on utilise une approche simplifiée avec HMAC
    const calculatedSignature = crypto
      .createHmac('sha256', apiV3Key)
      .update(stringToSign, 'utf8')
      .digest('base64');

    const isValid = calculatedSignature === signature;

    if (isValid) {
      logger.info('WeChat Pay v3 signature verified successfully');
    } else {
      logger.warn('WeChat Pay v3 signature verification failed');
    }

    return isValid;

  } catch (error) {
    logger.error('WeChat Pay v3 signature verification error', {
      error: error.message
    });
    return false;
  }
}

/**
 * Middleware Express pour vérifier les webhooks PayPal
 * Usage: app.post('/api/webhook/paypal', verifyPayPalWebhook, handler)
 */
export async function verifyPayPalWebhook(req, res, next) {
  try {
    const rawBody = req.body.toString('utf8');
    const useSandbox = process.env.PAYPAL_MODE === 'sandbox';

    const isValid = await verifyPayPalIPN(rawBody, useSandbox);

    if (!isValid) {
      logger.warn('PayPal webhook rejected: invalid signature', {
        ip: req.ip,
        body: rawBody.substring(0, 100), // Log premier 100 chars
      });
      return res.status(403).json({ error: 'Invalid webhook signature' });
    }

    // Signature valide, continuer
    next();

  } catch (error) {
    logger.error('PayPal webhook verification middleware error', {
      error: error.message
    });
    res.status(500).json({ error: 'Webhook verification failed' });
  }
}

/**
 * Middleware Express pour vérifier les webhooks WeChat Pay
 * Usage: app.post('/api/webhook/wechat', verifyWeChatWebhook, handler)
 */
export function verifyWeChatWebhook(req, res, next) {
  try {
    const data = JSON.parse(req.body.toString('utf8'));
    const signature = data.sign || req.headers['wechatpay-signature'];
    const apiKey = process.env.WECHAT_API_KEY;

    if (!apiKey) {
      logger.error('WeChat API key not configured');
      return res.status(500).json({ error: 'WeChat payment not configured' });
    }

    // Vérifier si c'est v3 (avec headers spéciaux)
    const timestamp = req.headers['wechatpay-timestamp'];
    const nonce = req.headers['wechatpay-nonce'];
    const serialNo = req.headers['wechatpay-serial'];

    let isValid = false;

    if (timestamp && nonce && serialNo) {
      // WeChat Pay v3
      const apiV3Key = process.env.WECHAT_API_V3_KEY || apiKey;
      isValid = verifyWeChatV3Signature(
        timestamp,
        nonce,
        req.body.toString('utf8'),
        signature,
        serialNo,
        apiV3Key
      );
    } else {
      // WeChat Pay v2 (ancien protocole)
      isValid = verifyWeChatSignature(data, signature, apiKey);
    }

    if (!isValid) {
      logger.warn('WeChat webhook rejected: invalid signature', {
        ip: req.ip,
        hasV3Headers: !!(timestamp && nonce),
      });
      return res.status(403).json({ error: 'Invalid webhook signature' });
    }

    // Signature valide, continuer
    next();

  } catch (error) {
    logger.error('WeChat webhook verification middleware error', {
      error: error.message
    });
    res.status(500).json({ error: 'Webhook verification failed' });
  }
}

export default {
  verifyPayPalIPN,
  verifyWeChatSignature,
  verifyWeChatV3Signature,
  verifyPayPalWebhook,
  verifyWeChatWebhook,
};
