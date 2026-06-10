# Plan de recette croisée — migration Sourcing → monorepo (ven 12/06 soir → sam 13/06)

> **Objectif** : prouver, sur la préprod monorepo, que les 7 modules Sourcing portés
> fonctionnent ET que la transposition de données est fiable, pour prononcer le
> **GO/NO-GO samedi 13/06 soir** (bascule dimanche 14/06 8h-11h —
> `docs/RUNBOOK_BASCULE_MONOREPO_140626.md`).
>
> **Exécutants** : Camille (qa Sourcing) + Sébastien (lead Suivi+ACT) — checklist à 2,
> chacun exécute, l'autre contre-vérifie les cas sécurité.
> **Rédigé le 10/06 (Camille).** Base : specs e2e S1-S14 (`e2e/multi-org/`),
> cartographie Lot 2 (`docs/CARTOGRAPHIE_MONOREPO_LOT2_260610.md`), arbitrages A1-A8.

## 0. Environnement de recette

| Élément | Valeur |
|---|---|
| Cible | Préprod monorepo (deploy Vercel preview branche `migration/sourcing-*` + projet/branche Supabase de préprod ⏳ à confirmer avec Sébastien — JAMAIS la prod) |
| Schéma | 0129-0131 appliqués + script de transposition Lot 6 joué sur un **dump prod Sourcing** anonymisé ou non (données réelles = recette du script en conditions réelles) |
| Fixtures | 3 orgs de test type S1-S14 : `ALYOS-TEST`, `PROTECT-TEST`, `DUPONT-TEST` (3e tenant témoin) + comptes admin/member/superadmin par org. **Garde `assertNotProdUrl` adaptée au project ref prod monorepo AVANT tout seed** (leçon incident P0 10/06) |
| Préalable | La transposition du dump est exécutée **2 fois de suite** : run 2 = mêmes assertions vertes (idempotence). C'est un cas de recette à part entière (M1) |
| Outils | Navigateur (2 profils + 1 fenêtre privée pour anon), SQL Editor préprod, curl |

**Convention de notation** : chaque ligne = `OK` / `KO` / `N/A` + commentaire obligatoire si ≠ OK.
KO sécurité = tag `[SEC]` dans le commentaire + remontée immédiate (pas en fin de session).
Un cas KO corrigé doit être **rejoué après fix** (re-run tracé dans la colonne commentaire).

**Planning compressé** :

- **Vendredi 12/06 soir (~3h)** : §1 transposition (M1-M6) + modules 1-2-6 (le cœur : AO/Salve U,
  Tandem, admin org) — ce sont les plus risqués, on veut la nuit pour les fixes.
- **Samedi 13/06 (journée)** : modules 3-4-5-7 + §2 plateforme (SSO, gating, hosts, crons) +
  re-run de TOUS les KO de vendredi + suites automatisées §3.
- **Samedi soir** : bilan chiffré → GO/NO-GO.

---

## 1. Tests spécifiques migration (M) — TOUS P0

C'est ce qui n'a jamais existé avant : la transposition et les mécanismes monorepo.

