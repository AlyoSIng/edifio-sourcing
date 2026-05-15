# Threat Model + Runbook Incident — edifio Sourcing v1.0

**Auteurs** : [CTO Sophie] + [CEO Marc]
**Date** : 2026-05-10
**Statut** : Préparation Gate 8 — solde les items OWASP A04 (insecure design) et A09 (logging & monitoring)
**Référentiel** : STRIDE pour le threat model, NIST SP 800-61 simplifié pour le runbook

---

# PARTIE 1 — THREAT MODEL

## Périmètre de l'analyse

| Asset | Sensibilité | Conséquence si compromis |
|-------|-------------|--------------------------|
| Comptes utilisateurs AlyoS | Élevée | Usurpation, accès à toutes les données client |
| Base architectes (B2B) | Moyenne | Fuite données pros, image AlyoS, sanctions RGPD |
| Tokens architectes (JWT) | Moyenne | Accès tokenisé non-autorisé, spam ciblé |
| Données AO (publiques mais consolidées) | Faible | Pas de fuite RGPD, perte concurrentielle marginale |
| Bibliothèque pièces (CERFA, attestations) | Moyenne | Fuite données entreprise, atouts concurrentiels |
| Clés API (Anthropic, Brevo, Resend, etc.) | Élevée | Usage abusif facturé à AlyoS, exposition de données via API tiers |
| Mémoires techniques générés IA | Faible | Pas de données perso, mais propriété AlyoS |
| Audit logs | Élevée | Couverture de trace en cas d'attaque, intégrité juridique |

---

## STRIDE — Scenarios d'attaque analysés

### T1 — Spoofing : usurpation d'identité @alyosingenierie.fr

**Vecteur d'attaque** :
- Attaquant en possession d'un email AlyoS leaké (data breach tiers, phishing)
- Tente de se connecter via magic-link
- Si l'email est valide, l'attaquant reçoit le lien et accède à l'app

**Probabilité** : moyenne — un email AlyoS peut être trouvé sur LinkedIn ou via OSINT.
**Impact** : ÉLEVÉ — accès complet aux données de l'org.

**Mitigations** :
- ✅ Magic-link envoyé à l'email **possédé** — l'attaquant doit aussi avoir compromis la boîte mail (auth en 2 facteurs implicite)
- ⚠️ Anomalie détection : IP géographique inattendue déclenche alerte Sentry → notif admin
- ⚠️ MFA obligatoire pour les rôles `admin` (Gate 6)
- ⚠️ Rotation périodique des emails AlyoS pour les comptes désactivés (départ collaborateur)

**Procédure si détecté** : révoquer immédiatement la session Supabase de l'utilisateur, audit log de toutes les actions, alerte CEO.

### T2 — Tampering : altération de données critiques

**Vecteur** :
- Compromission d'un compte `admin` AlyoS
- Modification ou suppression de données utilisateurs ou architectes

**Probabilité** : faible — seuls 1-2 comptes admin existent, MFA obligatoire.
**Impact** : MOYEN — données métier modifiables, restoration via Supabase PITR.

**Mitigations** :
- ✅ Audit log immutable trace toutes les modifications (timestamp, qui, quoi, valeur avant/après)
- ✅ Supabase PITR 7 jours permet restauration
- ⚠️ Approval workflow Board pour les actions destructives (suppression de données = require `data_delete` audit avec ref handoff)

**Procédure si détecté** : audit log → identifier l'action et l'acteur → restaurer via PITR si critique → révoquer le compte compromis.

### T3 — Repudiation : déni d'action

**Vecteur** :
- Un user dit « je n'ai pas envoyé ce mail à cet architecte » alors qu'il l'a fait
- Ou : un architecte dit « je n'ai pas accepté ce Tandem » alors qu'il a cliqué

**Probabilité** : faible mais réelle (litige commercial).
**Impact** : MOYEN — exposition contractuelle AlyoS.

**Mitigations** :
- ✅ Audit log immutable côté AlyoS (qui a cliqué « envoyer », à quelle heure, depuis quelle IP)
- ✅ Logs Brevo (qui a ouvert le mail, qui a cliqué, à quelle heure)
- ✅ Signature JWT côté architecte (token signé RS256, impossible à forger)

