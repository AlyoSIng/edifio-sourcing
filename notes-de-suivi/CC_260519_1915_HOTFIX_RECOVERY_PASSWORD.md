# CC 2026-05-19 19h15 — Hotfix P0 INC-2026-05-18-02 routing recovery password

**Agent** : Alex (sub-agent dev)
**Branche** : `hotfix/auth-recovery-password` (créée depuis `origin/main` au merge `e3d9e07`)
**Mission** : INC-2026-05-18-02 — lien recovery Supabase atterrit sur `/` (Server Component) qui ignore le fragment `#access_token=...&type=recovery`. Onboarding utilisateurs réels bloqué.

## Diagnostic

Supabase envoie le lien recovery en implicit flow : tokens dans le **fragment** d'URL. Le fragment n'est jamais envoyé au serveur — la landing `src/app/page.tsx` (Server Component) ne peut pas le lire. Sans handler Client, l'utilisateur reste sur la landing après avoir cliqué sur le lien email, sans aucun feedback.

## Fix

1. **Composant `RecoveryHashHandler` (Client, silencieux par défaut)** — embarqué sur `/` (landing) et `/login` (par robustesse si Site URL change côté Supabase). Inspecte `window.location.hash` au mount, ne s'active que si `type=recovery`. Appelle `setSession`, nettoie l'URL, redirige vers `/auth/update-password`. Sur erreur : `/login?error=recovery_invalid`.