| ID | Cas | Étapes | Attendu | OK/KO | Commentaire |
|---|---|---|---|---|---|
| M1 | Idempotence du script de transposition | Jouer le script 2× de suite sur le même dump | Run 2 : zéro doublon, mêmes counts, assertions runbook §5 vertes 2× | ☐ | |
| M2 | Billing — trial PROTECT intact | Comparer `organizations` cible vs dump source | `trial_until` = `trial_ends_at` (0049) à la seconde près, `trial_status='actif'`, `contract_summary` initialisé, `modules_actifs ? 'sourcing'` | ☐ | |
| M3 | Billing — comportement applicatif trial | Login admin PROTECT-TEST ; puis passer `trial_until` à J-2 puis J+1 en BDD | Bannière trial correcte ; expiré → mode readOnly (`get-trial-info`), pas de 500 (fail-soft null = actif) | ☐ | |
| M4 | Mapping rôles | Vérifier `profiles` vs source : admin→`admin`, user→`member`, viewer→`member`, superadmin→`is_superadmin=true` | 0 rôle hors check `owner/admin/member` ; superadmin N'EST PAS un rôle dans profiles.role | ☐ | |
| M5 | Rôles lus depuis la TABLE profiles (pas le JWT) | Changer `profiles.role` member→admin en BDD pour un user connecté, recharger une page admin | L'accès suit la TABLE (immédiatement ou au refresh session — noter le délai constaté), PAS l'ancien user_metadata | ☐ | |
| M6 | Remap des FK | Requêtes anti-orphelins sur `organization_id` + `user_id` des 22 tables `sourcing.*` (bloc assertion A8 du runbook) | 0 ligne orpheline, 0 ligne rattachée à une mauvaise org (spot-check : 3 tenders PROTECT pointent bien l'id PROTECT cible) | ☐ | |
| M7 | SSO cookie `.edifio.fr` inter-modules | Login sur le host sourcing de préprod → naviguer vers le host Suivi (même domaine parent) → retour | Session partagée sans re-login ; logout sur un module déconnecte l'autre | ☐ | |
| M8 | Gating `modules_actifs` | Org témoin SANS `"sourcing"` dans `modules_actifs` tente le host sourcing | Redirect `/module-non-active`, aucun contenu sourcing rendu | ☐ | |
| M9 | Host routing | Host sourcing → rewrite `/sourcing` ; vérifier passthrough `/api`, `/admin`, `/superadmin` ; URL preview vercel (regex) | Routage conforme au pattern ACT (middleware.ts:43-77) ; pas de boucle de redirect | ☐ | |
| M10 | Non-régression Suivi/ACT | Sébastien déroule SON smoke standard Suivi + ACT sur la préprod APRÈS transposition | Zéro régression côté Suivi/ACT (schémas, RLS, middleware partagés) | ☐ | |
| M11 | auth.users importés avec hashes | Login avec le mot de passe ACTUEL d'un compte transposé (compte de test issu du dump) | Login OK sans reset password ; collision email (compte existant des 2 côtés) → un seul auth.user, profile cohérent | ☐ | |
| M12 | Anti-prod guard CI/seed | Lancer le seed e2e en pointant volontairement l'URL prod monorepo | Throw `assertNotProdUrl` AVANT toute écriture | ☐ | [SEC] |

---

## 2. Matrice par module (7 modules portés)

Légende : N = nominal, R = RLS/sécurité cross-tenant, L = limite. Réfs S1-S14 = specs `e2e/multi-org/`.

### Module 1 — AO du jour / Salve U (réf S2, S3, S4, S6, S7)

| ID | P | Cas | Attendu | OK/KO | Commentaire |
|---|---|---|---|---|---|
| 1.1 | P0-N | Admin ALYOS-TEST ouvre `/sourcing/ao-du-jour` | Liste AO (ou empty state propre), zéro erreur runtime | ☐ | |
| 1.2 | P0-N | Sélectionner un AO | Statut `selected_solo` posé sur la bonne org (vérif SQL) | ☐ | |
| 1.3 | P0-N | **Écarter avec motif** : modale → 7 motifs structurés → valider | `learning_events` : 1 row avec `reason_code` + `payload`, org correcte | ☐ | |
| 1.4 | P0-L | **Exclure** un AO | Succès UI + **ZÉRO row** `learning_events` pour cet AO | ☐ | |
| 1.5 | P0-R | Admin PROTECT-TEST ne voit AUCUN AO/tender ALYOS-TEST ni DUPONT-TEST (et symétrie) | 0 leak, RLS `sourcing.tenders` + `current_user_has_sourcing()` | ☐ | [SEC] |
| 1.6 | P1-L | Org sans AO du jour | Empty state, pas de 500 (pattern fail-soft ACT) | ☐ | |

### Module 2 — Tandem cotraitant (réf S12, S13)

| ID | P | Cas | Attendu | OK/KO | Commentaire |
|---|---|---|---|---|---|
| 2.1 | P0-N | Créer un share cotraitant + ouvrir `/cotraitant/<token>` en fenêtre privée (anon) | Page rendue (h1 + greeting), functions SECURITY DEFINER OK dans le schéma `sourcing` | ☐ | |
| 2.2 | P0-N | Signer un item via la page anon | `signed_at` + `signer_name` posés ; 2e signature même item → refusée (FALSE) | ☐ | |
| 2.3 | P0-R | Anti-IDOR : token valide + item d'un AUTRE share → mark_signed | FALSE, rien écrit | ☐ | [SEC] |
| 2.4 | P0-R | DOM + réponses réseau de la page anon | Aucun `org_id`/`tender_id` ne fuite, aucun lien `/sourcing/*` | ☐ | [SEC] |
| 2.5 | P0-L | Token expiré | Page « Lien invalide / expiré », items = 0 row, mark_signed = FALSE | ☐ | |
| 2.6 | P1-L | Token introuvable / format invalide | Page « Lien invalide », pas de 500 | ☐ | |

### Module 3 — Dossier IA (briefs + dispatch)

| ID | P | Cas | Attendu | OK/KO | Commentaire |
|---|---|---|---|---|---|
| 3.1 | P0-N | Générer un brief IA sur un AO sélectionné | Brief créé (`sourcing.tender_briefs`), contenu non vide, org correcte | ☐ | |
| 3.2 | P0-N | Dispatch du dossier (`dossier_dispatches`) | Dispatch tracé, destinataires corrects, mail parti (sandbox Brevo/Resend de préprod — PAS de vrai envoi externe) | ☐ | |
| 3.3 | P0-R | User PROTECT-TEST tente d'accéder au brief/dossier d'un AO ALYOS-TEST (URL directe) | 404/redirect, 0 contenu | ☐ | [SEC] |
| 3.4 | P1-L | AO sans documents (tender_documents vide) | Génération refusée proprement ou brief dégradé annoncé, pas de 500 | ☐ | |
| 3.5 | P1-L | Clé Anthropic absente/invalide en préprod | Erreur absorbée + message UI (fail-soft), pas de crash | ☐ | |

### Module 4 — Bibliothèque (presentation_library + index)

| ID | P | Cas | Attendu | OK/KO | Commentaire |
|---|---|---|---|---|---|
| 4.1 | P0-N | Ajouter un document à la bibliothèque | Row `presentation_library` + indexation `library_item_index`, org correcte | ☐ | |
| 4.2 | P0-N | Documents transposés du dump visibles + téléchargeables | Liste complète (count = source), fichiers Storage accessibles ⏳ (selon décision périmètre Storage, runbook Annexe C.9) | ☐ | |
| 4.3 | P0-R | PROTECT-TEST ne voit pas la bibliothèque ALYOS-TEST (et symétrie) | 0 leak | ☐ | [SEC] |
| 4.4 | P1-L | Item avec date d'expiration dépassée | Signalé/filtré conformément à l'existant (digest = cron, cf. 7.x crons) | ☐ | |

### Module 5 — Annuaire acheteurs (buyers)

| ID | P | Cas | Attendu | OK/KO | Commentaire |
|---|---|---|---|---|---|
| 5.1 | P0-N | Liste + fiche acheteur, recherche | Données transposées complètes (count = source), navigation OK | ☐ | |
| 5.2 | P0-R | Cloisonnement buyers entre orgs (si scopé org) OU lecture seule partagée conforme à la spec | Comportement identique au standalone, 0 écriture cross-tenant | ☐ | [SEC] |
| 5.3 | P1-L | Acheteur sans AO rattaché | Fiche s'affiche, sections vides propres | ☐ | |

### Module 6 — Admin org (users, profil de recherche) (réf S5, S9, S11)

| ID | P | Cas | Attendu | OK/KO | Commentaire |
|---|---|---|---|---|---|
| 6.1 | P0-N | Admin crée un user (workflow admin-create) | User créé, profile avec `organization_id` + rôle corrects ; flow password provisoire selon arbitrage `must_change_password` ⏳ (runbook Annexe C.5) | ☐ | |
| 6.2 | P0-R | Liste users filtrée tenant : admin ALYOS-TEST ne voit pas les users PROTECT-TEST (API + UI) | 0 leak (équiv. S5) | ☐ | [SEC] |
| 6.3 | P0-R | RBAC : member → pages admin | Redirect forbidden (équiv. S9) ; admin → accès | ☐ | [SEC] |
| 6.4 | P0-L | Hardfail : échec d'insert `profiles` pendant la création user | **Rollback auth.users** (pas d'orphelin — équiv. S11, transposé memberships→profiles) | ☐ | |
| 6.5 | P0-N | Profil de recherche : modifier mots-clés/départements puis relancer un matching de test | `sourcing.search_profiles` mis à jour, matching utilise le profil transposé (24 positive + 9 negative + 23 départements de la baseline si dump prod) | ☐ | |
| 6.6 | P1-L | Création user avec email déjà existant | Erreur propre, pas de doublon profile | ☐ | |

