# Guide de Conformité RGPD - RealTranslate

Ce document détaille la conformité de RealTranslate au Règlement Général sur la Protection des Données (RGPD - UE 2016/679) et les mesures mises en place pour protéger les données personnelles des utilisateurs.

## 📋 Table des Matières

1. [Introduction au RGPD](#introduction-au-rgpd)
2. [Données collectées](#données-collectées)
3. [Base juridique du traitement](#base-juridique)
4. [Droits des utilisateurs](#droits-des-utilisateurs)
5. [Gestion du consentement](#gestion-du-consentement)
6. [Transferts de données hors UE](#transferts-hors-ue)
7. [Sécurité des données](#sécurité-des-données)
8. [Conservation des données](#conservation-des-données)
9. [Sous-traitants](#sous-traitants)
10. [Notifications de violation](#notifications-de-violation)
11. [Délégué à la Protection des Données (DPO)](#dpo)
12. [Checklist de conformité](#checklist)

---

## 1. Introduction au RGPD

Le **Règlement Général sur la Protection des Données (RGPD)** est entré en vigueur le 25 mai 2018 dans l'Union Européenne. Il vise à renforcer la protection des données personnelles et harmoniser les lois sur la vie privée à travers l'Europe.

### Principes fondamentaux

RealTranslate respecte les 6 principes du RGPD :

1. **Licéité, loyauté, transparence** : Traitement légal, équitable et transparent
2. **Limitation des finalités** : Collecte pour des finalités déterminées et légitimes
3. **Minimisation des données** : Données adéquates, pertinentes et limitées
4. **Exactitude** : Données exactes et tenues à jour
5. **Limitation de la conservation** : Durées de conservation définies
6. **Intégrité et confidentialité** : Sécurité appropriée des données

---

## 2. Données Collectées

### 2.1 Données personnelles

| Catégorie | Données | Finalité | Base juridique |
|-----------|---------|----------|----------------|
| **Identification** | Email, nom d'affichage | Création de compte, authentification | Exécution du contrat |
| **Authentification** | Mot de passe (hashé bcrypt) | Sécurité du compte | Exécution du contrat |
| **Abonnement** | Tier, date d'expiration, historique de paiement | Gestion de l'abonnement | Exécution du contrat |
| **Utilisation** | Quotas d'utilisation (transcriptions, traductions, TTS) | Limitation selon l'abonnement | Exécution du contrat |
| **Social** | Liste d'amis, demandes d'ami, groupes | Fonctionnalités sociales | Exécution du contrat |
| **Contenu** | Messages, traductions, fichiers partagés | Service de traduction | Exécution du contrat |
| **Paiement** | Historique de paiement (montant, date) | Facturation, comptabilité | Obligation légale |

### 2.2 Données techniques

| Données | Finalité | Base juridique |
|---------|----------|----------------|
| Adresse IP | Sécurité, prévention des abus | Intérêt légitime |
| Logs d'accès | Surveillance, débogage | Intérêt légitime |
| User-Agent | Compatibilité | Intérêt légitime |
| Statut en ligne | Fonctionnalité de messagerie | Consentement |

### 2.3 Données NON collectées

RealTranslate **ne collecte PAS** :
- ❌ Numéro de carte bancaire (géré par Stripe)
- ❌ Données de localisation GPS
- ❌ Contacts de l'appareil
- ❌ Données biométriques
- ❌ Données de navigation hors application

---

## 3. Base Juridique du Traitement

Conformément à l'Article 6(1) du RGPD, chaque traitement repose sur une base juridique :

### 3.1 Exécution du contrat (Art. 6(1)(b))

- Création et gestion du compte utilisateur
- Fourniture des services de traduction
- Gestion de l'abonnement
- Messagerie et fonctionnalités sociales

### 3.2 Obligation légale (Art. 6(1)(c))

- Conservation des données de facturation (10 ans - obligations comptables)
- Réponse aux demandes d'autorités judiciaires

### 3.3 Intérêt légitime (Art. 6(1)(f))

- Sécurité de la plateforme (logs, détection de fraude)
- Amélioration du service
- Support technique

### 3.4 Consentement (Art. 6(1)(a))

- Analytics (si activé)
- Marketing (si activé)
- Cookies non essentiels (si activés)
- Transferts de données hors UE vers certains pays

---

## 4. Droits des Utilisateurs

RealTranslate garantit l'exercice des droits suivants :

### 4.1 Droit d'accès (Article 15)

**Permettre à l'utilisateur d'obtenir une copie de ses données.**

**Implémentation** :
```javascript
GET /api/gdpr/export
Authorization: Bearer {token}
```

**Résultat** : Fichier JSON contenant toutes les données personnelles.

### 4.2 Droit de rectification (Article 16)

**Permettre à l'utilisateur de corriger ses données inexactes.**

**Implémentation** :
- Modifier le nom d'affichage : Interface utilisateur
- Modifier l'email : Contact DPO (vérification identité)
- Modifier le mot de passe : `POST /api/auth/change-password`

### 4.3 Droit à l'effacement (Article 17)

**Permettre à l'utilisateur de demander la suppression de ses données.**

**Implémentation** :
```javascript
POST /api/gdpr/delete-request
Authorization: Bearer {token}
```

**Processus** :
1. Demande de suppression enregistrée
2. Période de grâce de 30 jours (conformité)
3. Suppression définitive des données
4. Anonymisation des messages (pour préserver l'intégrité des conversations)

### 4.4 Droit à la portabilité (Article 20)

**Permettre à l'utilisateur de récupérer ses données dans un format structuré.**

**Implémentation** : Export JSON via `/api/gdpr/export`

### 4.5 Droit d'opposition (Article 21)

**Permettre à l'utilisateur de s'opposer au traitement de ses données.**

**Implémentation** :
- S'opposer au marketing : Désactiver le consentement
- S'opposer au profilage : Non applicable (RealTranslate ne fait pas de profilage)

### 4.6 Droit à la limitation (Article 18)

**Permettre à l'utilisateur de demander la limitation du traitement.**

**Implémentation** : Contact DPO pour gel temporaire du compte

---

## 5. Gestion du Consentement

### 5.1 Types de consentement

RealTranslate distingue plusieurs types de consentement :

| Type | Description | Obligatoire | API |
|------|-------------|-------------|-----|
| `essential` | Services essentiels au fonctionnement | ✅ Oui | Automatique |
| `analytics` | Statistiques d'utilisation | ❌ Non | Opt-in |
| `marketing` | Communications marketing | ❌ Non | Opt-in |
| `personalization` | Personnalisation de l'expérience | ❌ Non | Opt-in |
| `third_party` | Services tiers (OpenAI, DeepSeek) | ⚠️ Requis pour le service | Opt-in |

### 5.2 Endpoints de gestion du consentement

**Récupérer les consentements** :
```javascript
GET /api/gdpr/consent
Authorization: Bearer {token}

// Réponse
{
  "consent": {
    "consents": {
      "essential": true,
      "analytics": false,
      "marketing": false,
      "personalization": true,
      "third_party": true
    },
    "updatedAt": "2026-01-15T10:30:00Z"
  }
}
```

**Mettre à jour les consentements** :
```javascript
POST /api/gdpr/consent
Authorization: Bearer {token}
Content-Type: application/json

{
  "consents": {
    "analytics": true,
    "marketing": false,
    "personalization": true,
    "third_party": true
  }
}
```

### 5.3 Caractéristiques du consentement RGPD

Conformément à l'Article 7 du RGPD, le consentement doit être :

- ✅ **Libre** : Pas de pression, alternative gratuite disponible
- ✅ **Spécifique** : Par finalité (analytics, marketing, etc.)
- ✅ **Éclairé** : Information claire sur l'usage
- ✅ **Univoque** : Action positive claire (pas de cases pré-cochées)
- ✅ **Révocable** : Aussi facile à retirer qu'à donner

---

## 6. Transferts de Données Hors UE

### 6.1 Destinations des transferts

| Sous-traitant | Pays | Données transférées | Garanties |
|---------------|------|---------------------|-----------|
| **OpenAI** | 🇺🇸 USA | Audio/Texte pour traduction | Clauses Contractuelles Types (SCC) |
| **DeepSeek** | 🇨🇳 Chine | Texte pour traduction | Consentement explicite |
| **Stripe** | 🇺🇸 USA | Email, montant, devise | Clauses Contractuelles Types (SCC) |

### 6.2 Vérification du consentement

Avant chaque transfert vers un service tiers, le système vérifie :

```javascript
// Vérification automatique
const canTransfer = canTransferDataOutsideEU(userEmail, 'openai');

if (!canTransfer) {
  return res.status(403).json({
    error: 'Consentement requis pour les services tiers'
  });
}
```

### 6.3 Clauses Contractuelles Types (SCC)

RealTranslate utilise les **SCC (Standard Contractual Clauses)** approuvées par la Commission Européenne pour les transferts vers les USA (OpenAI, Stripe).

**Documentation** :
- [SCC Commission Européenne](https://ec.europa.eu/info/law/law-topic/data-protection/international-dimension-data-protection/standard-contractual-clauses-scc_en)

---

## 7. Sécurité des Données

### 7.1 Mesures techniques

| Mesure | Implémentation |
|--------|----------------|
| **Chiffrement en transit** | HTTPS/TLS 1.2+ obligatoire |
| **Chiffrement au repos** | AES-256-GCM pour données sensibles |
| **Hashing des mots de passe** | Bcrypt (cost factor 12) |
| **Authentification** | JWT avec expiration 30 jours |
| **Rate limiting** | Protection contre brute force |
| **En-têtes de sécurité** | Helmet.js (CSP, HSTS, etc.) |
| **Validation des entrées** | Sanitisation automatique |
| **Logs de sécurité** | Tous les événements d'authentification |

### 7.2 Mesures organisationnelles

- 🔐 Accès aux données limité au personnel autorisé
- 📝 Politique de gestion des mots de passe
- 🎓 Formation du personnel sur le RGPD
- 🔍 Audits de sécurité réguliers
- 📋 Plan de réponse aux incidents

### 7.3 Pseudonymisation et anonymisation

- Messages supprimés → Anonymisés (`[Utilisateur supprimé]`)
- Logs → IP anonymisées après 90 jours
- Analytics → Données agrégées uniquement

---

## 8. Conservation des Données

### 8.1 Durées de conservation

| Données | Durée | Justification |
|---------|-------|---------------|
| **Compte actif** | Tant que le compte existe | Exécution du contrat |
| **Compte supprimé** | 30 jours puis suppression | Conformité + Possibilité de récupération |
| **Données de facturation** | 10 ans | Obligation légale (comptabilité) |
| **Logs d'accès** | 90 jours | Sécurité et débogage |
| **Logs d'authentification** | 1 an | Sécurité |
| **Messages supprimés** | Anonymisés immédiatement | Intégrité des conversations |

### 8.2 Suppression automatique

```javascript
// Job automatique de suppression
function cleanExpiredData() {
  // Supprimer les demandes de suppression > 30 jours
  processDeletionRequests();

  // Anonymiser les logs > 90 jours
  anonymizeOldLogs();

  // Nettoyer les tokens expirés
  cleanExpiredTokens();
}

// Exécuté quotidiennement
setInterval(cleanExpiredData, 24 * 60 * 60 * 1000);
```

---

## 9. Sous-traitants (Article 28 RGPD)

### 9.1 Liste des sous-traitants

| Sous-traitant | Rôle | Données traitées | Contrat RGPD |
|---------------|------|------------------|--------------|
| **OpenAI** | Traitement IA | Audio, texte | ✅ Oui |
| **DeepSeek** | Traitement IA | Texte | ✅ Oui |
| **Stripe** | Paiements | Email, montant | ✅ Oui (PCI-DSS) |
| **Hébergeur** | Infrastructure | Toutes les données | ✅ Oui |

### 9.2 Obligations des sous-traitants

Tous les sous-traitants doivent :
- ✅ Signer un accord de traitement des données (DPA)
- ✅ Garantir la sécurité des données
- ✅ Ne traiter les données que sur instruction
- ✅ Assister en cas de violation de données
- ✅ Supprimer/restituer les données à la fin du contrat

---

## 10. Notifications de Violation

### 10.1 Procédure en cas de violation (Article 33-34)

**Délais** :
- ⏱️ **72 heures** pour notifier l'autorité de contrôle (CNIL en France)
- ⏱️ **Sans délai** pour notifier les personnes concernées (si risque élevé)

**Processus** :

1. **Détection** : Surveillance active des logs et alertes
2. **Évaluation** : Déterminer la nature et l'impact de la violation
3. **Confinement** : Limiter les dégâts immédiatement
4. **Notification CNIL** : Via le formulaire en ligne (72h max)
5. **Notification utilisateurs** : Si risque élevé pour leurs droits
6. **Documentation** : Registre des violations
7. **Mesures correctives** : Prévenir de futures violations

### 10.2 Informations à fournir

- Nature de la violation
- Catégories et nombre approximatif de personnes concernées
- Catégories et nombre approximatif d'enregistrements
- Conséquences probables
- Mesures prises ou envisagées

### 10.3 Contact CNIL

**France** :
- Site web : https://www.cnil.fr/
- Notification : https://notifications.cnil.fr/
- Téléphone : 01 53 73 22 22

---

## 11. Délégué à la Protection des Données (DPO)

### 11.1 Coordonnées du DPO

**Email** : dpo@realtranslate.com
**Adresse postale** : [À compléter]
**Téléphone** : [À compléter]

### 11.2 Rôle du DPO

- 📋 Tenir le registre des activités de traitement
- 🎓 Sensibiliser et former le personnel
- 🔍 Surveiller la conformité au RGPD
- 🤝 Coopérer avec l'autorité de contrôle
- 📞 Point de contact pour les personnes concernées

### 11.3 Registre des activités de traitement

Génération automatique via :

```javascript
GET /api/gdpr/compliance-report
Authorization: Bearer {admin_token}
```

---

## 12. Checklist de Conformité

### ✅ Obligations légales

- [x] Registre des activités de traitement maintenu
- [x] Base juridique identifiée pour chaque traitement
- [x] Information claire des utilisateurs (politique de confidentialité)
- [x] Mécanisme de consentement conforme
- [x] Procédure de réponse aux demandes d'accès
- [x] Procédure de suppression des données
- [x] DPO désigné et contactable
- [x] Accords avec les sous-traitants (DPA)
- [x] Procédure de notification de violation
- [x] Garanties pour les transferts hors UE

### ✅ Mesures techniques

- [x] Chiffrement HTTPS/TLS
- [x] Hashing sécurisé des mots de passe (bcrypt)
- [x] Logs de sécurité et d'audit
- [x] Contrôle d'accès et authentification
- [x] Sauvegarde et récupération des données
- [x] Limitation des tentatives de connexion
- [x] Détection des activités suspectes

### ✅ Droits des utilisateurs

- [x] Droit d'accès (export JSON)
- [x] Droit de rectification (modification profil)
- [x] Droit à l'effacement (suppression compte)
- [x] Droit à la portabilité (export JSON)
- [x] Droit d'opposition (gestion consentements)
- [x] Droit à la limitation (contact DPO)

---

## 📚 Ressources et Références

### Documentation officielle

- [RGPD - Texte officiel (EUR-Lex)](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- [CNIL - Commission Nationale de l'Informatique et des Libertés](https://www.cnil.fr/)
- [Guide CNIL du sous-traitant](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre4)
- [EDPB - European Data Protection Board](https://edpb.europa.eu/)

### Outils pratiques

- [Générateur de politique de confidentialité CNIL](https://www.cnil.fr/fr/modeles)
- [Checklist de conformité CNIL](https://www.cnil.fr/fr/principes-cles/rgpd-se-preparer-en-6-etapes)
- [Registre des activités de traitement (modèle)](https://www.cnil.fr/fr/cartographier-vos-traitements-de-donnees-personnelles)

### Formation

- [MOOC CNIL - L'atelier RGPD](https://atelier-rgpd.cnil.fr/)
- [Formation RGPD pour développeurs](https://www.cnil.fr/fr/formations)

---

## 🔄 Mises à Jour de ce Document

| Date | Version | Modifications |
|------|---------|---------------|
| 2026-01-21 | 1.0 | Création initiale du guide de conformité |

---

## 📧 Contact

Pour toute question relative à la protection des données :

- **DPO** : dpo@realtranslate.com
- **Support** : admin@realtranslate.com
- **Autorité de contrôle (France)** : https://www.cnil.fr/

---

**Note importante** : Ce document est un guide de conformité technique. Il doit être complété par une **Politique de Confidentialité** publiée sur votre site web, rédigée dans un langage clair et accessible aux utilisateurs.

---

**Dernière mise à jour** : Janvier 2026
**Validé par** : [DPO à compléter]
