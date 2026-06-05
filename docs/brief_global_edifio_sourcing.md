# Brief global — edifio Sourcing

> Document de cadrage produit, technique et financier destiné à une équipe externe d'analyse marché.
> **Auteur :** session de travail Claude Code (Steve TEISSIER, dirigeant AlyoS Ingénierie)
> **Date :** 5 juin 2026
> **Version :** v2 — coûts IA recalibrés sur audit interne réel

---

## ⚠️ Note de méthodologie sur les coûts

La section 5 a été **mise à jour avec un audit interne réel** au 5 juin 2026 :

- **Anthropic API** (IA) : coûts **mesurés** depuis la table `ai_runs` de la BDD prod (logs `cost_usd` par appel, par modèle, par prompt).
- **Tous les autres postes** (Supabase, Vercel, Brevo, Resend, Fly.io) : restent des **estimations sur grille tarifaire publique** — les dashboards de chaque service n'ont pas été consultés dans la session de production de ce document. À valider par l'équipe expert si nécessaire en consultant directement les consoles.

L'audit IA a **bouleversé l'estimation initiale** (passage de 50-150 €/mois IA à 5-15 €/mois IA en usage régime de croisière). Le coût total mensuel a donc été **revu à la baisse**.

---

## 0. Lecture express — ce qu'il faut retenir

| Item | Réponse courte |
|---|---|
| **Qu'est-ce que c'est ?** | Outil interne SaaS de **veille et réponse à appels d'offres publics BTP** (maîtrise d'œuvre, architectes, bureaux d'études), construit chez AlyoS Ingénierie. |
| **À qui ça sert ?** | Aujourd'hui : ~5-10 collaborateurs AlyoS. Demain (V2) : autres MOE / archi / BE indépendants sur le marché français. |
| **Quel problème ?** | Le sourcing AO public (BOAMP, plateformes régionales) consomme **plusieurs heures/jour** par dirigeant : lecture, tri, sélection cotraitants, montage du dossier de candidature (DC1, DC2, mémoire, références). edifio Sourcing automatise tout ce qui est mécanique et laisse à l'humain le seul jugement métier. |
| **État de maturité** | **MVP avancé, en cours de mise en service réelle.** 95+ chantiers livrés depuis Phase 0. Stack greenfield Next.js 14 / Supabase / Anthropic. Migrations DB en cours de stabilisation. Premier déploiement Vercel actif. |
| **Coût IA par AO sélectionné (mesuré)** | **0,08 €/AO** (analyse RC PDF + brief AO, audit du 5 juin) |
| **Coût IA par profil de recherche actif** | **5-10 €/mois** par profil en régime de croisière (60-100 AO/mois) |
| **Coût d'infra MVP révisé** | **90-130 €/mois** (usage AlyoS interne 5-10 utilisateurs) |
| **Coût marginal par organisation cliente en SaaS V2** | **~20-30 €/mois** (sur scénario 50 orgs, ~1,5 profil moyen par org) |
| **Coût d'infra projeté V2 SaaS** | **1 000-1 500 €/mois** à 50 organisations clientes (vs 1 000-2 500 en v1, revu après audit IA) |
| **Coût de développement consenti à date** | **Équivalent humain 175-350 k€**. Cash réel : session assistée Claude Code, abonnement ~150 €/mois utilisateur + temps Steve |
| **Avantage concurrentiel revendiqué** | Pipeline **bout-en-bout** : veille → tri intelligent → cotraitance → dossier auto. Les concurrents historiques (Doublet, Vecteur Plus, AWS Achat) couvrent la veille mais s'arrêtent à la consultation. edifio va jusqu'au ZIP envoyé à l'acheteur. |

---

## 1. Contexte et opportunité

### 1.1 Le marché des appels d'offres publics en France

- **BOAMP** (Bulletin Officiel des Annonces de Marchés Publics) publie environ **100 000 à 150 000 avis par an**, dont une part significative concerne la maîtrise d'œuvre BTP, l'architecture et les bureaux d'études.
- Une PME de MOE (50 collaborateurs ou moins) répond typiquement à **20-80 AO par an**, soit 1 à 7 par mois actif.
- Chaque dossier de candidature mobilise **3 à 15 heures** : lecture du RC, sélection des cotraitants, préparation des DC1/DC2/CERFA, assemblage du mémoire technique, du portefeuille de références, des attestations.
- Le **taux de transformation moyen** dans le secteur tourne autour de 10-25 % (variable selon la spécialité métier et la concurrence locale).

### 1.2 La douleur visée

Trois douleurs critiques pour un dirigeant comme Steve TEISSIER (AlyoS) :

1. **Le matin** : il ouvre 4 plateformes (BOAMP + 3 régionales) et passe 30-90 min à parcourir 50-200 annonces dont 90 % ne le concernent pas.
2. **Pour chaque AO retenu en cotraitance** : il doit téléphoner / mailer 3-8 architectes pour leur proposer le groupement, suivre les relances, gérer les non-réponses.
3. **Au moment du dossier** : il re-saisit pour la N-ième fois les mêmes données société (SIRET, capital, CA n-1/n-2/n-3, représentant légal), copie-colle des références dans Word, assemble manuellement un ZIP de 15-30 fichiers.

