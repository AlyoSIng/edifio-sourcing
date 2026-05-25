# REQUEST — Clôture traçabilité nuit + déblocage commits + feu vert Lot #56/#57

**Émetteur** : CEO Marc + CTO Sophie + CMO Léa (Cowork)
**Destinataires** : Yann (`ps_operator`), Nadia (`dev_tandem`), Alex (`dev`), Camille (`qa`), Hugo (`reviewer`)
**Date** : 2026-05-25
**Origine** : décisions Board 2026-05-25 (chat Cowork) après relecture des notes de nuit.
**Zones** : Partie A = 🟢 (doc/traçabilité) · Partie B = 🔴 merge PR #43 (Board) puis 🟢 commits · Partie C = 🟢 (specs validées).

---

## Contexte

Le Board a relu, depuis Cowork, les notes de la nuit du 24→25 (Tandem étape 2 final 00:55,
bug `cabinet` 03:07, analyse import architectes 03:26, `NIGHT_RECAP`). Trois exécutions
prod ont eu lieu **sans note de clôture ni entrée `DECISIONS.md`** :

1. **Apply prod de la migration `architects.cabinet`** (résolution « Sourcing indisponible »).
2. **Import réel des architectes** (le Board indique **3440 importés** sur 3805 du fichier source).
3. **Mise en prod / merge du module Tandem** (étape 2).

Le `NIGHT_RECAP` a ses sections « À ta validation au réveil » et « Blocages » restées vides.
Trou de traçabilité à combler — principe non négociable « tout est tracé ».

---

## Partie A — Clôture de la traçabilité (🟢, prioritaire)

**Responsables** : Nadia (cabinet + import + Tandem), Yann (journal migrations + snapshot).

Produire les **notes de suivi de clôture** manquantes + les **entrées `DECISIONS.md`** correspondantes :

### A.1 — Migration `cabinet` appliquée en prod
- Note `notes-de-suivi/CC_260525_HHMM_CLOTURE_CABINET_APPLY.md` : quelle option a été
  réellement exécutée (Option B bootstrap journal `__drizzle_migrations` 0000-0004 puis
  apply incrémental 0005-0006 ? patch DDL ciblé ?), **résultat de l'audit prod préalable**
  (nombre de lignes `architects` avant apply, état DDL), **snapshot Supabase pris oui/non**,
  et le smoke test post-apply (`SELECT cabinet FROM architects LIMIT 1` + `test:rls`).
- Entrée `DECISIONS.md` : date, agent, action, motif, réversibilité.
- **Confirmer l'état du journal `__drizzle_migrations`** : est-il désormais aligné
  (7/7) ? Sinon, signaler le reste à faire **avant la 8e migration** (sinon
  `drizzle-kit migrate` futur plantera).

### A.2 — Import architectes réel
- Note `notes-de-suivi/CC_260525_HHMM_CLOTURE_IMPORT_ARCHITECTS.md` : scénario retenu
  (script CLI `architects-import-260525.ts` ?), **dry-run puis `--commit`**, et surtout
  l'**écart 3805 → 3440** : combien d'ignorés/rejetés et pourquoi (lignes sans `name`,
  doublons, erreurs de mapping ?). Joindre le résumé du rapport JSON d'import
  (`{ insérés, mis_à_jour, ignorés, erreurs }`) — **sans aucune donnée perso** dans la note.
- Entrée `DECISIONS.md`.
- Rappel RGPD : `Contact_complete.xlsx` reste **hors repo** (gitignored) ; le rapport JSON
  ne doit pas embarquer d'emails/noms réels.

### A.3 — Merge / mise en prod Tandem étape 2
- Note `notes-de-suivi/CC_260525_HHMM_CLOTURE_TANDEM_PROD.md` : n° de PR, commit de merge,
  déploiement Vercel (preview puis prod), vérif logs, et l'état E2E (7/13 livrés ;
  6 back-loggés Gate 7 — le confirmer noir sur blanc).
- Entrée `DECISIONS.md`.

> Ces 3 notes + entrées DECISIONS sont du pur rattrapage documentaire (zone verte) :
> aucune nouvelle action prod n'est demandée ici, **seulement décrire ce qui a été fait**.
> Si l'une des 3 exécutions n'a en réalité PAS été menée à son terme, le dire explicitement
> au Board (ne rien inventer).

---

## Partie B — Déblocage des commits (🔴 merge Board, puis 🟢)

Le hook `.husky/pre-commit` cassé bloquait les commits ; la correction est dans **PR #43**
(`chore/fix-husky-lint-staged`, commit `139c351`, migration vers `pnpm exec lint-staged`).

1. **🔴 Board** : merger **PR #43** sur `main` (action qui te revient — déblocage du flow
   de commit normal). https://github.com/AlyoSIng/edifio-sourcing/pull/43