2. **Nouvelle page `/auth/update-password`** (page Server + formulaire Client). Validation 16 car + maj/min/chiffre/symbole (conforme CLAUDE.md décisions 2026-05-10 Q2/B). Appelle `supabase.auth.updateUser({ password })` côté client (la session vient d'être posée par `setSession`). Erreurs Supabase localisées FR.

3. **Test E2E `e2e/auth-recovery.spec.ts`** — 3 scénarios. R1 happy path via vrai lien recovery `auth.admin.generateLink({ type: 'recovery' })`, R2 fragment invalide → `/login?error=recovery_invalid`, R3 visite normale `/` sans fragment.

## Fichiers touchés

**Créés** :
- `src/components/auth/RecoveryHashHandler.tsx`
- `src/app/auth/update-password/page.tsx`
- `src/app/auth/update-password/UpdatePasswordForm.tsx`
- `e2e/auth-recovery.spec.ts`
- `notes-de-suivi/CC_260519_1915_HOTFIX_RECOVERY_PASSWORD.md` (ce document)

**Modifiés** :
- `src/app/page.tsx` (embed `<RecoveryHashHandler />` en tête du `<main>`)
- `src/app/login/page.tsx` (embed `<RecoveryHashHandler />` en tête du `<main>`)
- `DECISIONS.md` (entrée 2026-05-19 hotfix + 8 sous-entrées détaillées)

## Statut validation locale

| Étape                            | Résultat |
|----------------------------------|----------|
| `tsc --noEmit`                   | vert (0 erreur) |
| `next lint`                      | vert (0 warning, 0 erreur) |
| `vitest run`                     | vert (108/108 tests PASS) |
| `next build`                     | vert (route `/auth/update-password` 1.72 kB listée) |
| Playwright E2E `auth-recovery`   | **non exécuté localement** (dépend du projet Supabase live + `SUPABASE_SERVICE_ROLE_KEY`). CI fera foi. |
| Dry-run DB Postgres              | non applicable (aucune migration BDD touchée) |

## Choix d'implémentation à signaler au Board

1. **Redirect post-`updateUser` = `/sourcing/ao-du-jour`** (pas `/dashboard`).
   Le brief mentionnait `/dashboard` mais cette route n'existe pas dans le repo. J'ai aligné sur le CTA principal de la landing + sur le redirect par défaut de `ClientCallbackHandler` magic-link. À arbitrer Board si une autre cible est souhaitée (par exemple une page de confirmation dédiée « Mot de passe mis à jour ✓ » avant le redirect).

2. **`RecoveryHashHandler` séparé du `ClientCallbackHandler`** (pas de refactor partagé).
   Justification : le `ClientCallbackHandler` est dédié au flow magic-link `/auth/callback` (toujours utilisé par les helpers E2E `signInWith` côté tests middleware), avec une cible dynamique `next`. Le flow recovery a une cible fixe `/auth/update-password` et un trigger explicite `type=recovery`. Garder deux handlers évite la régression sur le magic-link et fait deux composants lisibles plutôt qu'un hook partagé avec branches. Refactor possible si un 3e cas de hash apparaît (peu probable au MVP).

3. **Pas de test vitest unitaire pour `validatePassword`** dans ce hotfix.
   La fonction est pure et testable trivialement (5 règles + égalité confirmation). Reporté à une PR de hardening pour ne pas étendre le scope du hotfix P0. Couverture indirecte par l'E2E R1 (mot de passe valide accepté) + cas négatif côté form input.

## Points à signaler / risques résiduels

- **`SUPABASE_AUTH_SITE_URL` côté projet Supabase** : le fix présume que les liens recovery continueront d'atterrir sur `/` ou `/login` (les deux pages où le handler est embarqué). Si la config Supabase change pour pointer vers une autre route publique, il faudra embarquer le handler là aussi. Non corrigé dans cette PR — pas de regression Risk Board.
- **Bug latent connexe possible** : je n'ai pas creusé pourquoi Supabase pointe sur `/` plutôt que sur `/auth/callback` (qui est notre handler magic-link). Il est probable que le Site URL Supabase soit simplement la racine du projet Vercel. Configurer Supabase pour pointer recovery sur `/auth/callback` (qui aurait pu gérer recovery aussi) est une alternative architecturale — mais ça nécessiterait de changer `ClientCallbackHandler` pour gérer `type=recovery`. Le choix retenu (handler dédié recovery) est plus localisé et lisible.
- **MFA admin optionnel** (CLAUDE.md Q3/A 2026-05-10) — non touché par ce hotfix. Si MFA est activé sur un user, `updateUser` peut nécessiter une étape supplémentaire. Pas de cas connu actuellement (MFA non encore implémenté).

## Message de commit suggéré (pour `ps_operator` Yann)

```
fix(auth): routing recovery password (INC-2026-05-18-02)

Le lien recovery Supabase atterrit sur / avec les tokens dans le fragment
(#access_token=...&type=recovery). La landing etait un Server Component
qui ne pouvait pas lire le hash, donc l'utilisateur restait bloque sans
pouvoir reinitialiser son mot de passe.

- Nouveau composant Client RecoveryHashHandler embarque sur / et /login
  qui detecte le fragment, appelle setSession, nettoie l'URL et redirige
  vers /auth/update-password.
- Nouvelle page /auth/update-password avec formulaire updateUser cote
  client (la session vient d'etre posee par setSession). Validation
  16 car + maj/min/chiffre/symbole (CLAUDE.md decisions 2026-05-10 Q2/B).
- Test E2E e2e/auth-recovery.spec.ts couvrant happy path + hash invalide
  + visite normale.

Pas de touche au ClientCallbackHandler magic-link (separation deliberee
pour eviter la regression sur la matrice middleware-domain).

Redirect post-update = /sourcing/ao-du-jour (pas /dashboard qui n'existe
pas dans le repo, a arbitrer Board si autre cible souhaitee).

Validation locale verte : tsc, lint, vitest (108/108), build. E2E
Playwright couvert en CI.

Refs INC-2026-05-18-02, DECISIONS.md 2026-05-19, pivot auth 2026-05-10.
```

## Prochaine étape

1. `ps_operator` Yann : `git add` des 8 fichiers (5 créés + 3 modifiés) + commit avec le message ci-dessus + push.
2. Vérifier que le job CI E2E Playwright `auth-recovery.spec.ts` passe (3/3) sur la preview Vercel de la branche.
3. Si vert : PR `hotfix/auth-recovery-password` prête pour review CTO Sophie + merge dans `main` (pas dans `feat/sourcing-mvp` — c'est un hotfix branché sur main).
4. Post-merge : valider visuellement le flow bout-en-bout sur l'URL Vercel preview (cliquer le lien dans le vrai email Resend → arriver sur update-password → submit → `/sourcing/ao-du-jour`).

— Alex (sub-agent dev)
