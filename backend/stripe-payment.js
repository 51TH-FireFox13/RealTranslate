import Stripe from 'stripe';
import { logger } from './logger.js';

// Initialisation lazy de Stripe (au premier appel)
let stripe = null;

function getStripe() {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY not configured in environment variables');
    }
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    logger.info('✅ Stripe initialized successfully');
  }
  return stripe;
}

// Configuration des tiers d'abonnement
// À synchroniser avec les prix créés dans le Dashboard Stripe
const SUBSCRIPTION_TIERS = {
  premium: {
    priceId: process.env.STRIPE_PRICE_PREMIUM, // Prix mensuel Premium (€9.99)
    name: 'Premium',
    amount: 999, // centimes
  },
  enterprise: {
    priceId: process.env.STRIPE_PRICE_ENTERPRISE, // Prix mensuel Enterprise (€49.99)
    name: 'Enterprise',
    amount: 4999, // centimes
  },
};

/**
 * Crée une session Stripe Checkout
 * @param {string} userEmail - Email de l'utilisateur
 * @param {string} tier - Tier d'abonnement ('premium' ou 'enterprise')
 * @param {string} successUrl - URL de redirection après succès
 * @param {string} cancelUrl - URL de redirection après annulation
 * @returns {Promise<{sessionId: string, url: string}>}
 */
export async function createCheckoutSession(userEmail, tier, successUrl, cancelUrl) {
  try {
    if (!SUBSCRIPTION_TIERS[tier]) {
      throw new Error(`Invalid subscription tier: ${tier}`);
    }

    const { priceId, name } = SUBSCRIPTION_TIERS[tier];

    if (!priceId) {
      throw new Error(`Stripe Price ID not configured for tier: ${tier}`);
    }

    // Créer ou récupérer le client Stripe
    let customer;
    const existingCustomers = await getStripe().customers.list({
      email: userEmail,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await getStripe().customers.create({
        email: userEmail,
        metadata: {
          tier,
        },
      });
    }

    // Créer la session Checkout
    const session = await getStripe().checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: {
        userEmail,
        tier,
      },
      subscription_data: {
        metadata: {
          userEmail,
          tier,
        },
      },
      allow_promotion_codes: true, // Permettre les codes promo
    });

    logger.info('Stripe Checkout session created', {
      sessionId: session.id,
      userEmail,
      tier,
    });

    return {
      sessionId: session.id,
      url: session.url,
    };
  } catch (error) {
    logger.error('Error creating Stripe Checkout session', {
      error: error.message,
      userEmail,
      tier,
    });
    throw error;
  }
}

/**
 * Récupère une session Checkout par son ID
 * @param {string} sessionId - ID de la session Checkout
 * @returns {Promise<object>}
 */
export async function getCheckoutSession(sessionId) {
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    return session;
  } catch (error) {
    logger.error('Error retrieving Checkout session', {
      error: error.message,
      sessionId,
    });
    throw error;
  }
}

/**
 * Crée un lien vers le portail client Stripe
 * @param {string} customerId - ID du client Stripe
 * @param {string} returnUrl - URL de retour après gestion du portail
 * @returns {Promise<string>} URL du portail client
 */
export async function createBillingPortalSession(customerId, returnUrl) {
  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    logger.info('Billing portal session created', { customerId });

    return session.url;
  } catch (error) {
    logger.error('Error creating billing portal session', {
      error: error.message,
      customerId,
    });
    throw error;
  }
}

/**
 * Récupère le client Stripe par email
 * @param {string} email - Email de l'utilisateur
 * @returns {Promise<object|null>}
 */
export async function getCustomerByEmail(email) {
  try {
    const customers = await getStripe().customers.list({
      email,
      limit: 1,
    });

    return customers.data.length > 0 ? customers.data[0] : null;
  } catch (error) {
    logger.error('Error getting customer by email', {
      error: error.message,
      email,
    });
    throw error;
  }
}

/**
 * Récupère l'abonnement actif d'un client
 * @param {string} customerId - ID du client Stripe
 * @returns {Promise<object|null>}
 */
export async function getActiveSubscription(customerId) {
  try {
    const subscriptions = await getStripe().subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    return subscriptions.data.length > 0 ? subscriptions.data[0] : null;
  } catch (error) {
    logger.error('Error getting active subscription', {
      error: error.message,
      customerId,
    });
    throw error;
  }
}