2. **🟢 Yann**, une fois #43 mergée :
   - committer/pusher les fichiers **Tandem étape 2 sous-étape 5** restés en working tree
     (liste exacte dans `CC_260525_0055_NADIA_TANDEM_STEP2_FINAL.md` § « Liste des fichiers
     à committer ») + ouvrir/mettre à jour la PR Tandem si pas déjà fait ;
   - vérifier qu'aucun fichier de la liste « À NE PAS committer » de cette note ne part
     (design-system, briefs Steve…) ;
   - ajouter **`tmp/` au `.gitignore`** (reco Nadia, anti-leak des scripts d'analyse XLSX) ;
   - `git diff --cached` systématique avant commit (anti-fuite secret).

---

## Partie C — Feu vert Lot #56 + #57 (🟢, specs validées Board)

### C.1 — #56 : intégration Brevo de la copie de sollicitation v2
- **Spec / copy** : `design/copy/email_sollicitation_architecte_v2.md` (remplace v1).
- À faire (Nadia) : alimenter les templates Brevo `architect_solicitation_VOUS` (variante A,
  formelle, défaut) et `_TU` (variante B) avec : bloc « qui est AlyoS » **4 puces**
  (éco-construction/MŒ ; accessibilité Ad'AP + **AMO PPMS** + **diagnostic PEMD**/amiante +
  **économie circulaire/réemploi** ; BIM/ACCA ; 2 agences Normandie & PACA), variable
  **`{{civilite}}`** avec **fallback obligatoire « Madame, Monsieur, »** (jamais d'appel
  genré au hasard), et le bloc **RGPD art.14 + lien d'opposition** obligatoires au 1er envoi.
- Sélection TU/VOUS pilotée par **`architects.tutoiement`** (déjà en base ; défaut `false`
  = vouvoiement). Choix **persistant** par architecte tant que le Board ne le modifie pas.

### C.2 — #57 : Architectes au menu + fiche éditable + éditeur de TOUS les templates + présentation société
- **Spec** : `handoff/SPEC_ADDENDUM_260525_ARCHITECTES_MENU_ET_TRAME_MAIL.md` (4 exigences A→D).
- **Séquencement validé Board** : **B → A → (C + D)**.
  - **B** — entrée « Architectes » dans la sidebar (section PILOTAGE) → écran
    `/sourcing/architectes` : liste (recherche + filtres spécialité/zone/statut/registre/actif),
    pagination 3440 lignes, **fiche éditable** (dont **toggle tu/vous** = champ `tutoiement`),
    création/désactivation (opposition = `active=false`, **pas de suppression dure**), audit log
    sur modification. RLS org-scopée stricte ; jamais d'export non tracé.
  - **A** — l'envoi de sollicitation **lit `architects.tutoiement`** pour choisir le template
    (quasi gratuit une fois B fait).
  - **C + D ensemble** — écran CONFIGURATION → « Modèles d'e-mail »
    (`/sourcing/admin/modeles-email`) éditant **TOUS** les templates (Brevo :
    `solicitation_tu/vous`, `relance_tu/vous`, `diffusion_tu/vous`, `decline_acknowledgment` ;
    Resend : `tender_summary_to_user`, `user_provisional_password`, `user_password_reset`,
    `user_notification`). Stockage table **`message_templates`** (org-scopée :
    `organization_id, key, channel ∈ {brevo,resend}, subject, body, updated_by, updated_at, version`).
    Palette de **variables par `key`**. **Garde-fous non supprimables** : mention RGPD art.14
    + lien d'opposition sur le 1er envoi (validation à l'enregistrement) ; `{{lien_ao}}` requis.
    **D** : écran « Présentation société » (`/sourcing/admin/societe`) → variable
    **`{{presentation_societe}}`** injectée dans les modèles, **seed** avec le bloc AlyoS
    (4 puces ci-dessus). Structure org-scopée pour ouverture Phase 2 sans dette.

### Contraintes transverses (rappel)
- Migrations **uniquement via `drizzle-kit generate` + revue CTO** — aucun `ALTER TABLE` manuel.
- Aucun secret en clair ; `.env.local` jamais committé. **Rappel sécurité** : `.env.local`
  pointe encore sur la **prod** → rotation à planifier (bloque les E2E locaux ; cf. note de nuit).
- Tests : Vitest + E2E (Camille), revue Hugo (sécurité/perf/correctness) avant validation.
- Plan court (3-7 étapes) posté **pour info** (zone verte) ; orange → CTO, rouge → Board.

---

## Demande de retour au Board

À l'issue : un message court par lot (A clôturé / B débloqué / C démarré) + les liens PR.
Les entrées `DECISIONS.md` de la Partie A sont **bloquantes** pour considérer la nuit soldée.
