# Configuration des Paiements - RealTranslate

Ce document explique comment configurer les systèmes de paiement PayPal et WeChat Pay pour RealTranslate.

## 🌍 Architecture des Paiements

RealTranslate supporte deux systèmes de paiement selon la région :
- **PayPal** : Europe & International
- **WeChat Pay** : Chine & Asie du Sud-Est

## 💳 Configuration PayPal

### 1. Créer un compte PayPal Business
1. Rendez-vous sur [PayPal Developer](https://developer.paypal.com/)
2. Créez une application dans le Dashboard
3. Notez vos clés API (Client ID et Secret)

### 2. Configuration des webhooks PayPal
1. Dans le Dashboard PayPal, allez dans "Webhooks"
2. Ajoutez l'URL webhook : `https://votre-domaine.com/api/webhook/paypal`
3. Sélectionnez les événements à surveiller :
   - `PAYMENT.SALE.COMPLETED`
   - `BILLING.SUBSCRIPTION.CREATED`
   - `BILLING.SUBSCRIPTION.CANCELLED`

### 3. Variables d'environnement
Ajoutez dans votre `.env` :
```bash
PAYPAL_CLIENT_ID=votre_client_id
PAYPAL_SECRET=votre_secret
PAYPAL_MODE=sandbox  # ou 'live' en production
```

### 4. Configuration des prix
Les prix sont automatiquement détectés dans le webhook :
- 9.99€ → Premium
- 49.99€ → Enterprise

### 5. Intégration Frontend
```javascript
// Exemple de redirection vers PayPal Checkout
function payWithPayPal(tier) {
  const prices = {
    premium: 9.99,
    enterprise: 49.99
  };

  // Redirection vers PayPal avec paramètres
  window.location.href = `https://www.paypal.com/checkout?...`;
}
```

## 💚 Configuration WeChat Pay

### 1. Créer un compte WeChat Pay Merchant
1. Rendez-vous sur [WeChat Pay](https://pay.weixin.qq.com/)
2. Créez un compte marchand (nécessite une entreprise chinoise)
3. Obtenez vos clés API (MCH_ID, API_KEY)

### 2. Configuration des webhooks WeChat Pay
1. Dans le dashboard WeChat Pay, configurez l'URL de callback
2. URL webhook : `https://votre-domaine.com/api/webhook/wechat`
3. Configurez la clé de signature

### 3. Variables d'environnement
Ajoutez dans votre `.env` :
```bash
WECHAT_MCH_ID=votre_mch_id
WECHAT_API_KEY=votre_api_key
WECHAT_APP_ID=votre_app_id
```

### 4. Configuration des prix
Convertir les prix en RMB (ou garder en EUR selon config) :
- 9.99€ ≈ 75 RMB → Premium
- 49.99€ ≈ 375 RMB → Enterprise

### 5. Intégration Frontend
```javascript
// Exemple de génération QR Code WeChat Pay
function payWithWeChat(tier) {
  const prices = {
    premium: 7500,  // en centimes (75 RMB)
    enterprise: 37500  // en centimes (375 RMB)
  };

  // Appel API pour générer le QR Code
  fetch('/api/payment/wechat/create', {
    method: 'POST',
    body: JSON.stringify({ tier, amount: prices[tier] })
  });
}
```

## 🔄 Flux de Paiement

### PayPal
1. Utilisateur clique sur "S'abonner" (Premium/Enterprise)
2. Redirection vers PayPal Checkout
3. Paiement effectué sur PayPal
4. PayPal envoie un webhook à `/api/webhook/paypal`
5. Backend active l'abonnement pour 30 jours
6. Email de confirmation envoyé à l'utilisateur

### WeChat Pay
1. Utilisateur clique sur "S'abonner" (Premium/Enterprise)
2. Génération d'un QR Code WeChat Pay
3. Utilisateur scanne le QR Code avec WeChat
4. Paiement effectué dans WeChat
5. WeChat envoie un webhook à `/api/webhook/wechat`
6. Backend active l'abonnement pour 30 jours
7. Notification push WeChat envoyée

## ⏱️ Gestion Automatique des Abonnements

### Expiration Automatique
- Un job CRON vérifie les abonnements expirés **toutes les heures**
- Lorsqu'un abonnement expire :
  1. Le statut passe de `active` à `expired`
  2. Le tier est réinitialisé vers `free`
  3. Les quotas sont réinitialisés aux valeurs gratuites
  4. Un log est généré dans `logs/auth.log`

### Code de vérification
```javascript
function checkExpiredSubscriptions() {
  const users = authManager.listUsers();
  const now = new Date();

  users.forEach(user => {
    if (user.subscription.expiresAt < now) {
      authManager.updateSubscription(user.email, 'free', null);
    }
  });
}

// Vérifier toutes les heures
setInterval(checkExpiredSubscriptions, 60 * 60 * 1000);
```

## 🔒 Sécurité

### Validation des Webhooks PayPal
```javascript
// Vérifier la signature PayPal IPN
const crypto = require('crypto');

function verifyPayPalSignature(headers, body) {
  const signature = headers['paypal-transmission-sig'];
  const certUrl = headers['paypal-cert-url'];
  const transmissionId = headers['paypal-transmission-id'];
  const timestamp = headers['paypal-transmission-time'];

  // Vérification de la signature...
  // Voir documentation PayPal IPN
}
```

### Validation des Webhooks WeChat Pay
```javascript
// Vérifier la signature WeChat Pay
function verifyWeChatSignature(body, signature) {
  const hash = crypto
    .createHash('sha256')
    .update(body + WECHAT_API_KEY)
    .digest('hex');

  return hash === signature;
}
```

## 📊 Tarifs et Quotas

| Palier | Prix | Transcriptions | Traductions | TTS | Support |
|--------|------|----------------|-------------|-----|---------|
| **Gratuit** | 0€ | 10/jour | 50/jour | 10/jour | Email |
| **Premium** | 9.99€/mois | 500/jour | 2000/jour | 500/jour | Prioritaire |
| **Enterprise** | 49.99€/mois | Illimité | Illimité | Illimité | 24/7 Dédié |

## 🚀 Déploiement en Production

### 1. Vérifier les variables d'environnement
```bash
# PayPal
PAYPAL_MODE=live
PAYPAL_CLIENT_ID=...
PAYPAL_SECRET=...

# WeChat Pay
WECHAT_MCH_ID=...
WECHAT_API_KEY=...
```

### 2. Configurer HTTPS
Les webhooks PayPal et WeChat Pay nécessitent **HTTPS obligatoirement**.

### 3. Tester les webhooks
Utilisez les modes sandbox/test des deux plateformes avant de passer en production.

### 4. Monitoring
- Surveiller les logs : `logs/api.log`, `logs/auth.log`
- Créer des alertes pour les échecs de webhook
- Vérifier quotidiennement les abonnements actifs

## 🆘 Support

Pour toute question sur la configuration des paiements :
- Documentation PayPal : https://developer.paypal.com/docs/
- Documentation WeChat Pay : https://pay.weixin.qq.com/wiki/doc/api/
- Issues GitHub : https://github.com/votre-repo/RealTranslate/issues

---

**Note** : Ce système de paiement est configuré mais nécessite l'activation complète des comptes PayPal Business et WeChat Pay Merchant avec les clés API correspondantes.