### Module 7 — Superadmin (réf S8, S10, S14)

| ID | P | Cas | Attendu | OK/KO | Commentaire |
|---|---|---|---|---|---|
| 7.1 | P0-N | Superadmin (flag `is_superadmin`) ouvre la liste des organisations | Toutes les orgs visibles (multi-tenant), y compris orgs Suivi | ☐ | |
| 7.2 | P0-N | Créer une org + son admin → login du nouvel admin | Login OK, AUCUN leak des autres orgs (équiv. S8), `modules_actifs` posé comme demandé | ☐ | |
| 7.3 | P0-R | Admin simple (non super) tente `/superadmin/*` | 403/redirect (équiv. S14) ; vérifier que le flag se lit dans profiles, PAS dans user_metadata | ☐ | [SEC] |
| 7.4 | P0-R | `organization_trial_events` : SELECT en tant qu'admin simple | 0 row (RLS superadmin only) ; écriture réservée service_role | ☐ | [SEC] |
| 7.5 | P1-L | User orphelin (profile sans org — forcé en BDD) | Page `/no-org` sans leak (équiv. S10) ou comportement monorepo équivalent documenté | ☐ | |

### Crons & API protégées (transverse) (réf S6, S14)

| ID | P | Cas | Attendu | OK/KO | Commentaire |
|---|---|---|---|---|---|
| 8.1 | P0-R | Les 5 routes `/api/cron/sourcing-*` sans bearer puis avec bearer invalide | 401 systématique | ☐ | [SEC] |
| 8.2 | P0-N | Trigger manuel `sourcing-monitoring` avec `CRON_SECRET` préprod | 200 `{ok:true}` | ☐ | |
| 8.3 | P0-R | Run sourcing de test : tenders insérés taggés sur la bonne org | 0 tender cross-tenant (équiv. S6) | ☐ | [SEC] |
| 8.4 | P1-N | Worker Fly.io déclenché vers la préprod (si testable) | Run complet tracé `cron_run_log`, aucun run bloqué `running` > 10 min | ☐ | |

