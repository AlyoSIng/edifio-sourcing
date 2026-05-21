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

## 2026-05-10 — Batch parallèle Cowork n°5 *(suite à validation Board « top 3 »)*

- **2026-05-10 · CEO + CTO · Plan de bascule Gate 9 livré `specs/plan_bascule_gate9_v1.md`.** [LIVRABLE]
  *32 critères pré-flight GO/NO-GO, procédure J0 step-by-step (8 étapes), 4 procédures de rollback distinctes (Vercel, BDD, secrets, comm), plan d'astreinte intensif J+1 à J+7 avec dashboards de monitoring, signature 3 niveaux (CTO + CEO + Board). Plan figé.*

- **2026-05-10 · CTO + CEO · Threat model + Runbook incident livré `specs/threat_model_runbook_v1.md`.** [LIVRABLE]
  *Solde OWASP A04 (insecure design) et A09 (logging & monitoring). Threat model STRIDE avec 8 scénarios (spoofing AlyoS, fuite données, DoS coût IA, vol JWT archi, compromission sous-traitant, etc.). 7 actions correctives priorisées P0-P2. Runbook 4 niveaux SEV1-SEV4, 4 playbooks types (app down, fuite, dépassement IA, compte compromis), postmortem blameless obligatoire SEV1/SEV2.*

- **2026-05-10 · CEO + CMO · Plan de recette Gate 7 livré `specs/plan_recette_gate7_v1.md`.** [LIVRABLE]
  *72 tests sur 9 scénarios (S0 Auth/middleware, S1 Solo, S2 Tandem accepté, S3 Tandem VOUS, S4 Préparation IA, S5 Audit log, S6 Performance, S7 Sécurité, S8 8 templates Brevo). Jeux de données complets : 6 comptes utilisateurs test, 3 AO, 5 architectes, 6 pièces bibliothèque, 1 RC test 12 pages. Critères d'acceptation par scénario (bloquants Gate 7 identifiés). Procédure J-1 / J0 / J+1.*

---

## 2026-05-10 — Batch parallèle Cowork n°6 *(tier-4 livrables)*

- **2026-05-10 · CMO + Graphiste · Guide utilisateur 1 page A4 recto-verso livré `design/copy/guide_utilisateur_1page.html`.** [LIVRABLE]
  *Page imprimable conforme palette DS Edifio. Recto : connexion 3 étapes, 3 vues principales (AO du jour / Pipeline / Fiche AO), 3 actions (Sélectionner / Différer / Rejeter). Verso : Solo vs Tandem (quand choisir quoi), préparation dossier IA 4 étapes, statuts d'AO, bonnes pratiques, contact support. Prêt à imprimer pour la démo Gate 9.*

- **2026-05-10 · CTO + CEO · Charte d'usage interne IA livrée `specs/charte_usage_ia_v1.md`.** [LIVRABLE]
  *Principe directeur : IA = copilote, pas pilote. Détail des 7 tâches IA et niveau de validation humaine. Procédure de signalement des hallucinations. Protection des données. Quotas et coûts. Responsabilité juridique. À publier sur /help app + intranet AlyoS + annexe contrat (recommandé). Lue et acceptée par chaque collaborateur au premier login.*

- **2026-05-10 · CEO + CTO · Backlog Phase 2 priorisé livré `specs/backlog_phase2_v1.md`.** [LIVRABLE]
  *Méthode MoSCoW : 5 Must (multi-tenancy stricte, facturation Stripe, SSO Edifio/client, onboarding self-service, support externalisable), 5 Should (Odoo bidi tests réels, ML scoring, signature électronique, vues collaboratives, API publique), 5 Could (mobile native, plus de plateformes, veille acheteurs, marketplace archi, RAG mémoires), 5 Won't. Estimation Must+Should = 21-28 sem. Trigger Phase 2 documenté.*

- **2026-05-10 · CTO + PS_OPERATOR · Stratégie backups + procédure de restauration livrée `specs/backups_restore_v1.md`.** [LIVRABLE]
  *RPO 24h, RTO 4h. Triple sauvegarde : Supabase PITR + export quotidien chiffré OVH + snapshots mensuels Storage. 5 procédures de récupération distinctes (BDD locale, infra Supabase, compromission, perte GitHub, secret API). Calendrier de tests mensuel/trimestriel/annuel. Coût total ~ 30-40 €/mois inclus plafond Phase 1.*

---

## 2026-05-10 — Premier incident CI Gate 6 *(résolu par Alex)*

- **2026-05-10 · INC-2026-05-10-01 · CI GitHub Actions — 5/6 jobs failed on PR #5 `feat/ci-vercel`.** [INCIDENT SEV3 résolu]
  *Cause racine : pnpm 11.0.9 utilise le builtin `node:sqlite` disponible uniquement à partir de Node 22. Runner CI configuré sur Node 20.20.2 → `ERR_UNKNOWN_BUILTIN_MODULE` au step `setup-node@v4`. Détection : 5 jobs échouent en 6-10s, seul `ci-middleware-check` passe (job léger sans pnpm install). Fix par [DEV Alex] commit `ba3560e` : node-version 20 → 22 dans 5 jobs CI, `package.json engines.node = ">=22.13.0"`, création `.nvmrc` à 22, README mis à jour. Run suivant `25668827608` reprend OK (>31s = install passe).*

- **2026-05-10 · INC-2026-05-10-01 (bonus) · Middleware fail-closed appliqué.** [LIVRABLE]
  *Alex profite du fix pour ajouter try-catch global au middleware : si crash interne, redirect `/login` (fail-closed) au lieu de 500. Conforme à threat_model_runbook § A03/A05. Élimine `MIDDLEWARE_INVOCATION_FAILED`.*

- **2026-05-10 · INC-2026-05-10-01 (bonus) · `req.ip` retiré du middleware.** [LIVRABLE]
  *Déprécié Next 15, instable Edge runtime cdg1. Fallback `x-real-ip` puis `x-forwarded-for`. Renforce la robustesse en production.*

- **2026-05-10 · CTO Sophie · Convention build : versions alignées CI/package/nvmrc/README.** [DÉCISION CTO]
  *Suite à l'incident INC-2026-05-10-01, toute PR qui touche aux dépendances de build doit vérifier l'alignement : `.github/workflows/*.yml` node-version + `package.json` engines.node + `.nvmrc` + README prérequis. Check à intégrer dans la review de PR.*

---

## 2026-05-10 — Tagline produit edifio Sourcing validée

- **2026-05-10 · CMO+CEO+Graphiste+Board · Tagline edifio Sourcing : « AO publics, du sourcing au pli ».** [BOARD-OK 2026-05-10]
  *Modèle parallèle à « Pilotage de chantier MOE » d'edifio Suivi. Choix Option B (sur 3 propositions : A descriptif, B évocateur, C métier strict). Le Board choisit B pour son ton qui raconte le cycle complet.*
  *Mise en cohérence effectuée : `design/tokens.json` (nouveau nœud `product`), `design/pwa_manifest_v1.json` (description), `design/maquettes/maquettes_v1.html` (M4 header), `design/maquettes/maquettes_v1_1_vous.html` (M4 vouvoiement header), `design/maquettes/maquettes_v1_2_auth.html` (M7 login + M8 forbidden), `design/copy/guide_utilisateur_1page.html` (header).*
  *Open Graph image à mettre à jour côté Théo avant Gate 9 (tagline visible).*

---

## 2026-05-10 — Pivot d'auth : email + mot de passe (au lieu de magic-link)

- **2026-05-10 · Board · Auth = email + mot de passe durable (au lieu de magic-link).** [BOARD-OK 2026-05-10] [SURCLASSE PHASE 0 Q4 + GATE 5 AUTH]
  *Décision Board suite à 3 problèmes constatés en preview Vercel : (1) magic-link bloqué par scanner email entreprise qui pré-clique le lien et consomme le token, (2) UX moins durable que le pattern edifio Suivi (parité à respecter dans la fratrie), (3) impossible de demander à l'IT AlyoS de whitelister Supabase. Modèle retenu : identique à edifio Suivi.*
  *Workflow attendu : (a) admin AlyoS crée un compte avec email + nom + rôle, (b) système génère un mot de passe provisoire aléatoire 16 car., (c) email Resend envoyé au futur user avec le mot de passe provisoire + lien login, (d) première connexion → force-redirect vers changement de mot de passe, (e) mot de passe définitif appliqué + session JWT durable. Mot de passe provisoire expire après 7 jours.*

- **2026-05-10 · CTO · Implications doc à actualiser.** [ACTION OUVERTE]
  *Documents impactés par le pivot auth, à mettre à jour dans le prochain batch Cowork :*
  *— `specs/middleware_domain_gate.md` (mentionne magic-link, à actualiser)*
  *— `specs/plan_recette_gate7_v1.md` (scénarios S0 à ré-écrire avec email+password)*
  *— `design/maquettes/maquettes_v1_2_auth.html` (M7 login → ajouter champ password + lien « Mot de passe oublié »)*
  *— `design/copy/templates_brevo_v1.md` (ajout D.9 = template mot de passe provisoire)*
  *— `design/copy/onboarding_and_push_v1.md` (mise à jour étape 2)*
  *— `specs/charte_usage_ia_v1.md` (légère mise à jour mention auth)*
  *— `CLAUDE.md` (section auth à reformuler)*

