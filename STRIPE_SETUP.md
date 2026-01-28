# Configuration Stripe pour RealTranslate

Ce guide explique comment configurer Stripe Checkout pour accepter les paiements par carte bancaire.

## 📋 Prérequis

1. Un compte Stripe (gratuit) : https://dashboard.stripe.com/register
2. Accès au Dashboard Stripe
3. Un domaine HTTPS (obligatoire pour les webhooks Stripe en production)

---

## 🚀 Configuration Rapide

### 1. Créer un compte Stripe

1. Inscrivez-vous sur https://dashboard.stripe.com/register
2. Validez votre email
3. Complétez les informations de votre entreprise

### 2. Récupérer les clés API

#### En mode TEST (développement)

1. Allez sur https://dashboard.stripe.com/test/apikeys
2. Copiez la **Publishable key** (pk_test_...)
3. Cliquez sur "Reveal test key" pour la **Secret key** (sk_test_...)

#### En mode LIVE (production)

1. Activez votre compte Stripe en complétant les informations bancaires
2. Allez sur https://dashboard.stripe.com/apikeys
3. Copiez la **Publishable key** (pk_live_...)
4. Copiez la **Secret key** (sk_live_...)

### 3. Créer les produits et prix

#### Option A : Via le Dashboard (recommandé)

1. Allez sur https://dashboard.stripe.com/products
2. Cliquez sur **"+ Add product"**

**Produit Premium :**
- Nom : `RealTranslate Premium`
- Description : `Abonnement Premium - 500 transcriptions, 2500 traductions, 500 TTS/mois`
- Prix : `9.99 EUR` récurrent `Monthly`
- Copiez le **Price ID** (commence par `price_...`)

**Produit Enterprise :**
- Nom : `RealTranslate Enterprise`
- Description : `Abonnement Enterprise - Usage illimité`
- Prix : `49.99 EUR` récurrent `Monthly`
- Copiez le **Price ID** (commence par `price_...`)

#### Option B : Via Stripe CLI

```bash
# Premium
stripe products create \
  --name="RealTranslate Premium" \
  --description="500 transcriptions, 2500 traductions, 500 TTS/mois"

stripe prices create \
  --product=<PRODUCT_ID> \
  --unit-amount=999 \
  --currency=eur \
  --recurring[interval]=month

# Enterprise
stripe products create \
  --name="RealTranslate Enterprise" \
  --description="Usage illimité"

stripe prices create \
  --product=<PRODUCT_ID> \
  --unit-amount=4999 \
  --currency=eur \
  --recurring[interval]=month
```

### 4. Configurer le webhook

1. Allez sur https://dashboard.stripe.com/webhooks
2. Cliquez sur **"+ Add endpoint"**
3. URL du endpoint :
   - **Production** : `https://ia.leuca.fr/api/webhook/stripe`
   - **Test local** : `http://localhost:3000/api/webhook/stripe` (avec Stripe CLI)
4. Sélectionnez les événements à écouter :
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copiez le **Signing secret** (whsec_...)

### 5. Configurer les variables d'environnement

Éditez le fichier `/root/RealTranslate/backend/.env` sur le serveur :

```bash
# Clés Stripe
STRIPE_SECRET_KEY=sk_test_votre_cle_secrete_ici
STRIPE_PUBLISHABLE_KEY=pk_test_votre_cle_publique_ici
STRIPE_WEBHOOK_SECRET=whsec_votre_webhook_secret_ici

# Price IDs des produits
STRIPE_PRICE_PREMIUM=price_xxx_premium_monthly
STRIPE_PRICE_ENTERPRISE=price_xxx_enterprise_monthly
```

**⚠️ IMPORTANT :**
- En production, remplacez `sk_test_` par `sk_live_`
- Ne commitez JAMAIS vos clés dans Git
- Gardez la Secret Key confidentielle

---

## 🧪 Tests en Local

### 1. Installer Stripe CLI

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Linux
wget https://github.com/stripe/stripe-cli/releases/download/v1.19.5/stripe_1.19.5_linux_x86_64.tar.gz
tar -xvf stripe_1.19.5_linux_x86_64.tar.gz
sudo mv stripe /usr/local/bin/

# Vérifier l'installation
stripe --version
```

### 2. S'authentifier avec Stripe CLI

```bash
stripe login
```

### 3. Forwarder les webhooks vers localhost

```bash
stripe listen --forward-to localhost:3000/api/webhook/stripe
```

Cette commande affiche un **webhook signing secret** temporaire (whsec_...) à utiliser dans votre `.env` local.

### 4. Tester un paiement

1. Démarrez votre serveur : `npm start`
2. Ouvrez http://localhost:3000
3. Connectez-vous
4. Cliquez sur "Voir les tarifs" puis "S'abonner" sur Premium ou Enterprise
5. Utilisez les cartes de test Stripe :
   - **Succès** : `4242 4242 4242 4242`
   - **Échec** : `4000 0000 0000 0002`
   - **3D Secure** : `4000 0027 6000 3184`
   - CVV : n'importe quel 3 chiffres
   - Date : n'importe quelle date future
   - Code postal : n'importe quel code

### 5. Déclencher un webhook manuellement

```bash
# Simuler un checkout réussi
stripe trigger checkout.session.completed
```

---

## 🚀 Déploiement en Production

### 1. Basculer en mode LIVE

1. Récupérez vos clés **LIVE** (pk_live_ et sk_live_)
2. Activez votre compte Stripe (informations bancaires requises)
3. Créez les produits en mode LIVE
4. Configurez le webhook sur l'URL de production
5. Mettez à jour le `.env` sur le serveur avec les clés LIVE

### 2. Redémarrer l'application

```bash
ssh root@ia.leuca.fr

