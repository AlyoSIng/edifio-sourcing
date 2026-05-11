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

## 2026-05-11 — Gate 6 (MVP fonctionnel) — démarrage

- **2026-05-11 · G6 · CEO Marc · Plan Gate 6 démarrage validé.** [BOARD-OK 2026-05-11]
  *Plan 7 étapes posé par [DEV Alex] et validé par le Board : (1) bootstrap Next.js, (2) middleware `@alyosingenierie.fr`, (3) Supabase Auth magic-link, (4) CI GitHub Actions + Vercel preview deploys, (5) spike ORM Drizzle vs Prisma (2 branches sœurs, même périmètre), (6) ADR-0001 choix ORM, (7) première migration métier. Garde-fous fermes : aucune migration committée avant étape 6, aucune route protégée exposée avant étape 2 mergée, middleware actif sur 100 % des routes protégées en CI (bloquant). Branches : `main` + `feat/<step>` par étape, PR + Vercel preview obligatoire par PR. Conventional Commits obligatoires.*

- **2026-05-11 · G6 · CEO Marc · 2 projets Supabase distincts dès J0.** [BOARD-OK 2026-05-11] [SURCLASSE ARBITRAGE 3 OUVERT]
  *`edifio-sourcing-preview` (utilisé par Vercel previews + dev local) et `edifio-sourcing-prod` (utilisé uniquement après Gate 9). Région Frankfurt `eu-central-1`. Compte AlyoS Ingénierie en plan Pro (place pour les 2 projets). **Aucun partage de clés entre les deux.** Service role key serveur-only, jamais exposée au bundle client. Création de `-preview` à l'étape 3 par [CEO Marc] depuis le dashboard Supabase.*

- **2026-05-11 · G6 · DEV Alex · pnpm activé via Corepack en shim utilisateur.** [DÉCISION DEV]
  *`corepack enable` standard a échoué (EPERM sur `C:\Program Files\nodejs`) — contournement : shim utilisateur dans `$env:LOCALAPPDATA\pnpm-shims` via `corepack enable --install-directory ...`. Aucune installation système, conforme limite stricte CLAUDE.md « pas d'installation logicielle système ». pnpm 11.0.9 actif. Le shim doit être préfixé au `$env:Path` dans chaque session PowerShell (l'état shell ne persiste pas entre invocations de l'agent) — à documenter pour Yann/manuel.*

- **2026-05-11 · G6 · DEV Alex · Étape 1 : bootstrap Next.js 14 + TS strict + Tailwind 3 + ESLint + Prettier + commitlint + husky + fontsource.** [DÉCISION DEV]
  *Stack figée : Next 14.2.35, React 18.3.1, TypeScript 5.9 (`strict` + `noUncheckedIndexedAccess` + `noImplicitOverride` + `noFallthroughCasesInSwitch`), Tailwind 3.4 (pas v4 — stabilité 2026, breaking change non justifié au MVP), ESLint 8 avec `next/core-web-vitals` + `next/typescript`. Fontsource self-host (Inter / Space Grotesk / JetBrains Mono) conforme arbitrage Gate 5 (pas d'appel `fonts.googleapis.com`). Hook husky `commit-msg` valide Conventional Commits, hook `pre-commit` lance `prettier --check` + `next lint`. pnpm 11 nécessite `allowBuilds: unrs-resolver: true` dans `pnpm-workspace.yaml` pour autoriser le postinstall (`napi-postinstall`) — sinon install échoue par sécurité (pnpm 11 bloque les scripts inconnus par défaut).*

- **2026-05-11 · G6 · CEO Marc · Allowlist autonomie posée dans `.claude/settings.local.json`.** [BOARD-OK 2026-05-11]
  *Sur demande Board : allowlist large posée pour les opérations Gate 6 — git (sauf push origin main), pnpm/npx/corepack, supabase, vercel (sauf `--prod`), gh (sauf delete). Deny strict sur `git push origin main` (toute mise à jour de main passe par PR mergée), `vercel --prod` / `vercel deploy --prod` (escalade Board obligatoire), `supabase projects delete`, `gh repo delete`, `git reset --hard`, `rm -rf /*`. Edit/Write scopés à `C:\Dev\edifio-sourcing\**`.*

---

## Arbitrages ouverts à ce stade

1. **ORM Drizzle vs Prisma** — reporté Gate 5, à statuer début Gate 6 par CTO Sophie sur base spike [DEV Alex] (étapes 5 et 6 du plan).
2. **URL d'accès edifio Sourcing** — Vercel preview `edifio-sourcing.vercel.app` au démarrage ; custom domain `sourcing.alyosingenierie.fr` ou `app.alyosingenierie.fr/sourcing` à arbitrer en Gate 7.
3. ~~**Projet Supabase** — instance partagée ou dédiée ?~~ **RÉSOLU 2026-05-11** : 2 projets distincts (`-preview` et `-prod`) sans partage de clés.

---

*Dernière mise à jour : 2026-05-11 par [DEV Alex] — Gate 6 étape 1 : bootstrap Next.js 14 + TS strict + Tailwind + outillage Conventional Commits.*