/**
 * Gère les événements webhook de Stripe
 * @param {object} event - Événement Stripe
 * @param {object} authManager - Instance du gestionnaire d'authentification
 * @returns {Promise<void>}
 */
export async function handleStripeWebhook(event, authManager) {
  logger.info('Processing Stripe webhook', { type: event.type });

  try {
    switch (event.type) {
      // Paiement réussi pour une session Checkout
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { userEmail, tier } = session.metadata;

        logger.info('Checkout session completed', {
          sessionId: session.id,
          userEmail,
          tier,
        });

        // Récupérer l'abonnement associé
        if (session.subscription) {
          const subscription = await getStripe().subscriptions.retrieve(session.subscription);
          const expiresAt = new Date(subscription.current_period_end * 1000).toISOString();

          // Activer l'abonnement dans la base de données
          const result = authManager.updateSubscription(userEmail, tier, expiresAt, {
            stripeCustomerId: session.customer,
            stripeSubscriptionId: subscription.id,
          });

          if (result.success) {
            logger.info('Subscription activated via Stripe', {
              userEmail,
              tier,
              expiresAt,
              subscriptionId: subscription.id,
            });
          } else {
            logger.error('Failed to activate subscription', {
              userEmail,
              error: result.message,
            });
          }
        }
        break;
      }

      // Abonnement mis à jour (renouvellement, changement de plan)
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const userEmail = subscription.metadata.userEmail;
        const tier = subscription.metadata.tier;
        const expiresAt = new Date(subscription.current_period_end * 1000).toISOString();

        logger.info('Subscription updated', {
          subscriptionId: subscription.id,
          userEmail,
          tier,
          status: subscription.status,
        });

        // Mettre à jour le statut de l'abonnement
        if (subscription.status === 'active') {
          authManager.updateSubscription(userEmail, tier, expiresAt, {
            stripeSubscriptionId: subscription.id,
          });
        } else if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
          // Révoquer l'abonnement
          authManager.updateSubscription(userEmail, 'free', null);
        }
        break;
      }

      // Abonnement supprimé ou expiré
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userEmail = subscription.metadata.userEmail;

        logger.info('Subscription deleted', {
          subscriptionId: subscription.id,
          userEmail,
        });

        // Révoquer l'abonnement
        authManager.updateSubscription(userEmail, 'free', null);
        break;
      }

      // Paiement de facture échoué
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscription = await getStripe().subscriptions.retrieve(invoice.subscription);
        const userEmail = subscription.metadata.userEmail;

        logger.warn('Invoice payment failed', {
          invoiceId: invoice.id,
          userEmail,
          subscriptionId: invoice.subscription,
        });

        // On peut envoyer un email à l'utilisateur pour l'informer
        // ou marquer l'abonnement comme "en attente de paiement"
        break;
      }

      // Paiement de facture réussi (renouvellement)
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscription = await getStripe().subscriptions.retrieve(invoice.subscription);
          const userEmail = subscription.metadata.userEmail;
          const tier = subscription.metadata.tier;
          const expiresAt = new Date(subscription.current_period_end * 1000).toISOString();

          logger.info('Invoice payment succeeded', {
            invoiceId: invoice.id,
            userEmail,
            subscriptionId: invoice.subscription,
          });

          // Mettre à jour la date d'expiration
          authManager.updateSubscription(userEmail, tier, expiresAt);
        }
        break;
      }

      default:
        logger.info('Unhandled webhook event type', { type: event.type });
    }
  } catch (error) {
    logger.error('Error handling Stripe webhook', {
      type: event.type,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Vérifie la signature d'un webhook Stripe
 * @param {string} payload - Corps de la requête brut
 * @param {string} signature - Signature Stripe-Signature header
 * @param {string} webhookSecret - Secret du webhook Stripe
 * @returns {object} Événement Stripe vérifié
 */
export function constructWebhookEvent(payload, signature, webhookSecret) {
  try {
    const event = getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
    return event;
  } catch (error) {
    logger.error('Webhook signature verification failed', {
      error: error.message,
    });
    throw error;
  }
}

export default {
  createCheckoutSession,
  getCheckoutSession,
  createBillingPortalSession,
  getCustomerByEmail,
  getActiveSubscription,
  handleStripeWebhook,
  constructWebhookEvent,
};