cd /root/RealTranslate/backend

# Installer le package stripe
npm install

# Vérifier le .env
nano .env
# Ajouter les clés Stripe

# Redémarrer PM2
pm2 restart realtranslate

# Vérifier les logs
pm2 logs realtranslate --lines 50
```

### 3. Vérifier que le site fonctionne

1. Ouvrez https://ia.leuca.fr
2. Connectez-vous
3. Allez sur "Voir les tarifs"
4. Testez un paiement

---

## 🔐 Sécurité

### Bonnes pratiques

1. **Ne jamais exposer la Secret Key** côté client
2. **Toujours vérifier les signatures** des webhooks (déjà implémenté)
3. **Utiliser HTTPS** en production (obligatoire pour Stripe)
4. **Restreindre les clés API** dans le Dashboard Stripe
5. **Activer l'authentification 2FA** sur votre compte Stripe
6. **Monitorer les webhooks** dans le Dashboard

### Logs Stripe

- Webhooks : https://dashboard.stripe.com/webhooks
- Événements : https://dashboard.stripe.com/events
- Paiements : https://dashboard.stripe.com/payments
- Clients : https://dashboard.stripe.com/customers

---

## 🛠️ Endpoints API

### POST /api/create-checkout-session

Crée une session Stripe Checkout.

**Headers :**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body :**
```json
{
  "tier": "premium" // ou "enterprise"
}
```

**Response :**
```json
{
  "success": true,
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/c/pay/cs_test_..."
}
```

### POST /api/webhook/stripe

Webhook pour recevoir les événements Stripe.

**Headers :**
```
Stripe-Signature: t=...,v1=...
```

**Événements gérés :**
- `checkout.session.completed` → Active l'abonnement
- `customer.subscription.updated` → Met à jour l'abonnement
- `customer.subscription.deleted` → Désactive l'abonnement
- `invoice.payment_succeeded` → Renouvellement réussi
- `invoice.payment_failed` → Échec de paiement

### POST /api/create-portal-session

Crée un lien vers le portail client Stripe (pour gérer l'abonnement).

**Headers :**
```
Authorization: Bearer <token>
```

**Response :**
```json
{
  "success": true,
  "url": "https://billing.stripe.com/session/..."
}
```

---

## 🐛 Dépannage

### L'app ne démarre pas (erreur 502)

```bash
# Vérifier les logs PM2
pm2 logs realtranslate --lines 100

# Si erreur "Cannot find package 'stripe'"
cd /root/RealTranslate/backend
npm install stripe
pm2 restart realtranslate
```

### Les webhooks ne fonctionnent pas

1. Vérifiez que l'URL du webhook est correcte dans le Dashboard
2. Vérifiez que le `STRIPE_WEBHOOK_SECRET` est correct
3. Consultez les logs dans le Dashboard Stripe > Webhooks > Cliquez sur votre endpoint
4. Vérifiez les logs serveur : `pm2 logs realtranslate`

### Le paiement ne s'active pas

1. Vérifiez les logs du webhook dans le Dashboard Stripe
2. Vérifiez que l'email de l'utilisateur est correct
3. Vérifiez les logs PM2 : `pm2 logs realtranslate | grep -i stripe`

### Erreur "Payment system not configured"

Vérifiez que toutes les variables d'environnement sont définies :
```bash
cat /root/RealTranslate/backend/.env | grep STRIPE
```

---

## 📚 Ressources

- **Documentation officielle Stripe Checkout** : https://docs.stripe.com/payments/checkout
- **API Stripe** : https://docs.stripe.com/api
- **Dashboard Stripe** : https://dashboard.stripe.com
- **Cartes de test** : https://docs.stripe.com/testing
- **Stripe CLI** : https://docs.stripe.com/stripe-cli

---

## 💡 Fonctionnalités Supplémentaires (Optionnelles)

### Codes promo

Activés par défaut dans Checkout. Créez-les dans le Dashboard :
https://dashboard.stripe.com/coupons

### Portail client

Permet aux utilisateurs de gérer leur abonnement (changement de carte, annulation, etc.).

Bouton à ajouter dans le frontend :
```javascript
async function manageSubscription() {
  const response = await fetch('/api/create-portal-session', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();
  window.location.href = data.url;
}
```

### Facturation automatique

Stripe génère automatiquement les factures et les envoie par email aux clients.

Personnalisez les emails dans le Dashboard :
https://dashboard.stripe.com/settings/emails

---

## ✅ Checklist de Déploiement

- [ ] Compte Stripe créé et activé
- [ ] Clés API récupérées (Secret Key + Publishable Key)
- [ ] Produits créés (Premium + Enterprise)
- [ ] Price IDs copiés
- [ ] Webhook configuré sur l'URL de production
- [ ] Webhook Secret copié
- [ ] Variables d'environnement configurées dans `.env`
- [ ] Package `stripe` installé (`npm install`)
- [ ] PM2 redémarré
- [ ] Test de paiement effectué avec succès
- [ ] Webhook testé et fonctionnel

---

🎉 **Votre intégration Stripe est prête !**

Pour toute question, consultez la [documentation officielle](https://docs.stripe.com) ou contactez le support Stripe.