**Procédure si litige** : extraction des logs avec horodatage notarié, fourniture au service juridique AlyoS.

### T4 — Information disclosure : fuite de données

**Vecteur** :
- Mauvaise config RLS → cross-tenant leak (mais 1 seul tenant en MVP donc peu pertinent)
- Endpoint API mal protégé → données accessibles sans auth
- Logs verbeux exposent des données sensibles
- Backups non chiffrés volés

**Probabilité** : moyenne sans contrôles.
**Impact** : ÉLEVÉ — sanctions RGPD, image AlyoS.

**Mitigations** :
- ✅ RLS FORCE sur 100 % tables multi-tenant + tests pgTAP cross-tenant
- ⚠️ Tous les endpoints API protégés par middleware d'auth + RBAC
- ⚠️ Pas d'`console.log` de données utilisateurs en prod (lint rule à mettre en place)
- ✅ Backups chiffrés AES-256 vers OVH

**Procédure si détecté** : déclenchement procédure violation RGPD (cf. `rgpd_registre_v1.md` § 11) — notification CNIL sous 72h si risque.

### T5 — Denial of service : attaque de coût IA

**Vecteur** :
- Attaquant compromet un compte AlyoS
- Lance massivement des analyses RC IA Sonnet pour faire exploser la facture Anthropic
- 1000 appels × 0,80 € = 800 € en une heure

**Probabilité** : faible (nécessite compromission compte) mais critique financièrement.
**Impact** : MOYEN — coût + interruption de service quand le quota est atteint.

**Mitigations** :
- ⚠️ Quota Anthropic par compte hard à 100 €/mois (paramétré côté console Anthropic)
- ⚠️ Quota Studio IA par organization : 20 AO/mois inclus + 1,50 €/AO sup (bloqué au-delà sans escalade admin)
- ⚠️ Rate limiting sur les endpoints IA : max 10 analyses RC / utilisateur / heure
- ⚠️ Anomalie usage IA détectée → alerte Sentry → suspension du compte le temps de vérifier

**Procédure si détecté** : suspendre immédiatement le compte concerné, audit usage IA, recharger les quotas après investigation.

### T6 — Elevation of privilege : escalade de privilèges

**Vecteur** :
- Un user (rôle `user`) accède à des fonctions `admin`
- Faille dans le RBAC (vérification rôle manquante sur un endpoint)

**Probabilité** : faible si RBAC bien testé.
**Impact** : ÉLEVÉ — un user peut alors faire les actions admin (modifier rôles, exporter RGPD, supprimer).

**Mitigations** :
- ⚠️ Tests RBAC systématiques (pgTAP + Playwright) sur chaque endpoint admin
- ✅ Audit log capture le `actor_role` au moment de l'action (détection a posteriori)
- ⚠️ Code review obligatoire pour tout endpoint qui touche aux memberships ou aux roles

### T7 — Vol de token JWT architecte

**Vecteur** :
- L'architecte forward le mail Brevo à un tiers (ami, employé, etc.)
- Le tiers clique sur le lien tokenisé et accède à la page

**Probabilité** : moyenne — comportement courant en B2B.
**Impact** : FAIBLE — la page contient seulement les infos de l'AO (relativement publiques) et permet de répondre OUI/NON. Pas d'accès à des données sensibles.

**Mitigations** :
- ✅ Token JWT signé RS256 + expiration 30 jours
- ✅ Révocation manuelle possible par admin AlyoS
- ✅ Audit log de toute action via token
- ⚠️ Limitation : pas d'authentification forte (c'est l'objectif UX : friction zéro)