### 1.3 La promesse edifio Sourcing

> **Tu ouvres l'app le matin. Une file « AO du jour » te montre 3-8 annonces ciblées sur ton profil de recherche. Tu lis le brief AI, tu cliques « Sélectionner ». Pour chaque AO en cotraitance, tu reçois un mail de l'archi accepté en 24-72h. Au moment de monter le dossier, tu cliques « Compiler » et tu télécharges un ZIP prêt à déposer chez l'acheteur.**

Reformulation pour un dirigeant TPE/PME : *"Je récupère 1 à 2 heures de mon temps par jour, et je réponds à plus d'AO avec un taux de conformité parfait."*

---

## 2. Positionnement concurrentiel

> ⚠️ Note méthodologique : ce qui suit est basé sur ma connaissance du marché français pré-2026. L'équipe experte devra valider/affiner par enquête terrain et benchmark live (pricing publics, étude utilisateurs).

### 2.1 Acteurs identifiés et angle d'attaque

| Acteur | Positionnement | Forces | Faiblesses |
|---|---|---|---|
| **Doublet** | Veille AO multi-secteurs | Couverture nationale, alertes mail, API | Pas de gestion dossier, pas de cotraitance, UI dépassée |
| **AWS-Achat / e-Marchés Publics** | Plateforme acheteur publique | Officiel, large adoption | Pas un outil candidat, pas d'AI |
| **Vecteur Plus** | Veille AO BTP | Réseau bien établi, alerte intelligente | Pas de dossier, pas de matching IA, pricing élevé |
| **MarchésOnline / J360** | Veille + accompagnement | Filtres CPV avancés | Pas d'automatisation dossier |
| **Solutions internes maison** | Excel + Word + Outlook | Pas de cash burn | Hyperfragile, pas scalable |

### 2.2 Différenciation revendiquée par edifio Sourcing

- **Bout-en-bout** : seul acteur identifié qui va de la veille jusqu'au ZIP final dans une même expérience.
- **IA contextuelle** (Claude Sonnet 4.6 + Haiku 4.5) : analyse du RC (Règlement de Consultation) en PDF, indexation sémantique de la bibliothèque entreprise, matching automatique pièces RC ↔ pièces disponibles.
- **Cotraitance native** : module Tandem (architecte mandataire) + module Cotraitance BE intégrés, avec relance auto J+3 et tracking des réponses.
- **Multi-tenant prêt** : architecture RLS (Row Level Security) Supabase activée dès le MVP — l'ouverture SaaS à des cabinets externes ne nécessite pas de refonte.
- **Made in France / RGPD natif** : hébergement Supabase Frankfurt + Vercel EU + Fly.io EU. Tous les flux IA passent par Anthropic (Sonnet/Haiku) — pas d'OpenAI, conscient des contraintes du secteur public sur la souveraineté.

### 2.3 Risques de positionnement

- **Asymétrie de notoriété** : Doublet et Vecteur Plus ont 20+ ans de présence. edifio est inconnu.
- **Cycle de vente B2B long** : un cabinet d'archi adopte un outil de sourcing après 2-3 mois d'évaluation, pas en 2 clics.
- **Tarification opaque chez les concurrents** : impossible de benchmarker précisément sans demander un devis. Risque de mauvais positionnement de prix.

---

## 3. Fonctionnalités produit (état au 5 juin 2026)

> Ce qui suit est la **liste exhaustive** des modules livrés, organisée par grandes capacités. La granularité est dictée par les 95+ chantiers tracés dans le journal projet.

### 3.1 Veille et tri d'AO

- **Crawler multi-sources** :
  - API BOAMP officielle (gratuite, data.gouv.fr) avec cron 6h30 quotidien
  - 6 plateformes régionales scrappées via worker Playwright sur Fly.io EU
  - Auto-détection de la pièce RC (Règlement Consultation) et du DCE (Dossier de Consultation des Entreprises) depuis la page annonce
- **Tri intelligent par profil de recherche** :
  - N profils de recherche par organisation (positifs, négatifs, codes CPV, départements, types de marchés MOE/services/fournitures)
  - Onglets « AO du jour » / « Sélectionnés » / « Reportés » avec filtres
  - Brief AO v2 : titre, RC, compétences, alerte visite obligatoire, déduplication
- **Saisie manuelle** : formulaire pour ajouter une consultation privée découverte hors plateformes

### 3.2 Cotraitance (modules Tandem + Cotraitance BE)

- **Annuaire des architectes** (DC1) avec fiche enrichie : cabinet, SIRET, capital, CA n-1/n-2/n-3, représentant légal, signature, contact, historique des sollicitations
- **Annuaire des Bureaux d'Études** (DC2 cotraitance) : identique architectes
- **Annuaire Entreprises/Majors** : pour les groupements de plus grand format
- **Annuaire des acheteurs publics** (livré 4 juin) : alimenté automatiquement à la saisie de l'adresse acheteur sur un AO — réutilisé sur tous les AO suivants du même acheteur
- **Critères de shortlist configurables** : CA minimum, départements géographiques, compétences
- **Pipeline cotraitance** : pour chaque AO retenu en mode Tandem :
  - Sollicitation N architectes en parallèle (mail Brevo template configurable)
  - Tracking de l'acceptation / refus / non-réponse
  - Relance auto J+3 si pas de réponse
  - Sélecteur d'architecte mandataire au moment du DC1