---

## 2026-05-10 — Batch parallèle Cowork n°7 *(implémentation pivot auth)*

- **2026-05-10 · CEO · `CLAUDE.md` section auth mise à jour.** [LIVRABLE]
  *Section « Décisions d'architecture actées le 2026-05-10 » point 4 reformulée pour décrire le flow email + password (admin-create + provisional + first-login force change). « Premières actions Gate 6 » point 4 actualisé.*

- **2026-05-10 · CMO Léa · 2 nouveaux templates Resend D.9 et D.10.** [LIVRABLE]
  *`design/copy/templates_brevo_v1.md` enrichi de : D.9 `welcome_provisional_password` (mot de passe provisoire à la création du compte, neutre, sécurité documentée) + D.10 `password_reset` (lien tokenisé Supabase 60 min, usage unique). Logique de sélection mise à jour côté pseudo-code Alex.*

- **2026-05-10 · Graphiste Théo · Maquettes v2 auth livrées `design/maquettes/maquettes_v2_password_auth.html`.** [LIVRABLE]
  *Supersede maquettes_v1_2_auth.html pour M7 et M8. Contenu : M7 v2 (login email + password + lien « Mot de passe oublié »), M13 (force change password à la première connexion avec règles dynamiques), M13 bis (forgot password), M14 (admin interface gestion utilisateurs avec modale Inviter).*

- **2026-05-10 · CMO Léa · Onboarding mis à jour avec Étape 0 (première connexion).** [LIVRABLE]
  *`design/copy/onboarding_and_push_v1.md` enrichi d'une Étape 0 préalable à l'Étape 1, qui décrit le force-redirect vers `/reset-password` pour les comptes avec `must_change_password=true`.*

- **2026-05-10 · CEO + CTO · Plan de recette Gate 7 — Scénario S0 réécrit.** [LIVRABLE]
  *`specs/plan_recette_gate7_v1.md` § S0 : 8 tests → 14 tests, couvrant tout le flow admin-create → invitation → first-login → force change → reconnexions ultérieures + rate-limit + mot de passe oublié + provisional expiré.*

- **2026-05-10 · CTO Sophie · Spec middleware v1.1 mise à jour.** [LIVRABLE]
  *`specs/middleware_domain_gate.md` : version 1.1, note pivot ajoutée en en-tête, mention magic-link remplacée par pivot email+password dans la section « Risques résiduels ». Le middleware lui-même est inchangé fonctionnellement.*

---

## 2026-05-10 — Paramètres auth password détaillés actés Board

- **2026-05-10 · Q1/B · Board · Mot de passe provisoire expire après 24 heures.** [BOARD-OK 2026-05-10]
  *Surclasse la reco CTO (7 jours). Sécurité prioritaire : le mot de passe provisoire en clair dans la boîte mail ne doit pas traîner. Conséquence : workflow admin doit prévenir le futur user avant l'invitation. Si user en congé/weekend, admin peut re-générer un nouveau mot de passe via bouton « Renvoyer » dans la liste utilisateurs (M14). À surveiller : taux de renvois en première semaine.*

- **2026-05-10 · Q2/B · Board · Mot de passe définitif min 16 caractères (+1 maj +1 min +1 chiffre +1 symbole).** [BOARD-OK 2026-05-10]
  *Surclasse la reco CTO (12 caractères, standard NIST 2024). Sécurité renforcée. UI doit encourager les passphrases pour faciliter la mémorisation (ex. exemple affiché : « montagne bleue sourire café 7 », 28 caractères, facile à retenir, conforme aux règles).*

- **2026-05-10 · Q3/A · Board · MFA optionnel pour admin au MVP.** [BOARD-OK 2026-05-10]
  *Reco CTO+CEO suivie. Activable dans les paramètres user, pas bloquant. À évaluer pour passage en obligatoire en Phase 2 (ouverture multi-clients).*

- **2026-05-10 · Q4/A · Board · Rate-limit 5 tentatives / 15 min.** [BOARD-OK 2026-05-10]
  *Reco CTO suivie. Default Supabase, équilibre standard industrie.*

---

## 2026-05-10 — Batch parallèle Cowork n°8 *(tier-5 production)*

- **2026-05-10 · CTO Sophie · ADR-006 à ADR-010 livrés `specs/adr_006_to_010.md`.** [LIVRABLE]
  *Formalise 5 décisions techniques actées dans la journée : ADR-006 repo dédié (pas monorepo), ADR-007 auth email+password (pivot magic-link), ADR-008 Vercel compte perso temporaire à migrer avant Gate 9, ADR-009 domaine Resend `alyosingenierie.fr` avec DKIM/SPF/MX/DMARC, ADR-010 4 paramètres auth (24h provisoire, 16 car, MFA optionnel, rate-limit 5/15).*

- **2026-05-10 · CEO Marc · Index sommaire des livrables Cowork livré `INDEX.md`.** [LIVRABLE]
  *Navigation par rôle (Pilotage, Gates, Specs, Préparation 7/8/9, Design, Copy, Notes) + section « Navigation par usage » (audit sécu, démo Gate 9, incident, etc.). Statistiques globales : 35+ livrables, 50+ décisions, 350+ lignes SQL, 72 tests recette, 54 critères RGAA. À actualiser à chaque nouveau livrable.*

- **2026-05-10 · CTO Sophie + CEO Marc · Template postmortem livré `specs/postmortem_template_v1.md`.** [LIVRABLE]
  *Template SEV1/SEV2 obligatoire, format blameless NIST SP 800-61. 12 sections : résumé, impact, chronologie horodatée, root cause (avec 5-whys facultatif), détection, réponse, ce qui a bien/mal fonctionné, actions correctives, apprentissages, diffusion, suivi. Procédure : copier en `notes-de-suivi/POSTMORTEM_INC-YYYY-MM-DD-N.md`, finaliser sous 7 jours.*

---

## 2026-05-13 — DNS Resend basculé chez IONOS (correction ADR-009)

- **2026-05-13 · BOARD + CEO · DNS Resend reposé chez IONOS, pas OVH.** [CORRECTION ADR-009]
  *Diagnostic Alex 2026-05-13 (note CC_260513_0850) : le domaine `alyosingenierie.fr` est hébergé chez IONOS (NS `ns1016.ui-dns.com`), pas OVH comme supposé en Phase 0. Les records initialement posés chez OVH n'ont jamais propagé.*
  *Correction effectuée : 4 records ajoutés chez IONOS le 2026-05-13 par le Board avec assistance Cowork (CEO + PS_OPERATOR via DNS-over-HTTPS Google). Stratégie sous-domaine `send.` pour ne pas toucher au SPF racine qui sert Outlook 365 AlyoS.*
  *Records validés propagés Google DNS public le 2026-05-13 :*
  *— TXT `resend._domainkey.alyosingenierie.fr` : `v=DKIM1; k=rsa; p=MIGfMA...QIDAQAB`*
  *— TXT `send.alyosingenierie.fr` : `v=spf1 include:amazonses.com ~all`*
  *— MX `send.alyosingenierie.fr` : `10 feedback-smtp.eu-west-1.amazonses.com`*
  *— TXT `_dmarc.alyosingenierie.fr` : `v=DMARC1; p=none;`*
  *ADR-009 à corriger en v1.1 : remplacer toutes mentions « OVH » par « IONOS » dans le contexte DNS. Au passage : Phase 0 onboarding doc à actualiser (hébergement DNS = IONOS et non OVH).*

---

- **2026-05-13 · BOARD · Resend Domain `alyosingenierie.fr` = Verified.** [BOARD-OK 2026-05-13]
  *Confirmation Resend dashboard 2026-05-13. Les 4 records DKIM + SPF + MX + DMARC sont validés côté Resend. `sendPasswordResetEmail` et `sendWelcomeProvisionalPassword` peuvent désormais émettre depuis `noreply@alyosingenierie.fr` et autres aliases. Le flow auth bout-en-bout est techniquement débloqué — restera à valider via E2E une fois la PR `feat/auth-password-pivot` mergée.*

---

## 2026-05-14 — Custom SMTP Supabase + Resend opérationnel + bug `https://https://`

- **2026-05-14 · BOARD + CEO · Supabase Custom SMTP configuré avec Resend.** [LIVRABLE]
  *Diagnostic initial : `Failed to send recovery email` → Auth log a révélé `535 Authentication credentials invalid`. Cause : le mot de passe initialement collé dans Supabase Custom SMTP n'était pas une clé API Resend valide. Correction : création d'une nouvelle clé API Resend dédiée (`Supabase Auth SMTP`, permission Sending access, domain restriction `alyosingenierie.fr`), valeur collée propre dans Supabase Settings → Email → Password. Save → test « Send password recovery » sur user `steissier@alyosingenierie.fr` → email reçu via Resend en moins d'1 minute.*

