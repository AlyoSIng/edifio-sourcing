# DECISIONS.md — Sourcing-Edifio

> Log des décisions structurantes du projet. Une ligne = une décision actée et opposable.
> Convention : `YYYY-MM-DD · Gate · Décideur(s) · Décision · Motif`
> Validation Board notée `[BOARD-OK YYYY-MM-DD]`.

---

## 2026-05-07 — Phase 0 (Onboarding)

- **2026-05-07 · P0 · Board · Public cible = SaaS multi-clients dès le MVP.** [BOARD-OK 2026-05-07]
  *Motif : ambition de commercialisation immédiate. Conséquence : multi-tenancy stricte non négociable, RLS Supabase par `organization_id` obligatoire dès Gate 5.*

- **2026-05-07 · P0 · Board · Budget MVP = infra + API uniquement.** [BOARD-OK 2026-05-07]
  *Motif : développement assuré en interne via Claude Code (sub-agents `dev` Alex + `ps_operator` Yann). Pas de prestation externe sauf arbitrage Board.*

- **2026-05-07 · P0 · Board · Repo = monorepo `edifio-platform` existant à étendre.** [BOARD-OK 2026-05-07]
  *Motif : factorisation `@edifio/ui` et cohérence avec Suivi-Edifio / AO-Edifio. Action [CTO Sophie] : inventaire complet du monorepo en début Gate 5 avant tout commit côté Sourcing.*

- **2026-05-07 · P0 · Board · SSO Edifio déjà opérationnel — Sourcing-Edifio s'y branche en Gate 6.** [BOARD-OK 2026-05-07]
  *Motif : SSO existe côté plateforme Edifio, gain de plusieurs semaines. Action [CTO Sophie] : récupérer endpoints + métadonnées IdP avant Gate 5.*

---

## 2026-05-07 — Gate 1 (Cadrage usage & business case)

- **2026-05-07 · G1 · CMO+CEO+Board · UVP retenue.** [BOARD-OK 2026-05-07]
  *« La seule plateforme qui orchestre, pour les PME du BTP, l'intégralité du cycle d'un marché public — de l'avis publié à la remise du pli — avec un copilote IA qui prépare les dossiers à votre place. »*
  *Slogan court : « De l'avis publié à l'opportunité gagnée, sans rien tenir à la main. »*