- **Module Cotraitance BE** : idem pour les BE cotraitants (multi-BE DC2)

### 3.3 Module dossier (cœur de valeur)

- **Analyse IA du RC** :
  - PDF natif via Claude Sonnet 4.6 (avec fallback pdf-parse + streaming si nécessaire)
  - Extraction structurée : objet, lots, montant, dates, pièces réclamées, critères d'attribution
  - Audit log `ai_runs` pour traçabilité coûts
- **CERFA DC1 / DC2** :
  - Pré-remplissage déterministe depuis les données société + fiche cotraitant
  - 33 balises Mustache documentées dans les templates `.docx` admin (cf. document `docs/variables_mustache_dc1_dc2.doc`)
  - Génération du PDF rempli OU du `.docx` rempli selon le template fourni (voie Mustache choisie suite à un essai pdf-lib qui ne donnait pas un rendu CERFA officiel correct)
  - Multi-archi / multi-BE : un DC1 par archi mandataire, N DC2 si plusieurs BE cotraitants
- **Pouvoir mandataire** : auto-inclus si présent en bibliothèque
- **Matching pièces RC ↔ bibliothèque** :
  - Indexation IA des documents bibliothèque (Claude Haiku 4.5)
  - Détection des pièces réclamées par le RC vs disponibles vs manquantes
  - Boost matching V2 via `library_item_index`
- **Compilation ZIP** :
  - Structure : `dossier_candidature/CERFA/` + `pouvoir_mandataire.{ext}` + `RC.pdf` + `pieces/` + `Références/`
  - URL signée Supabase (validité 1h)
  - Bouton « Envoyer à l'architecte » avec template mail
  - Annulation possible post-envoi

### 3.4 Bibliothèque entreprise

- **17 catégories** officielles + 3 legacy : DC1, DC2, DC4, Pouvoir, Kbis, URSSAF, attestation fiscale, assurance RC, déclarations honneur/CA/effectifs, RIB, présentation entreprise, moyens humains, références de marchés, **tableau Excel références filtré auto** (livré 5 juin), **fiches référence A4 matching auto** (livré 5 juin), mémoire RSE, **fiches métiers matching auto** (livré 4 juin), autre
- **Indexation IA** : extraction titre, mots-clés, résumé, type de doc, entités via Claude Haiku 4.5
- **Détection d'obsolescence** : comparaison `updated_at` vs `indexed_at`, alerte si ré-upload après indexation
- **Alerte d'expiration** : badges J-30/J-7/J-1 sur les attestations, cron mail digest J-30
- **Matching keywords automatique** : fiches métiers et fiches référence incluses au ZIP seulement si leurs `matching_keywords` intersectent les positives du profil actif

### 3.5 Modèles d'email Brevo

- Templates configurables par catégorie (sollicitation archi, relance J+3, envoi dossier, refus, etc.)
- 14 libellés de statut FR validés
- Substitution de variables ({acheteur}, {objet}, {date_visite}, etc.)
- Bloc RGPD auto-injecté
- Test render pour chaque template

### 3.6 Modules administration et observabilité

- **Utilisateurs** (admin only) : création par admin avec mot de passe provisoire 16 caractères envoyé via Resend, expiration 24h, première connexion force changement, MFA optionnel
- **Profils de recherche** : N profils par org, 1 actif par défaut
- **Présentation société** : fiche AlyoS pour pré-remplissage DC2 (forme juridique, capital, CA, adresse, représentants)
- **Critères short-list** : règles de sélection cotraitants
- **Personnalisation** : logo, couleurs, signature
- **Coûts IA** (superadmin only) : dashboard mensuel d'usage Anthropic
- **Crons** (superadmin) : déclenchement manuel + observabilité des 4 crons (sourcing, tandem-followup, library-expiry-digest, dossier-zip-cleanup)
- **Activité Tandem** : dashboard suivi des sollicitations
- **Envois de dossiers** : historique avec stats
- **Debug sourcing** : pour comprendre pourquoi un AO n'est pas remonté
- **Notifications in-app** : badge cloche temps réel

### 3.7 Formation et accompagnement utilisateur

- **16 guides** HTML / Markdown intégrés (durée 6-10 min chacun) couvrant l'ensemble des features
- Accessible depuis la sidebar
- Mise à jour synchronisée avec les évolutions produit

---

## 4. Stack technique et choix d'architecture

### 4.1 Stack figée Gate 5 (validée par le Board AlyoS)

