/**
 * @fileoverview Service de gestion des abonnements
 * @module services/subscription
 *
 * Ce service gère :
 * - Création de sessions Stripe Checkout
 * - Gestion des webhooks Stripe
 * - Mise à jour des abonnements utilisateur
 * - Portail client Stripe
 */

import Stripe from 'stripe';
import { logger } from '../../logger.js';
import { authManager } from '../../auth-sqlite.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Tiers d'abonnement disponibles
const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free',
    price: 0,
    quotas: {
      transcribe: 50,
      translate: 250,
      speak: 50
    }
  },
  premium: {
    name: 'Premium',
    price: 9.99,
    priceId: process.env.STRIPE_PRICE_PREMIUM,
    quotas: {
      transcribe: 500,
      translate: 2000,
      speak: 500
    }
  },
  enterprise: {
    name: 'Enterprise',
    price: 49.99,
    priceId: process.env.STRIPE_PRICE_ENTERPRISE,
    quotas: {
      transcribe: Infinity,
      translate: Infinity,
      speak: Infinity
    }
  }
};

/**
 * Récupère tous les tiers d'abonnement disponibles
 * @returns {Object} - Tiers disponibles
 */
export function getSubscriptionTiers() {
  return SUBSCRIPTION_TIERS;
}

/**
 * Récupère les informations d'un tier spécifique
 * @param {string} tierName - Nom du tier (free, premium, enterprise)
 * @returns {Object|null} - Informations du tier
 */
export function getTierInfo(tierName) {
  return SUBSCRIPTION_TIERS[tierName] || null;
}

/**
 * Crée une session Stripe Checkout
 * @param {string} userEmail - Email de l'utilisateur
 * @param {string} tier - Tier souhaité (premium ou enterprise)
 * @param {string} successUrl - URL de redirection en cas de succès
 * @param {string} cancelUrl - URL de redirection en cas d'annulation
 * @returns {Promise<Object>} - Session Stripe { sessionId, url }
 */
export async function createCheckoutSession(userEmail, tier, successUrl, cancelUrl) {
  try {
    // Vérifier que le tier est valide
    const tierInfo = getTierInfo(tier);
    if (!tierInfo || !tierInfo.priceId) {
      throw new Error(`Invalid tier: ${tier}`);
    }

    // Créer la session Checkout
    const session = await stripe.checkout.sessions.create({
      customer_email: userEmail,
      payment_method_types: ['card'],
      line_items: [{
        price: tierInfo.priceId,
        quantity: 1
      }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userEmail,
        tier
      }
    });

    logger.info('Checkout session created', {
      userEmail,
      tier,
      sessionId: session.id
    });

    return {
      sessionId: session.id,
      url: session.url
    };
  } catch (error) {
    logger.error('Error creating checkout session', {
      userEmail,
      tier,
      error: error.message
    });
    throw error;
  }
}

/**
 * Récupère le statut d'une session Checkout
 * @param {string} sessionId - ID de la session
 * @returns {Promise<Object>} - Statut de la session
 */