---

## 3. Suites automatisées (samedi, en parallèle du manuel)

| Suite | Commande (préprod) | Seuil |
|---|---|---|
| Vitest porté (Lot 7) | `npm run test` (monorepo — npm, pas pnpm !) | Vert complet ; en dégradé : échecs uniquement sur des specs documentées KO-connus avec ticket |
| E2E P0 multi-org portés | `npx playwright test e2e/multi-org --grep "@p0"` avec `PLAYWRIGHT_BASE_URL` préprod + fixtures §0 | 9/9 specs P0 (S1-S6, S8, S10, S11 transposées) |
| pgTAP RLS | `npm run test:rls` sur la BDD préprod (policies schéma `sourcing`) | 100 % vert — non négociable |

Si le portage Lot 7 n'est pas terminé samedi midi : **minimum incompressible** = pgTAP RLS + les
9 specs e2e P0. En dessous → NO-GO (on ne bascule pas une RLS réécrite sans preuve automatisée).

---

## 4. Critères GO/NO-GO (samedi 13/06 soir)

GO si et seulement si TOUS les critères suivants sont vrais :

| # | Critère | Seuil chiffré |
|---|---|---|
| G1 | Cas P0 (sections 1 + 2, lignes P0) | **100 % OK, 0 KO** (re-runs post-fix admis si tracés) |
| G2 | Cas `[SEC]` toutes priorités | **0 KO** — un seul KO sécurité non corrigé+rejoué = NO-GO |
| G3 | Cas P1 | ≥ 90 % OK ; chaque KO restant a un ticket + contournement écrit + accord Steve |
| G4 | M1 idempotence transposition | 2 runs consécutifs = assertions identiques vertes |
| G5 | Assertions post-import (runbook §5) | 12/12 vertes sur la préprod après transposition du dump |
| G6 | Suites automatisées §3 | pgTAP 100 % + e2e P0 9/9 (minimum incompressible) |
| G7 | Non-régression Suivi/ACT (M10) | Validée par Sébastien nominativement |
| G8 | Runbook | Figé : Annexe C du runbook = 9/9 résolus, rollback relu par Steve + Sébastien |

**Décision** : Steve + Sébastien, sur la base de cette checklist signée par Camille
(état brut : X OK / Y KO / Z N/A par section, liste nominative des KO).
**NO-GO = retour au plan du 18/07 sans dégât** (prod Sourcing standalone intacte) — c'est une
issue acceptable, pas un échec : ne pas forcer un GO pour tenir la date.

## 5. Traçabilité

- Résultats consignés au fil de l'eau dans `notes-de-suivi/CC_260613_HHMM_RECETTE_CROISEE.md`
  (copie de cette matrice avec colonnes remplies + horodatage des re-runs).
- Tout KO → constat de repro standard (étapes + données + attendu vs observé) pour Alex/Sébastien.
- Bilan GO/NO-GO reporté dans `DECISIONS.md` samedi soir.

---

**Plan rédigé le 10/06/2026 (Camille, qa). À ajuster jeudi/vendredi selon l'avancement des Lots 2-7.**
