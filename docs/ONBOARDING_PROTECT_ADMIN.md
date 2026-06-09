# Onboarding PROTECT — Guide pour l'administrateur

> Guide à transmettre à l'administrateur PROTECT après création de son compte
> par le superadmin edifio (cf. workflow `/sourcing/superadmin/organizations`).
>
> Pas pour les utilisateurs finaux — pour l'admin qui va gérer son équipe.

## TL;DR (3 min)

Tu viens d'être créé en tant qu'**admin PROTECT** sur edifio Sourcing.
Tu peux dès maintenant :

1. **Te connecter** avec ton email et ton mot de passe provisoire (envoyé par
   mail, valable 24 heures)
2. **Définir un mot de passe durable** (premier login force ce changement)
3. **Créer ton équipe** : inviter tes collaborateurs en `member` ou `admin`
4. **Configurer ton profil de recherche** (les types de marchés que tu cherches)
5. **Recevoir le digest AO du jour** chaque matin à 7h, lundi-vendredi

## Sommaire

- [1. Première connexion](#1-première-connexion)
- [2. Définir le mot de passe durable](#2-définir-le-mot-de-passe-durable)
- [3. Créer ton équipe](#3-créer-ton-équipe)
- [4. Configurer ton profil de recherche](#4-configurer-ton-profil-de-recherche)
- [5. Le digest AO du jour](#5-le-digest-ao-du-jour)
- [6. Le flow Tandem V2 (cotraitant)](#6-le-flow-tandem-v2-cotraitant)
- [7. Cloisonnement multi-org (sécurité)](#7-cloisonnement-multi-org-sécurité)
- [8. Facturation et trial](#8-facturation-et-trial)
- [9. Support](#9-support)

---

## 1. Première connexion

### URL
`https://sourcing.edifio.fr/login`

### Identifiants
- **Email** : ton email professionnel (ex. `contact@protect-marseille.com`)
- **Mot de passe provisoire** : reçu par mail signé `sebastien@edifio.fr`,
  valable 24 heures

### Si le mot de passe a expiré
Demande à `sebastien@edifio.fr` la régénération (bouton « Renvoyer » côté
admin edifio).

### Règles de mot de passe définitif

- Minimum 16 caractères
- 1 majuscule + 1 minuscule + 1 chiffre + 1 symbole
- Recommandation : **passphrase** type `montagne bleue sourire café 7 !`
  (plus facile à retenir, plus dur à brute-forcer)
- Stocké en hash bcrypt côté Supabase

## 2. Définir le mot de passe durable

Au **premier login** avec le mot de passe provisoire, tu seras
automatiquement redirigé vers `/reset-password`. Tu dois définir un mot
de passe durable AVANT d'accéder au reste de l'app.

⚠️ Si tu refermes l'onglet sans changer, ton mot de passe provisoire
expire dans 24h et tu devras redemander une régénération.

## 3. Créer ton équipe

Une fois connecté en tant qu'admin, va sur `/sourcing/admin/users`.

### Inviter un collaborateur

1. Clique sur **« Inviter un utilisateur »**
2. Renseigne :
   - Email professionnel
   - Nom complet
   - **Rôle** : `member` (lecture + actions métier) ou `admin` (full
     contrôle dans ton org)
3. Confirme

Le collaborateur reçoit immédiatement un email avec son mot de passe
provisoire 16 caractères.

### Promouvoir un member en admin
`/sourcing/admin/users` → action « Promouvoir admin »

### Régénérer un mot de passe (si oublié)
Si un collaborateur perd son mot de passe avant le premier changement,
tu peux régénérer via le bouton « Renvoyer mot de passe provisoire ».

### Limite de membres
Pas de limite technique. La facturation est par organisation, pas par
utilisateur.

## 4. Configurer ton profil de recherche

Le profil de recherche définit **quels AO** sont remontés dans ton
« AO du jour » chaque matin.

Va sur `/sourcing/admin/profil` (admin uniquement).

### Critères principaux

| Critère | Description |
|---|---|
| **CPV codes** | Codes CPV BOAMP qui matchent ton métier (ex. `71300000` ingénierie) |
| **Geo zones** | Départements ou régions ciblés (ex. `13, 83, 84` = PACA) |
| **Types de marchés** | `moe`, `services`, `fournitures`, `travaux` |
| **Mots-clés `exact`** | Expressions à matcher exactement dans le titre |
| **Mots-clés `positive`** | Mots qui augmentent le score (cumulables) |
| **Mots-clés `negative`** | Mots qui excluent l'AO du résultat |
| **Montant min** | Seuil minimum (€ HT) — exclut les marchés trop petits |
| **Montant max** | Seuil maximum — exclut les marchés trop gros |
| **Heure cron** | Heure d'envoi du digest (défaut 6h30 Paris) |

### Profils multiples

Tu peux créer plusieurs profils (ex. « Marseille MOE » + « PACA ingénierie »)
et activer celui que tu veux à un moment donné.

### Apprentissage par écartement (Salve U)

Quand tu écartes un AO avec un motif structuré (ex. « hors zone »,
« budget trop faible »), edifio agrège ces motifs et te propose
d'**ajuster automatiquement ton profil** si un même motif revient 3 fois
sur 30 jours.

Page : `/sourcing/admin/search-profiles` → section « Suggestions
d'ajustement ».

## 5. Le digest AO du jour

### Cron quotidien
Tous les jours **lundi-vendredi à 6h30** (heure Paris), le cron
`sourcing-run` :
1. Fetche les AO depuis BOAMP + 6 plateformes régionales (PLACE,
   francmarches, etc.)
2. Filtre selon ton profil
3. Calcule un score de pertinence
4. Insère les AO dans ta liste

### Tu reçois un mail (à venir)
Récap du nombre d'AO du jour + lien direct vers la liste.

### Tu consultes `/sourcing/ao-du-jour`
Liste triée par score de pertinence. 3 actions :
- **Sélectionner** : passe l'AO en « selected » (workflow de réponse)
- **Reporter** : différe la décision +1, +3 ou +7 jours
- **Écarter** : sort l'AO de ta file (avec motif structuré → alimente
  l'apprentissage)

### Distinction « Exclure » vs « Écarter »
- **Exclure** : retire l'AO de ta file sans aucun effet algo. Neutre.
- **Écarter** : retire avec un **motif structuré** qui alimente
  l'apprentissage et **modifie l'algo** (après validation admin).

## 6. Le flow Tandem V2 (cotraitant)

Tandem V2 te permet de **partager un AO avec un cotraitant externe**
(BE ou autre architecte) via un **lien magique** sécurisé.

### Comment ça marche
1. Sur la page d'un AO, clique sur **« Partager avec cotraitant »**
2. Renseigne l'email du cotraitant + son rôle
3. edifio génère un **token UUID v4** valable 7 jours par défaut
4. Le cotraitant reçoit un email avec un lien `https://sourcing.edifio.fr/cotraitant/<token>`
5. Il accède aux infos AO **sans création de compte** (anonyme)
6. Il peut signer numériquement → tu reçois la confirmation

### Sécurité du lien magique
- Token UUID v4 : 122 bits d'entropie, impossible à deviner
- `expires_at` : 7 jours par défaut (ajustable)
- `revoked_at` : tu peux révoquer à tout moment
- Pas d'exposition de `organization_id` dans le payload JSON
- Fonctions SECURITY DEFINER côté BDD (cf. migration 0053)

## 7. Cloisonnement multi-org (sécurité)

edifio Sourcing est **multi-tenant** : ton organisation PROTECT est
**totalement cloisonnée** d'AlyoS ou de toute autre organisation.

### Ce que tu peux voir
- Architectes, bureaux d'études, entreprises de **ton org**
- AO de **ton profil de recherche**
- Users de **ton org** (admin uniquement)

### Ce que tu ne peux PAS voir
- Aucune donnée d'une autre organisation
- Pas même la liste des autres organisations (sauf superadmin edifio)

### Garde-fous techniques en place
1. **RLS Postgres** : Row Level Security sur toutes les tables tenant
2. **Filtre SQL** : chaque requête a un `WHERE organization_id = <ton org>`
   explicite (defense-in-depth)
3. **Helper async** : `getRequiredOrgId(user.id)` retourne ton org en
   début de chaque Server Action (throw si pas de membership = pas
   d'accès cross-tenant)
4. **Page `/no-org`** : si un user est créé sans membership, il
   atterrit sur une page d'erreur (jamais sur des données d'une autre
   org)

## 8. Facturation et trial

### Modèle MVP (jusqu'au 18 juillet 2026)
- **Trial 30 jours** gratuit
- Bannière à J-3 + J-1 t'avertit avant l'expiration
- À J0 : ton org passe en `expired`, l'app se verrouille (sauf
  superadmin edifio)

### Pour souscrire
Contacte `sebastien@edifio.fr` pour discuter du pack Solo (99€/mois HT)
ou Pro.

### Stripe (à venir)
La facturation Stripe complète arrive en Sprint 9.E (post-migration
juillet). En attendant : facturation manuelle via Stripe Dashboard.

## 9. Support

### Pour les questions métier
`sebastien@edifio.fr` (CTO edifio)

### Pour les bugs ou demandes d'évolution
Email avec :
- URL où le bug s'est produit
- Capture écran si possible
- Description du comportement attendu vs observé

### SLA support (MVP)
- Bug bloquant : réponse sous 4h ouvrées
- Bug majeur : réponse sous 24h ouvrées
- Demande d'évolution : qualification sous 1 semaine

### Statut de l'app
Pas de page status publique pour l'instant. Si l'app est down, contacte
`sebastien@edifio.fr` directement.

---

## Roadmap visible pour PROTECT (à transmettre)

Après la bascule vers le monorepo `alyos-suivi-chantier` du **18 juillet 2026** :
- Intégration avec **edifio Suivi** (suivi de chantier)
- Intégration avec **edifio ACT** (passation de marché)
- Pack groupé Solo + Suivi + ACT au tarif unifié (à confirmer)

Tu seras informé 2 semaines avant la bascule (planning communication
gérée par Sébastien Cowork).

---

**edifio Sourcing v1 — Édité par AlyoS Ingénierie**
*Document à jour au 9 juin 2026*