- **2026-05-14 · INC-2026-05-14-01 · Bug double `https://` dans lien email reset password.** [INCIDENT SEV2 ouvert]
  *Le lien dans l'email reset arrive sous forme `https://https://edifio-sourcing-3gfzshq1t-teissiers-projects.vercel.app/#access_token=...` (double `https://`). Brave interprète `https` comme hostname → DNS_PROBE_POSSIBLE error. Confirmé aussi dans Auth Log antérieur (referer `https://https://edifio-sourcing...`). Cause à confirmer : Supabase Site URL avec `https://` dupliqué OU helper `getSiteUrl()` côté code qui préfixe 2× OU env var Vercel mal configurée. Workaround utilisateur : copy-paste + cleanup manuel du lien (acceptable pour le test mais inadmissible en prod). Brief Alex envoyé pour fix P0.*

---

## 2026-05-14 — Batch parallèle Cowork n°9 *(pendant qu'Alex code les fixes auth)*

- **2026-05-14 · CTO Sophie · ADR-011 livré `specs/adr_011_auth_strategy_post_scanner.md`.** [LIVRABLE]
  *Formalise la stratégie auth en 3 couches face au scanner email d'entreprise AlyoS qui consume les tokens recovery. Recommandation : abandonner le `resetPasswordForEmail` standard Supabase au profit d'une regénération de mot de passe provisoire envoyée en clair via Resend (réutilise template D.9 + force change first-login). Page `/auth/error` à ajouter pour les cas où un user clique malgré tout sur un ancien lien. Brief Alex inclus.*

- **2026-05-14 · CTO Sophie + DEV Alex · Spec module sourcing engine livrée `specs/module_sourcing_engine_v1.md`.** [LIVRABLE]
  *Architecture complète : 4 connecteurs (BOAMP API + PLACE/Francmarchés/MP.info via container Fly.io), orchestrateur Supabase Edge Function, normalisation, dedup hash composite cross-plateformes, scoring V1 règles + scoring IA Haiku, cron Vercel HH:MM Europe/Paris, webhook scraper, tests E2E. Plan de mise en œuvre Alex : ~9-13 jours sur 2-2.5 semaines de Gate 6. Coût opérationnel ~10-25 €/mois. Risques + mitigations documentés.*

- **2026-05-14 · CEO Marc · INDEX.md mis à jour avec les 3 nouveaux livrables.** [LIVRABLE]
  *Navigation par usage enrichie d'une section « préparer le prochain gros chantier ». ADR-011 et spec module sourcing intégrés à l'index des specs techniques.*

---

## 2026-05-14 — Audit visuel edifio.fr (ADR-012) + tokens enrichis

- **2026-05-14 · Graphiste Théo + CTO Sophie · Audit live edifio.fr via DOM inspection.** [DIAGNOSTIC]
  *Méthode : navigation MCP vers edifio.fr + javascript_tool sur les éléments hero/buttons/pills. Inspection font-family, font-size, color, padding, border, letter-spacing. Verdict : les bases du DS (couleurs paper/ink/alyos-red/line + fontes Space Grotesk/Inter + CTA primary/secondary) sont **strictement identiques** à edifio.fr. Le diagnostic Board sur la divergence typo était fondé sur la perception (gros titres marketing 52px sur edifio.fr vs page-titles app interne 32px), pas sur une vraie divergence technique.*

- **2026-05-14 · CTO Sophie + Graphiste Théo · 3 patterns marketing ajoutés au DS via `tokens.json`.** [LIVRABLE]
  *Patterns extraits de edifio.fr non couverts par notre Gate 3 (maquettes Phase 1 = app interne uniquement) : (1) pill « eyebrow » bg `#FFE5EA` + color `#C8002A` pour les badges SUITE LOGICIELLE etc., (2) H1 marketing scale 52px + letter-spacing -1.5px + line-height 1.05, (3) pattern split-color H1 (2 lignes, ligne 2 en alyos-red — signature éditoriale edifio). Tokens ajoutés sous `color.marketing-pill`, `font.size.marketing-h1`, `font.letter-spacing`. ADR-012 livré.*

