# RUNBOOK — Cron `sourcing-run` KO le lundi matin

> **Auteur** : Alex (sub-agent `dev`)
> **Date** : 2026-06-09
> **Contexte** : mitigation R12 — flag Sébastien + Camille (« Cron 6h30 du
> lundi 20/7 KO = AlyoS aveugle le lundi matin »).
> **Cible** : Steve (`steissier@alyosingenierie.fr`) et la suite admin AlyoS.

## TL;DR — Que faire si le mail « ALERT: cron sourcing-run KO » arrive ?

Suivre les 4 étapes ci-dessous dans l'ordre. Le mail d'alerte arrive vers
07h00 si le cron 6h30 n'a pas tourné correctement. Pas de panique : la
résolution prend en général 5 à 10 minutes.

---

## Étape 1 — Vérifier l'état du cron sur `/sourcing/admin/crons`

1. Ouvrir https://edifio-sourcing.vercel.app/sourcing/admin/crons (ou
   l'URL de prod si custom domain `sourcing.alyosingenierie.fr` est posé).
2. Repérer la carte **`sourcing-run`** en haut de la page.
3. Lire la ligne **« Dernier : … »** :
   - Si la date est aujourd'hui après 06:25 et statut `OK` → fausse alerte
     possible (à investiguer mais pas bloquant ; aller voir les logs Vercel
     pour comprendre pourquoi le monitoring a déclenché malgré tout).
   - Si la date est hier ou plus vieux → **le cron 6h30 n'a pas tourné**.
     Passer à l'étape 2.
   - Si statut `Erreur` → le cron a tourné mais a thrown. Passer à
     l'étape 4 pour l'analyse, le mail `notifyCronError` est déjà parti.

## Étape 2 — Déclencher le cron manuellement (bouton du panel)

1. Sur la même page `/sourcing/admin/crons`, repérer la section
   **« Déclencher manuellement »**.
2. Cliquer sur **« ▶ Déclencher maintenant »** dans la carte
   `sourcing-run`.
3. Attendre 30 secondes à 3 minutes (le pipeline BOAMP + scrapers peut
   être long les jours chargés).
4. Lire le panneau de feedback en bas du composant :
   - Bandeau vert ✓ + HTTP 200 + nombre de tenders insérés → **OK,
     terminé**. Les AO du jour vont apparaître dans `/sourcing/ao-du-jour`
     dès le rafraîchissement.
   - Bandeau rouge ✗ → passer à l'étape 3.

## Étape 3 — Tomber sur le smoke endpoint (back-up si le bouton plante)

Si le bouton du panel échoue (timeout côté Server Action, etc.), il reste
un endpoint smoke direct qui fait exactement la même chose en bypassant
la Server Action.

1. S'assurer d'être connecté en tant que superadmin
   (`sebastien@edifio.fr` ou équivalent dans Phase 2).
2. Ouvrir un nouvel onglet :
   ```
   https://edifio-sourcing.vercel.app/api/admin/crons/smoke-sourcing-run
   ```
3. Lire la réponse JSON :
   - `verdict: "ok"` → terminé.
   - `verdict: "ko"` + `httpStatus: 401/403` → problème d'auth, vérifier
     que le cookie de session est bien posé (ré-login si besoin).
   - `verdict: "ko"` + `httpStatus: 500` → la route cron sourcing-run
     elle-même throw. Passer à l'étape 4.

## Étape 4 — Lancer le pipeline en SQL direct (Supabase Studio)

Dernier filet de sécurité quand l'API est cassée mais que la BDD est OK.
Réservé aux superadmins avec l'accès Supabase Studio.

1. Ouvrir le projet Supabase EU (Frankfurt) →
   **SQL Editor**.
2. Lancer cette requête pour voir si une row du jour a déjà été tentée :
   ```sql
   SELECT id, cron_name, started_at, status, error_message
   FROM cron_run_log
   WHERE cron_name = 'sourcing-run'
   ORDER BY started_at DESC
   LIMIT 5;
   ```
