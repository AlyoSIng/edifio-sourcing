# Note de suivi — Réunion Gate 2 « Spec fonctionnelle & parcours détaillés »

**Date** : 2026-05-07
**Application** : Sourcing-Edifio
**Présents** : [CTO Sophie] (pilote), [CEO Marc] (co-pilote), [CMO Léa] (consultation), [GRAPHISTE Théo] (consultation), [BOARD TEISSIER]
**Rédacteur** : [CEO Marc]
**Statut** : Gate 2 validée par le Board

---

## 1. Décisions prises

| # | Décision | Pris par | Motif |
|---|----------|----------|-------|
| 1 | Découpage en **10 epics** : Auth, Configuration, Sourcing, Notification & sélection, Mode Solo, Mode Tandem, Préparation dossier IA, Tableau de bord, Bibliothèque, Intégrations & administration. | [CTO] + [CEO] + [BOARD] | Granularité adaptée au cadrage MVP. Chaque epic a un livrable identifiable et testable. |
| 2 | **Format INVEST** retenu pour toutes les user stories. Échantillon de 30 stories produit en séance, complétion à charge de [DEV Alex] côté Claude Code. | [CTO] + [BOARD] | Convention universelle, lisible par DEV et compatible Linear/Asana si futur tracking. |
| 3 | **3 parcours utilisateurs détaillés** validés : Solo (Patrick mobile), Tandem accepté (Sandrine + architecte), Préparation dossier IA (Sandrine desktop). | [CTO] + [CEO] + [BOARD] | Couvre les chemins critiques que [DEV Alex] doit instrumenter en E2E Playwright. |
| 4 | **10 contraintes non fonctionnelles** consolidées (perf, sécu, RGPD, accessibilité, dispo, PWA, IA). Bloquantes selon les gates indiquées. | [CTO] + [BOARD] | Référentiel d'arbitrage pour les choix techniques Gate 5. |
| 5 | **Arbitrage 1/A** — Tokens architectes : 1 JWT actif par AO/architecte, expiration 30 jours, révocation manuelle admin. | [BOARD] | Sécurité prioritaire sans surcharge UX. |
| 6 | **Arbitrage 2/A** — « Plus d'infos » architecte : canal email simple en V1, rebouclé en notification Sourcing-Edifio. | [BOARD] | MVP simple, chat in-app reporté. |
| 7 | **Arbitrage 3/A** — Diffusion du dossier à l'architecte : autorisée pour les rôles `admin` ET `user`. | [BOARD] (surclasse reco CTO+CEO) | Souplesse opérationnelle privilégiée. **Compensation imposée** : audit log strict obligatoire (qui / quand / quel AO / vers quel architecte) + alerte admin push à chaque diffusion par un `user`. |
| 8 | **Arbitrage 4/A** — Stratégie IA : Sonnet 4.6 par défaut (RC, mémoire technique). Haiku 4.5 sur pré-classification AO (scoring complémentaire) et copy courts (sujets emails, accroches). | [BOARD] | Maîtrise des coûts (Haiku ×7 moins cher) sur tâches courtes sans perte qualité. |

---

## 2. Désaccords / arbitrages remontés au Board

| # | Sujet | Position A | Position B | Arbitrage Board |
|---|-------|------------|------------|-----------------|
| 1 | Politique tokens architectes | 1 token / AO / archi (CTO+CEO) | 1 token permanent / archi | **A retenue** |
| 2 | « Plus d'infos » | Email simple (CTO+CEO) | Chat in-app | **A retenue** |
| 3 | Rôle requis pour diffusion dossier | Admin OU user | Admin uniquement (CTO+CEO) | **A retenue (Board surclasse)** |
| 4 | Stratégie modèles IA | Sonnet+Haiku mix (CTO+CEO) | Tout Sonnet | **A retenue** |

---

## 3. Actions à mener

| # | Action | Responsable | Échéance |
|---|--------|-------------|----------|
| 1 | Production document Gate 2 (PDF) | [CEO] | 2026-05-07 |
| 2 | Mise à jour `DECISIONS.md` (8 décisions ci-dessus) | [CEO] | 2026-05-07 |
| 3 | Convocation Gate 3 (Design / maquettes) avec [GRAPHISTE Théo] pilote | [CEO] | Sur OK Board |
| 4 | Complétion exhaustive des user stories par epic (~6-12 stories par epic = ~80-120 stories cibles) | [DEV Alex] côté Claude Code | Avant Gate 6 |
| 5 | Spécification technique des prompts IA (RC + mémoire), versionnés en table `ai_prompts` | [CTO Sophie] + [DEV Alex] | Gate 5 |
| 6 | Spécification audit log : 12 événements sensibles à tracer | [CTO Sophie] | Gate 5 |
| 7 | Templates Brevo (4 templates : sollicitation, relance, diffusion, récap Solo) | [CMO Léa] | Avant Gate 4 |
| 8 | Mode Kanban « groupé » (3 super-colonnes) en alternative aux 10 colonnes | [GRAPHISTE Théo] | Gate 3 |

---

## 4. Risques identifiés

- **Volumétrie scraping** non garantie en production (Francmarchés / marches-publics.info peuvent rate-limiter ou modifier leur HTML). Mitigation : monitoring journalier + retry exponentiel + fallback API BOAMP comme filet.
- **Diffusion par rôle `user` (arbitrage 3/A)** : risque opérationnel d'envoi prématuré. Mitigation imposée par CTO : audit log strict + alerte push admin systématique + bouton « Annuler la diffusion » disponible 5 minutes après envoi.
- **Rejet de l'architecte par "Non" massif** : si le scoring matching est mal calibré, taux Tandem effondré. Mitigation : logs détaillés des `architect_responses.status='declined'` + recalibrage trimestriel.
- **Latence Claude API** sur analyse RC long (> 80 pages) : risque timeout Vercel Function (60s Pro). Mitigation : routage automatique vers Edge Function Supabase ou container externe (arbitrage Gate 5).
- **Provenance page/citation** sur extraction RC : si le modèle hallucine la page, faux sentiment de fiabilité. Mitigation : validation regex post-extraction + revue humaine obligatoire en Phase 1.

---

## 5. Prochaine étape

- **Gate suivante** : Gate 3 — Design / maquettes (haute-fidélité alignées charte Edifio + design tokens)
- **Pilote** : [GRAPHISTE Théo Renard]
- **Consultations** : [CMO Léa] (copy in-screen), [CTO Sophie] (faisabilité tech)
- **Date prévue** : à convoquer dès OK Board sur la suite

---

*Note de suivi clôturée le 2026-05-07 par [CEO Marc].*
