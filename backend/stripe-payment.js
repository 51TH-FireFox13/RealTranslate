/**
 * Module de gestion des paiements Stripe
 * Support: Cartes bancaires, PayPal, Alipay, WeChat Pay
 */

import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

// Initialisation Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Configuration des tiers d'abonnement
export const SUBSCRIPTION_TIERS = {
  free: {
    name: 'free',
    displayName: 'Gratuit',
    price: 0,
    currency: 'eur',
    quotas: {
      transcribe: { limit: 50, resetPeriod: 'monthly' },
      translate: { limit: 250, resetPeriod: 'monthly' },
      speak: { limit: 50, resetPeriod: 'monthly' }
    },
    features: ['Traduction en temps réel', 'Support par email']
  },
  premium: {
    name: 'premium',
    displayName: 'Premium',
    price: 9.99,
    currency: 'eur',
    stripePriceId: 'price_premium', // À configurer dans Stripe Dashboard
    quotas: {
      transcribe: { limit: 500, resetPeriod: 'monthly' },
      translate: { limit: 2500, resetPeriod: 'monthly' },
      speak: { limit: 500, resetPeriod: 'monthly' }
    },
    features: [
      'Traduction en temps réel',
      'Transcription audio avancée',
      'Synthèse vocale premium',
      'Support prioritaire',
      'Historique illimité'
    ]
  },
  enterprise: {
    name: 'enterprise',
    displayName: 'Enterprise',
    price: 49.99,
    currency: 'eur',
    stripePriceId: 'price_enterprise', // À configurer dans Stripe Dashboard
    quotas: {
      transcribe: { limit: 5000, resetPeriod: 'monthly' },
      translate: { limit: 25000, resetPeriod: 'monthly' },
      speak: { limit: 5000, resetPeriod: 'monthly' }
    },
    features: [
      'Toutes les fonctionnalités Premium',
      'API dédiée',
      'Intégrations personnalisées',
      'Support 24/7 dédié',
      'SLA garanti',
      'Facturation sur mesure'
    ]
  }
};

/**
 * Crée une session Stripe Checkout pour un abonnement
 * @param {string} userEmail - Email de l'utilisateur
 * @param {string} tier - Tier d'abonnement (premium, enterprise)
 * @param {string} successUrl - URL de redirection après succès
 * @param {string} cancelUrl - URL de redirection après annulation
 * @returns {Promise<Object>} Session Stripe
 */
export async function createCheckoutSession(userEmail, tier, successUrl, cancelUrl) {
  try {
    const tierConfig = SUBSCRIPTION_TIERS[tier];

    if (!tierConfig || tier === 'free') {
      throw new Error('Tier invalide ou gratuit');
    }

    // Créer une session de paiement Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'], // Cartes bancaires
      mode: 'payment', // Paiement unique (peut être changé en 'subscription' pour abonnement récurrent)
      customer_email: userEmail,
      line_items: [
        {
          price_data: {
            currency: tierConfig.currency,
            product_data: {
              name: `RealTranslate ${tierConfig.displayName}`,
              description: `Abonnement mensuel ${tierConfig.displayName}`,
              images: ['https://votre-domaine.com/logo.png'], // À personnaliser
            },
            unit_amount: Math.round(tierConfig.price * 100), // Montant en centimes
          },
          quantity: 1,
        },
      ],
      // Activer PayPal, Alipay, WeChat Pay
      payment_method_types: ['card', 'paypal', 'alipay', 'wechat_pay'],
      // Métadonnées pour identifier la transaction
      metadata: {
        userEmail,
        tier,
        subscriptionType: 'monthly',
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Durée de validité de la session (30 minutes)
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60),
    });

    return {
      success: true,
      sessionId: session.id,
      sessionUrl: session.url,
      expiresAt: session.expires_at,
    };
  } catch (error) {
    console.error('Erreur lors de la création de la session Stripe:', error);
    throw error;
  }
}

/**
 * Vérifie et traite un webhook Stripe
 * @param {string} body - Corps brut de la requête
 * @param {string} signature - Signature Stripe dans l'en-tête
 * @returns {Promise<Object>} Événement vérifié
 */