3. Si aucune row n'apparaît pour aujourd'hui, c'est que la route
   sourcing-run n'a JAMAIS tourné. Possibilités :
   - Vercel cron miss (rare, vérifier dans Vercel → Project → Cron Logs).
   - Mauvais déploiement (vérifier que le dernier déploiement prod est
     OK dans Vercel → Deployments).
4. Pour forcer une exécution en attendant qu'un dev répare, on peut
   re-soumettre le payload Opendatasoft de la veille comme fallback :
   ```sql
   -- Inspecter le dernier profil par défaut
   SELECT id, name, active
   FROM search_profiles
   WHERE is_default = true AND active = true;

   -- Manuellement reprendre les AO d'hier qui n'ont pas été traités
   -- (à demander à un dev pour la requête exacte — variable selon le schéma).
   ```
   Ne PAS écrire directement dans `tenders` sans validation dev : un
   INSERT raté peut casser la cohérence avec `tender_dispatches` et
   les scorings IA.

## Étape 5 — Escalader

Si malgré les 4 étapes le cron est toujours KO :

1. **Pendant les heures ouvrées** : prévenir Sébastien (équipe Suivi+ACT,
   lead migration monorepo) sur Slack ou via mail
   `sebastien@edifio.fr`. Il a accès au déploiement Vercel et peut
   investiguer côté infra.
2. **Hors heures ouvrées** : envoyer un mail à `steissier@alyosingenierie.fr`
   (Steve) et `sebastien@edifio.fr` avec :
   - Heure du déclenchement de l'alerte
   - Résultat des étapes 1-4 (captures d'écran si possible)
   - Lien vers la dernière `cron_run_log` row error si elle existe
3. **En dernier ressort** (cas extrême du dimanche 19/7 ou lundi 20/7
   matin avec impact commercial) : **rollback de la bascule** vers
   l'ancien repo `edifio-sourcing` standalone. La procédure de rollback
   est documentée dans `docs/brief_migration_sourcing_to_monorepo.md` §11.

---

## Annexes

### Pourquoi ce runbook ?

Le cron `sourcing-run` est la principale capacité métier d'AlyoS le matin :
sans lui, l'écran `/sourcing/ao-du-jour` est vide et les collègues n'ont
plus accès aux nouveaux AO BOAMP / PLACE / Francmarchés. C'est un risque
commercial direct, surtout le lundi matin (3 jours de retard accumulés sur
les AO).

R12 a été flag par Sébastien et Camille à la review de la bascule du
18 juillet 2026 (cf. `gates/REVIEW_FINAL_MONOREPO_MAIN_966aa74.md`).

### Architecture du monitoring (résumé)

```
06:30 Europe/Paris  →  Vercel Cron  →  /api/cron/sourcing-run
                                            ↓
                                       cron_run_log
                                            ↓
07:00 Europe/Paris  →  Vercel Cron  →  /api/cron/sourcing-monitoring
                                            ↓
                                       evaluateCronHealth()
                                            ↓
                              ┌─────────────┴─────────────┐
                              ↓                           ↓
                            verdict ok                 verdict ko
                            log success            sendEmail Resend →
                              return 200          sebastien@edifio.fr
```

### Liens utiles

- Panel admin : `/sourcing/admin/crons`
- Smoke endpoint : `/api/admin/crons/smoke-sourcing-run`
- Code source helper : `src/lib/cron/monitoring.ts`
- Tests unit : `src/lib/cron/monitoring.test.ts`
- Mail Resend : voir `src/lib/email/resend.ts`
- Schedule Vercel : `vercel.json`

### Convention de nommage (rappel CLAUDE.md)

- Toujours `edifio Sourcing`, jamais `EDIFIO` ni `Edifio`.
- Toujours `AlyoS Ingénierie` (S majuscule final).
- Toujours `Solo` / `Tandem` pour les modes.
