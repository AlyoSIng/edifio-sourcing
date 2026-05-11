# Mentions légales et politique de confidentialité — edifio Sourcing v1.0

**Auteur** : [CEO Marc] + [CTO Sophie]
**Date** : 2026-05-10
**Statut** : Template à publier sur `/legal` à activer en Gate 9
**Note** : SIREN, adresse exacte du siège et téléphone à compléter par TEISSIER avant publication

---

## Page `/legal` — contenu à publier

---

# Mentions légales

## Éditeur du service

**edifio Sourcing** est un outil interne édité par :

**AlyoS Ingénierie**
Société [forme juridique à compléter — SARL/SAS/EURL] au capital de [à compléter] €
Siège social : [adresse complète à compléter]
SIREN : [à compléter] · RCS [ville d'immatriculation à compléter]
Numéro de TVA intracommunautaire : [FR + 11 chiffres à compléter]

**Représentant légal** : TEISSIER (Dirigeant)
**Contact** : `contact@alyosingenierie.fr`
**Délégué à la protection des données** : `dpo@alyosingenierie.fr` *(à créer Gate 9)*

## Hébergement

Le service edifio Sourcing est hébergé chez :
- **Vercel Inc.** — frontend & API — *Region eu-west-3 (Paris)*
- **Supabase Inc.** — base de données + authentification + stockage — *Region eu-central-1 (Francfort)*
- **Fly.io Inc.** — container de scraping — *Frankfurt (DEU)*

Tous les sous-traitants techniques opèrent dans l'Espace Économique Européen et ont signé un accord de traitement de données (DPA) conforme au RGPD.

## Public concerné

edifio Sourcing est un **outil interne** réservé aux collaborateurs d'AlyoS Ingénierie disposant d'une adresse email professionnelle en `@alyosingenierie.fr`. Toute tentative d'accès depuis une adresse externe est rejetée et journalisée pour des raisons de sécurité.

## Propriété intellectuelle

L'ensemble des éléments composant edifio Sourcing (code source, design, marque edifio, contenu éditorial) est la propriété exclusive d'AlyoS Ingénierie ou de ses ayants droit. Toute reproduction, diffusion ou exploitation sans autorisation écrite préalable est interdite.

La marque `edifio` et la composition `edifio Sourcing` sont des marques d'AlyoS Ingénierie.

---

# Politique de confidentialité

## 1. Données collectées

Dans le cadre de l'utilisation d'edifio Sourcing, nous collectons et traitons les catégories de données suivantes :

### 1.1. Utilisateurs (salariés AlyoS Ingénierie)
- Email professionnel (obligatoire pour l'authentification)
- Nom et prénom
- Rôle dans l'organisation (admin / user / viewer)
- Identifiants techniques de session (JWT, cookies)
- Logs d'activité (action effectuée, horodatage, adresse IP)

### 1.2. Contacts architectes externes
- Nom, prénom, civilité
- Email professionnel et téléphone
- SIRET et raison sociale
- Spécialités et zones d'intervention
- Historique des sollicitations et collaborations
- Préférence de tutoiement / vouvoiement
- Notes internes

### 1.3. Données métier
- Appels d'offres publics (données issues des plateformes officielles BOAMP, PLACE, etc.)
- Pièces du dossier de candidature et bibliothèque (présentations, attestations, références, CV)
- Communications transactionnelles (mails Brevo / Resend) et leur statut (envoyé, ouvert, cliqué)

## 2. Finalités et bases légales

| Traitement | Finalité | Base légale |
|------------|----------|-------------|
| Authentification | Permettre l'accès sécurisé à l'outil | Exécution du contrat de travail |
| Sourcing AO | Détecter les opportunités d'affaires | Intérêt légitime |
| Base architectes | Mobiliser des cotraitants MOE | Intérêt légitime (relation B2B) |
| Sollicitations Brevo | Proposer une cotraitance sur un AO précis | Intérêt légitime |
| Analyse IA | Automatiser la préparation des dossiers | Exécution du contrat de travail |
| Logs d'audit | Sécurité et conformité | Obligation légale + intérêt légitime |

## 3. Durées de conservation

- Comptes utilisateurs : durée du contrat de travail + 1 an
- Données AO : 7 ans (durée de prescription marchés publics)
- Contacts architectes : 3 ans après dernier contact effectif
- Logs d'audit : 5 ans
- Données IA (inputs/outputs) : 12 mois puis anonymisation

## 4. Destinataires

Les données collectées sont accessibles à :
- Les utilisateurs autorisés d'AlyoS Ingénierie (selon leur rôle et les politiques RLS)
- Nos sous-traitants techniques (Supabase, Vercel, Fly.io, Brevo, Resend, Anthropic, OVH) dans la limite de la finalité strictement nécessaire
- Sur réquisition légale, à toute autorité compétente

Aucune donnée n'est transférée à des tiers à des fins commerciales.

## 5. Transferts hors Union Européenne

**Aucun transfert hors UE.** Tous nos sous-traitants opèrent dans l'EEE et stockent les données sur le territoire de l'Union.

## 6. Sécurité

Nous mettons en œuvre des mesures techniques et organisationnelles pour protéger les données :
- Chiffrement TLS 1.3 pour les communications
- Chiffrement at-rest des données stockées (AES-256)
- Authentification par lien magique (sans mot de passe à mémoriser)
- Restriction d'accès au domaine `@alyosingenierie.fr` pour edifio Sourcing
- Isolation Row-Level Security (RLS) sur 100 % des tables multi-tenant
- Audit log immutable pour toute action sensible
- Sauvegardes chiffrées quotidiennes
- Audit de sécurité OWASP régulier

## 7. Droits des personnes concernées

Conformément au RGPD, vous disposez des droits suivants :
- **Accès** : connaître les données vous concernant
- **Rectification** : faire corriger des données inexactes
- **Effacement** (« droit à l'oubli ») : sous réserve des obligations légales de conservation
- **Limitation** du traitement
- **Opposition** : pour les traitements fondés sur l'intérêt légitime
- **Portabilité** : recevoir vos données dans un format structuré

### Pour les architectes externes

Chaque mail de sollicitation reçu via edifio Sourcing comporte un lien permettant à tout moment :
- d'accéder aux données vous concernant
- de demander leur modification ou suppression
- de vous opposer définitivement à tout nouveau contact

### Pour exercer vos droits

Adressez votre demande par email à `dpo@alyosingenierie.fr` *(à activer Gate 9)*. Nous répondons dans un délai maximal d'**1 mois**.

En cas de litige non résolu, vous pouvez introduire une réclamation auprès de la **CNIL** (cnil.fr).

## 8. Cookies et traceurs

edifio Sourcing utilise uniquement des cookies strictement nécessaires au fonctionnement du service (session d'authentification). Aucun cookie publicitaire, aucun cookie analytique tiers ne sont déposés. Vercel Analytics (mesure de performance) est configuré sans transfert de données personnelles.

## 9. Évolution

Cette politique peut être modifiée. Les modifications substantielles seront notifiées aux utilisateurs par email ou via un bandeau d'information à la connexion suivante.

**Dernière mise à jour** : *[à compléter à la date de publication Gate 9]*

---

# Footer mail Brevo *(à intégrer dans tous les templates architectes)*

```
---
Vous recevez ce message car l'entreprise AlyoS Ingénierie envisage une cotraitance avec votre cabinet sur un appel d'offres public. Ce message vous est adressé sur la base de notre intérêt légitime à proposer des collaborations professionnelles.

Pour vous opposer à recevoir de futurs messages :
→ <lien tokenisé vers la page « Mes données » avec bouton désinscription>

Vos données sont gérées dans le cadre de notre politique de confidentialité :
→ https://[URL_PROD]/legal

AlyoS Ingénierie — Outil interne edifio Sourcing
contact@alyosingenierie.fr — dpo@alyosingenierie.fr
```

---

## Checklist de finalisation avant Gate 9

- [ ] SIREN AlyoS complété
- [ ] Adresse siège complète
- [ ] Numéro TVA intracommunautaire complété
- [ ] Forme juridique précisée (SARL / SAS / EURL)
- [ ] Capital social complété
- [ ] Ville RCS d'immatriculation
- [ ] DPO formellement désigné (TEISSIER par défaut)
- [ ] Email `dpo@alyosingenierie.fr` activé chez le fournisseur d'email
- [ ] Email `contact@alyosingenierie.fr` actif
- [ ] Date de mise à jour de la politique renseignée
- [ ] Page `/legal` déployée sur Vercel
- [ ] Footer Brevo intégré aux 8 templates
- [ ] Lien désinscription tokenisé fonctionnel
- [ ] 6 DPA sous-traitants signés et archivés
- [ ] Revue juridique conseillée par un avocat (optionnel mais recommandé)

---

*Document à valider par TEISSIER en clôture Gate 8 et publier en Gate 9. Mise à jour annuelle obligatoire.*