- **2026-05-07 · G1 · CMO+CEO · Trois personas formalisés.** [BOARD-OK 2026-05-07]
  *Patrick (dirigeant TPE BTP, décideur, mobile-first) · Sandrine (chargée d'affaires, utilisatrice quotidienne, desktop) · Marc (architecte cotraitant externe, accès lien tokenisé sans compte). Priorité UX = Sandrine sur desktop + Patrick en mobile.*

- **2026-05-07 · G1 · CMO+CEO+Board · Tarification tiering 3 paliers.** [BOARD-OK 2026-05-07]
  *Sourcing 190 € / Cotraitance 390 € / Studio IA 790 € HT par mois et par compte. Détail final en Gate 4 (limites par tier, période d'essai, dégressivité multi-comptes).*

- **2026-05-07 · G1 · CTO+CEO+Board · Quotas mensuels sur Tier Studio IA.** [BOARD-OK 2026-05-07]
  *20 AO Studio inclus / 1,50 € l'AO supplémentaire. Motif : analyse RC (0,30-0,80 €) + mémoire technique (0,50-1,50 €) sur Claude Sonnet 4.6 = coûts variables non absorbables sans plafond. Conséquence : monitoring coûts par compte dès Gate 6 + alerte 80 % du quota.*

- **2026-05-07 · G1 · CMO+CEO+Board · Naming des modes de réponse = Solo / Tandem.** [BOARD-OK 2026-05-07]
  *Solo = réponse en propre (mandataire seul). Tandem = réponse en cotraitance avec architecte. Remplace définitivement « Mode 1 / Mode 2 ». Adoption immédiate dans code, copy, documentation, URLs (`/solo/`, `/tandem/`).*

- **2026-05-07 · G1 · CMO+CEO+Board · 4 KPIs MVP retenus.** [BOARD-OK 2026-05-07]
  *(1) Taux de sélection ≥ 8 %. (2) Taux de transformation Tandem ≥ 35 %. (3) Délai sourcing → diffusion ≤ 5 jours ouvrés. (4) NPS J+90 ≥ 40. Indicateur qualitatif complémentaire : satisfaction architecte sur page tokenisée. Instrumentation dès Gate 6, activation Gate 9.*

- **2026-05-07 · G1 · CMO+CEO+Board · Hypothèse de gain utilisateur = 50 à 80 h/mois.** [BOARD-OK 2026-05-07]
  *Sur volume cible PME BTP de 10-15 AO Tandem/mois. À valider par mesure terrain en Gate 9 (recette utilisateur réelle).*

---

## 2026-05-07 — Gate 2 (Spec fonctionnelle & parcours détaillés)

- **2026-05-07 · G2 · CTO+CEO+Board · Découpage en 10 epics retenu.** [BOARD-OK 2026-05-07]
  *E1 Auth & multi-tenancy · E2 Configuration · E3 Sourcing automatique · E4 Notification & sélection · E5 Mode Solo · E6 Mode Tandem · E7 Préparation dossier IA · E8 Tableau de bord & suivi · E9 Bibliothèque & assets · E10 Intégrations & administration.*

- **2026-05-07 · G2 · CTO+Board · Format INVEST pour toutes les user stories.** [BOARD-OK 2026-05-07]
  *Échantillon de 30 stories produit en séance, complétion exhaustive (~80-120 stories cibles) à charge de [DEV Alex] côté Claude Code avant Gate 6.*

- **2026-05-07 · G2 · CTO+CEO+Board · 3 parcours utilisateurs détaillés validés.** [BOARD-OK 2026-05-07]
  *(1) Solo — Patrick mobile, ~2 min · (2) Tandem accepté — Sandrine + architecte, ~24 h · (3) Préparation dossier IA — Sandrine desktop, ~4 h. Bases obligatoires des tests E2E Playwright.*

- **2026-05-07 · G2 · CTO+Board · 10 contraintes non fonctionnelles consolidées.** [BOARD-OK 2026-05-07]
  *Perf (LCP < 2,5 s ; sourcing complet < 10 min) · Sécu (RLS 100 %, audit log 12 actions) · RGPD (DPA prestataires) · RGAA AA · SLA ≥ 99,5 % · PWA installable + offline · IA (provenance citation, prompts versionnés). Criticité par gate documentée.*

- **2026-05-07 · G2 · Board · Arbitrage 1/A — Politique tokens architectes.** [BOARD-OK 2026-05-07]
  *1 JWT actif par AO/architecte, expiration 30 jours, révocation manuelle admin. Recommandation CTO+CEO suivie.*

- **2026-05-07 · G2 · Board · Arbitrage 2/A — Canal « Plus d'infos » architecte.** [BOARD-OK 2026-05-07]
  *Email simple en V1, rebouclé en notification Sourcing-Edifio. Recommandation CTO+CEO suivie. Chat in-app reporté en V2.*

- **2026-05-07 · G2 · Board · Arbitrage 3/A — Diffusion dossier autorisée pour rôles `admin` ET `user`.** [BOARD-OK 2026-05-07] [BOARD SURCLASSE RECO CTO+CEO]
  *Board choisit la souplesse opérationnelle. Compensation imposée par CTO et actée : (1) audit log strict (qui / quand / quel AO / vers quel architecte) ; (2) alerte push admin systématique à chaque diffusion par un `user` ; (3) bouton « Annuler la diffusion » disponible 5 minutes après envoi. Bloquant Gate 6.*

- **2026-05-07 · G2 · Board · Arbitrage 4/A — Stratégie modèles IA Sonnet+Haiku.** [BOARD-OK 2026-05-07]
  *Claude Sonnet 4.6 par défaut sur analyse RC + génération mémoire technique. Claude Haiku 4.5 sur pré-classification AO (scoring complémentaire) et générations de copy court (sujets emails, accroches mémoire). Recommandation CTO+CEO suivie. Coût optimisé sans perte qualité sur tâches longues.*

---

## 2026-05-07 — Gate 3 (Design & maquettes)

- **2026-05-07 · G3 · Graphiste+CEO+Board · Naming produit corrigé : `edifio Sourcing`.** [BOARD-OK 2026-05-07] [BOARD SURCLASSE BRIEF V1.0]
  *Le DS Edifio impose `edifio` minuscules + composition « edifio + nom produit » (cf. edifio Suivi, edifio AO, edifio ACT). « Sourcing-Edifio » est explicitement proscrit. Conséquence : renommage global à mener Gate 5 dans tous fichiers, code, URLs, copy.*

- **2026-05-07 · G3 · Graphiste+CEO+Board · Signature éditeur corrigée : `AlyoS Ingénierie`.** [BOARD-OK 2026-05-07] [BOARD SURCLASSE BRIEF V1.0]
  *S majuscule final imposé par le DS Edifio. À corriger dans tous supports (footer, mentions légales, signatures mail, brief).*

- **2026-05-07 · G3 · CEO · PDF Gate 1 et Gate 2 à ré-éditer en v1.1.** [DÉCISION CEO]
  *Palette inventée (bleu profond + orange) utilisée par erreur sur Gate 1 et Gate 2. Ré-édition v1.1 avec palette correcte (alyos-red + ink + paper) avant Gate 5.*

- **2026-05-07 · G3 · Graphiste+CTO+Board · Design tokens DTCG v1.0 livrés.** [BOARD-OK 2026-05-07]
  *Fichier `design/tokens.json` au format Design Tokens Community Group v1.0. Couvre couleurs (12), typographies (3 familles + 9 tailles), espacements (9), rayons (5), ombres (3), naming, accessibilité. Source unique consommée par le package monorepo `@edifio/ui`.*

- **2026-05-07 · G3 · Graphiste+Board · 6 maquettes haute-fidélité validées.** [BOARD-OK 2026-05-07]
  *(M1) Vue mobile « AO du jour » Patrick · (M2) Kanban groupé desktop Sandrine · (M3) Modale Solo / Tandem · (M4) Page tokenisée architecte · (M5) Side-by-side de revue dossier IA · (M6) Fiche AO consolidée. Livrables : `design/maquettes/maquettes_v1.html`.*

- **2026-05-07 · G3 · Graphiste+CEO+Board · Kanban groupé 3 super-colonnes en vue par défaut.** [BOARD-OK 2026-05-07]
  *« En cours / Diffusé / Clôturé » par défaut, toggle vers le détaillé 10 colonnes disponible. Lève l'alerte densité signalée en Gate 2.*

- **2026-05-07 · G3 · Graphiste+Board · Accessibilité RGAA AA dès la conception.** [BOARD-OK 2026-05-07]
  *Contrastes ≥ 4,5:1 (texte courant) / ≥ 3:1 (texte large) · cibles tactiles ≥ 44×44 px · focus ring alyos-red 2 px offset 2 px · jamais couleur seule (toujours libellé + icône). Audit formel Gate 9.*

- **2026-05-07 · G3 · Graphiste · Logo edifio inchangé.** [DÉCISION GRAPHISTE]
  *Pin rouge circulaire (alyos-red) + wordmark Space Grotesk 700 letter-spacing -1 px. Étiquette de produit « Sourcing » en Inter 500 muted. Cohérence stricte DS officiel.*

- **2026-05-07 · G3 · Graphiste · Self-host obligatoire des polices.** [DÉCISION GRAPHISTE — à confirmer Gate 5]
  *Inter, Space Grotesk, JetBrains Mono à servir depuis Vercel/Supabase, pas depuis fonts.googleapis.com. Justifications : PWA offline, RGPD (pas d'IP visiteur vers Google), perf LCP. À acter Gate 5.*

---

## 2026-05-07 — Gate 4 (Revue marketing & copy)

- **2026-05-07 · G4 · Board · Tu/Vous architecte rendu paramétrable.** [BOARD-OK 2026-05-07] [DIRECTIVE BOARD]
  *Ajout colonne `architects.tutoiement BOOLEAN NOT NULL DEFAULT FALSE`, modifiable depuis fiche architecte + toggle dans modale d'envoi Brevo. Valeur sauvegardée à chaque envoi. Templates Brevo dédoublés (3 architecte × 2 registres + 2 templates internes/courts). Motif : la directive Board structure la qualité relationnelle archi par archi.*

- **2026-05-07 · G4 · CMO+CEO+Board · Défaut tutoiement = FALSE (vouvoiement).** [BOARD-OK 2026-05-07]
  *Vouvoiement par défaut à la création / l'import. Le tutoiement se gagne par la connaissance de l'archi. Recommandation CMO+CEO suivie.*

- **2026-05-07 · G4 · CMO+Board · 8 templates Brevo livrés.** [BOARD-OK 2026-05-07]
  *D.1-D.2 architect_solicitation TU/VOUS · D.3-D.4 architect_followup TU/VOUS · D.5-D.6 dossier_diffusion TU/VOUS · D.7 tender_summary_to_user (interne neutre) · D.8 architect_decline_acknowledgment (court neutre). templateId distincts par registre pour analytics propres. Détail dans `design/copy/templates_brevo_v1.md`.*

- **2026-05-07 · G4 · CMO+Board · 14 libellés de statut français naturels validés.** [BOARD-OK 2026-05-07]
  *Code interne anglais préservé. Libellés visibles utilisateur en FR : Sourcé / Sélectionné — Solo / Sélectionné — Tandem / Architecte sollicité / Architecte OK / Architecte indisponible / Plus d'infos demandées / À revoir / Dossier prêt / Dossier diffusé / Remis / Gagné / Perdu / Sans suite. « Indisponible » plus doux que « refusé ».*

- **2026-05-07 · G4 · CMO+GRAPHISTE+Board · Microcopy 6 écrans validée.** [BOARD-OK 2026-05-07]
  *Empty states, CTAs, confirmations, alertes posés. Empty state-clé : « Pas d'AO ce matin. C'est rare, ça se fête. » Ton Léa : direct, chaleureux, sans jargon.*

- **2026-05-07 · G4 · CMO+Board · Audit naming complet finalisé.** [BOARD-OK 2026-05-07]
  *Domaine `sourcing.edifio.fr`, sélecteur module « edifio Sourcing », footer « © AlyoS Ingénierie 2026 », signatures email « via edifio Sourcing ». Aligné DS Edifio (Gate 3).*

- **2026-05-07 · G4 · CMO+CEO+Board · 3 accroches commerciales tiering validées.** [BOARD-OK 2026-05-07]
  *Sourcing 190 € : « Ne plus rater un AO. Tout le sourcing public BTP, chaque matin, dans une seule app. » · Cotraitance 390 € : « Sourcing + un copilote pour mobiliser tes architectes. La cotraitance, sans le tableur. » · Studio IA 790 € : « Le dossier de candidature préparé par l'IA. Tu valides, tu signes, tu remets. »*

- **2026-05-07 · G4 · CMO+Board · Plan SEO on-page sourcing.edifio.fr validé.** [BOARD-OK 2026-05-07]
  *Title, meta 159c., H1 « De l'avis publié à l'opportunité gagnée — sans rien tenir à la main », mots-clés longue traîne, OG image (M2 Kanban), Schema.org SoftwareApplication + 3 Offer. App `app.sourcing.edifio.fr` fermée aux crawlers.*

- **2026-05-07 · G4 · GRAPHISTE · Variante M4 vouvoiement à livrer.** [ACTION OUVERTE]
  *Maquette M4 (page tokenisée architecte) à dupliquer en variante VOUVOIEMENT. Toggle tu/vous à intégrer dans la maquette M3 (modale sollicitation). À livrer avant Gate 5 par [GRAPHISTE Théo].*

---

## 2026-05-07 — Gate 5 (Architecture & stack technique)

- **2026-05-07 · G5 · CTO+Board · Structure monorepo Turborepo + pnpm workspaces.** [BOARD-OK 2026-05-07]
  *Apps `suivi`, `ao`, `act` (existantes), `sourcing` (à créer). Packages partagés `@edifio/ui`, `@edifio/db`, `@edifio/auth`, `@edifio/lib-ai`, `@edifio/lib-integrations`, `@edifio/tsconfig`. Inventaire concret à mener par [PS_OPERATOR Yann] début Gate 6.*

- **2026-05-07 · G5 · Board · Arbitrage 1/A — Worker scraping hybride.** [BOARD-OK 2026-05-07]
  *BOAMP via Vercel Cron + Edge Function Supabase. Playwright (Francmarchés, MP.info, PLACE) via container Fly.io EU dédié (~5 €/mois), déclenché par message Supabase Realtime. Recommandation CTO suivie.*

- **2026-05-07 · G5 · Board · Arbitrage 2/A — PLACE en scraping authentifié.** [BOARD-OK 2026-05-07]
  *Pas d'API officielle accessible aux soumissionnaires. Credentials par compte chiffrés Supabase Vault. Fallback silencieux + alerte UI si pas configuré. Recommandation CTO suivie.*

- **2026-05-07 · G5 · Board · Arbitrage 3 — ORM REPORTÉ.** [REPORT BOARD]
  *Décision Drizzle vs Prisma reportée. Cadre imposé par CTO : spike technique 2 jours mené par [DEV Alex] début Gate 6 sur prototype `tenders` + `architects` + `architect_responses` avec RLS strict + JSON columns + cron Edge Function. Critères pondérés : cold start (50 %), DX migrations + types (25 %), compat Supabase + RLS (15 %), maturité (10 %). Décision finale CTO Sophie première semaine Gate 6, escalade Board uniquement si désaccord [DEV Alex] / [CTO Sophie]. **CONTRAINTE FERME : aucune migration committée avant la décision.***

- **2026-05-07 · G5 · Board · Arbitrage 4/A — Adaptateur Odoo unique avec détection auto.** [BOARD-OK 2026-05-07]
  *Une interface `OdooAdapter` avec branchements internes minimaux par version (17/18/19). Pas d'adapters versionnés séparés. XML-RPC stable depuis 15 ans, divergences sur champs custom uniquement. Recommandation CTO suivie.*

- **2026-05-07 · G5 · Board · Arbitrage 5/A — UI hybride shadcn/ui + custom Edifio.** [BOARD-OK 2026-05-07]
  *shadcn/ui pour primitives universelles (Button, Input, Dialog, Select, Tabs, Toast, Tooltip), thématisées via tokens DS. Composants custom pour patterns métier : carte AO, kanban-card, side-by-side IA, page tokenisée architecte. Tout sous `@edifio/ui`. Effort initial ~2 sem, accessibilité Radix UI native. Recommandation CTO suivie.*

- **2026-05-07 · G5 · CTO+Board · Modèle de données 22+ tables.** [BOARD-OK 2026-05-07]
  *organizations, users, memberships, search_profiles, platforms, platform_credentials, architects (avec `tutoiement BOOLEAN DEFAULT FALSE`), tenders, tender_lots, tender_documents, tender_events (timeline), selections, match_proposals, architect_responses, architect_tokens, response_files, presentation_library, ai_prompts (versionnés), ai_runs, odoo_opportunities, brevo_messages, notifications, audit_logs (immutable, rétention 5 ans), learning_events. RLS Postgres FORCE 100 %. Schéma complet `packages/db/schema.ts` à livrer Gate 6 (selon arbitrage 3).*

- **2026-05-07 · G5 · CTO+Board · Plan sécurité validé.** [BOARD-OK 2026-05-07]
  *Chiffrement at-rest AES-256 + TLS 1.3 + Vault Supabase + SSO Edifio OIDC + MFA admin obligatoire + RLS FORCE + JWT RS256 30j révocable + rate limiting (100 req/min/IP, 1000 req/min/user) + CSP strict + 12 actions auditées + sauvegardes PITR 7j + export quotidien chiffré OVH Object Storage EU + DPA prestataires. Conformité Gate 8 préparée.*

- **2026-05-07 · G5 · CTO+Board · Self-host fonts acté.** [BOARD-OK 2026-05-07]
  *Inter, Space Grotesk, JetBrains Mono téléchargés depuis fontsource.org au build, servis depuis `/public/fonts/` avec Cache-Control immutable + font-display: swap. Aucun appel à fonts.googleapis.com. Action ouverte Gate 3 formellement actée.*

- **2026-05-07 · G5 · CTO+Board · Stratégie de tests.** [BOARD-OK 2026-05-07]
  *Vitest unit ≥70 % global / ≥90 % `lib-ai` et `matching-engine` · RTL composants critiques · pgTAP RLS 100 % (BLOQUANT Gate 6) · Playwright E2E sur 3 parcours Gate 2 · k6 charge Gate 9 · axe-core RGAA AA Gate 9 (BLOQUANT). Tests cross-tenant systematic obligatoires.*

- **2026-05-07 · G5 · CTO+Board · Pipeline CI/CD.** [BOARD-OK 2026-05-07]
  *GitHub Actions (lint + typecheck + tests + build Turborepo cache) → Vercel preview deploy par PR → merge main → production deploy + migrations Drizzle/Prisma (selon arbitrage 3). Conventional Commits + Changesets. Rollback via Supabase migration history.*

- **2026-05-07 · G5 · CTO+Board · 12 actions sensibles auditées.** [BOARD-OK 2026-05-07]
  *(1) Connexion · (2) Modif rôle membership · (3) Création/édition profil recherche · (4) Sélection AO · (5) Envoi sollicitation architecte (registre TU/VOUS loggué) · (6) Diffusion dossier (par admin OU user → push admin) · (7) Génération IA (prompt + cost) · (8) Création opportunité Odoo · (9) Modif base architectes · (10) Export RGPD · (11) Révocation token archi · (12) Suppression données. Audit log immutable, insertion only, rétention 5 ans.*

---

## 2026-05-10 — Pivot FINAL Board : repo dédié, 100 % AlyoS interne (override pivot précédent)

> **Surclasse le pivot du même jour (intégration dans `edifio-site`). Rectifie la décision dans la même journée — dernière en date prévaut.**

- **2026-05-10 · BOARD-OVERRIDE-2 · Repo dédié `AlyoSIng/edifio-sourcing`.** [BOARD-OK 2026-05-10]
  *Le repo GitHub vide créé ce matin sous le nom `AlyoSIng/edifio-platform` est **renommé en `edifio-sourcing`** (Settings GitHub → Rename). Aucun lien avec `edifio-site` (site marketing edifio.fr — repo distinct). Aucun monorepo. Repo Next.js standalone classique (un seul `package.json`, un seul `apps/`).*

- **2026-05-10 · BOARD · Naming produit conservé : `edifio Sourcing`.** [DÉCISION CEO + BOARD]
  *Pas de rebranding malgré l'usage 100 % interne AlyoS. Justification : toute la Phase 1 (Gates 1-5 + design tokens + maquettes + templates Brevo) référence `edifio Sourcing`. Le brand `edifio` est la famille de produits AlyoS — un outil interne peut légitimement porter ce nom. Pas d'avenant Gate 3+4 nécessaire. Footer mis à jour : `© AlyoS Ingénierie {{year}} — Outil interne`.*

- **2026-05-10 · BOARD · Usage 100 % interne AlyoS Ingénierie.** [BOARD-OK 2026-05-10] [SURCLASSE PHASE 0 Q3]
  *MVP utilisé exclusivement par les collaborateurs AlyoS. Multi-tenancy SaaS multi-clients reportée Phase 2. Une seule organisation au démarrage : AlyoS. Schéma multi-tenant (RLS + `organization_id`) conservé pour préparer l'ouverture sans dette technique.*

- **2026-05-10 · BOARD · Accès via lien Vercel + restriction `@alyosingenierie.fr`.** [BOARD-OK 2026-05-10]
  *Déploiement Vercel direct, URL `https://edifio-sourcing.vercel.app` (ou similaire) au démarrage. Custom domain (`sourcing.alyosingenierie.fr` ou `app.alyosingenierie.fr/sourcing`) à arbitrer en Gate 7. Auth Supabase magic-link + middleware Next.js qui rejette toute session dont email ne se termine pas par `@alyosingenierie.fr`. Audit log de chaque tentative.*

- **2026-05-10 · CTO · Pas de monorepo Turborepo.** [DÉCISION CTO]
  *Surclasse la décision Gate 5 (monorepo Turborepo + packages `@edifio/*`). Repo Next.js standalone classique. Aucune factorisation `@edifio/ui` au MVP. Si Phase 2+ justifie une factorisation par l'apparition d'un 2ᵉ produit AlyoS interne, ce sera un sujet à ce moment.*

- **2026-05-10 · CTO · Schéma BDD inchangé.** [DÉCISION CTO]
  *Le modèle 22+ tables validé Gate 5 reste valide à l'identique. Tables créées dans un nouveau projet Supabase EU dédié à edifio Sourcing (pas le Supabase de edifio-site). Décision actée : projet Supabase dédié.*

- **2026-05-10 · CEO · Pivot précédent (intégration dans `edifio-site`) ANNULÉ.** [DÉCISION CEO]
  *Les entrées Board du même jour relatives à l'intégration dans `edifio-site` (route groups `(public)`/`(app)/sourcing`) sont annulées et remplacées par les entrées ci-dessus. Trace conservée pour auditabilité.*

---

## 2026-05-10 — Pivot d'architecture Board (override Phase 0 + Gate 5) — ANNULÉ ET REMPLACÉ

> **Décisions prises directement par le Board le 2026-05-10. Surclasse formellement plusieurs points actés en Phase 0 et en Gate 5. Toutes les décisions antérieures demeurent valides sauf mention explicite ci-dessous.**

- **2026-05-10 · BOARD-OVERRIDE · Repo de travail = `edifio-site` (pas de monorepo `edifio-platform`).** [BOARD-OK 2026-05-10]
  *Le repo GitHub `AlyoSIng/edifio-platform` (créé vide le 2026-05-10) est mis de côté. edifio Sourcing est développé directement dans le repo Next.js `edifio-site` déjà en production sur edifio.fr. Surclasse l'arbitrage Phase 0 « repo existant à étendre » qui était en réalité aspirationnel (le monorepo n'existait pas) et la structure cible Gate 5 (`apps/sourcing` + packages `@edifio/*`).*
  *Conséquence : pas d'app séparée `apps/sourcing`. Pas de packages `@edifio/{ui,db,auth,lib-ai,lib-integrations,tsconfig}` factorisés au MVP. Tout vit dans `src/app/` du repo `edifio-site`. Une factorisation ultérieure pourra être étudiée si justifiée par un 2ᵉ projet.*

- **2026-05-10 · BOARD · Intégration au site edifio.fr — module sous `(app)/sourcing/*`.** [BOARD-OK 2026-05-10]
  *Structure Next.js App Router avec route groups : `src/app/(public)/...` (pages marketing actuelles edifio.fr, NE PAS CASSER — site en prod) + `src/app/(app)/sourcing/...` (module authentifié edifio Sourcing). URL cible : `https://edifio.fr/sourcing/...` ou sous-domaine `app.edifio.fr/sourcing/...` (à arbitrer en Gate 6).*

- **2026-05-10 · BOARD · Accès restreint au domaine email `@alyosingenierie.fr`.** [BOARD-OK 2026-05-10]
  *Authentification Supabase magic-link. **Middleware Next.js `middleware.ts`** qui rejette toute session dont `email.endsWith('@alyosingenierie.fr') === false` sur les routes `/sourcing/*` (et toutes routes protégées). Audit log de chaque tentative d'accès (autorisée OU refusée) dans `audit_logs.action = 'access_attempt'`. Désactivation du middleware = action interdite (cf. CLAUDE.md limites strictes).*
  *Bloquant Gate 6 : test d'intégration vérifiant qu'un email hors domaine est rejeté. Bloquant CI (test obligatoire à chaque PR).*

- **2026-05-10 · BOARD · Public cible révisé — usage interne AlyoS au MVP.** [BOARD-OK 2026-05-10] [SURCLASSE PHASE 0 Q3]
  *Phase 0 Q3 actait « SaaS multi-clients dès le MVP ». Révision : **MVP = usage interne AlyoS Ingénierie uniquement**. Multi-tenancy SaaS multi-clients reportée en Phase 2. Le schéma BDD reste multi-tenant (RLS Postgres + `organization_id`) pour préparer l'ouverture sans dette technique.*
  *Conséquence : 1 seule organisation au MVP (AlyoS). RLS testée mais avec une seule org en production. Plan d'ouverture multi-clients à élaborer en Phase 2 (Gate 10+).*

- **2026-05-10 · CTO+CEO · SSO Edifio non utilisé pour le MVP.** [DÉCISION CTO]
  *La Phase 0 Q4 actait que le SSO Edifio était opérationnel et que Sourcing s'y branchait. Vu le pivot vers `edifio-site` standalone + restriction domaine email, **Supabase Auth magic-link suffit largement au MVP**. Pas de complexité SSO inutile. Si le SSO Edifio devient pertinent en Phase 2 (multi-clients), il sera ajouté à ce moment.*

- **2026-05-10 · CTO · Schéma BDD inchangé.** [DÉCISION CTO]
  *Le modèle 22+ tables validé Gate 5 reste valide à l'identique. Les tables sont créées dans le Supabase de `edifio-site` (ou un nouveau projet Supabase dédié à edifio Sourcing si on veut isoler — à arbitrer Gate 6 avec [DEV Alex]).*

- **2026-05-10 · CTO · Bootstrap script à pointer sur `edifio-site`.** [DÉCISION CTO]
  *Le script `bootstrap-edifio-sourcing.ps1` reste valide. La cible `-RepoPath` devient `C:\Dev\edifio-site` au lieu de `C:\dev\edifio-platform`. Les Phase 1 deliverables sont copiés dans le repo `edifio-site` à côté du code existant.*

---

## Arbitrages ouverts à ce stade

1. **ORM Drizzle vs Prisma** — reporté Gate 5, à statuer début Gate 6 par CTO Sophie sur base spike [DEV Alex].
2. **URL d'accès edifio Sourcing** — `edifio.fr/sourcing/...` (path) ou `app.edifio.fr/sourcing/...` (sous-domaine). À arbitrer en Gate 6.
3. **Projet Supabase** — instance partagée avec le site existant ou nouveau projet dédié à edifio Sourcing ? À arbitrer en Gate 6 avec [DEV Alex].

---

## 2026-05-10 — Travail Cowork en parallèle de Gate 6 *(Alex + Yann en exécution)*

> Le Board délègue Gate 6 à Alex/Yann en autonomie et confirme « GO sur tout » pour la production parallèle Cowork. Pas de décision Board nécessaire sur ces livrables — ils dérisquent ou alimentent Gate 6.

- **2026-05-10 · CTO Sophie · Schéma BDD complet livré `specs/schema_v1.sql`.** [LIVRABLE]
  *22+ tables, types enum, RLS FORCE + politiques, indexes, triggers updated_at, immutabilité audit_logs. Prêt à brancher sur Drizzle ou Prisma après spike ORM Gate 6 par Alex.*

- **2026-05-10 · CTO Sophie · Spec détaillée middleware `@alyosingenierie.fr` livrée `specs/middleware_domain_gate.md`.** [LIVRABLE]
  *12 cas de comportement (matrice), skeleton TypeScript Next.js 14 + Supabase SSR, tests E2E Playwright bloquants, check CI bloquant. À implémenter par Alex en priorité absolue Gate 6.*

- **2026-05-10 · CTO Sophie · 12 prompts IA versionnés livrés `specs/ai_prompts_v1.md`.** [LIVRABLE]
  *Stratégie Sonnet/Haiku conforme Gate 2 arbitrage 4/A. Schémas Zod pour validation runtime. Politique versioning + traçabilité ai_runs. Coûts estimés par appel documentés.*

- **2026-05-10 · CMO Léa · Matrice concurrentielle détaillée livrée `design/copy/competitive_matrix_v1.md`.** [LIVRABLE]
  *Analyse Vecteur Plus, AWS-Achat, Explore-marketing, Doublet. Matrice 13 critères × 5 acteurs. Battlecards pour pitch interne AlyoS. Risques de positionnement anticipés.*

- **2026-05-10 · Graphiste Théo · Variante M4 vouvoiement + toggle TU/VOUS sur M3 livrés `design/maquettes/maquettes_v1_1_vous.html`.** [LIVRABLE]
  *Action ouverte Gate 4 soldée. Comportement Tandem-only sur le toggle (Solo ne nécessite pas le choix).*

- **2026-05-10 · CEO Marc · PDF Gate 1 et Gate 2 ré-édités en v1.1 avec palette DS Edifio correcte.** [ACTION SOLDÉE]
  *Palette `alyos-red #FF0033 + ink #0F1A2E + paper-2 #F3F1EC` substituée à la palette inventée v1.0. Action ouverte Gate 3 soldée. Anciens PDF v1.0 conservés pour traçabilité. Nouveaux fichiers : `01_CADRAGE_260507_v1_1.pdf` et `02_SPEC_FONCT_260507_v1_1.pdf`.*

---

## 2026-05-10 — Batch parallèle Cowork n°2 *(suite à validation Board « OK ça me va, continue »)*

- **2026-05-10 · CTO Sophie · Spec audit log détaillée livrée `specs/audit_log_v1.md`.** [LIVRABLE]
  *13 actions × payload JSON détaillé, helper TypeScript, tests pgTAP bloquants, politique de rétention 5 ans + archivage. Prêt à coder par Alex.*

- **2026-05-10 · CTO Sophie · ADR-001 à ADR-005 livrés `specs/adr_001_to_005.md`.** [LIVRABLE]
  *Formalisation des 5 arbitrages techniques Gate 5 au format Architecture Decision Record (contexte / décision / conséquences / alternatives rejetées). Convention posée pour les ADR suivants.*

- **2026-05-10 · CEO Marc · Budget infrastructure prévisionnel livré `specs/budget_infra_v1.md`.** [LIVRABLE]
  *Synthèse mensuelle MVP : ~45-85 €/mois en preview, ~70-110 €/mois après Gate 9. Détail coûts Anthropic par prompt. Plafond Phase 1 acté à 150 €/mois. Alertes et garde-fous documentés. Tableau de suivi mensuel à compléter par PS_OPERATOR.*

- **2026-05-10 · CMO Léa · Onboarding tooltips + push notifications copy livrés `design/copy/onboarding_and_push_v1.md`.** [LIVRABLE]
  *5 étapes d'onboarding, 12 push notifications, tooltips contextuels par vue, 6 toasts d'erreur, 6 empty states. Strings figées MVP, prêtes pour Alex.*

- **2026-05-10 · Graphiste Théo · Maquettes M7 (login) + M8 (forbidden 403) livrées `design/maquettes/maquettes_v1_2_auth.html`.** [LIVRABLE]
  *Critiques pour le middleware @alyosingenierie.fr. Login 2 états (initial + magic-link envoyé). Page 403 avec détails techniques pour support et lien de contact IT.*

- **2026-05-10 · Graphiste Théo · Manifest PWA + spec icônes livrés.** [LIVRABLE]
  *`design/pwa_manifest_v1.json` (manifest complet avec shortcuts et screenshots) + `design/pwa_icons_spec.md` (déclinaisons à produire : favicons, apple-touch, maskable Android, splashscreens iOS, OG image). Source SVG vectoriel défini.*

---

## Chantiers tier 3 encore en file

- [CEO] Plan de recette utilisateur Gate 6 → Gate 7 (préma — à débloquer quand Alex a une preview fonctionnelle)
- [CEO] Préparation Gate 8 (checklist OWASP + registre RGPD + mentions légales)
- [CEO] Préparation Gate 9 (plan de bascule + rollback + support)
- [CTO] ADR-006 à ADR-010 (à ajouter au fil de Gate 6)
- [CMO] Plan de formation utilisateurs AlyoS + plan de comm interne Gate 9
- [Graphiste] 4 maquettes restantes (configuration profils, base architectes, bibliothèque, notifications)
- [Graphiste] Rendu HTML des 8 templates Brevo
- [Graphiste] Audit RGAA AA détaillé sur les 8 maquettes existantes

---

## 2026-05-10 — Batch parallèle Cowork n°3 *(suite à validation Board « go »)*

- **2026-05-10 · Graphiste Théo · 4 maquettes restantes M9-M12 livrées `design/maquettes/maquettes_v1_3_complete.html`.** [LIVRABLE]
  *M9 Configuration profil de recherche (édition complète) · M10 Base architectes (liste + actions multiples, import CSV, tutoiement groupé) · M11 Bibliothèque (cartes avec alertes expiration J-7 / J-22 / OK) · M12 Notifications (liste + filtres + paramètres). Layout app avec sidebar standard.*

- **2026-05-10 · Théo + Léa · Rendu HTML des 8 templates Brevo livré `design/copy/brevo_templates_rendered.html`.** [LIVRABLE]
  *Rendu visuel email-safe avec données d'exemple substituées aux variables Handlebars. Permet validation Board avant push Brevo par Alex en Gate 6.*

- **2026-05-10 · CTO + CEO · Préparation Gate 8 — Checklist OWASP livrée `specs/owasp_checklist_v1.md`.** [LIVRABLE]
  *48 contrôles sur OWASP Top 10 2021. 18 conformes par défaut, 27 à implémenter Gate 6-7, 3 non couverts (acceptés MVP). Tests bloquants Gate 8 listés.*

- **2026-05-10 · CTO + CEO · Préparation Gate 8 — Registre RGPD des traitements livré `specs/rgpd_registre_v1.md`.** [LIVRABLE]
  *7 traitements documentés (auth, sourcing AO, base architectes, sollicitation Brevo, IA, audit logs, bibliothèque). 6 DPA sous-traitants à signer (bloquant Gate 9). Procédure violation et droits exerçables documentés.*

- **2026-05-10 · CEO + CTO · Préparation Gate 8 — Template mentions légales livré `specs/mentions_legales_v1.md`.** [LIVRABLE]
  *Page /legal complète + footer mail Brevo + checklist 14 items à finaliser par TEISSIER (SIREN, adresse, DPO, etc.). À publier Gate 9.*

- **2026-05-10 · DEV Alex (côté Claude Code) · `.prettierignore` créé pour exclure les artefacts Cowork du scope Prettier.** [LIVRABLE EXÉCUTION]
  *Exclut CLAUDE.md, DECISIONS.md, /gates/, /notes-de-suivi/, /handoff/, /specs/, /design/copy/, /design/maquettes/, /design/*.md, /design/*.json, .claude/. Conformité Prettier rétablie sans dénaturer la matière éditoriale Cowork.*

---

## Chantiers tier 4 encore en file *(non urgents)*

- [CEO] Plan de recette utilisateur Gate 6 → Gate 7 (à débloquer quand Alex aura une preview fonctionnelle)
- [CEO] Préparation Gate 9 (plan de bascule + rollback + plan de support)
- [CTO] ADR-006 à ADR-010 (à ajouter au fil de Gate 6 selon décisions)
- [CMO] Plan de formation utilisateurs AlyoS détaillé
- [CMO] Plan de comm interne Gate 9
- [Graphiste] Audit RGAA AA détaillé sur les 12 maquettes existantes

---

## 2026-05-10 — Batch parallèle Cowork n°4 *(pendant qu'Alex code middleware sub-step 5)*

- **2026-05-10 · Graphiste Théo · Audit RGAA AA détaillé sur 12 maquettes livré `design/rgaa_audit_v1.md`.** [LIVRABLE]
  *54 critères audités sur 9 thématiques RGAA. 38 conformes par défaut (70 %), 16 actions à intégrer par Alex au fil de Gate 6, 0 non couvert. Mapping action ↔ maquette fourni. Outillage CI bloquant Gate 9 documenté (axe-core + Lighthouse). Solde le bloquant Gate 9.*

- **2026-05-10 · PS_OPERATOR Yann côté Cowork · Bootstrap script v2 livré `bootstrap-edifio-sourcing-v2.ps1`.** [LIVRABLE]
  *Scan dynamique de specs/, design/, gates/, notes-de-suivi/ (au lieu de la liste hardcodée v1). Mode -SyncOnly pour synchroniser uniquement les deltas sans recréer la structure. Évite la désynchro repo ↔ Cowork qu'on a vue ce matin. 100 % ASCII, 29/29 accolades, 0 here-string.*

- **2026-05-10 · CMO Léa · Plan de comm interne Gate 9 livré `design/copy/plan_comm_interne_gate9_v1.md`.** [LIVRABLE]
  *Calendrier J-7 / J-3 / J0 / J+1 / J+7 / J+30, scripts d'email préformatés, 3 niveaux de support, KPIs de la comm, plan de formation (démo 1h + accompagnement individuel + office hours), risques anticipés et mitigations. Prêt à activer T-7 du go-live.*

---

## 2026-05-11 — Gate 6 étape 3 (Supabase Auth magic-link) — exécution

- **2026-05-11 · G6 · CEO Marc · Projet Supabase `edifio-sourcing-preview` créé (Frankfurt eu-central-1, Pro).** [BOARD-OK 2026-05-11]
  *Clés `anon` / `service_role` posées dans `.env.local` côté Marc (Option A : pas de transit chat). Configuration Auth : magic-link activé, sign-up désactivé (admin-only), URL Configuration avec `http://localhost:3000/auth/callback` whitelisté. La création du projet `-prod` reste différée à Gate 9.*

- **2026-05-11 · G6 · DEV Alex · Helpers Supabase SSR — pattern `getAll`/`setAll` (API @supabase/ssr 0.6+).** [DÉCISION DEV]
  *`src/lib/supabase/server.ts` expose `createSupabaseServerClient` (Server Actions / Route Handlers / Server Components avec try-catch sur `setAll` pour les SC) et `createSupabaseAdminClient` (service_role, jamais exposé client). `src/lib/supabase/browser.ts` expose `createSupabaseBrowserClient`. L'ancienne API `get/set/remove` était deprecated en 0.6 → migration obligatoire pour propager correctement les cookies de session entre callback et middleware.*

- **2026-05-11 · G6 · DEV Alex · Server Action `signInWithOtpAction` (`src/app/login/actions.ts`).** [DÉCISION DEV]
  *Validation côté serveur AVANT envoi du magic-link : regex email basique + `isAuthorizedEmail()` (réutilise lib auth étape 2). Refus pré-envoi si domaine non Alyos → économie de magic-link inutile et pas de fuite d'info sur l'existence des comptes. `shouldCreateUser` au défaut (true) — autorisation gérée par le middleware côté serveur.*

- **2026-05-11 · G6 · DEV Alex · Callback `/auth/callback` — dual-flow (PKCE + implicit).** [DÉCISION DEV]
  *Migré de `route.ts` → `page.tsx` (Server Component) + `ClientCallbackHandler.tsx` (Client Component). Le SC gère le PKCE flow (`?code=` côté serveur) — flow standard du Server Action. Le CC gère l'implicit flow (`#access_token=...` côté browser uniquement) — flow produit par `auth.admin.generateLink` (utilisé par les helpers E2E). Sans ça les tests Playwright étaient impossibles à brancher (admin ne supporte pas PKCE). Garde-fou `sanitizeNext` anti-open-redirect (rejette `//`, `\`, schémas absolus).*

- **2026-05-11 · G6 · DEV Alex · `/login` form wired (Client Component + `useFormState`).** [DÉCISION DEV]
  *`LoginForm.tsx` Client Component avec `useFormState` consomme la Server Action. Trois états : idle / error / sent. État `sent` conforme M7 (icône check + message). `useFormStatus` pour disable du bouton pendant `pending`. Affichage du `?error=magic_link_invalid` côté page server.*

- **2026-05-11 · G6 · DEV Alex · Bug `middleware.ts` à la racine — déplacé en `src/middleware.ts`.** [INCIDENT FIX]
  *Avec le mode `src-dir` activé, Next.js cherche `middleware.ts` **dans `src/`**, pas à la racine du repo. Le middleware n'était jamais exécuté à l'étape 2 (les tests E2E auraient échoué Gate 6). Détecté en debug E2E étape 3. À surveiller : la spec `specs/middleware_domain_gate.md` §3.1 dit « à la racine du repo » — l'expression est ambiguë avec `src-dir`. Pas de mise à jour de spec proposée — la convention Next.js prévaut.*

- **2026-05-11 · G6 · DEV Alex · Bug matcher middleware trop strict.** [INCIDENT FIX]
  *Le matcher proposé en spec §3.1 utilisait un negative lookahead complexe avec `.*\.(?:svg|png|...)$` qui n'est pas supporté par path-to-regexp de Next.js → matcher silencieusement ignoré → middleware inactif. Remplacé par le pattern canonique Next.js `/((?!_next/static|_next/image|favicon.ico).*)`.*

- **2026-05-11 · G6 · DEV Alex · Tooling tests : @supabase/ssr 0.10, vitest 4.1, @playwright/test 1.59, @next/env 16.** [DÉCISION DEV]
  *Configs `vitest.config.ts` (env node, coverage v8 scopée sur `src/lib/auth/**`) et `playwright.config.ts` (chromium, webServer auto-start `pnpm dev`, env chargée via `@next/env loadEnvConfig` pour que les helpers E2E aient `SUPABASE_SERVICE_ROLE_KEY`). Scripts npm : `test`, `test:watch`, `test:coverage`, `test:e2e`. Chromium installé via `pnpm exec playwright install chromium` (~150 MB cache local).*

- **2026-05-11 · G6 · DEV Alex · 7 tests E2E Playwright actifs et verts (spec §4 bloquant Gate 6).** [LIVRABLE BLOQUANT]
  *`e2e/middleware-domain.spec.ts` couvre les cas C2, C3, C4, C7, C10, C11, C12 de la matrice spec §2. Helpers `signInWith` / `getCookieFor` (`e2e/helpers/auth.ts`) utilisent `auth.admin.generateLink({type:"magiclink",options:{redirectTo:"/auth/callback?next=/"}})` pour bypasser la boîte mail. **Important** : la `redirectTo=/` pointe sur une route publique pour que le middleware ne déclenche pas `signOut()` prématurément avant que le test puisse vérifier la matrice. Audit log `access_attempt` visible dans les logs serveur (succès ET refus). 7 / 7 verts. Validations locales toutes vertes (49 Vitest, typecheck, lint, format, build).*

---

## 2026-05-11 — Gate 6 étape 4 (CI + Vercel preview) — exécution

- **2026-05-11 · G6 · CEO Marc · Repo connecté à Vercel + GitHub Secrets posés + branch protection `main` activée.** [BOARD-OK 2026-05-11]
  *Projet Vercel `edifio-sourcing` importé (compte AlyoS Ingénierie). Env vars Vercel posées sur scope `Preview` + `Development` uniquement (4 vars Supabase preview + `ALLOWED_EMAIL_DOMAIN` + `NEXT_PUBLIC_APP_ENV`). Scope `Production` laissé vide jusqu'à Gate 9. Wildcard `https://*.vercel.app/auth/callback` ajouté aux Redirect URLs Supabase. 4 GitHub Secrets posés (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF`). Branch protection `main` : require PR + 6 CI checks verts + pas de force-push + pas de delete.*

- **2026-05-11 · G6 · DEV Alex · Pipeline CI `.github/workflows/ci.yml` posé — 6 jobs parallélisés.** [DÉCISION DEV]
  *`ci-lint` + `ci-typecheck` + `ci-test` + `ci-middleware-check` + `ci-e2e` + `ci-build`. Tous parallèles, pas de dépendance. Setup pnpm 11.0.9 + Node 20 via `pnpm/action-setup@v4` + `actions/setup-node@v4`. Cache `pnpm-store` (auto via setup-node) + cache binaires Chromium (~150 MB, clé pnpm-lock.yaml hash) + cache `.next/cache` (clé sources hash).*

- **2026-05-11 · G6 · DEV Alex · `ci-middleware-check` bloquant (spec §5 — migré depuis le draft étape 2).** [LIVRABLE BLOQUANT]
  *Vérifie `src/middleware.ts` présent (adapté suite au fix étape 3 — racine → `src/`), grep `@alyosingenierie.fr`, grep `isAuthorizedEmail`. Suppression de `.github/middleware-check-draft.yml` (rôle rempli). La désactivation du middleware est INTERDITE per CLAUDE.md — ce job empêche tout merge qui contournerait la garde de domaine.*

- **2026-05-11 · G6 · DEV Alex · `ci-e2e` Playwright bloquant — 7 tests middleware sur Chromium.** [LIVRABLE BLOQUANT]
  *Env via GitHub Secrets, `pnpm dev` auto-démarré via `webServer` Playwright. Install `--with-deps chromium` au premier run (cache binary partagé entre runs). Upload du rapport HTML + traces en cas d'échec (artefact retention 7 jours). Verify step des secrets pour fail rapide et lisible si un secret manque.*

- **2026-05-11 · G6 · DEV Alex · Helper `src/lib/site-url.ts` — résolution URL multi-environnement.** [DÉCISION DEV]
  *Priorité : `NEXT_PUBLIC_SITE_URL` (custom domain Gate 7) → `VERCEL_URL` (auto-injecté server-side par Vercel preview/prod) → `http://localhost:3000` (fallback dev). Utilisée dans `signInWithOtpAction` pour `emailRedirectTo` — la valeur DOIT matcher exactement un pattern whitelisté dans Supabase Auth → Redirect URLs (`http://localhost:3000/auth/callback` + `https://*.vercel.app/auth/callback`).*

- **2026-05-11 · G6 · DEV Alex · Concurrency CI — cancel-in-progress par branche.** [DÉCISION DEV]
  *`concurrency.group: ${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true`. Évite les builds parallèles sur les PR actives (chaque push annule le run précédent). Économise des minutes runner et accélère le feedback.*

- **2026-05-11 · G6 · DEV Alex · Premier preview public déployé sur Vercel (push de la PR `feat/ci-vercel`).** [LIVRABLE]
  *URL `https://edifio-sourcing-git-feat-ci-vercel-*.vercel.app` (variable par run). Middleware actif sur `/sourcing/*` et `/api/protected/*` depuis l'étape 2, donc l'exposition publique reste safe : tout visiteur hors `@alyosingenierie.fr` est redirigé vers `/login` ou `/forbidden`. Test fonctionnel `/login` à mener une fois la PR ouverte (form actif, magic-link envoyé à un email AlyoS Marc, callback OK).*

- **2026-05-11 · G6 · DEV Alex · `vercel --prod` reste verrouillé.** [GARDE-FOU]
  *Pattern dans le `deny` de `.claude/settings.local.json`. Toute mise en production passe par OK Board explicite Gate 9 (cf. CLAUDE.md limites strictes). Le scope Vercel `Production` reste vide pour éviter tout déploiement accidentel.*

---

*Dernière mise à jour : 2026-05-11 par [DEV Alex] — Gate 6 étape 4 : CI GitHub Actions 6 jobs + Vercel preview auto + branch protection main + premier preview public.*

---

## 2026-05-12 — Gate 6 étape 5 (pivot auth password — ajustements Board Q1-Q4)

> **4 paramètres Board figés sur la base du pivot password initial 2026-05-11.
> Toute modification ultérieure passe par escalade Board.**

- **2026-05-12 · G6 · Board · Q1/B — TTL provisoire = 24 heures (au lieu de 7 jours).** [BOARD-OK 2026-05-12]
  *Justification : un lien sensible ne doit pas dormir une semaine dans une boîte mail. Si le collaborateur n'active pas son compte dans la journée, un admin lui regénère un lien (bouton « Renvoyer » dans `/sourcing/admin/users`). Constante renommée `PROVISIONAL_PASSWORD_TTL_HOURS = 24`. Helper `computeProvisionalExpiresAt(ttlHours)`. Wording email mis à jour. Route `POST /api/admin/users/[id]/regenerate-password` implémentée (réutilise le template welcome au MVP — un template dédié reste possible si Léa le demande). Invariante de sécurité documentée dans `password-server.ts` : le password provisoire ne doit JAMAIS être loggué, audité ou persisté en clair côté serveur après envoi (cycle de vie : RAM → Supabase Auth hash bcrypt → Resend → GC).*

- **2026-05-12 · G6 · Board · Q2/B — Mot de passe définitif : MIN_LENGTH = 16 + check top common-passwords.** [BOARD-OK 2026-05-12]
  *Constante `MIN_LENGTH` passe de 12 à 16. À exigences de classes inchangées, allonger paie le plus en entropie et encourage les passphrases (plus mémorisables qu'un password court complexe). Ajout d'une liste locale `src/lib/auth/common-passwords.ts` (~100 entrées MVP : top 30 universels, sectoriels AlyoS/edifio, saisons + années récentes). Le check `isCommonPassword` est branché dans `validatePasswordStrength` (code d'erreur `TOO_COMMON`, libellé FR « Mot de passe trop courant, choisis-en un moins évident »). `ResetPasswordForm` affiche une astuce passphrase visible (« Astuce : une passphrase facile à retenir et sûre. Ex. : montagne bleue sourire café 7 ! »). TODO Gate 7 : remplacer le sous-ensemble par la liste 10k complète SecLists (MIT) via API ou chargement lazy — ne PAS commiter directement dans le bundle JS.*

- **2026-05-12 · G6 · Board · Q3/A — MFA admin préparée mais désactivée au MVP.** [BOARD-OK 2026-05-12]
  *Le Board veut juste réserver la place. Implémentation minimale conformément au brief : champ `mfa_enabled?: boolean` ajouté à `UserMetadata` (non câblé UI/API) + commentaire `TODO Phase 2 MFA TOTP` en tête de `src/app/sourcing/admin/users/page.tsx`. Pas de route `/security` dédiée — la créer pour un toggle désactivé serait du gaspillage. Activation prévue Phase 2 via `supabase.auth.mfa.enroll({ factorType: "totp" })` quand le SaaS multi-clients s'ouvrira.*

- **2026-05-12 · G6 · Board · Q4/A — Rate-limit login 5 / 15 min / 15 min + countdown UI.** [BOARD-OK 2026-05-12]
  *Configuration côté Supabase Dashboard à régler par [PS_OPERATOR Yann] en parallèle (5 tentatives échouées en 15 min → blocage 15 min). Côté code : helper `isRateLimitError` détecte 429 / `over_request_rate_limit` / message `rate.?limit` (3 signaux selon version SDK). `signInWithPasswordAction` peuple `LoginState.rateLimitedUntil` (timestamp absolu ms). `LoginForm` consomme le hook `useCountdown` (tick 500 ms, lecture `Date.now()` à chaque tick pour éviter la dérive) et affiche un countdown `mm:ss` visible + bouton submit désactivé pendant le cooldown. Anti-énumération préservée pour les 401 (message générique « Email ou mot de passe incorrect »). Constante dédiée `LOGIN_RATE_LIMIT_COOLDOWN_MS`.*

- **2026-05-12 · G6 · DEV Alex · Décision ad hoc — détection rate-limit extraite dans `src/app/login/rate-limit.ts`.** [DÉCISION DEV]
  *`actions.ts` est tagué `"use server"` et Next.js 14 interdit d'exporter autre chose que des async functions depuis ce type de fichier (`https://nextjs.org/docs/messages/invalid-use-server-value`). Pour rendre `isRateLimitError` testable en Vitest, le helper vit dans un module séparé. Pas d'impact runtime — l'import est interne au flow login.*

- **2026-05-12 · G6 · DEV Alex · Décision ad hoc — hook `useCountdown` testé via fonction pure `computeRemaining`.** [DÉCISION DEV]
  *Vitest est configuré en environnement `node` (pas `jsdom`) — impossible de monter un hook React. La fonction pure `computeRemaining(deadlineMs, now)` est testable directement (10 cas couverts). Le comportement runtime du hook (`useEffect` / `setInterval`) sera validé en E2E Playwright via le formulaire login (test à ajouter dans `auth-password.spec.ts` quand la config Supabase rate-limit sera réglée — non bloquant Gate 6 étape 5).*

- **2026-05-12 · G6 · DEV Alex · Tests Vitest : 121 verts (49 baseline + 72 ajoutés cumulés sur le pivot + ajustements).** [LIVRABLE]
  *7 fichiers de tests, coverage 97.05 % statements / 100 % fonctions / 92.95 % branches (seuil 90 % largement tenu). Typecheck OK, lint OK, build OK, prettier OK. E2E couvert par le job `ci-e2e` à l'ouverture de la PR.*

---

*Dernière mise à jour : 2026-05-12 par [DEV Alex] — Gate 6 étape 5 : ajustements Board Q1/B Q2/B Q3/A Q4/A sur le pivot auth password. Aucune migration BDD (spike ORM toujours pas tranché). Aucun commit ni push (Yann gère).*