export async function getCheckoutSessionStatus(sessionId) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return {
      status: session.payment_status,
      customerEmail: session.customer_email,
      subscriptionId: session.subscription,
      metadata: session.metadata
    };
  } catch (error) {
    logger.error('Error retrieving checkout session', {
      sessionId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Crée un portail client Stripe pour gérer l'abonnement
 * @param {string} userEmail - Email de l'utilisateur
 * @param {string} returnUrl - URL de retour après gestion
 * @returns {Promise<Object>} - Portail { url }
 */
export async function createCustomerPortal(userEmail, returnUrl) {
  try {
    // Récupérer le customer Stripe associé à cet email
    const customers = await stripe.customers.list({
      email: userEmail,
      limit: 1
    });

    if (customers.data.length === 0) {
      throw new Error('No Stripe customer found for this email');
    }

    const customer = customers.data[0];

    // Créer la session du portail
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: returnUrl
    });

    logger.info('Customer portal session created', {
      userEmail,
      customerId: customer.id
    });

    return {
      url: session.url
    };
  } catch (error) {
    logger.error('Error creating customer portal', {
      userEmail,
      error: error.message
    });
    throw error;
  }
}

/**
 * Met à jour l'abonnement d'un utilisateur
 * @param {string} userEmail - Email de l'utilisateur
 * @param {string} newTier - Nouveau tier
 * @param {string} subscriptionId - ID de l'abonnement Stripe (optionnel)
 * @returns {Promise<Object>} - Utilisateur mis à jour
 */
export async function updateUserSubscription(userEmail, newTier, subscriptionId = null) {
  try {
    const user = authManager.users[userEmail];
    if (!user) {
      throw new Error(`User not found: ${userEmail}`);
    }

    // Mettre à jour le tier et la date d'expiration
    const subscriptionData = {
      tier: newTier,
      subscriptionId: subscriptionId,
      startDate: Date.now(),
      endDate: null // Calculer si récurrent
    };

    // Mettre à jour via authManager
    authManager.updateUserSubscription(userEmail, subscriptionData);

    logger.info('User subscription updated', {
      userEmail,
      newTier,
      subscriptionId
    });

    return authManager.users[userEmail];
  } catch (error) {
    logger.error('Error updating user subscription', {
      userEmail,
      newTier,
      error: error.message
    });
    throw error;
  }
}

/**
 * Gère les événements webhook de Stripe
 * @param {Object} event - Événement Stripe
 * @returns {Promise<Object>} - Résultat du traitement
 */
export async function handleStripeWebhook(event) {
  try {
    logger.info('Processing Stripe webhook', {
      type: event.type,
      id: event.id
    });

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userEmail = session.customer_email || session.metadata.userEmail;
        const tier = session.metadata.tier;
        const subscriptionId = session.subscription;

        await updateUserSubscription(userEmail, tier, subscriptionId);

        return {
          success: true,
          message: 'Subscription activated',
          userEmail,
          tier
        };
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customer = await stripe.customers.retrieve(subscription.customer);
        const userEmail = customer.email;

        // Déterminer le tier basé sur le price ID
        let tier = 'free';
        for (const [tierName, tierInfo] of Object.entries(SUBSCRIPTION_TIERS)) {
          if (subscription.items.data[0]?.price.id === tierInfo.priceId) {
            tier = tierName;
            break;
          }
        }

        await updateUserSubscription(userEmail, tier, subscription.id);

        return {
          success: true,
          message: 'Subscription updated',
          userEmail,
          tier
        };
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customer = await stripe.customers.retrieve(subscription.customer);
        const userEmail = customer.email;

        // Rétrograder vers free
        await updateUserSubscription(userEmail, 'free', null);

        return {
          success: true,
          message: 'Subscription cancelled',
          userEmail
        };
      }

      default:
        logger.info('Unhandled webhook event type', { type: event.type });
        return {
          success: true,
          message: 'Event not handled'
        };
    }
  } catch (error) {
    logger.error('Error handling Stripe webhook', {
      eventType: event.type,
      error: error.message
    });
    throw error;
  }
}

/**
 * Vérifie la signature d'un webhook Stripe
 * @param {string} payload - Payload brut du webhook
 * @param {string} signature - Signature Stripe
 * @returns {Object} - Événement vérifié
 */
export function verifyWebhookSignature(payload, signature) {
  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    return event;
  } catch (error) {
    logger.error('Webhook signature verification failed', {
      error: error.message
    });
    throw error;
  }
}

export default {
  getSubscriptionTiers,
  getTierInfo,
  createCheckoutSession,
  getCheckoutSessionStatus,
  createCustomerPortal,
  updateUserSubscription,
  handleStripeWebhook,
  verifyWebhookSignature
};
