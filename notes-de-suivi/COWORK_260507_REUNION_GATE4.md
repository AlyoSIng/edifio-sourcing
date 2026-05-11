# Note de suivi — Réunion Gate 4 « Revue marketing & copy »

**Date** : 2026-05-07
**Application** : edifio Sourcing
**Présents** : [CMO Léa Charpentier] (pilote), [GRAPHISTE Théo] (consultation), [CTO Sophie] (consultation), [CEO Marc], [BOARD TEISSIER]
**Rédacteur** : [CEO Marc]
**Statut** : Gate 4 validée par le Board

---

## 1. Décisions prises

| # | Décision | Pris par | Motif |
|---|----------|----------|-------|
| 1 | **Tu/Vous architecte rendu paramétrable** : ajout d'une colonne `tutoiement` (boolean) dans la table `architects`, modifiable depuis la fiche architecte et lors de chaque envoi via toggle dans la modale Brevo. La valeur retenue est sauvegardée pour les prochains envois. | [BOARD] (directive structurante) | Le Board pilote la qualité relationnelle architecte par architecte ; un ton imposé serait un mauvais signal. |
| 2 | **Défaut tutoiement = FALSE** (vouvoiement par défaut à la création / l'import). | [CMO] + [CEO] + [BOARD] | Prudence relationnelle. Le tutoiement se gagne par la connaissance de l'architecte. Évite le faux pas. |
| 3 | **8 templates Brevo livrés** au lieu de 4 : `architect_solicitation`, `architect_followup`, `dossier_diffusion` × 2 registres (TU + VOUS) + `tender_summary_to_user` (interne, neutre) + `architect_decline_acknowledgment` (court, neutre). | [CMO] + [BOARD] | Couverture complète des cas tu/vous + accusé de refus pour entretenir la relation longue durée. |
| 4 | **Variante VOUVOIEMENT de la maquette M4** (page tokenisée architecte) à livrer par [GRAPHISTE Théo] en clôture de Gate 4. | [GRAPHISTE] | Cohérence avec les 2 templates de sollicitation. |
| 5 | **Audit naming complet** finalisé : domaine `sourcing.edifio.fr`, sélecteur module « edifio Sourcing », signature footer « © AlyoS Ingénierie 2026 », signatures email « via edifio Sourcing ». | [CMO] + [BOARD] | Cohérence visuelle et juridique avec le DS Edifio (Gate 3). |
| 6 | **14 libellés de statut** validés en français naturel (Sourcé / Sélectionné Solo / Architecte sollicité / Architecte indisponible / Plus d'infos demandées / À revoir / etc.). Le code interne reste anglais. | [CMO] + [BOARD] | Lisibilité utilisateur sans casser la consistance code. « Indisponible » plus doux que « refusé ». |
| 7 | **Microcopy des 6 écrans** posée (titres, empty states, CTAs, confirmations, alertes). Empty state-clé : *« Pas d'AO ce matin. C'est rare, ça se fête. »* | [CMO] + [GRAPHISTE] + [BOARD] | Ton Léa : direct, chaleureux, pas de jargon. Aligné persona Patrick / Sandrine. |
| 8 | **Accroches commerciales tiering** validées : Sourcing 190 € *« Ne plus rater un AO »* / Cotraitance 390 € *« La cotraitance, sans le tableur »* / Studio IA 790 € *« Le dossier préparé par l'IA. Tu valides, tu signes, tu remets. »* | [CMO] + [CEO] + [BOARD] | Lisibilité immédiate + capture de la valeur métier par tier. |
| 9 | **Plan SEO on-page sourcing.edifio.fr** : Title, meta, H1, mots-clés longue traîne, OG image (Kanban M2), Schema.org SoftwareApplication × 3 Offer, robots interdits sur app. | [CMO] + [BOARD] | Page marketing publique référençable, app fermée aux crawlers. |

---

## 2. Désaccords / arbitrages remontés au Board

| # | Sujet | Position A | Position B | Position C | Arbitrage Board |
|---|-------|------------|------------|------------|-----------------|
| 1 | Défaut `tutoiement` à la création d'un architecte | FALSE / vouvoiement (CMO+CEO) | TRUE / tutoiement | Choix explicite à l'import | **A retenue** |

---

## 3. Actions à mener

| # | Action | Responsable | Échéance |
|---|--------|-------------|----------|
| 1 | Production document Gate 4 (PDF) | [CEO] | 2026-05-07 |
| 2 | Mise à jour `DECISIONS.md` (9 décisions Gate 4) | [CEO] | 2026-05-07 |
| 3 | Variante M4 vouvoiement (HTML) à intégrer dans `design/maquettes/` | [GRAPHISTE Théo] | Avant Gate 5 |
| 4 | Toggle tu/vous dans la maquette M3 (modale sollicitation Brevo) | [GRAPHISTE Théo] | Avant Gate 5 |
| 5 | Migration Postgres : ajout colonne `architects.tutoiement BOOLEAN NOT NULL DEFAULT FALSE` | [DEV Alex] côté Claude Code | Gate 5 / Gate 6 |
| 6 | Création des 8 templates Brevo (templateId distincts pour analytics propres) | [DEV Alex] + [CMO] | Gate 6 |
| 7 | Convocation Gate 5 (Architecture & stack) avec [CTO Sophie] pilote | [CEO] | Sur OK Board |
| 8 | Page marketing publique sourcing.edifio.fr (statique) — copy SEO posée | [CMO] + [DEV Alex] | Avant Gate 9 (go-live) |

---

## 4. Risques identifiés

- **Mauvais réglage tu/vous lors de premiers envois en masse** : un import CSV initial avec 50 architectes vouvoie tout le monde. Si le Board tutoie 30 d'entre eux dans la vraie vie, friction relationnelle. Mitigation : interface batch d'édition « passer en tutoiement » multi-sélection sur la base architectes (à intégrer Gate 6 dans l'epic E2 Configuration).
- **Templates Brevo à 8 entrées = maintenance ×2** sur les évolutions futures de copy. Mitigation : structurer les templates en blocs réutilisables (header, footer, body chunks) côté Brevo.
- **Risque légal sur « Architecte indisponible »** vs « refusé » : le terme « indisponible » peut prêter à confusion juridique en cas de litige cotraitance. Mitigation : traçabilité explicite dans `architect_responses.status` (code interne `declined`), libellé visible « indisponible » côté utilisateur uniquement.
- **Empty state humour « C'est rare, ça se fête »** : peut tomber à plat si le sourcing a un bug et qu'aucun AO ne remonte. Mitigation : message conditionnel selon présence/absence d'erreur de run (« Le run a échoué — voir les logs » dans le second cas).
- **SEO français BTP très concurrentiel** : Vecteur Plus, Doublet, Explore tiennent les positions. Mitigation : long-tail + content marketing post-MVP (blog edifio commun aux 4 produits).

---

## 5. Prochaine étape

- **Gate suivante** : Gate 5 — Architecture & stack technique
- **Pilote** : [CTO Sophie Vasseur]
- **Consultations** : [DEV Alex] (côté Claude Code, recevra la spec finale), [CEO Marc]
- **Date prévue** : à convoquer dès OK Board sur la suite
- **Charge attendue** : c'est la gate la plus dense de la chaîne — 5 arbitrages techniques ouverts (worker scraping, API PLACE, ORM, adaptateur Odoo, shadcn vs custom) + structuration monorepo + diagramme C4 + plan sécurité

---

*Note de suivi clôturée le 2026-05-07 par [CEO Marc].*