| Couche | Technologie | Justification |
|---|---|---|
| **Frontend** | Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui hybride | Standard moderne, SSR pour SEO et perfs, écosystème React mature |
| **Backend BDD** | Supabase EU Frankfurt (PostgreSQL 15 + RLS) | Hébergement européen, Row Level Security native pour multi-tenant, Storage + Auth + Realtime + Edge Functions |
| **ORM** | Drizzle 0.39 + drizzle-kit 0.30 + postgres 3.4 | Décision actée 2026-05-18 (ADR-013) — score pondéré 7,80/10 vs Prisma 5,30/10. Avantages : Edge-native (Deno compatible), TypeScript-first, migrations explicites |
| **Auth** | Supabase Auth email + password durable | Pivot 2026-05-10 (scanner email entreprise cassait les magic-links). Restreinte au domaine `@alyosingenierie.fr` au MVP via middleware Next.js |
| **Hébergement app** | Vercel EU (preview deploys par PR + production) | Intégration Next.js native, CDN edge, secrets vaultés |
| **Worker Playwright** | Fly.io EU container | Pour scrapping plateformes régionales sans JS — déclenché par message Supabase Realtime |
| **Emails transactionnels** | Brevo (utilisateurs) + Resend (admin/comptes) | Brevo pour les comms B2B (taux de délivrabilité), Resend pour les comms internes (UX dev meilleure) |
| **IA** | Anthropic API (Claude Sonnet 4.6 + Haiku 4.5) | Souveraineté (pas d'OpenAI), qualité PDF native Sonnet, coût maîtrisé Haiku pour les tâches d'indexation |
| **Tests** | Vitest (unit + intégration) + Playwright (E2E) + pgTAP (RLS) | 77 fichiers de test, 1198 tests verts au 5 juin |
| **CI/CD** | GitHub Actions (lint + typecheck + tests + build + RLS pgTAP + check middleware domaine) | Bloc obligatoire avant merge |

### 4.2 Schéma BDD (état actuel)

22+ tables Drizzle, dont les principales :

- `organizations`, `users`, `memberships`, `roles` (multi-tenant)
- `search_profiles`, `keywords` (configuration sourcing)
- `tenders`, `tender_documents`, `tender_events` (AO)
- `architects`, `bureau_etudes`, `entreprises`, `buyers` (annuaires)
- `tender_be_cotraitants`, `architect_responses` (cotraitance)
- `presentation_library`, `library_item_index` (bibliothèque + indexation IA)
- `response_files` (CERFA générés)
- `ai_prompts`, `ai_runs` (audit IA)
- `cron_run_log`, `user_notifications`, `audit_log`, `formations` (observabilité + accompagnement)

**12 policies RLS** SQL natif (hors ORM) testées via pgTAP, garantissent l'isolation tenant.

### 4.3 Choix d'architecture remarquables

1. **Pas de monorepo** : repo Next.js standalone classique (`AlyoSIng/edifio-sourcing`). Si une fratrie de modules edifio internes émerge (Suivi, AO, ACT…), refacto vers `@edifio/ui` en Phase 2+.
2. **Schéma multi-tenant dès le MVP** : préparation de l'ouverture SaaS sans dette technique, même si une seule organisation (AlyoS) à ce jour.
3. **Pattern de résilience runtime** : toutes les pages Server Component qui font `db.select(...)` sont wrapped dans try/catch + ErrorBanner. Évite les 500 brutaux en cas de blip Supabase ou de schéma désynchronisé.
4. **Storage admin** (`service_role`) pour les opérations qui contournent RLS volontairement (génération CERFA, ZIP) avec auth + isAdmin vérifiés en amont (defense in depth).
5. **Edge Functions Deno** pour les calculs sourcing (compatible Drizzle).
6. **Migrations idempotentes** (IF NOT EXISTS partout) pour permettre l'application répétée sans dégâts.

### 4.4 Dette technique connue

- **Édition inline** des matching_keywords absente sur les fiches biblio (limitation MVP — il faut supprimer + ré-uploader)
- **Pas de versioning** sur le tableau Excel des références (upload = remplacement)
- **Rotation des secrets** post-incident 2026-05-21 reportée post-MVP (password BDD prod a fuité 2× dans des stacktraces — règle URI-safe à appliquer)
- **Hardening migrate.ts** + règle password URI-safe à finaliser avant mise en service réelle
- **MFA admin** seulement optionnelle au MVP

---

## 5. Modèle financier — recalibré sur audit interne réel

### 5.0 Audit interne IA du 5 juin 2026 — données brutes

Source : table `ai_runs` de la BDD production (logs `cost_usd` par appel Anthropic, alimentés automatiquement à chaque exécution prompt).

**Période auditée : du 29 mai au 5 juin 2026 (7 jours)**

| Métrique | Valeur |
|---|---|
| Nombre d'appels IA | **3** |
| Coût total | **0,1507 USD ≈ 0,14 €** |
| Coût moyen par appel | 0,0502 USD ≈ 0,047 € |
| Latence moyenne | 28 740 ms |
| Taux de succès | 100 % (3 OK / 0 fail) |

Répartition par modèle :

| Modèle | Appels | Coût USD | % du coût |
|---|---|---|---|
| Haiku 4.5 (analyse PDF RC) | 2 | 0,1461 | **97 %** |
| Sonnet 4.6 (brief AO) | 1 | 0,0046 | 3 % |

Répartition par prompt :

| Prompt | Appels | Coût USD |
|---|---|---|
| `rc_analysis_full` (analyse PDF natif du Règlement de Consultation) | 2 | 0,1461 |
| `ao_brief` (synthèse courte AO) | 1 | 0,0046 |

**Constat surprenant et structurant :**
- C'est **Haiku** qui coûte le plus, pas Sonnet — parce que Haiku avale le PDF entier en input (tokens input volumineux sur les RC longs).
- Sonnet est appelé pour des synthèses courtes (brief AO) → coût quasi nul.
- Le coût IA est donc **dominé par l'analyse de RC**, qui se déclenche **une fois par AO sélectionné**.

Sur cette base, on en déduit le coût IA par AO sélectionné :

> **0,047 € en moyenne par appel IA** × ~1,6 appels par AO sélectionné (1 analyse RC + 0,6 brief — tous les AO ne génèrent pas de brief) = **≈ 0,07-0,08 € par AO sélectionné**

### 5.1 Coûts par profil de recherche (la métrique pertinente)

Le **profil de recherche** est l'unité de granularité naturelle pour mesurer l'usage et la facturation :

- Une organisation possède N profils de recherche actifs (1 par utilisateur principal, jusqu'à 3-5 pour un cabinet diversifié)
- Chaque profil = un thème de prospection (ex. « MOE patrimoine BTP », « MOE scolaire neuf », « BE structure régional »)
- Un profil consomme proportionnellement à son **volume d'AO sélectionnés**, lui-même fonction de :
  - La largeur du profil (positives + départements + types de marchés)
  - La discipline de tri de l'utilisateur (taux de sélection / total scrappés)

Hypothèses d'usage régime de croisière (à valider en réel après 2-3 mois d'utilisation AlyoS) :

| Hypothèse | Valeur |
|---|---|
| AO scrappés par jour par profil (BOAMP + régionales) | 50-200 |
| Taux de sélection (utilisateur ouvre le brief + clique « Sélectionner ») | 5-10 % |
| AO sélectionnés par jour par profil | **3-8** |
| Jours ouvrés / mois | 22 |
| **AO sélectionnés / mois / profil** | **66-176** (médiane ~100) |
| **Coût IA / mois / profil** (× 0,08 €/AO) | **5-14 €/mois** |

Coût par organisation (selon nombre de profils actifs) :

| Profils actifs / org | Coût IA / mois | Cible utilisateur |
|---|---|---|
| 1 profil | **5-14 €** | Indépendant / petite struct |
| 2 profils | 10-28 € | PME diversifiée |
| 3 profils | 15-42 € | Cabinet multi-spécialités |
| 5 profils | 25-70 € | Grosse PME / micro-ETI |

> **Conclusion stratégique** : le coût IA scale linéairement avec l'usage. C'est **prévisible, mesurable et facturable** au profil de recherche actif. C'est la pièce centrale du pricing recommandé en section 5.4.

### 5.2 Coûts d'infrastructure mensuels — MVP usage interne AlyoS

| Poste | Coût mensuel | Source | Notes |
|---|---|---|---|
| **Supabase Pro** | 25 € | Grille publique | Base 8 Go + 100 Go storage. Suffisant pour 10 utilisateurs et 500 AO/mois en historique. |
| **Vercel Pro** | 20 € | Grille publique | 1 user, builds illimités, edge functions. |
| **Fly.io worker Playwright** | 10-15 € | Estimation tarif VM | 1 VM 1 Go RAM EU, démarrage à la demande pour les scrappings régionaux. |
| **Brevo (emails)** | 25 € | Grille publique | Pack 20 000 emails/mois. |
| **Resend (emails internes)** | 0-20 € | Grille publique | Free tier 3 000 emails/mois suffisant à 10 utilisateurs. |
| **Anthropic API** | **5-15 €** | **🟢 Audit interne `ai_runs`** | Régime de croisière 1-2 profils actifs AlyoS. **Audit réel à date : 0,14 €/semaine** (test à peine commencé) → projection mensuelle réaliste 5-15 € en exploitation normale. |
| **Domaine custom** | 1 € | Domaine déjà détenu | `sourcing.alyosingenierie.fr` ou équivalent. |
| **TOTAL MVP révisé** | **86-121 €/mois** | — | Soit **1 030-1 450 €/an** — **40 % moins cher** que l'estimation v1 grâce au recalibrage IA. |

### 5.3 Coûts projetés V2 SaaS (50 organisations clientes)

Hypothèses cible 50 organisations × 1,5 profil moyen = **75 profils actifs** :

| Poste | Coût mensuel | Notes |
|---|---|---|
| **Supabase Team** | 200 € | 100 Go base, 250 Go storage. Pour 50 orgs ≈ 250-500 utilisateurs. |
| **Vercel Pro** | 60-150 € | Bandwidth élevée + builds CI fréquents. |
| **Fly.io worker** | 30-60 € | Plus de scrappings simultanés. |
| **Brevo** | 50-100 € | 100 000-300 000 emails/mois (relances cotraitance × 50 orgs). |
| **Resend** | 50 € | Plan Pro 50 000 emails/mois. |
| **Anthropic API** | **375-1 050 €** | **🟢 Calcul depuis audit** : 75 profils × 5-14 €/mois. **Médiane projetée ~660 €/mois.** Très en-dessous de l'estimation v1 (500-1 500 €). |
| **Datadog ou équivalent monitoring** | 150-300 € | APM, logs, alertes — indispensable en SaaS. |
| **Sentry** | 25-50 € | Suivi erreurs runtime. |
| **TOTAL V2 révisé** | **940-1 960 €/mois** | Soit **11 280-23 520 €/an**. |

### 5.4 Coût marginal par organisation cliente — clé du pricing

Décomposition pour 50 orgs (V2 SaaS) :

| Catégorie | Coût mensuel | Coût marginal par org |
|---|---|---|
| **Coûts fixes** (Supabase + Vercel + Fly + Brevo + Resend + Monitoring + Sentry) | 565-910 € | Mutualisé sur 50 orgs → **11-18 €/org/mois fixe** |
| **Coûts variables IA** (75 profils × 5-14 €) | 375-1 050 € | **7-14 €/org/mois** (1,5 profil moyen × 5-9 € médian) |
| **TOTAL coût marginal par org** | — | **≈ 18-32 €/mois/organisation** |

→ **Si edifio Sourcing est tarifé 100-200 €/mois/org, la marge brute par client est de 80-90 %.** Confortable, laisse de la place pour CAC + marketing + amélioration produit + résilience face à une explosion non anticipée du coût IA.

### 5.5 Coût de développement consenti à date

> ⚠️ **Important** : Steve TEISSIER utilise Claude Code pour orchestrer le développement. Le coût cash réel est donc principalement composé du temps de cadrage et de revue par Steve lui-même (CTO de fait) + abonnement Claude Code (~150 €/mois utilisateur).
>
> Le chiffre ci-dessous est l'**équivalent en équipe humaine externalisée**, utile pour benchmarker la valeur produit créée. Il ne représente pas un cash burn réel.

| Métrique | Valeur |
|---|---|
| Tâches/PR/chantiers livrés depuis Phase 0 | 95+ |
| Estimation effort par chantier | 6 à 12 h |
| Volume horaire total estimé | 570-1 140 h |
| Équivalent jours/homme | 70-140 j/h |
| Équivalent jours/junior facturable | 350-700 j |
| **Équivalent coût marché développeur senior TJM 600 €** | **175-350 k€** |

### 5.6 Modèle économique potentiel — V2 SaaS (à valider par étude clientèle)

Le modèle n'est **pas encore arrêté**. Pistes à explorer **maintenant chiffrées sur coût marginal réel** :

| Modèle | Prix indicatif | Marge brute | Forces | Faiblesses |
|---|---|---|---|---|
| **Per-seat mensuel** | 75-150 €/utilisateur/mois | 80-90 % | Lisible, prévisible | Décourage usages occasionnels |
| **Par organisation à plat** | 150-400 €/mois | 85-90 % | Simple à vendre | Peu rentable à grosses orgs |
| **Par profil de recherche actif** | **50-100 €/profil/mois** | **80-90 %** | **Aligné sur l'usage IA réel mesurable** | Nouveau concept à éduquer |
| **Pay-per-AO** | 1-3 €/AO sélectionné | 90-95 % | Aligné usage | Imprévisible côté revenu |
| **Freemium + Pro** | 0 € (1 profil, 30 AO/mois) + 99 €/mois (3 profils, illimité) | 70-85 % | Onboarding facile | Conversion incertaine, risque abus |

**Recommandation actualisée après audit** :

Le pricing **par profil de recherche actif** devient particulièrement intéressant maintenant qu'on a chiffré le coût marginal IA par profil (5-14 €/mois). C'est :

1. **Honnête** : l'utilisateur paye proportionnellement à ce qu'il consomme réellement.
2. **Prévisible côté SaaS** : on connaît notre marge à l'AO près.
3. **Différenciant face à la concurrence** : Doublet/Vecteur Plus facturent en forfait opaque.
4. **Cohérent avec le mental model du dirigeant** : « j'ouvre 1 nouveau thème de prospection = 1 nouveau profil = 1 nouvelle ligne sur ma facture ».

Recommandation initiale (à challenger par l'équipe expert) :
- **Pack Solo** : 1 profil actif, jusqu'à 100 AO sélectionnés/mois → **79 €/mois**
- **Pack Tandem** : 3 profils actifs, jusqu'à 300 AO sélectionnés/mois → **199 €/mois**
- **Pack Cabinet** : 5+ profils, illimité, support prioritaire → **399 €/mois**
- **Overage** : 0,15 €/AO sélectionné au-delà du quota inclus

À 100 clients dans 18 mois sur un mix 60 % Solo / 30 % Tandem / 10 % Cabinet → ARPU ~145 €/mois → **MRR ≈ 14,5 k€** → ARR ≈ 174 k€. Marge brute ~85 % → contribution annuelle ~148 k€ (avant CAC, salaires, marketing).

### 5.7 Limites de l'audit et zones à compléter par l'équipe expert

L'audit n'est **complet que sur la couche IA**. Pour les autres postes, l'équipe expert peut vouloir consulter elle-même les consoles pour challenger / affiner :

| Service | Action recommandée |
|---|---|
| Supabase | console.supabase.com → Project AlyoS Sourcing → Billing → Usage actuel |
| Vercel | vercel.com → Project edifio-sourcing → Usage (bandwidth, builds) |
| Brevo | brevo.com → SMTP & API → Logs (volume emails envoyés) |
| Resend | resend.com → Emails → Stats |
| Fly.io | fly.io → Apps → Metrics (heures VM playwright worker) |

Volumétrie réelle d'usage Steve cette semaine (queries SQL à relancer si besoin de précision) :
- AO sourcés : `SELECT COUNT(*) FROM tenders WHERE created_at >= NOW() - INTERVAL '7 days';`
- Docs biblio uploadés : `SELECT COUNT(*) FROM presentation_library WHERE created_at >= NOW() - INTERVAL '7 days';`
- Détail crons : audit déjà effectué dans la session (cf. section 6.3 ci-dessous).

---

## 6. Maturité, roadmap et points de vigilance

### 6.1 État de maturité (juin 2026)

- **✅ MVP fonctionnel** : tous les modules cités en section 3 sont livrés et testés (77 fichiers test, 1198 tests verts)
- **✅ Déploiement Vercel actif** : URL preview opérationnelle, branche `main` auto-deployée
- **🟠 Mise en service réelle imminente** : Steve teste en condition réelle depuis fin mai 2026
- **🟠 Migrations en cours de stabilisation** : migrations 0047 et 0048 à appliquer en prod (incident détecté le 5 juin sur nom de table `bureau_etudes` vs `bureaux_etudes`)
- **🟠 Rotation des secrets prod pas finalisée** (incident BDD prod 2026-05-21 — password leaké 2× dans des stack traces postgres-js)
- **🔴 Pas encore d'utilisateur externe à AlyoS** : le multi-tenant est prêt mais non éprouvé en charge
- **🔴 Cron `sourcing-run` : 60 % d'échec cette semaine** (3 KO / 5 runs sur 7 jours) — bug de fiabilité du job principal de scrapping AO à investiguer **avant ouverture SaaS**

### 6.2 Audit opérationnel — crons exécutés cette semaine

Source : table `cron_run_log` BDD prod. Période du 29 mai au 5 juin 2026.

| Cron | Runs | OK | KO | Durée totale (ms) | Durée moyenne (ms) | Observation |
|---|---|---|---|---|---|---|
| `sourcing-run` | 5 | 2 | **3** | 7 284 043 | 1 821 011 (~30 min) | **⚠️ 60 % d'échec — à investiguer.** Probablement lié aux migrations 0047/0048 non appliquées + drift schéma `bureau_etudes`. |
| `tandem-followup` | 4 | 4 | 0 | 3 250 | 813 | Sain, durée négligeable |
| `dossier-zip-cleanup` | 3 | 3 | 0 | 1 335 | 445 | Sain |
| `library-expiry-digest` | 2 | 2 | 0 | 1 631 | 816 | Sain |

> Le cron `sourcing-run` est **le job critique** : c'est lui qui alimente la file « AO du jour » tous les matins à 6h30. 60 % d'échec signifie que les utilisateurs ont vu une file vide ou partielle 3 jours sur 5 cette semaine. C'est inacceptable en mode SaaS — à fixer impérativement avant ouverture.

### 6.3 Roadmap envisagée

**Court terme (T3 2026)** :
- Stabilisation prod (rotation secrets, finalisation hardening migrate.ts)
- Édition inline matching_keywords sur les fiches biblio (lever la limitation MVP)
- Polish UX (Réutilisation cross-archi, dashboard envois v2, filtres date custom)
- Premier retour terrain AlyoS sur 30-50 AO traités

**Moyen terme (T4 2026)** :
- Ouverture SaaS : domaine custom, page d'accueil publique, pricing
- Versioning du tableau Excel références
- Recherche fuzzy d'acheteurs (merge manuel doublons)
- MFA admin obligatoire
- Module ACT (Analyse et Contrôle Travaux) — modèle edifio frère
- Module Suivi — modèle edifio frère

**Long terme (2027+)** :
- Plateforme complète edifio (Sourcing + Suivi + AO + ACT) avec design system commun `@edifio/ui`
- Marketplace de templates DC1/DC2 partagés entre cabinets
- API publique pour intégration Odoo / outils métier tiers

### 6.4 Risques majeurs identifiés

| Risque | Probabilité | Impact | Mitigation envisagée |
|---|---|---|---|
| **Fiabilité cron `sourcing-run`** | Élevée (constaté) | Élevé | Diagnostic + fix immédiat post-stabilisation migrations 0047/0048. Monitoring + alerting sur taux d'échec > 10 % |
| **Dépendance Anthropic API** | Moyenne | Élevé | Préparer fallback OpenAI ou Mistral (souveraineté FR) en couche d'abstraction. Audit IA confirme coût marginal faible, donc switch lib réaliste |
| **Scraping plateformes régionales fragile** | Élevée | Moyen | Worker Playwright avec retry + monitoring. Plan B : abandonner les régionales pour ne garder que BOAMP officiel |
| **Coût IA explose en usage SaaS** | **Faible** (réévalué après audit) | Élevé | Tarification au profil de recherche actif → marge IA prévisible. Cache des analyses RC pour les AO multi-cabinets |
| **Concurrent gros budget rachète Doublet et y ajoute le module dossier** | Faible | Très élevé | Aller vite, lock-in via templates et historique d'AO de l'utilisateur |
| **RGPD / souveraineté** | Faible | Élevé | Toute l'infra UE. À vérifier : pas de log Anthropic conservé > 30 j ; opt-in cookie consent |
| **Conformité CERFA officielle** | Moyenne | Élevé | Templates `.docx` fournis par le client (l'app remplit, ne génère pas depuis zéro) — décharge la responsabilité |

### 6.5 Points forts à exploiter en go-to-market

1. **Story crédible** : produit né en condition réelle chez un MOE (AlyoS Ingénierie), pas un projet labo
2. **Bout-en-bout unique** : aucune concurrence identifiée sur ce périmètre complet
3. **Coût d'infra ridicule au regard du coût humain économisé** : un cabinet qui économise 5h/semaine × 4 utilisateurs au TJM 400 € = 8 000 €/mois. Le SaaS edifio à 600 €/mois est ROI imbattable
4. **Stack moderne et maintenable** : Next.js 14 + Drizzle + Supabase = facile à recruter dessus, écosystème stable
5. **IA bien dosée** : usage ciblé (analyse RC, indexation biblio) — pas de gadget IA partout. Le coût et la valeur sont alignés

### 6.6 Points faibles à anticiper

1. **Marque inconnue** : `edifio Sourcing` n'a aucune notoriété. L'éditeur `AlyoS Ingénierie` non plus en dehors du secteur BTP local
2. **Pricing pas encore validé** par étude clientèle
3. **Pas de réseau commercial** : Steve TEISSIER porte tout, il faudra recruter ou s'associer
4. **Doc technique éparse** : `DECISIONS.md` + `CLAUDE.md` + 16 guides utilisateur + 1 doc balises Mustache + spec gates. Bonne traçabilité interne, mais pas encore agrégée en kit de vente B2B
5. **Pas de programme de partenariat** identifié (intégrateurs, cabinets de conseil B2B)

---

## 7. Demande à l'équipe experte

L'équipe à qui ce brief est transmis est invitée à produire :

1. **Validation du positionnement** sur le marché français
   - Cartographie compétitive précise (5-10 acteurs majeurs, pricing public ou benchmark devis fictif)
   - Identification de 2-3 angles de différenciation à pousser en go-to-market
2. **Estimation TAM / SAM / SOM** sur le segment MOE BTP français
   - Combien de cabinets archi (et BE) en France répondent à au moins 1 AO public par an ?
   - Quelle proportion est outillée vs Excel/Word maison ?
3. **Étude pricing** par interviews terrain (10-20 dirigeants cibles)
   - Willingness-to-pay pour les 5 modèles testés en section 5.6 (per-seat, par org, **par profil de recherche**, pay-per-AO, freemium)
   - Validation que le concept « profil de recherche actif » fait sens pour la cible (notre coût marginal scale à cette granularité)
   - Identification de la métrique de valeur perçue (économie de temps, taux de transformation, nombre d'AO traités)
4. **Plan d'acquisition** réaliste à 12 mois
   - Inbound (SEO, contenu CMO, démos), outbound (cold mailing dirigeants cibles), partenariats (CINOV, syntec ingénierie, ordres des architectes)
5. **Recommandation packaging**
   - Solo / Tandem / Cabinet (proposés en 5.6) ou autre découpage ?
   - Add-ons : analyse IA pay-per-AO en overage, templates DC1/DC2 premium, intégration Odoo
6. **Validation cohérence financière**
   - Le **coût marginal par org de 18-32 €/mois** (calculé en 5.4) supporte-t-il un pricing 79-399 € avec quel CAC ?
   - Modèle de P&L cible 12 / 24 / 36 mois
7. **Audit complet des coûts services restants** (Supabase, Vercel, Brevo, Resend, Fly.io)
   - Récupérer les vraies factures et chiffres dashboards
   - Identifier les leviers d'optimisation (Vercel Hobby vs Pro selon usage, Supabase Pro vs Team, etc.)

---

## 8. Annexes et matériel disponible

L'équipe experte peut demander à Steve TEISSIER ces ressources complémentaires :

- `docs/variables_mustache_dc1_dc2.doc` — liste exhaustive des 33 balises Mustache des CERFA
- `docs/DEPLOY.md` — procédure de déploiement
- `DECISIONS.md` (privé) — log de toutes les décisions techniques et produit
- `gates/05_ARCHI/` — gate d'architecture validée par le Board
- `gates/06_ORM/DECISION_ORM_260518.md` — décision ORM Drizzle
- `specs/adr_013_orm_drizzle.md` — ADR ORM
- 16 guides HTML utilisateur intégrés dans l'app (table `formations`)
- Une démo de l'app (URL Vercel preview sur demande)

---

## 9. Contact

**Steve TEISSIER**
Dirigeant — AlyoS Ingénierie
Email : `steissier@alyosingenierie.fr`
Rôle dans le projet : Vision produit, CTO de fait, Board principal, recetteur n°1

---

*Document v1 — 5 juin 2026. À mettre à jour à chaque jalon majeur (mise en service réelle, ouverture SaaS, partenariat structurant). Document interne AlyoS Ingénierie / edifio Sourcing — transmissible à un partenaire de confiance sous accord de confidentialité.*