export async function verifyWebhookSignature(body, signature) {
  try {
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    return event;
  } catch (error) {
    console.error('Erreur de vérification de signature webhook:', error);
    throw new Error('Signature webhook invalide');
  }
}

/**
 * Traite un événement de paiement réussi
 * @param {Object} session - Session Stripe Checkout
 * @returns {Object} Informations de l'abonnement
 */
export function processSuccessfulPayment(session) {
  const { userEmail, tier } = session.metadata;
  const tierConfig = SUBSCRIPTION_TIERS[tier];

  // Calculer la date d'expiration (30 jours)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  return {
    userEmail,
    tier,
    amount: session.amount_total / 100, // Convertir centimes en euros
    currency: session.currency.toUpperCase(),
    expiresAt: expiresAt.toISOString(),
    paymentIntent: session.payment_intent,
    quotas: tierConfig.quotas,
  };
}

/**
 * Récupère les détails d'une session de paiement
 * @param {string} sessionId - ID de la session Stripe
 * @returns {Promise<Object>} Détails de la session
 */
export async function getCheckoutSession(sessionId) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return session;
  } catch (error) {
    console.error('Erreur lors de la récupération de la session:', error);
    throw error;
  }
}

/**
 * Crée un portail client Stripe pour gérer l'abonnement
 * @param {string} customerId - ID du client Stripe
 * @param {string} returnUrl - URL de retour
 * @returns {Promise<Object>} URL du portail
 */
export async function createCustomerPortalSession(customerId, returnUrl) {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return {
      success: true,
      url: session.url,
    };
  } catch (error) {
    console.error('Erreur lors de la création du portail client:', error);
    throw error;
  }
}

/**
 * Récupère l'historique des paiements d'un client
 * @param {string} customerEmail - Email du client
 * @param {number} limit - Nombre de paiements à récupérer
 * @returns {Promise<Array>} Liste des paiements
 */
export async function getPaymentHistory(customerEmail, limit = 10) {
  try {
    // Rechercher le client par email
    const customers = await stripe.customers.list({
      email: customerEmail,
      limit: 1,
    });

    if (customers.data.length === 0) {
      return [];
    }

    const customerId = customers.data[0].id;

    // Récupérer les charges (paiements)
    const charges = await stripe.charges.list({
      customer: customerId,
      limit,
    });

    return charges.data.map(charge => ({
      id: charge.id,
      amount: charge.amount / 100,
      currency: charge.currency.toUpperCase(),
      status: charge.status,
      created: new Date(charge.created * 1000).toISOString(),
      description: charge.description,
      receiptUrl: charge.receipt_url,
    }));
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'historique:', error);
    throw error;
  }
}

/**
 * Rembourse un paiement
 * @param {string} paymentIntentId - ID du PaymentIntent Stripe
 * @param {number} amount - Montant à rembourser (optionnel, total par défaut)
 * @returns {Promise<Object>} Remboursement
 */
export async function refundPayment(paymentIntentId, amount = null) {
  try {
    const refundData = {
      payment_intent: paymentIntentId,
    };

    if (amount !== null) {
      refundData.amount = Math.round(amount * 100); // Convertir en centimes
    }

    const refund = await stripe.refunds.create(refundData);

    return {
      success: true,
      refundId: refund.id,
      amount: refund.amount / 100,
      currency: refund.currency.toUpperCase(),
      status: refund.status,
    };
  } catch (error) {
    console.error('Erreur lors du remboursement:', error);
    throw error;
  }
}

/**
 * Obtient la clé publique Stripe (pour le frontend)
 * @returns {string} Clé publique
 */
export function getPublishableKey() {
  return process.env.STRIPE_PUBLISHABLE_KEY;
}

export default {
  createCheckoutSession,
  verifyWebhookSignature,
  processSuccessfulPayment,
  getCheckoutSession,
  createCustomerPortalSession,
  getPaymentHistory,
  refundPayment,
  getPublishableKey,
  SUBSCRIPTION_TIERS,
};