**Décision acceptée** : risque résiduel accepté pour le MVP. Le compromis friction zéro > sécurité parfaite est validé par le Board (cf. arbitrage Gate 2 #1).

### T8 — Compromission d'un sous-traitant

**Vecteur** :
- Anthropic / Brevo / Supabase subit un incident de sécurité majeur
- Données AlyoS exposées via leur infra

**Probabilité** : faible (acteurs sérieux) mais réelle.
**Impact** : variable selon le sous-traitant et la nature de l'incident.

**Mitigations** :
- ✅ DPA signés avec chaque sous-traitant (obligation de notification rapide en cas d'incident)
- ⚠️ Veille active sur les bulletins sécurité (Supabase Status, Anthropic Trust Center, etc.)
- ⚠️ Procédure de notification AlyoS si l'un signale un incident

---

## Synthèse des actions découlant du threat model

| # | Action | Priorité | Responsable | Échéance |
|---|--------|----------|-------------|----------|
| TM1 | Mettre en place MFA admin obligatoire | P0 | [DEV Alex] | Gate 6 |
| TM2 | Implémenter rate limiting (100 req/min IP public, 1000/user auth) | P0 | [DEV Alex] | Gate 6 |
| TM3 | Implémenter quotas Anthropic par compte + alerte 80 % | P0 | [DEV Alex] | Gate 6 |
| TM4 | Tests pgTAP cross-tenant denied | P0 | [DEV Alex] | Gate 6 |
| TM5 | Lint rule contre `console.log` avec données utilisateurs | P1 | [DEV Alex] | Gate 6 |
| TM6 | Workflow approval pour les actions destructives | P1 | [DEV Alex + CTO] | Gate 7 |
| TM7 | Veille active sur bulletins sécu sous-traitants | P2 | [CTO Sophie] | Permanent |

---

# PARTIE 2 — RUNBOOK INCIDENT

## 1. Classification de criticité

| Niveau | Définition | Délai cible de prise en compte |
|--------|------------|------------------------------|
| **SEV1 — Critique** | App down totale OU fuite de données avérée OU dépense > 500 € en moins d'1h | < 30 min |
| **SEV2 — Majeur** | Fonctionnalité-clé indisponible pour tous OU faille de sécurité non-exploitée | < 2 h |
| **SEV3 — Moyen** | Bug bloquant un utilisateur, contournement possible OU performance dégradée | < 24 h |
| **SEV4 — Mineur** | Bug cosmétique OU edge case rare | < 1 sem |

---

## 2. Détection

### Sources d'alerte

| Source | Quoi détecte | Délai |
|--------|--------------|-------|
| **Sentry** | Erreurs runtime app, anomalies | < 5 min |
| **Vercel Status** | Outages plateforme | Variable |
| **Supabase Status** | Outages DB, Auth, Storage | Variable |
| **Anthropic Console** | Quota IA dépassé | < 1h (alerte 80%) |
| **Brevo / Resend Console** | Bounces, blacklist domaine | Quotidien |
| **Alerte utilisateur** | Slack/Teams `#edifio-sourcing` | Variable |
| **Audit log monitoring** | Actions suspectes (login impossible, accès cross-tenant tenté) | Manuel |

---

## 3. Triage

### Workflow standard

1. **Réception** : Sentry alert / message Slack / email
2. **Acknowledgement** : [PS_OPERATOR Yann] (premier contact) ou [DEV Alex] répond *« Pris en charge »* dans le canal d'alerte avec un identifiant `INC-<YYYY-MM-DD>-<N>`
3. **Classification** : déterminer le niveau (SEV1-4) selon § 1
4. **Notification escalade** selon § 4

### Identifier le périmètre

Questions à se poser dans les 5 premières minutes :

- Combien d'utilisateurs impactés ?
- Y a-t-il fuite de données ?
- Service tiers en cause ?
- Bug récent (lien avec un déploiement de < 24h) ?
- Reproductible ?

---

## 4. Communication & escalade

### SEV1 — Critique

| Délai | Action |
|-------|--------|
| T+0 | [PS_OPERATOR] ack dans Slack + alerte CTO + CEO |
| T+15 min | [CEO] notification Board (TEISSIER) directe |
| T+30 min | Message public dans Slack/Teams AlyoS (transparent) |
| T+60 min | Si fuite RGPD → notification CNIL préparée |

### SEV2 — Majeur

| Délai | Action |
|-------|--------|
| T+0 | [PS_OPERATOR] ack + alerte CTO |
| T+30 min | [CTO] décision rollback ou patch en cours |
| T+2h | [CEO] informé pour communication interne |

### SEV3 — Moyen

| Délai | Action |
|-------|--------|
| T+0 | [DEV Alex] ack + investigation |
| T+24h | Patch déployé OU communication aux utilisateurs |

### SEV4 — Mineur

Ticket GitHub Issue. Backlog. Traité dans le sprint suivant.

---

## 5. Mitigation

### Playbook : app down (SEV1)

1. Vérifier Vercel Status + Supabase Status pages
2. Si Vercel down → patience, communication aux utilisateurs, refaire un déploiement si nécessaire
3. Si Supabase down → vérifier l'incident en cours, patience, message d'attente
4. Si ni Vercel ni Supabase → bug applicatif récent → **ROLLBACK Vercel** (cf. `plan_bascule_gate9_v1.md` § 4)
5. Investigation post-rollback dans une branche dédiée

### Playbook : fuite de données détectée (SEV1)

1. **Identifier le périmètre** : combien d'utilisateurs, quel type de données, depuis quand
2. **Couper l'accès** : suspendre les comptes potentiellement compromis ou désactiver l'endpoint vulnérable
3. **Notifier le Board** dans les 30 min
4. **Évaluer obligation CNIL** : si risque pour les droits/libertés → notification < 72h
5. **Notification individuelle** aux personnes concernées si risque élevé
6. **Postmortem obligatoire** sous 7 jours

### Playbook : dépassement budget IA (SEV1 ou SEV2 selon ampleur)

1. **Couper temporairement** les appels Sonnet via feature flag (Haiku reste opérationnel pour les tâches courtes)
2. **Audit usage** : qui, quoi, depuis quand
3. Si abus volontaire → suspendre le compte
4. Si bug applicatif → patch d'urgence
5. **Communication aux utilisateurs** : « le module IA Studio est temporairement indisponible, on investigue »

### Playbook : compte compromis (SEV1 ou SEV2)

1. **Révoquer la session Supabase** immédiatement (`SELECT auth.users.id INTO ... ; UPDATE auth.users SET ... WHERE id = ...`)
2. **Audit log** : extraire toutes les actions de cet acteur sur les 30 derniers jours
3. **Rotation email AlyoS** : si compte ENCORE actif (collaborateur en poste), rotation du mot de passe boîte mail + MFA renforcée
4. **Notification** au collaborateur (s'il est de bonne foi) ou au CEO (s'il est suspect)
5. **Restauration** des éventuelles données altérées via PITR Supabase

---

## 6. Postmortem

### Trigger

Obligatoire pour SEV1 et SEV2. Optionnel pour SEV3 (selon enseignements).

### Format

À publier dans `notes-de-suivi/POSTMORTEM_<INC-ID>.md` dans le repo + archivage dans `gates/` quand consolidé en Gate 8 update.

### Sections obligatoires

1. **Résumé** (3-5 lignes)
2. **Chronologie horodatée** (T-0 = détection)
3. **Impact** (utilisateurs, données, financier)
4. **Root cause** (analyse technique)
5. **Ce qui a bien fonctionné** (le système de détection, l'astreinte, etc.)
6. **Ce qui a mal fonctionné** (gaps de monitoring, procédure manquante, etc.)
7. **Actions correctives** (avec responsable + échéance + suivi)
8. **Apprentissages** pour les futurs incidents

**Posture du postmortem** : *blameless* (pas de recherche de coupable). Le but est d'apprendre et corriger les systèmes, pas de blâmer les personnes.

---

## 7. Numéros & contacts d'urgence

| Rôle | Personne | Joignabilité |
|------|----------|--------------|
| Board / décision finale | TEISSIER | Email + téléphone (à compléter) |
| CEO (orchestration) | Marc *(Cowork)* | Email + Slack |
| CTO (technique) | Sophie *(Cowork)* | Email + Slack |
| DEV (code) | Alex *(Claude Code)* | Slack |
| PS_OPERATOR (infra) | Yann *(Claude Code)* | Slack |
| Support Vercel | helpdesk Vercel Pro | https://vercel.com/help |
| Support Supabase | helpdesk Supabase Free | https://supabase.com/support |
| CNIL (RGPD) | 01 53 73 22 22 | cnil.fr |
| DPO AlyoS | dpo@alyosingenierie.fr | Email (Gate 9) |

---

*Runbook à actualiser après chaque incident SEV1/SEV2. Revue annuelle obligatoire en Gate 8 update.*
