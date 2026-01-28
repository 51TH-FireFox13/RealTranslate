# Configuration des Paiements Stripe - RealTranslate

Ce document explique comment configurer Stripe pour accepter les paiements par **carte bancaire**, **PayPal**, **Alipay** et **WeChat Pay** via une seule plateforme unifiée.

## 🌍 Architecture des Paiements

RealTranslate utilise désormais **Stripe** comme unique système de paiement, qui supporte nativement :
- 💳 **Cartes bancaires** : Visa, Mastercard, American Express, etc.
- 💙 **PayPal** : Intégration native via Stripe
- 🟡 **Alipay** : Pour les utilisateurs chinois
- 💚 **WeChat Pay** : Pour les utilisateurs chinois

**Avantages de Stripe** :
- ✅ Une seule intégration pour tous les moyens de paiement
- ✅ Conformité PCI-DSS intégrée
- ✅ Interface utilisateur moderne (Stripe Checkout)
- ✅ Webhooks sécurisés avec vérification de signature
- ✅ Support multidevise automatique
- ✅ Facturation et comptabilité simplifiées

---

## 💳 Configuration Stripe

### 1. Créer un compte Stripe

1. Rendez-vous sur [Stripe Dashboard](https://dashboard.stripe.com/register)
2. Créez un compte (Europe recommandé pour RealTranslate)
3. Complétez la vérification de votre entreprise
4. Activez votre compte

### 2. Récupérer les clés API

1. Dans le Dashboard Stripe, allez dans **Developers > API keys**
2. Notez vos clés :
   - **Publishable key** (clé publique) : `pk_test_...` ou `pk_live_...`
   - **Secret key** (clé secrète) : `sk_test_...` ou `sk_live_...`

**Mode Test vs Live** :
- **Test** (`pk_test_` / `sk_test_`) : Pour le développement et les tests
- **Live** (`pk_live_` / `sk_live_`) : Pour la production réelle

### 3. Activer les méthodes de paiement

1. Dans le Dashboard, allez dans **Settings > Payment methods**
2. Activez les méthodes souhaitées :
   - ✅ **Cards** (activé par défaut)
   - ✅ **PayPal** (cliquez sur "Enable" et suivez les instructions)
   - ✅ **Alipay** (activez pour les paiements en Asie)
   - ✅ **WeChat Pay** (activez pour les paiements en Chine)

**Note** : PayPal, Alipay et WeChat Pay peuvent nécessiter une approbation de Stripe selon votre pays.

### 4. Créer les produits dans Stripe

#### Option A : Via le Dashboard (Recommandé)

1. Allez dans **Products > Add product**
2. Créez les deux produits :

**Premium** :
- Nom : `RealTranslate Premium`
- Description : `Abonnement mensuel Premium`
- Prix : `9.99 EUR` (récurrent mensuel)
- ID du prix : Notez le `price_id` généré (ex: `price_1ABC123`)

**Enterprise** :
- Nom : `RealTranslate Enterprise`
- Description : `Abonnement mensuel Enterprise`
- Prix : `49.99 EUR` (récurrent mensuel)
- ID du prix : Notez le `price_id` généré (ex: `price_2DEF456`)

#### Option B : Via l'API Stripe

```bash
# Créer le produit Premium
curl https://api.stripe.com/v1/products \
  -u sk_test_votre_cle_secrete: \
  -d name="RealTranslate Premium" \
  -d description="Abonnement mensuel Premium"

# Créer le prix associé
curl https://api.stripe.com/v1/prices \
  -u sk_test_votre_cle_secrete: \
  -d product=prod_ABC123 \
  -d unit_amount=999 \
  -d currency=eur \
  -d "recurring[interval]"=month
```

### 5. Configurer les webhooks

1. Dans le Dashboard, allez dans **Developers > Webhooks**
2. Cliquez sur **Add endpoint**
3. URL du webhook : `https://votre-domaine.com/api/webhook/stripe`
4. Sélectionnez les événements à écouter :
   - ✅ `checkout.session.completed` (paiement réussi)
   - ✅ `payment_intent.payment_failed` (paiement échoué)
   - ✅ `customer.subscription.deleted` (abonnement annulé)
   - ✅ `customer.subscription.updated` (abonnement modifié)
5. Cliquez sur **Add endpoint**
6. **IMPORTANT** : Notez le **Signing secret** (`whsec_...`) affiché

---

## 🔧 Configuration Backend

### 1. Variables d'environnement

Ajoutez dans votre fichier `/backend/.env` :

```bash
# Configuration Stripe
STRIPE_SECRET_KEY=sk_test_votre_cle_secrete_ici
STRIPE_PUBLISHABLE_KEY=pk_test_votre_cle_publique_ici
STRIPE_WEBHOOK_SECRET=whsec_votre_secret_webhook_ici

# URL de l'application (pour les redirections)
APP_URL=http://localhost:3000  # En dev
# APP_URL=https://votre-domaine.com  # En prod

# Environnement
NODE_ENV=development  # ou 'production'
```

### 2. Mettre à jour les Price IDs dans le code

Éditez `/backend/stripe-payment.js` et mettez à jour les `stripePriceId` :

```javascript
export const SUBSCRIPTION_TIERS = {
  // ...
  premium: {
    // ...
    stripePriceId: 'price_VOTRE_ID_PREMIUM', // ← Remplacez par votre Price ID
    // ...
  },
  enterprise: {
    // ...
    stripePriceId: 'price_VOTRE_ID_ENTERPRISE', // ← Remplacez par votre Price ID
    // ...
  }
};
```

### 3. Installer les dépendances

```bash
cd backend
npm install
```

Cela installera Stripe SDK (`stripe@^14.11.0`) et les autres dépendances.

---

## 🎨 Intégration Frontend

### 1. Charger la clé publique Stripe

Au démarrage de l'application, récupérez la clé publique :

```javascript
// Dans app.js ou votre fichier principal
let stripePublishableKey = null;

async function loadStripeKey() {
  try {
    const res = await fetch('/api/payment/stripe-key');
    const data = await res.json();
    stripePublishableKey = data.publishableKey;
  } catch (error) {
    console.error('Erreur lors du chargement de la clé Stripe:', error);
  }
}

// Appeler au démarrage
loadStripeKey();
```

### 2. Implémenter le bouton de paiement

```javascript
async function subscribeToPlan(tier) {
  if (!['premium', 'enterprise'].includes(tier)) {
    alert('Tier invalide');
    return;
  }

  try {
    // Créer une session Stripe Checkout
    const res = await fetch('/api/payment/create-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: JSON.stringify({ tier })
    });

    const data = await res.json();

    if (data.sessionUrl) {
      // Rediriger vers Stripe Checkout
      window.location.href = data.sessionUrl;
    } else {
      alert('Erreur lors de la création de la session de paiement');
    }
  } catch (error) {
    console.error('Erreur:', error);
    alert('Erreur lors de la création de la session');
  }
}
```

### 3. Gérer le retour de paiement

```javascript
// Vérifier si l'utilisateur revient après un paiement
const urlParams = new URLSearchParams(window.location.search);

if (urlParams.get('payment') === 'success') {
  const sessionId = urlParams.get('session_id');

  // Afficher un message de succès
  showNotification('Paiement réussi ! Votre abonnement est maintenant actif.', 'success');

  // Recharger les informations utilisateur
  await loadUserInfo();

  // Nettoyer l'URL
  window.history.replaceState({}, document.title, window.location.pathname);
}

if (urlParams.get('payment') === 'cancelled') {
  showNotification('Paiement annulé.', 'info');
  window.history.replaceState({}, document.title, window.location.pathname);
}
```

### 4. Exemple d'UI pour les abonnements

```html
<div class="subscription-plans">
  <div class="plan">
    <h3>Premium</h3>
    <p class="price">9.99€/mois</p>
    <ul>
      <li>500 transcriptions/mois</li>
      <li>2500 traductions/mois</li>
      <li>500 synthèses vocales/mois</li>
      <li>Support prioritaire</li>
    </ul>
    <button onclick="subscribeToPlan('premium')">S'abonner</button>
  </div>

  <div class="plan">
    <h3>Enterprise</h3>
    <p class="price">49.99€/mois</p>
    <ul>
      <li>5000 transcriptions/mois</li>
      <li>25000 traductions/mois</li>
      <li>5000 synthèses vocales/mois</li>
      <li>Support 24/7 dédié</li>
    </ul>
    <button onclick="subscribeToPlan('enterprise')">S'abonner</button>
  </div>
</div>
```

---

## 🔄 Flux de Paiement Complet

### Étape par étape

1. **Utilisateur clique sur "S'abonner"** (Premium ou Enterprise)
2. **Frontend** appelle `/api/payment/create-session` avec le tier choisi
3. **Backend** crée une session Stripe Checkout via l'API Stripe
4. **Backend** renvoie l'URL de la session (`sessionUrl`)
5. **Frontend** redirige l'utilisateur vers Stripe Checkout
6. **Utilisateur** voit l'interface Stripe avec les méthodes de paiement disponibles :
   - Carte bancaire
   - PayPal
   - Alipay
   - WeChat Pay
7. **Utilisateur** choisit sa méthode et paie
8. **Stripe** traite le paiement de manière sécurisée
9. **Stripe** redirige l'utilisateur vers `success_url` ou `cancel_url`
10. **Stripe** envoie un webhook à `/api/webhook/stripe` avec l'événement `checkout.session.completed`
11. **Backend** vérifie la signature du webhook (sécurité)
12. **Backend** active l'abonnement pour 30 jours dans la base de données
13. **Frontend** affiche le message de succès et recharge les infos utilisateur

---

## 🔒 Sécurité

### Vérification de signature des webhooks

**IMPORTANT** : Le code backend vérifie automatiquement la signature de chaque webhook Stripe :

```javascript
// Dans server.js
const signature = req.headers['stripe-signature'];
const event = await verifyWebhookSignature(req.body, signature);
```

Cette vérification garantit que le webhook provient bien de Stripe et n'a pas été falsifié.

### Tests de sécurité

Testez votre webhook avec l'outil Stripe CLI :

```bash
# Installer Stripe CLI
# macOS
brew install stripe/stripe-cli/stripe

# Linux
# Voir: https://stripe.com/docs/stripe-cli

# Se connecter
stripe login

# Écouter les webhooks en local
stripe listen --forward-to localhost:3000/api/webhook/stripe

# Déclencher un événement test
stripe trigger checkout.session.completed
```

---

## 📊 Tarifs et Quotas

| Palier | Prix | Transcriptions/mois | Traductions/mois | TTS/mois | Support |
|--------|------|---------------------|------------------|----------|---------|
| **Gratuit** | 0€ | 50 | 250 | 50 | Email |
| **Premium** | 9.99€/mois | 500 | 2500 | 500 | Prioritaire |
| **Enterprise** | 49.99€/mois | 5000 | 25000 | 5000 | 24/7 Dédié |

---

## 🚀 Déploiement en Production

### 1. Passer en mode Live

1. Dans Stripe Dashboard, basculez de "Test" à "Live" (en haut à droite)
2. Récupérez vos nouvelles clés Live :
   - `pk_live_...`
   - `sk_live_...`
3. Créez un nouveau webhook pour la production avec le secret Live

### 2. Mettre à jour le `.env` de production

```bash
# Mode production
NODE_ENV=production
APP_URL=https://votre-domaine.com

# Clés Stripe LIVE
STRIPE_SECRET_KEY=sk_live_votre_cle_live
STRIPE_PUBLISHABLE_KEY=pk_live_votre_cle_live
STRIPE_WEBHOOK_SECRET=whsec_votre_secret_live
```

### 3. Configurer HTTPS

**OBLIGATOIRE** : Stripe nécessite HTTPS en production.

Voir le guide [SECURITY_HARDENING.md](./SECURITY_HARDENING.md) pour configurer Let's Encrypt.

### 4. Tests en production

1. Effectuez un paiement test avec une vraie carte (sera remboursé)
2. Vérifiez que le webhook est bien reçu dans les logs
3. Vérifiez que l'abonnement s'active correctement
4. Remboursez le paiement test via le Dashboard Stripe

---

## 📈 Monitoring et Analytiques

### Dashboard Stripe

1. **Payments** : Voir tous les paiements en temps réel
2. **Customers** : Liste de tous vos clients
3. **Subscriptions** : Gérer les abonnements actifs
4. **Disputes** : Gérer les litiges
5. **Logs** : Historique complet de tous les événements API

### Logs Backend

Surveillez les logs de l'application :

```bash
# Logs PM2
pm2 logs realtranslate

# Logs d'authentification
tail -f /var/log/realtranslate/auth.log

# Logs API
tail -f /var/log/realtranslate/api.log
```

### Métriques importantes

- **Taux de conversion** : Nombre de paiements réussis / tentatives
- **Taux d'échec** : Paiements échoués / total
- **MRR** (Monthly Recurring Revenue) : Revenu mensuel récurrent
- **Churn rate** : Taux d'annulation des abonnements

---

## 🔧 Dépannage

### Problème : "Webhook signature verification failed"

**Causes possibles** :
- Mauvais `STRIPE_WEBHOOK_SECRET` dans le `.env`
- Webhook configuré sur le mauvais environnement (Test vs Live)
- Corps de la requête modifié avant vérification

**Solution** :
1. Vérifiez que le secret webhook dans `.env` correspond à celui du Dashboard
2. Assurez-vous que le webhook utilise `express.raw()` pour le body
3. Vérifiez les logs Stripe Dashboard > Webhooks > Recent events

### Problème : "Payment method not available"

**Causes possibles** :
- Méthode de paiement non activée dans Stripe Dashboard
- Restrictions géographiques

**Solution** :
1. Allez dans Settings > Payment methods et activez la méthode
2. Vérifiez les restrictions par pays

### Problème : Abonnement non activé après paiement

**Causes possibles** :
- Webhook non reçu
- Erreur dans le traitement du webhook
- Email utilisateur incorrect dans la session

**Solution** :
1. Vérifiez les logs du serveur
2. Consultez Stripe Dashboard > Webhooks > Recent events
3. Vérifiez manuellement dans Stripe si le paiement est "succeeded"

---

## 📚 Ressources

- [Documentation Stripe](https://stripe.com/docs)
- [Stripe Checkout](https://stripe.com/docs/payments/checkout)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Stripe Testing](https://stripe.com/docs/testing)
- [Stripe CLI](https://stripe.com/docs/stripe-cli)
- [Support Stripe](https://support.stripe.com/)

---

## 🎓 Cartes de test Stripe

Pour tester en mode Test :

| Carte | Numéro | Résultat |
|-------|--------|----------|
| Visa | `4242 4242 4242 4242` | Succès |
| Visa (3D Secure) | `4000 0027 6000 3184` | Succès avec authentification |
| Mastercard | `5555 5555 5555 4444` | Succès |
| Carte déclinée | `4000 0000 0000 0002` | Échec (carte déclinée) |
| Fonds insuffisants | `4000 0000 0000 9995` | Échec (fonds insuffisants) |

**CVC** : N'importe quel 3 chiffres (ex: 123)
**Date d'expiration** : N'importe quelle date future (ex: 12/34)
**Code postal** : N'importe quel code (ex: 75001)

---

**Dernière mise à jour** : Janvier 2026
