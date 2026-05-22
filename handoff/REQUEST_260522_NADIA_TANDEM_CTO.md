# REQUEST CTO — Module Tandem : 4 questions techniques résiduelles

**Émetteur** : Nadia (`dev_tandem`) via Claude Code
**Destinataire** : CTO Sophie (relais Board)
**Date** : 2026-05-22
**Plan associé** : `handoff/PLAN_TANDEM_NADIA_260522.md` (zone verte — j'avance étape 1 pendant l'arbitrage)
**Urgence** : 🟠 moyenne — bloque la fin étape 2 + 4 + 5 (matching, sollicitation Brevo, JWT). Étape 1 (refonte schéma + RLS + seed + A16) tourne en parallèle sans dépendre de ces 4 questions.

> **Contexte** : le plan d'Alex de ce matin (`handoff/PLAN_TANDEM_ALEX_260522.md`) posait 5 questions (Q1-Q5). Les 4 décisions Board du 22/05 ferment **Q2** (refonte propre `architects` — décision (a)). Restent 4 questions résiduelles ci-dessous. Chacune a une reco explicite et un plan B si vous tranchez l'inverse.

---

## Q1 — Pondération matching V1 sur données pauvres

**Contexte** : `architects_data_and_admin_v1.md` §4 constate 16 % de remplissage seulement sur `x_studio_typologie_1` (spécialité). Le score « spécialité » du matching V1 (30 pts dans la spec stricte) sera 0 pour 84 % des fiches.

**Spec Tandem stricte** : `specialty 30 / geo 20 / history 25 / availability 15 / preference 10` (total 100).

**Reco architects_data_and_admin §7.4(a)** : repondérer le temps que la base soit enrichie. Proposition concrète :
- `geo 30 / specialty 15 / history 35 / availability 15 / preference 5` (total 100).

**Question** : on part sur la repondération `30/15/35/15/5` ? Avec un flag config `MATCHING_WEIGHTS_PROFILE = 'sparse_data' | 'mature'` qui bascule vers les poids spec stricte dès que la couverture spécialité dépasse 60 % ?

**Plan B si vous tranchez « spec stricte d'emblée »** : je code les poids stricts et on accepte que 84 % des fiches scorent surtout sur géo+histoire. La short-list reste exploitable, juste moins fine. Pas de blocage.

---

## Q3 — Mention RGPD art. 14 dans le 1er mail de sollicitation

**Contexte** : `design/copy/email_sollicitation_architecte_v1.md` §C définit le bloc art. 14 (origine données + finalité + droit d'opposition + lien). Doit être présent **obligatoirement** dans le 1er mail (art. 14 RGPD — données non collectées auprès de la personne).

**Question** : où injecte-t-on ce bloc ?
- **(A) Variable Brevo `{{rgpd_block}}`** générée côté code (Reco perso, type-safe, testable CI, contenu sous notre contrôle).
- **(B) Directement dans le template Brevo** côté Léa (CMO) — moins de surface code, mais on perd la testabilité et la cohérence avec le `{{lien_opposition}}` qu'on génère déjà.

**Reco** : (A) — variable code. Test E2E `tandem_rgpd_mention_present_in_first_email` capture le mail mocké et asserte la présence du bloc + du lien d'opposition. Si on bascule sur (B), on ne peut tester que la présence de la variable, pas le contenu.

**Demande** : confirmer (A) ou demander à Léa de pousser le bloc dans le template Brevo (B). Côté impact : 30 min de code en plus pour (A).

---

## Q4 — `solicitable` : colonne stockée ou expression dérivée

**Contexte** : `solicitable = TRUE ⇔ email IS NOT NULL` (cf. `architects_data_and_admin_v1.md` §4). Utilisé en filtre du matching V1.

**Question** : on stocke la colonne en BDD (denormalisée, 1 lookup) ou on dérive à la query (`WHERE email IS NOT NULL`) ?

**Reco** : **colonne stockée** + dérivée automatiquement à l'insert/update :
- Option 1 : `GENERATED ALWAYS AS (email IS NOT NULL) STORED` (Postgres native, 100 % cohérent, pas de drift possible).
- Option 2 : trigger `BEFORE INSERT OR UPDATE` qui set `solicitable = (email IS NOT NULL)`.

Avantage stocké : index possible (`WHERE solicitable = true` côté matching), pas de risque de drift, pas de re-calcul à chaque query.

Avantage dérivé : 1 colonne en moins, vérité unique = `email`.

**Préférence** : **Option 1 (`GENERATED STORED`)** — Postgres garantit la cohérence, on indexe, on filtre vite. C'est la solution canonique.

**Demande** : OK pour `GENERATED ALWAYS AS (email IS NOT NULL) STORED` ?

---

## Q5 — Clé JWT RS256 — dédiée vs réutilisation Supabase

**Contexte** : la page tokenisée `/archi/[token]` (publique hors middleware) vérifie un JWT RS256 émis par notre server action `sendArchitectSolicitation`. Spec Tandem §3.3.

**Question** : on génère une paire de clés dédiée `ARCHITECT_JWT_PRIVATE_KEY` / `ARCHITECT_JWT_PUBLIC_KEY` (Vercel env), ou on réutilise les clés Supabase Auth existantes ?

**Reco** : **clé dédiée** — pour 4 raisons :
1. **Rotation indépendante** : on peut changer la clé architecte sans toucher à Supabase Auth (qui invaliderait toutes les sessions AlyoS).
2. **Isolation de risque** : compromission d'une clé n'invalide pas l'autre périmètre.
3. **Audience claire** : le JWT architecte a `aud=architect`, on peut vérifier sans risque de confusion avec un JWT Supabase user.
4. **Pas de coupling** au runtime Supabase Auth (qui peut bouger).

**Plan B si vous tranchez « réutilisation »** : on signe avec la clé Supabase Auth, on documente la rotation conjointe dans `DECISIONS.md`, on accepte le coupling. Pas de blocage code.

**Demande** : OK pour génération paire dédiée `ARCHITECT_JWT_*` (Yann la génère + l'ajoute à Vercel env + `.env.example` placeholder) ?

---

## Synthèse — ce que j'attends de vous

| Q | Reco | Plan B | Bloque |
|---|---|---|---|
| Q1 | Repondération `30/15/35/15/5` + flag profile | Spec stricte `30/20/25/15/10` | Étape 2 (matching) |
| Q3 | Variable code `{{rgpd_block}}` | Template Brevo Léa | Étape 4 (sollicitation) |
| Q4 | `GENERATED ALWAYS AS (email IS NOT NULL) STORED` | Vue dérivée | Étape 1 (migration) — **plus prioritaire** |
| Q5 | Clé dédiée `ARCHITECT_JWT_*` | Réutilisation Supabase | Étape 2 (jwt) |

**Je continue l'étape 1 en parallèle** — la migration peut être générée avec `solicitable` en colonne `bool default false` simple, et upgradée en `GENERATED STORED` au moment de la réponse Q4 (1 ligne de SQL ALTER). Idem pour les autres : reco par défaut, j'amende dès réponse.

**Pas urgent — pas de réponse avant J+1 OK.** Je travaille déjà.

---

*Q2 du plan Alex (modèle architects double-colonne) tombée grâce à décision Board 22/05 (a) refonte propre. Codes audit A16 acquis grâce à décision (b). Colonnes `tokenId`/`followupSentAt` acquises grâce à décision (c). Normalisation matcher acquise grâce à décision (d).*
