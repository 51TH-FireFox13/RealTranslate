/**
 * @fileoverview Routes de gestion des paiements
 * @module routes/payments
 *
 * Ce module gère :
 * - Webhooks PayPal
 * - Webhooks WeChat Pay
 * - Sessions Stripe Checkout
 * - Webhooks Stripe
 * - Portail client Stripe
 */

import express from 'express';
import { logger } from '../logger.js';
import { authManager, authMiddleware } from '../auth-sqlite.js';
import stripePayment from '../stripe-payment.js';
import { verifyPayPalIPN, verifyWeChatSignature, verifyWeChatV3Signature } from '../payment-security.js';

/**
 * Configure les routes de paiements
 * @param {Object} dependencies - Dépendances injectées
 * @returns {express.Router} Router Express configuré
 */
export default function paymentsRoutes(dependencies = {}) {
  const router = express.Router();

  // ===================================
  // WEBHOOKS PAIEMENT
  // ===================================

  /**
   * POST /api/webhook/paypal
   * Webhook PayPal pour gérer les paiements complétés
   */
  router.post('/webhook/paypal', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      // Vérifier la signature PayPal IPN
      const rawBody = req.body.toString('utf8');
      const useSandbox = process.env.PAYPAL_MODE === 'sandbox';

      const isValid = await verifyPayPalIPN(rawBody, useSandbox);

      if (!isValid) {
        logger.warn('PayPal webhook rejected: invalid signature', {
          ip: req.ip,
          bodyPreview: rawBody.substring(0, 100),
        });
        return res.status(403).json({ error: 'Invalid webhook signature' });
      }

      const event = JSON.parse(rawBody);

      logger.info('PayPal webhook received and verified', event);

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

  /**
   * POST /api/webhook/wechat
   * Webhook WeChat Pay pour gérer les paiements complétés
   */
  router.post('/webhook/wechat', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      const rawBody = req.body.toString('utf8');
      const event = JSON.parse(rawBody);

      // Vérifier la signature WeChat Pay
      const signature = event.sign || req.headers['wechatpay-signature'];
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
        isValid = verifyWeChatV3Signature(timestamp, nonce, rawBody, signature, serialNo, apiV3Key);
      } else {
        // WeChat Pay v2 (ancien protocole)
        isValid = verifyWeChatSignature(event, signature, apiKey);
      }

      if (!isValid) {
        logger.warn('WeChat webhook rejected: invalid signature', {
          ip: req.ip,
          hasV3Headers: !!(timestamp && nonce),
        });
        return res.status(403).json({ error: 'Invalid webhook signature' });
      }

      logger.info('WeChat Pay webhook received and verified', event);

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
  // STRIPE CHECKOUT & WEBHOOKS
  // ===================================

  /**
   * POST /api/create-checkout-session
   * Créer une session Stripe Checkout
   */
  router.post('/create-checkout-session', authMiddleware, async (req, res) => {
    try {
      const { tier } = req.body;
      const userEmail = req.user.email;

      // Valider le tier
      if (!tier || (tier !== 'premium' && tier !== 'enterprise')) {
        return res.status(400).json({ error: 'Invalid subscription tier' });
      }

      // Vérifier que les clés Stripe sont configurées
      if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
        logger.error('Stripe not configured - missing API keys');
        return res.status(500).json({ error: 'Payment system not configured' });
      }

      // URLs de redirection
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const baseUrl = `${protocol}://${host}`;

      const successUrl = `${baseUrl}/?payment=success`;
      const cancelUrl = `${baseUrl}/?payment=cancelled`;

      // Créer la session Checkout
      const session = await stripePayment.createCheckoutSession(
        userEmail,
        tier,
        successUrl,
        cancelUrl
      );

      logger.info('Checkout session created', {
        userEmail,
        tier,
        sessionId: session.sessionId,
      });

      res.json({
        success: true,
        sessionId: session.sessionId,
        url: session.url,
      });
    } catch (error) {
      logger.error('Error creating checkout session', {
        errorMessage: error.message,
        errorStack: error.stack,
        errorType: error.type || error.name,
        user: req.user?.email,
        tier: req.body?.tier,
      });
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  /**
   * POST /api/webhook/stripe
   * Webhook Stripe pour gérer les événements de paiement
   * Note: Nécessite express.raw() pour vérifier la signature
   */
  router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      logger.warn('Stripe webhook missing signature');
      return res.status(400).send('Missing signature');
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      logger.error('Stripe webhook secret not configured');
      return res.status(500).send('Webhook not configured');
    }

    try {
      // Vérifier la signature du webhook
      const event = stripePayment.constructWebhookEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      logger.info('Stripe webhook received', { type: event.type, id: event.id });

      // Traiter l'événement
      await stripePayment.handleStripeWebhook(event, authManager);

      res.json({ received: true });
    } catch (error) {
      logger.error('Stripe webhook error', {
        error: error.message,
        signature: signature?.substring(0, 20),
      });
      res.status(400).send(`Webhook Error: ${error.message}`);
    }
  });

  /**
   * POST /api/create-portal-session
   * Créer une session de portail client Stripe (pour gérer l'abonnement)
   */
  router.post('/create-portal-session', authMiddleware, async (req, res) => {
    try {
      const userEmail = req.user.email;

      // Récupérer le client Stripe
      const customer = await stripePayment.getCustomerByEmail(userEmail);

      if (!customer) {
        return res.status(404).json({ error: 'No active subscription found' });
      }

      // URL de retour après le portail
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const returnUrl = `${protocol}://${host}/`;

      // Créer la session du portail
      const portalUrl = await stripePayment.createBillingPortalSession(
        customer.id,
        returnUrl
      );

      logger.info('Portal session created', { userEmail, customerId: customer.id });

      res.json({
        success: true,
        url: portalUrl,
      });
    } catch (error) {
      logger.error('Error creating portal session', {
        error: error.message,
        user: req.user?.email,
      });
      res.status(500).json({ error: 'Failed to create portal session' });
    }
  });

  /**
   * GET /api/checkout-session/:sessionId
   * Vérifier le statut d'une session Checkout
   */
  router.get('/checkout-session/:sessionId', authMiddleware, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = await stripePayment.getCheckoutSession(sessionId);

      res.json({
        success: true,
        status: session.payment_status,
        customerEmail: session.customer_details?.email,
      });
    } catch (error) {
      logger.error('Error retrieving checkout session', {
        error: error.message,
        sessionId: req.params.sessionId,
      });
      res.status(500).json({ error: 'Failed to retrieve session' });
    }
  });

  return router;
}