- **2026-05-14 · Graphiste Théo · Maquette M15 (landing publique edifio Sourcing) à programmer Gate 7.** [ACTION OUVERTE]
  *À produire quand on aura besoin d'une vraie page d'accueil publique pour edifio Sourcing (pas urgent en Gate 6 — l'app interne ne nécessite pas de landing marketing). Utilisera les 3 nouveaux patterns marketing du tokens.json.*

---

## 2026-05-14 — Batch parallèle Cowork n°10 *(spec modules Gate 6 + landing publique)*

- **2026-05-14 · Graphiste Théo · Maquette M15 — Landing publique edifio Sourcing livrée `design/maquettes/maquettes_v3_landing.html`.** [LIVRABLE]
  *Première maquette utilisant les 3 patterns marketing ADR-012 : pill eyebrow rose pâle, H1 52px avec letter-spacing -1.5px, split-color (2e ligne en alyos-red). Sections : header navigation, hero, « Que recouvre la marque ? », « Notre suite » (4 cards produits edifio Suivi/Sourcing/AO/ACT), spotlight sombre (effet card ink avec stats), footer 4 colonnes. Prêt pour intégration Alex en Gate 7+.*

- **2026-05-14 · CTO Sophie + DEV Alex · Spec module Tandem livrée `specs/module_tandem_engine_v1.md`.** [LIVRABLE]
  *Architecture complète flow cotraitance architecte : matching V1 par règles (spécialité + géo + history + availability + preference), short-list 3 archis, génération JWT token 30j, envoi Brevo template TU/VOUS selon archi.tutoiement, page tokenisée publique `/archi/[token]`, route POST response (accepted/declined/info_requested), webhook Brevo tracking, relance auto J+3, push Realtime au user. ~7 jours Alex (1.5 sem).*

- **2026-05-14 · CTO Sophie + DEV Alex · Spec module Préparation dossier IA livrée `specs/module_ia_dossier_v1.md`.** [LIVRABLE]
  *Module le plus complexe et différenciant de Gate 6. Pipeline 5 phases : (A) Analyse RC P1 Sonnet → JSON structuré + provenance, (B) Mapping bibliothèque P10 Haiku parallèle, (C) CERFA pré-remplissage DC1/DC2/DC4/ATTRI1 P3 Sonnet, (D) Mémoire technique P12 Haiku intro + P2 Sonnet sections pondérées critères, (E) Compilation ZIP + diffusion auto Tandem. UI side-by-side M5 pour revue manuelle obligatoire. Quota Studio 20 AO/mois + overage 1.50 €/AO. Coût estimé 1.50-4.30 €/dossier. ~13.5 jours Alex (2.5 sem).*

---

## 2026-05-15 — Réponses Cowork au handoff prérequis spike ORM

- **2026-05-15 · CTO Sophie · Q1 Taille `tenders.raw_data` = bucket 10-50 KB.** [DÉCISION CTO]
  *Bench ORM-bound, pas bandwidth-bound. La pondération Gate 5 (cold start 50/DX 25/RLS 15/maturité 10) reste discriminante. Pas d'arbitrage Board nécessaire. Réponse postée dans `handoff/ANSWER_260515_1430_PREREQ_SPIKE_ORM.md`.*

- **2026-05-15 · CTO Sophie · Q2 Prisma Data Proxy = NO-GO.** [DÉCISION CTO]
  *3 raisons : (1) latence 50-200 ms/query compromet cron-batch < 10 min, (2) coût 29-90 €/mois hors budget infra-only Phase 0, (3) alternative driver-adapter Deno expérimentale → risque. Prototype Prisma exclusivement via driver-adapter expérimental pour comparabilité équitable runtime cible.*

- **2026-05-15 · CTO Sophie · Q3 `tier` = enum Postgres `subscription_tier`.** [DÉCISION CTO]
  *Migration à pré-poser : `CREATE TYPE subscription_tier AS ENUM ('sourcing','cotraitance','studio')` + `ALTER TABLE organizations ADD COLUMN subscription_tier subscription_tier NOT NULL DEFAULT 'studio'`. Cohérent avec les 3 paliers tarifaires Gate 1. Phase 2 multi-clients : update via webhook Stripe quand client change de plan. Mock Phase 1 explicitement rejeté (gap dans pattern d'écriture conditionnelle).*

- **2026-05-15 · DEV Alex · Alex peut démarrer le spike ORM Drizzle vs Prisma.** [PROCHAINE ÉTAPE]
  *Délai cible : spike + rapport rendu 2-3 jours. Verdict CTO Sophie sous 24h après réception du rapport. Critères Gate 5 inchangés.*

---

## 2026-05-18 — Batch n°11 — Décision ORM : Drizzle retenu (Gate 5 Arbitrage 3 tranché)

- **2026-05-18 · DEV Alex · Rapport spike ORM Drizzle vs Prisma livré `gates/06_ORM/DECISION_ORM_260518.md`.** [LIVRABLE — 219 lignes]
  *Spike de 2 jours conformément au plan `CC_260516_0925_SPIKE_PLAN.md`. Prototypes complets sur branches `spike/orm-drizzle` (commit `ec9650d`) et `spike/orm-prisma` (commit `bf24fc2`) : 4 tables + 3 enums + RLS 12 policies + seed 100 tenders + scoring upsert (per_tender + batch_100) + cron Edge Function. Bench Drizzle exécuté ARM local Postgres 16.14 : cold start médiane 555 ms (stdev 26 ms), upsert batch_100 médiane 60 ms, upsert per_tender médiane 316 ms. Bench Prisma bloqué après 4 fails GHA pnpm 11 (commits `b96f826`, `d238188`, `cec3ce4`, `8433cd0`/`d8cf7a2`) — STOP acté ROI marginal. Caveat méthodologique : cold start Prisma analysé qualitativement (engine Wasm ~30 MB + driver-adapter Deno expérimental → extrapolation 700-1100 ms cold start vs 555 ms Drizzle).*

- **2026-05-18 · DEV Alex · Vote dev : Drizzle.** [VOTE DEV]
  *Score pondéré Gate 5 : Drizzle **7,80 / 10** vs Prisma **5,30 / 10** = écart **2,50 points** (TL;DR Alex annonce 2,3 par arrondi, Sophie a re-vérifié l'arithmétique → 2,50 retenu). Justification factuelle : 3 écarts DX disqualifiants Prisma (`upsertMany` absent → fallback `$executeRawUnsafe`, `Json` opaque sur 9 colonnes jsonb v1, `TRUNCATE` absent API native), driver Deno Drizzle stable vs Prisma expérimental, alignement Supabase + postgres-js natif. Maturité écosystème = seul critère Prisma (10 % seulement). Stress-test : si on relâche cold start Drizzle 8→6 (concession agressive au non-mesuré), écart reste 1,5 point > seuil 1 point d'arbitrage CTO.*

- **2026-05-18 · CTO Sophie · Verdict CTO : Drizzle validé tel quel sous 3 conditions.** [DÉCISION CTO]
  *(1) Bench cold start Edge Function Supabase Deno réel devient **bloquant pré-Gate 9** (k6 + sonde dédiée preview Vercel + Edge Deno). Si écart Drizzle vs Prisma < 200 ms → post-mortem + ADR amendé. Si écart conforme extrapolation → validation finale.*
  *(2) Re-seed avec payload Opendatasoft réel (25 KB médiane Q1 Cowork) à la première PR du module sourcing engine — le bug de remplissage `description` répétés sous-dimensionnait jsonb à 10 KB médiane (au lieu de 25 KB visés).*
  *(3) Conservation **30 jours** des branches `spike/orm-drizzle` et `spike/orm-prisma` (suppression différée 2026-06-17). Si la mesure pré-Gate 9 invalide la trajectoire, la base Prisma reste accessible pour pivoter avec coût modeste (schema déclaratif + migrations SQL portables).*

- **2026-05-18 · BOARD · Validation OUI du verdict CTO Drizzle.** [BOARD-OK 2026-05-18]
  *Validation chat Cowork le 2026-05-18. Les 5 actions sont enclenchées : update DECISIONS.md (cette entrée), ADR-013 rédigé, CLAUDE.md amendé (commandes utiles Drizzle + levée interdiction migration BDD), section Verdict CTO du rapport remplie + committée par Yann, conservation branches spike 30j programmée.*

- **2026-05-18 · CTO Sophie · ADR-013 livré `specs/adr_013_orm_drizzle.md`.** [LIVRABLE]
  *Formalise la décision Drizzle : contexte (Gate 5 Arbitrage 3), décision (Drizzle + postgres-js Deno-natif), motifs (4 critères pondérés détaillés), conséquences techniques + opérationnelles, alternatives rejetées (Prisma, Kysely, raw SQL, pg-promise, TypeORM), conditions formelles CTO (3 conditions ci-dessus), bench cold start Edge Function planifié pré-Gate 9 comme bloquant. ADR-013 référencé depuis DECISIONS.md et lié au rapport spike `gates/06_ORM/DECISION_ORM_260518.md`.*

- **2026-05-18 · CTO Sophie · CLAUDE.md amendé v1.1.** [LIVRABLE]
  *Section « Commandes utiles » alignée Drizzle : `pnpm drizzle-kit generate`, `pnpm drizzle-kit migrate`, `pnpm db:seed`, `pnpm db:reset`. Section « Limites strictes » : ligne « Committer une migration BDD avant la décision ORM » SUPPRIMÉE (la décision est prise). Section « État du projet au démarrage Gate 6 » : statut ORM passé de « décision REPORTÉE → spike de 2 jours » à « décision ACTÉE 2026-05-18 → Drizzle 0.39 + drizzle-kit 0.30 + postgres-js 3.4 ».*

- **2026-05-18 · DEV Alex · Première PR module sourcing engine à venir.** [PROCHAINE ÉTAPE]
  *Base Drizzle (pas de carry-over du spike — repart propre depuis `feat/sourcing-mvp`). Première PR contiendra : (a) migration `0000_init.sql` enum `subscription_tier` + colonne `organizations.tier` (verdict Cowork Q3), (b) schema Drizzle v1 complet (22+ tables incl. tenders/architects/architect_responses/audit_logs), (c) RLS FORCE 12 policies + helpers `current_organization_id()` et `current_user_role_text()` (SQL natif, hors ORM), (d) seed avec payload Opendatasoft réel (25 KB médiane). Effort ~9-13 jours sur 2-2.5 semaines.*

- **2026-05-18 · PS_OPERATOR Yann · Cleanup branches spike planifié 2026-06-17.** [ACTION PROGRAMMÉE]
  *Suppression différée 30j (condition 3 verdict CTO). Reminder : `git push origin --delete spike/orm-drizzle` + `git push origin --delete spike/orm-prisma` à exécuter le 2026-06-17 SI la mesure cold start Edge Function pré-Gate 9 valide la trajectoire Drizzle. Conservation locale conseillée 90j supplémentaires.*

---

## 2026-05-18 — Batch n°12 — Post-mortem CI 42P17 (PR #14 module sourcing engine)

- **2026-05-18 · DEV Alex · Bug latent spec schema_v1 sur `idx_tenders_deadline`.** [POST-MORTEM INCIDENT CI]
  *Détecté pendant la CI de PR #14 (ci-db-rls failing pull_request + push). Erreur Postgres SQLSTATE 42P17 « functions in index predicate must be marked IMMUTABLE » sur l'exécution de la migration Drizzle. Cause racine : `specs/schema_v1.sql:206` contenait depuis Gate 5 (validée Board 2026-05-07) un index partiel `CREATE INDEX idx_tenders_deadline ON tenders(deadline) WHERE deadline > now();`. Postgres exige des fonctions IMMUTABLE dans les prédicats d'index partiels — `now()` est marquée STABLE, donc refusée. Bug passé au travers de la review Gate 5 + de l'écriture du schema Drizzle.*

- **2026-05-18 · DEV Alex · Fix commit 6f4a10f sur `feat/sourcing-mvp`.** [LIVRABLE]
  *Diagnostic : 1 seul index fautif sur les 10 du schéma (les 9 autres utilisent des prédicats sur enum/statique = IMMUTABLE). Fix : retrait du prédicat → index full sur `deadline`. Les queries continueront à filtrer au runtime via leur clause WHERE applicative. 6 fichiers modifiés : `tenders.ts:84` (schema Drizzle), `0001_schema_v1.sql:388` (migration), 3 snapshots meta Drizzle, `DECISIONS.md` (post-mortem). Validation locale verte : `drizzle-kit check` 0 drift, `tsc` 0 erreur, `lint` 0 warning. CI relancée sur SHA 6f4a10f en surveillance background.*

- **2026-05-18 · CTO Sophie · Spec source de vérité `specs/schema_v1.sql:206` amendée.** [LIVRABLE]
  *Retrait du `WHERE deadline > now()` côté Cowork pour aligner la source de vérité sur le fix Alex. Commentaire explicatif ajouté avec référence au commit + au présent post-mortem. Empêche la régénération du bug si quelqu'un repart de la spec à l'avenir (ex. autre app de la fratrie edifio qui réutiliserait le pattern).*

- **2026-05-18 · CTO Sophie · Leçon à intégrer pour Gate 5 v2 et autres apps fratrie.** [APPRENTISSAGE]
  *Ajout à la grille review Gate 5 architecture : tout `CREATE INDEX ... WHERE` doit être audité explicitement pour la mutabilité des fonctions du prédicat. Liste des fonctions à interdire dans les prédicats : `now()`, `current_timestamp`, `current_date`, `random()`, et toute fonction custom non explicitement marquée `IMMUTABLE`. À propager dans le template ADR architecture.*

---

## 2026-05-18 — INC-2026-05-18-02 — Bug routing recovery password (landing affichée au lieu du formulaire reset)

- **2026-05-18 · BOARD · Incident détecté en testant le flow de réinitialisation de mot de passe.** [INCIDENT SEV2 ouvert]
  *Symptôme : le lien recovery de l'email Supabase/Resend mène à l'URL `https://edifio-sourcing-XXX.vercel.app/#access_token=...` avec le token bien présent dans le hash fragment. MAIS la page d'atterrissage est la **landing publique** (texte « De l'avis publié à l'opportunité gagnée »), pas le formulaire de réinitialisation `/auth/update-password`. Le token est ignoré, l'utilisateur ne peut pas redéfinir son mot de passe.*
  *Cause racine probable : la page `/` (landing) ne parse pas le `#access_token` dans le hash + ne redirige pas vers `/auth/update-password` quand un token recovery est détecté. Le middleware ne gère probablement que les sessions cookies, pas les hashes URL.*
  *Workaround Board : passer par Supabase Dashboard → Authentication → Users → `steissier@alyosingenierie.fr` → « Update user password » (manuel). Bypass complet du flow app.*

- **2026-05-18 · CTO Sophie · Fix à demander à Alex (P0 — bloquant pour onboarding utilisateurs réels).** [ACTION OUVERTE]
  *Spec du fix : sur la page `/` (landing) ET la page `/login`, détecter en JS client la présence d'un `#access_token=...&type=recovery&...` dans `window.location.hash`. Si détecté : appeler `supabase.auth.setSession({ access_token, refresh_token })` puis rediriger vers `/auth/update-password` (page à créer si elle n'existe pas) qui affiche un formulaire « définir nouveau mot de passe ». Test E2E à ajouter : `tests/e2e/auth/recovery.spec.ts` qui simule un click sur lien recovery → vérifie redirection vers `/auth/update-password` → soumet nouveau mot de passe → vérifie login fonctionne.*
  *À traiter en PR séparée ou en ajout à la PR auth ADR-011 (PR #7 actuellement en pause). Priorité P0 — sans ce fix, aucun utilisateur ne peut récupérer son mot de passe via le flow self-service.*

- **2026-05-18 · CMO Léa · Communication utilisateurs prévue.** [ACTION OUVERTE]
  *Si le bug est confirmé en prod, prévoir mention dans la newsletter interne AlyoS : « si vous ne pouvez pas récupérer votre mot de passe, contactez le Board pour réinit manuelle Supabase Dashboard en attendant le fix v1.x ». À enlever dès que PR fix mergée.*

---

*Dernière mise à jour : 2026-05-18 par [CTO Sophie] — INC-2026-05-18-02 routing recovery tracé, workaround Board documenté, fix P0 demandé à Alex.*

---

## 2026-05-18 — Batch n°13 — Erreur CTO rattrapée par Alex (intégrité spec audit)

- **2026-05-18 · DEV Alex · Blocage spec audit signalé avant push — réflexe correct.** [VICTOIRE WORKFLOW]
  *La CTO (Sophie) avait demandé à Alex de « câbler A1 tender_sourced » sur l'INSERT du connecteur BOAMP (RESPONSE PR #16, décision 3). Alex a fait une lecture croisée `specs/audit_log_v1.md` + `src/lib/audit/schemas.ts` et identifié 2 erreurs : (1) A1 dans la spec = `login`, pas `tender_sourced` ; (2) `tender_sourced` n'existe dans aucune des 13 actions A1-A13. La spec audit est figée CTO depuis 2026-05-10 (« toute modif action audit = PR validée CTO + bump version »). Alex a refusé de pousser sans arbitrage, et a proposé 3 hypothèses (H1 paraphrase A4 / H2 14e action non tracée / H3 confusion avec tender_events.event_type='sourced').*

- **2026-05-18 · CTO Sophie · Verdict : H3. Erreur CTO reconnue.** [DÉCISION CTO + CORRECTION]
  *Le sourcing automatique BOAMP n'est PAS une action auditable (pas d'acteur utilisateur = action système). Distinction actée : `audit_logs` = 13 actions sensibles attribuables à un user (login, tender_select, suppression, export RGPD…) ; `tender_events` = journal métier de l'AO (sourced, scored, selected…). Décision : (1) PAS de 14e action audit, spec reste figée à 13 ; (2) PAS de `audit()` câblé dans le connecteur ; (3) helper audit reste fondation structurelle (A4 + 12 placeholders), exercé end-to-end par la 1re action user future ; (4) à la place, émettre un row `tender_events event_type='sourced'` sur chaque nouvel insert (non-bloquant, optionnel PR #16). RESPONSE PR #16 décision 3 corrigée en conséquence.*

- **2026-05-18 · CTO Sophie · Leçon process.** [APPRENTISSAGE]
  *Une instruction CTO référençant une action audit doit TOUJOURS citer le nom exact de l'action (`login`, `tender_select`…) + son numéro vérifié dans `audit_log_v1.md`, jamais un concept paraphrasé. Le workflow DEV TEAM a fonctionné : le dev a protégé l'intégrité de la spec contre une erreur d'orchestration. C'est une victoire du process « un agent qui doute le dit », pas un échec.*

---

*Dernière mise à jour : 2026-05-18 par [CTO Sophie] — Erreur CTO sur action audit rattrapée par Alex (H3 retenu), spec audit préservée, RESPONSE PR #16 corrigée.*

---

## 2026-05-18 — Batch n°14 — Merges finaux : PR #7, #14, #16 + clôture PR #15

- **2026-05-18 · BOARD · PR #7 `feat(auth): pivot email+password durable + ajustements Board Q1-Q4` mergée.** [BOARD-OK]
  *18 tasks. Implémente ADR-011 (auth password durable + flow recovery par régénération de mot de passe provisoire Resend). Mergée 2026-05-18. `main` a désormais l'auth complète email+password + le flow recovery durable.*

- **2026-05-18 · DEV Alex · PR #15 `fix(auth): routing recovery password` FERMÉE sans merge — superédée par ADR-011 / PR #7.** [DÉCISION DEV — justifiée]
  *Alex a ouvert PR #15 comme hotfix rapide (lecture `window.location.hash` + page `/auth/update-password` dédiée + setSession client). Puis a réalisé que cette approche est INCOMPATIBLE avec ADR-011 (déjà actée Cowork 2026-05-15, implémentée PR #7). ADR-011 abandonne le fragment URL au profit d'une régénération de mot de passe provisoire (pattern invitation admin + Resend variant=reset), précisément parce que le scanner email AlyoS consomme les tokens recovery Supabase. Alex a fermé PR #15 avec un commentaire détaillé expliquant l'incompatibilité. Bonne décision — la solution ADR-011 est la durable. INC-2026-05-18-02 résolu via PR #7 (pas via PR #15).*

- **2026-05-18 · BOARD · PR #16 `feat(sourcing): connecteur BOAMP API + normalize + insert + audit helper + seed ai_prompts` mergée.** [BOARD-OK]
  *7 étapes + 3 follow-ups CTO (re-source conservatrice, audit non-throw, H3 tender_events au lieu d'audit). CI verte. Mergée 2026-05-18. `main` a désormais le 1er connecteur sourcing opérationnel (BOAMP API Opendatasoft).*

- **2026-05-18 · CTO Sophie · INC-2026-05-18-02 (routing recovery) — RÉSOLU via ADR-011 / PR #7.** [INCIDENT CLOS]
  *Le flow recovery durable est en prod : « Mot de passe oublié » → régénération mot de passe provisoire 24h → envoi Resend → login avec provisoire → force-change first-login. À re-tester par le Board pour confirmation finale. Note : le workaround SQL Editor reste documenté pour les cas d'urgence admin.*

- **2026-05-18 · CEO Marc · État `main` après les merges du jour.** [JALON]
  *`main` contient : schema Drizzle v1 (22+ tables) + RLS 20 policies + seed 200 AO BOAMP + connecteur BOAMP opérationnel + auth email+password durable + flow recovery ADR-011 + design ADR-011/012 + container Fly.io EU. 0 PR ouverte. Module sourcing engine : couche données + 1er connecteur faits. Prochaine étape : PR #3 scoring V1 + cron Vercel (brief en cours de rédaction Cowork).*

---

*Dernière mise à jour : 2026-05-18 par [CEO Marc] — Merges PR #7/#14/#16, clôture PR #15 (superédée ADR-011), INC recovery résolu, jalon main documenté.*

---

## 2026-05-20 — PR #3 scoring V1 + cron Vercel *(branche `feat/sourcing-scoring-cron`)*

- **2026-05-20 · G6 · Board + Alex · Scoring V1 = règles pures (sans IA Haiku), barème spec §3.6 intact.** [BOARD-OK 2026-05-20]
  *Barème additif : base 50 + 20 (exact match `keywords.exact`) + 10 par positif matché (cumulable) + 15 (CPV exact, pas préfixe) → clamp [0, 100]. Choix V1 = règles seules, déterministes, explicables. Le scoring complémentaire Haiku 4.5 décrit en spec §3.6 (`score_final = (rules + ai) / 2`) est reporté à une PR dédiée (dépend des prompts versionnés `ai_prompt_versions` + branche audit `ai_run`).*

- **2026-05-20 · G6 · Board + Alex · Pas de seuil d'insertion sur le score en PR #3 (insert exhaustif).** [BOARD-OK 2026-05-20]
  *Tout AO qui passe `filter.matchesProfile` est inséré, peu importe le score (un AO base 50 sans bonus reste inséré). Traçabilité totale en BDD. Seuil de notification user (≥ 60 envisagé) sera traité dans la PR push notifications Realtime — il s'agit d'un filtre UI/notif, pas d'un filtre persistance.*

- **2026-05-20 · G6 · Board + Alex · Cron Vercel = `30 4 * * 1-5` UTC = 6h30 Europe/Paris (CEST été) / 5h30 (CET hiver).** [BOARD-OK 2026-05-20] [REVU 2026-05-20 → cf. entrée suivante]
  *Vercel cron tourne en UTC. Choix d'aligner sur l'heure d'été (mai-octobre) car période active courante (2026-05-20). En hiver, le cron tournera à 5h30 Paris — toujours avant l'arrivée de l'équipe. À ré-ajuster si l'usage glisse vers un besoin temps réel (cf. backlog Phase 2 : cron multiples par profil selon `search_profiles.cron_time`).*

- **2026-05-20 · G6 · Alex · Dédup intra-batch + hash composite SHA-256 sur `(buyer_norm | title_norm[:100] | deadline_jour_UTC)`.** [TECHNIQUE]
  *Implémente spec §3.4. Politique : première occurrence rencontrée gagne (stable, ordre préservé). Cross-plateforme effectif quand PR scrapers PLACE/FM/MP livreront leur batch en parallèle. En PR #3 (BOAMP seul) la dédup retire les doublons internes BOAMP (cas rare mais possible).*

- **2026-05-20 · G6 · Alex · Périmètre PR #3 *(rappel hors scope)*.**
  *Inclus : BOAMP (API ouverte) + normalize + dedup + filter §3.5 + scoring V1 §3.6 + insert idempotent + cron `30 4 * * 1-5` UTC + `CRON_SECRET` Bearer auth + route `POST /api/cron/sourcing-run`. **Exclus** (PRs futures) : connecteurs PLACE/Francmarchés/MP.info via container Fly.io, scoring IA Haiku, push notifications Realtime, branche audit log `cron_run` (l'enum `audit_action` ne contient pas encore cette valeur — trace métier via `console.log` structuré Vercel logs en V1).*

- **2026-05-20 · G6 · Alex · Tests PR #3 : 61 tests Vitest (filter 15 / dedup 17 / scoring 14 / orchestrator 8 / route 7).** [LIVRABLE]
  *Total suite globale : 396/396 verts. TS strict OK, ESLint OK, `next build` env-clean OK (route `/api/cron/sourcing-run` reconnue dynamique). Aucun test E2E Playwright en PR #3 — le scénario S1.1 de `plan_recette_gate7_v1.md` (cron sourcing → 7 AO retenus) restera à câbler quand l'env Supabase test sera disponible (Gate 7).*

---

*Dernière mise à jour : 2026-05-20 par [Alex via Claude Code] — PR #3 scoring V1 + cron Vercel livrée sur branche `feat/sourcing-scoring-cron` (61 tests verts, 396/396 suite globale).*

---

## 2026-05-20 — PR #3 hotfix — Cron Vercel : 405 → GET handler + révision schedule

- **2026-05-20 · G6 · Board + Alex · Fix bug 405 Method Not Allowed sur ticks Vercel cron.** [BOARD-OK 2026-05-20]
  *Observation logs Vercel après premier preview deploy : `GET 405 /api/cron/sourcing-run` à chaque tick. Cause : Vercel Cron Jobs déclenchent **exclusivement en GET** (doc officielle Vercel), or la route ne déclarait que `POST`. Fix : factorisation logique métier dans `handleCronRequest()` + double export `GET` (Vercel cron, chemin prod) et `POST` (curl/ops/tests, déclenchement manuel) avec parité comportementale stricte. Nouveau bloc de tests anti-régression « exports HTTP » qui assert `typeof GET === 'function'` et `typeof POST === 'function'` — si l'un disparaît, Next.js renvoie 405 → tests échouent à la régression.*

- **2026-05-20 · G6 · Board · Cron Vercel révisé = `30 6 * * 1-5` UTC = 8h30 Europe/Paris (CEST été) / 7h30 (CET hiver).** [BOARD-OK 2026-05-20] [SURCLASSE entrée précédente `30 4`]
  *Décision Board en clarification de la PR #3. Vercel cron tourne en UTC : `30 6` UTC produit 8h30 Paris en été (mai-octobre) et 7h30 en hiver. Trade-off accepté : les AO BOAMP arrivent quand l'équipe est en place (vs. 6h30 avec `30 4` UTC) — meilleure visibilité immédiate pour Sandrine qui consulte « AO du jour » dès son arrivée bureau.*

- **2026-05-20 · G6 · Alex · Tests PR #3 hotfix : 400/400 verts, +4 tests (2 anti-régression exports HTTP + 2 parité POST).** [LIVRABLE]
  *TS strict OK, ESLint OK. Aucune régression sur les 396 tests précédents.*

---

*Dernière mise à jour : 2026-05-20 par [Alex via Claude Code] — Hotfix cron Vercel (GET handler + schedule `30 6` UTC) sur branche `feat/sourcing-scoring-cron`.*

---

## 2026-05-20 — PR `fix/cron-schedule-paris` — Retour cron à 6h30 Paris (`30 4` UTC)

- **2026-05-20 · G6 · Board · Cron Vercel = `30 4 * * 1-5` UTC = 6h30 Europe/Paris (CEST été) / 5h30 (CET hiver).** [BOARD-OK 2026-05-20] [SURCLASSE l'entrée hotfix précédente `30 6`]
  *Décision Board en révision de l'hotfix `30 6` mergé via PR #18 (commit `f0e06c5`). Cible métier confirmée : **6h30 heure de Paris**, pas 8h30. **Note technique fuseau (importante pour toute évolution future du schedule)** : Vercel cron tourne en UTC fixe et **ne gère pas le DST** (Daylight Saving Time). L'offset UTC est figé une fois posé. Conséquence : `30 4` UTC = 6h30 Paris en été (CEST = UTC+2) / 5h30 Paris en hiver (CET = UTC+1). Pas de bascule automatique. Trade-off accepté : l'heure d'hiver dérive de 1 h plus tôt, **toujours avant l'arrivée équipe** (9h) — l'AO du jour reste prêt à consultation pour Sandrine. Si l'usage glisse vers un besoin d'horaire strictement constant côté Paris, voir backlog Phase 2 : passer à un cron Supabase pg_cron (qui supporte les fuseaux) ou ajouter un offset DST dans `search_profiles.cron_time` exploité par un dispatcher d'orchestration interne.*

- **2026-05-20 · G6 · Alex · One-liner `vercel.json` `30 6` → `30 4` + cohérence JSDoc `route.ts` + nouvelle entrée DECISIONS.md.** [LIVRABLE]
  *Aucun changement de logique métier (le handler GET / POST + auth Bearer reste identique). Tests inchangés, 400/400 verts. Branche dédiée `fix/cron-schedule-paris` depuis `main` post-merge PR #18, ouvre une PR mince vers `main`.*

---

*Dernière mise à jour : 2026-05-20 par [Alex via Claude Code] — Retour cron `30 4` UTC (= 6h30 Paris été) sur branche `fix/cron-schedule-paris` depuis `main`.*

---

## 2026-05-20 — Init BDD prod (Phase A : seed prod minimal + DEPLOY.md) *(branche `infra/init-prod-db`)*

- **2026-05-20 · G6 · Board (Steve) · OK pour franchir la limite CLAUDE.md « pas d'opé prod hors Gate 9 » sur le cas remédiation infra.** [BOARD-OK 2026-05-20] [EXCEPTION TRACÉE]
  *Justification : la BDD prod Supabase `edifio-sourcing-prod` est vide (0 table). Le cron Vercel `/api/cron/sourcing-run` crashe en prod à chaque tick depuis le merge PR #18 sur `relation "search_profiles" does not exist`. Les 4 migrations Drizzle (`0000_init.sql` → `0003_fk_supabase.sql`) ont été appliquées en local + CI mais jamais à la prod réelle. Arbitrage Board : on procède à l'init prod en deux phases (Phase A code, Phase B exécution), avec traçabilité maximale en BDD via le script `prod.ts` + en doc via `docs/DEPLOY.md` opposable. Décision Gate 9 « pas d'opé prod » réaffirmée pour le futur — cette exception est ponctuelle, motivée par la criticité (cron prod KO), et bornée à la remédiation infra (pas de changement métier).*

- **2026-05-20 · G6 · Board (Steve) · Périmètre seed prod minimal validé (« 1 ok 2 ok 3 ok »).** [BOARD-OK 2026-05-20]
  *5 tables seedées : (1) `organizations` 1 ligne AlyoS Ingénierie UUID stable `11111111-1111-1111-1111-111111111111`, subscription_tier='studio' ; (2) `platforms` 4 lignes boamp/place/francmarches/mp_info (UUIDs identiques au seed dev pour cohérence pgTAP future) ; (3) `architect_specialties` 7 lignes (table de référence) ; (4) `ai_prompts` 12 lignes via import direct du catalogue figé `AI_PROMPTS_V1_CATALOG` (P1-P12, pas de duplication) ; (5) `search_profiles` 1 ligne AlyoS active (`Profil AlyoS BTP - sourcing principal`, CPV 45+71, geo 33/40/47/64/33000, cron 06h30 L-V). Tables explicitement NON touchées : `auth.users` (managed Supabase), `users` + `memberships` (peuplés au 1er login admin), `tenders` + `tender_events` (viendront du cron BOAMP réel), `architects` (user-driven), `ai_runs` / `brevo_messages` / `audit_logs` (peuplés à l'usage). Pas de fixture, pas de donnée métier inventée.*

- **2026-05-20 · G6 · Board (Steve) · Découpe Phase A code / Phase B exécution validée.** [BOARD-OK 2026-05-20]
  *Phase A (Alex, branche `infra/init-prod-db`) : 100 % code, aucune action sur la prod réelle. Livrables : `src/db/seed/prod.ts` + `src/db/seed/prod.test.ts` (mock Drizzle, double garde testée, tables interdites assertées par exclusion) + `docs/DEPLOY.md` (runbook opposable 9 étapes + revert + annexes) + script `package.json` `db:seed:prod` + cette entrée. Phase B (Yann, séparément) : exécution `pnpm db:migrate` + `pnpm db:seed:prod` contre l'URI prod Session Pooler (port 5432) fournie par Steve, suivant `docs/DEPLOY.md`. La séparation phase A/B est l'écho du protocole Gate-9 « jamais d'opé prod sans deux humains » dans une version dégradée acceptée (Board + Yann au lieu de CTO + opérateur).*

- **2026-05-20 · G6 · Alex · Double garde anti-régression du seed prod (defense in depth).** [TECHNIQUE]
  *Le script `prod.ts` refuse de tourner si : (a) `NODE_ENV !== "production"` sans flag `--allow-prod`, OU (b) `DATABASE_URL` contient `localhost` ou `127.0.0.1` sans flag `--allow-prod`. Le flag `--allow-prod` est documenté pour les dry-runs locaux manuels d'Alex contre un sandbox prod, mais reste interdit en CI et en automate (cf. `docs/DEPLOY.md`). Cette double garde est testée Vitest dans `prod.test.ts` (7 cas : 4 throw, 3 passe). Sans elle : risque qu'un dev pose accidentellement le seed prod sur sa BDD locale (l'org `1111-...` dupliquerait celle du seed dev = état incohérent) OU qu'un seed dev soit posé sur prod (peuple 2 orgs au lieu de 1, AlyoS + « Seed Test Org B »).*

- **2026-05-20 · G6 · Alex · Action ouverte : Phase B (exécution prod par Yann).** [ACTION OUVERTE]
  *Pré-requis Phase B : (1) Steve fournit l'URI Session Pooler prod à Yann via canal sécurisé Vault ; (2) merge PR Phase A sur `main` ; (3) Yann exécute la procédure pas-à-pas de `docs/DEPLOY.md` étapes 1 à 9, en signalant au Board chaque sanity check OK/KO ; (4) après seed, Yann crée le 1er admin AlyoS via Supabase Dashboard (Étape 7 Option A) ; (5) Yann déclenche le cron manuellement via curl `GET /api/cron/sourcing-run` Bearer `CRON_SECRET` pour valider que `200 OK` remplace l'erreur précédente `500 relation "search_profiles" does not exist`. Toute friction signalée immédiatement au Board, pas de retry silencieux.*

- **2026-05-20 · G6 · Alex · Livrables Phase A.** [LIVRABLE]
  *Fichiers créés : `src/db/seed/prod.ts` (script seed minimal idempotent + double garde) ; `src/db/seed/prod.test.ts` (mock Drizzle, 3 blocs critiques : double garde, tables présentes, tables interdites exclues) ; `docs/DEPLOY.md` (runbook 9 sections + revert + 5 annexes). Fichiers modifiés : `package.json` (ajout script `db:seed:prod`). Test suite globale : suite complète Vitest verte, aucune régression. TS strict + ESLint OK.*

---

*Dernière mise à jour : 2026-05-20 par [Alex via Claude Code] — Phase A init BDD prod livrée sur branche `infra/init-prod-db` (seed prod minimal + DEPLOY.md opposable).*

---

## 2026-05-21 — Cleanup post-merge : régression spec audit + clôture handoff stash obsolète *(branche `chore/cleanup-cto-validation-and-stash-archive`)*

- **2026-05-21 · G6 · Alex · Régression `specs/audit_log_v1.md:60` détectée et restaurée.** [POST-MORTEM MINEUR]
  *Audit de l'action ouverte ANSWER_260520_1810 (« nettoyer 2 mentions validation CTO ») a révélé que la mise à jour faite par le commit `ba97352` (2026-05-20 18:05) avait été partiellement écrasée par le commit suivant `8b18b9a` (2026-05-20 21:21, titre « docs: sync cowork decisions batch 14 + brief pr3 scoring cron »). 3 lignes regressées dans `audit_log_v1.md` : (a) l'extension de l'enum `operation` à 4 valeurs (`regenerate_provisional` retiré), (b) le paragraphe d'amendement daté 2026-05-20 (supprimé), (c) la mention « Validé CTO Sophie 2026-05-20 » avec le pointeur vers ANSWER (supprimée). Le JSDoc équivalent dans `src/db/types/jsonb.ts:236-243` est resté correct (non impacté par 8b18b9a). Le code applicatif est aligné depuis ba97352 — la régression est purement documentaire mais désaligne la spec figée vs l'implémentation, ce qui contredit l'invariant Gate 5 « spec = source de vérité immuable ». Cause racine probable : conflit de merge silencieux lors du sync Cowork, fichier édité depuis une base pré-ba97352.*

- **2026-05-21 · G6 · Alex · Restauration des 3 lignes spec à l'identique du contenu post-ba97352.** [LIVRABLE]
  *`specs/audit_log_v1.md` ligne 60 → enum étendu (`invite | update | revoke | regenerate_provisional`) + paragraphe amendement avec « Validé CTO Sophie 2026-05-20 » + pointeur `handoff/ANSWER_260520_1810_ETENDRE_A2_OPERATION_REGEN.md`. Aucun changement de code applicatif, aucune migration. Test suite globale Vitest inchangée (la spec n'est pas exécutée).*

- **2026-05-21 · G6 · Alex · Clôture handoff `REQUEST_260519_2030_STASH_COWORK_DECISIONS_SCHEMA.md` (obsolète).** [HANDOFF CLOS]
  *Le handoff demandait à Cowork d'arbitrer un stash isolé sur la branche `feat/sourcing-mvp` (DECISIONS.md condensé Cowork + retrait `AS RESTRICTIVE` involontaire sur policy `insert_by_member`). La branche `feat/sourcing-mvp` a été mergée puis supprimée local + origin entre-temps. Les fixes RLS it2 (`AS RESTRICTIVE` sur `insert_by_member`) sont en vigueur sur `main` depuis PR #14 (cf. `src/db/migrations/0002_rls.sql`). Le contenu condensé du stash n'a pas été récupéré et ne le sera pas — la trace détaillée des post-mortems CI Postgres reste préservée sur `main`. Footer de clôture ajouté au fichier handoff en place (pas de move vers `archive/` pour préserver les liens DECISIONS.md). Pas d'action Cowork attendue.*

- **2026-05-21 · G6 · Alex · Apprentissage process : détection conflits silencieux sync Cowork.** [APPRENTISSAGE]
  *Quand un commit `docs: sync cowork decisions ...` touche un fichier figé spec, audit systématique du diff doc vs implémentation avant push pour s'assurer qu'aucune entrée applicative actée (ex. ADR, ANSWER handoff) n'a été écrasée. À intégrer en checklist review PR Cowork-driven.*

---

*Dernière mise à jour : 2026-05-21 par [Alex via Claude Code] — Restauration spec audit_log_v1.md + clôture handoff stash obsolète sur branche `chore/cleanup-cto-validation-and-stash-archive`.*

---

## 2026-05-21 — PR n°4 : page liste AO du jour V1 read-only *(branche `feat/sourcing-ao-du-jour-list`)*

- **2026-05-21 · G6 · Alex · Mono-tenancy V1 via constante centralisée `ALYOS_ORG_ID`.** [DÉCISION TECHNIQUE]
  *Création de `src/lib/constants/organization.ts` exportant `ALYOS_ORG_ID = "11111111-1111-1111-1111-111111111111"` + `ALYOS_ORG_NAME = "AlyoS Ingenierie"` — source de vérité unique partagée par les 2 seeds (`src/db/seed/index.ts`, `src/db/seed/prod.ts`) et l'app (`src/app/sourcing/ao-du-jour/page.tsx`). Refactor DRY zero-impact-sémantique : les seeds conservent leurs exports nommés `ORG_A_ID` / `ORG_A_NAME` (re-export depuis la constante) pour ne pas casser les tests qui les référencent (`src/lib/audit/index.test.ts:51`, `src/db/seed/prod.test.ts:87`). Justification : la table `memberships` n'est PAS peuplée par l'admin API actuelle (`src/app/api/admin/users/route.ts` ne crée que `auth.users` + metadata), donc impossible de dériver l'org via lookup en V1. JSDoc explicite documente le passage Phase 2 multi-tenant (remplacer par `getCurrentOrgId(userId)` avec lookup `memberships` + peupler `public.users` au 1er login via hook auth).*

- **2026-05-21 · G6 · Alex · Page `/sourcing/ao-du-jour` V1 strictement read-only — pas de stubs d'actions.** [DÉCISION UX]
  *Pas de boutons « Sélectionner » / « Différer » / « Rejeter » sur la `TenderCard` V1. JSDoc explicite sur le composant pointe vers la PR n°5. Justification : honnêteté UX > stubs morts qui ne font rien au clic ; l'audit log A4 `tender_select` exige un payload typé non trivial (cf. `specs/audit_log_v1.md`) qu'on ne câble pas à la sauvette ; la transition `tenders.status` impose la modal Solo/Tandem (Maquette 3) packagée naturellement avec la PR n°5. Le menu utilisateur reste sobre — info essentielle (titre, acheteur, montant, deadline, CPV, plateforme, score) sans bruit décisionnel.*

- **2026-05-21 · G6 · Alex · Filtre tenant explicite dans la SQL (defense applicative) + RLS defense-in-depth.** [SÉCURITÉ]
  *`getTendersOfTheDay(organizationId, db)` et `getActiveSearchProfileName(organizationId, db)` posent un `WHERE organization_id = $1` explicite. Justification : le client Drizzle (`src/db/client.ts`) ouvre la connexion avec le rôle Postgres `postgres` via `DATABASE_URL` direct (pas via JWT Supabase) — les policies RLS non-FORCE sont implicitement bypassées par ce rôle. Le filtre applicatif est donc la ligne de défense PRIMAIRE en V1. La RLS reste en defense-in-depth (couverture pgTAP cross-tenant via `tests/rls/`). Tri `score DESC NULLS LAST, created_at DESC` aligné sur l'index partiel `idx_tenders_score (organization_id, score DESC) WHERE status='sourced'` posé migration 0001. `LIMIT 50` (volume cible MVP AlyoS ~5-30 AO/jour, marge confortable).*

- **2026-05-21 · G6 · Alex · Livrables PR n°4.** [LIVRABLE]
  *Fichiers créés : `src/lib/constants/organization.ts` ; `src/lib/sourcing/queries.ts` + `.test.ts` (5 tests Vitest) ; `src/app/sourcing/ao-du-jour/{page.tsx,TenderCard.tsx,EmptyState.tsx,format.ts}` ; `e2e/ao-du-jour.spec.ts` (2 scénarios) ; `notes-de-suivi/CC_260521_AO_DU_JOUR_V1.md`. Fichiers modifiés : `src/db/seed/index.ts` + `src/db/seed/prod.ts` (refactor import + re-export DRY). TS strict respecté (0 `any`, 0 `// @ts-ignore`). Aucune migration BDD, aucune nouvelle dépendance npm. `next build` env-clean préservé (lazy db Proxy). Prochaine PR identifiée : PR n°5 actions Sélectionner / Différer / Rejeter avec modal Solo/Tandem + audit log A4.*

- **2026-05-21 · G6 · Alex · Post-mortem échec `ci-e2e` 1er push PR #22 (`3391fbd`) : 4 tests rouges sur page Server Component sans `DATABASE_URL` provisionné.** [POST-MORTEM]
  *1er push de la PR : 8 checks verts, `ci-e2e` fail après 3 min 50 s avec 4 tests rouges. (1) `e2e/ao-du-jour.spec.ts:39` `expect(<h1>).toBeVisible()` → element not found ; (2-4) `e2e/auth-password.spec.ts:65,91,137` (scénarios S1/S2/S4) `page.waitForURL(/sourcing\/ao-du-jour/)` timeout 10 s. Cause racine : le workflow `.github/workflows/ci.yml` job `ci-e2e` **ne fournit pas `DATABASE_URL`** au webServer Playwright (choix d'architecture assumé — l'env E2E couvre middleware + auth + Resend, pas le métier BDD). La nouvelle page `/sourcing/ao-du-jour` lit la BDD via Drizzle au runtime (Server Component) → le Proxy lazy `db` exposé par `src/db/client.ts` throw `Error: DATABASE_URL is not set` au premier `.select()` (stack confirmée `…/page.js:1:7865` → `…/chunks/616.js:1:12407` qui est le `Proxy.get` du client Drizzle) → la page plante en 500 brutal → le `<h1>` n'est jamais rendu → mon test échoue, et S1/S2/S4 timeout sur `waitForURL` car le `load` event ne se déclenche pas correctement sur la page d'erreur. Diagnostic effectué via `gh run view 26216870037 --log-failed --job 77141401986` puis grep sur les patterns d'erreur Playwright.*

- **2026-05-21 · G6 · Alex · Décision : résilience runtime page-level (try/catch absorbé + ErrorBanner), pas provision BDD en CI.** [DÉCISION TECHNIQUE]
  *4 options évaluées. **A** — Provisionner `DATABASE_URL` dans le job ci-e2e (service Postgres + migrations + seed) → rejeté : projet infra à part entière, hors scope d'un hotfix CI. **B** — Page résiliente : try/catch absorbé autour du fetch BDD + composant `<ErrorBanner />` dédié → **retenu**. **C** — Détection env (`if !DATABASE_URL → []`) dans la page → rejeté : code smell, une page ne doit pas connaître l'env. **D** — Mock BDD via Playwright `route.fulfill()` interception → rejeté : lourd et fragile. Justification du choix B : (1) le bug révèle une vraie vulnérabilité runtime — si Supabase plante 30 s en prod, la page d'atterrissage post-login ne doit pas crasher en 500 brutal ; (2) précédent identique dans le projet — `src/lib/audit/index.ts` adopte déjà le pattern try/catch absorbé pour la même raison (cf. JSDoc `src/db/client.ts:15` *« Le catch-no-throw du helper `insertAuditLog` absorbe alors gracieusement l'absence de DB en CI e2e »*) ; (3) fix minimal — 1 try/catch dans `page.tsx`, 1 nouveau composant `<ErrorBanner />`, +1 cas de test `queries.test.ts`, +1 assertion E2E. Note Phase B (à arbitrer plus tard) : l'option A reste valable pour le long terme — provisionner une vraie BDD test en CI permettrait de couvrir les chemins métier BDD côté E2E. Reporté post-MVP, à challenger quand 3+ pages Server Component liront la BDD en lecture.*

- **2026-05-21 · G6 · Alex · Livrables hotfix PR #22 (push `8c163e8` vs `3391fbd` initial) — CI 9/9 verts.** [LIVRABLE]
  *Fichiers modifiés : `src/app/sourcing/ao-du-jour/page.tsx` (try/catch absorbé autour des 2 fetches + JSDoc bloc a/b/c expliquant *pourquoi* le pattern, *comportement attendu* en cas d'erreur, *observabilité* future via Sentry + 3 branches JSX : `fetchError` → `<ErrorBanner />`, sinon-si 0 tenders → `<EmptyState />`, sinon liste) ; `e2e/ao-du-jour.spec.ts` (JSDoc en-tête formalisant le contrat de résilience + 2e assertion couvrant `alert | status | article` pour accepter les 3 états valides) ; `src/lib/sourcing/queries.test.ts` (+1 cas verrouillant la **propagation** de l'erreur côté helper — pas de try/catch interne au helper, c'est la page qui décide de la stratégie d'absorption). Fichier créé : `src/app/sourcing/ao-du-jour/ErrorBanner.tsx` (Server Component, `role="alert"` distinct du `role="status"` de l'`EmptyState`, palette rouge, message debug en `font-mono` **uniquement hors prod** pour ne pas leak des détails infra côté users Vercel prod). Validations finales : Vitest 420/420 verts (+1 vs baseline 419), `tsc` 0 erreur, lint 0 warning, **CI 9/9 verts** (ci-e2e passé en 1 min 37 s vs 3 min 50 s rouge initial). Incident process : pre-commit Prettier a échoué sur les 2 fichiers nouvellement créés (`ErrorBanner.tsx` + ajout dans `queries.test.ts`), résolu par `prettier --write` + restage + **nouveau commit** (pas `--amend`, conformément au protocole CLAUDE.md).*

- **2026-05-21 · G6 · Alex · Apprentissage process : pattern « résilience runtime page-level » validé sur la stack edifio Sourcing + extension memory pré-push.** [APPRENTISSAGE]
  *Pattern validé : toute page Server Component qui consomme la BDD doit wrap ses fetches dans un try/catch absorbé + composant d'erreur dédié (`role="alert"` pour distinguer du `role="status"` de l'`EmptyState`). À répliquer sur les futures pages applicatives (fiche AO détail, dashboard sourcing, écran admin users, etc.) — voir si on factorise en helper générique (ex. `safeFetch<T>(fn, fallback)` wrapper) si le pattern se répète sur 3+ pages. Extension memory locale : `feedback_nextjs_build_env_clean.md` couvrait le **build** env-clean (top-level imports) mais PAS le **runtime** env-clean (page rendue Server Component en exécution avec BDD indisponible). Sujet d'extension future de la checklist locale pré-push : ajouter un `pnpm test:e2e` rapide (ou au moins un `next start` avec `DATABASE_URL` unset suivi d'un `curl http://localhost:3000/sourcing/ao-du-jour`) pour reproduire ce type de crash en local avant push.*

---

*Dernière mise à jour : 2026-05-21 par [Alex via Claude Code] — Hotfix CI E2E PR #22 livré (push `8c163e8`, 9/9 verts) : résilience runtime page-level via try/catch absorbé + `<ErrorBanner />` sur `/sourcing/ao-du-jour`.*
