# ADR-011 — Flow reset password & résistance aux scanners email d'entreprise

**Statut** : Acté Gate 6 — Option 1 livrée 2026-05-14, Option 2 planifiée P1 Gate 6 étape 6
**Date** : 2026-05-14
**Auteur** : [DEV Alex] avec validation [CTO Sophie] et [Board]
**Supersede** : aucun. **Surclassé par** : ADR-012 (à venir, OTP 6 chiffres en Gate 6 étape 6).

---

## Contexte

Le pivot Board 2026-05-11 a abandonné l'auth magic-link au profit d'un flow
email + password durable, avec un sous-flow recovery (« mot de passe oublié »)
qui repose toujours sur un **lien recovery cliqué dans un email** (généré
via `supabase.auth.admin.generateLink({type:'recovery'})`, envoyé via Resend).

### Symptômes observés le 2026-05-14

Lors du premier test bout-en-bout en preview Vercel (compte
`steissier@alyosingenierie.fr`) :

1. **Bug initial — double `https://`** dans le lien reçu :
   `https://https://edifio-sourcing-3gfzshq1t-teissiers-projects.vercel.app/#access_token=…`
   → DNS_PROBE_POSSIBLE côté Brave (host parsé = `https`).
   **Cause** : Site URL Supabase Dashboard contenait `https://https://…`
   (erreur de saisie corrigée depuis par le Board).

2. **Bug subsidiaire — `error_code=otp_expired`** après cleanup manuel du
   double-https : l'URL arrive sur la racine `/` avec un fragment
   `#error=access_denied&error_code=otp_expired&error_description=…` au lieu
   d'établir la session.
   **Cause racine identifiée** : le scanner email d'entreprise AlyoS
   (Microsoft Defender Safe Links / équivalent Outlook 365) **pré-clique
   automatiquement le lien recovery dès réception du mail** pour vérification
   sécurité. Ce pré-clic consume le token Supabase one-time → le clic réel
   de l'utilisateur arrive sur un token déjà invalidé.

### Anomalie subsidiaire Supabase

Quand le token recovery est consommé, Supabase **ignore systématiquement
notre `redirect_to`** (`/auth/callback?next=/reset-password`) et fait
fallback sur le **Site URL Dashboard** avec le fragment d'erreur — au lieu
de redirigerver `redirect_to` avec l'erreur. Comportement non documenté
explicitement mais reproductible.

**Conséquence pratique** : l'utilisateur arrive sur la home `/`
(Site URL = racine) avec un fragment d'erreur que la home ne sait pas lire
côté Server Component (les fragments ne traversent jamais la requête HTTP).
Résultat : page d'accueil edifio normale, aucune indication de l'échec.

### Discussion préalable

Le problème scanner email avait déjà été soulevé lors de l'arbitrage initial
magic-link vs password (cf. brief Board pivot 2026-05-11). À l'époque on
pensait que passer du magic-link au password durable suffisait à éviter le
problème — mais le **flow recovery** par email reste, et il subit la même
mécanique de pré-clic. La discussion est donc à ré-ouvrir, plus largement,
sur **tous les flows qui envoient un lien actionnable par email**.

---

## Options évaluées

### Option 1 — Page d'erreur dédiée + handler de fragment côté browser

Conserver le flow lien email actuel, mais ajouter :
- Une page `/auth/error` qui affiche un message UX clair selon `error_code`
  (« Lien expiré ou déjà utilisé — souvent ta messagerie pré-charge le lien
  pour le sécuriser. Demande un nouveau lien, il restera valide pour ton
  premier clic. ») + CTA `/forgot-password`.
- Un Client Component `HashErrorHandler` sur la home `/` qui lit
  `window.location.hash`, détecte `#error=…`, et redirige vers
  `/auth/error?code=…`. Sans ce handler, le user voit la landing page sans
  aucune indication.
- L'extension de `ClientCallbackHandler` pour traiter aussi `#error=…`
  (en plus de `#access_token=…`).

**Effort** : 2-3h. **Couverture** : 100 % de l'UX d'échec. **Limite** : ne
résout pas la cause racine. L'utilisateur devra parfois redemander plusieurs
liens avant d'arriver à cliquer avant le scanner.

### Option 2 — OTP 6 chiffres par email (sans clic)

Le user reçoit un **code numérique** (`123456`) dans le mail, qu'il saisit
manuellement dans une page UI `/forgot-password-confirm`. Aucun lien
cliquable → impossible pour un scanner de consommer le token via pré-clic.

**Faisabilité technique validée (spike 2026-05-14)** :
- `supabase.auth.admin.generateLink({type:'recovery'})` renvoie déjà
  `properties.email_otp` (confirmé par appel direct REST sur `auth/v1/admin/generate_link`).
- `supabase.auth.verifyOtp({email, token, type:'recovery'})` établit une
  session équivalente au flow lien.
- Le code OTP a une durée de vie (typiquement 1 h, configurable Supabase
  Dashboard) — pas pré-fetchable parce qu'il n'est PAS dans une URL.

**Effort** : 2-3 jours. **Couverture** : résout 100 % du problème scanner.
**Limite** : UX légèrement plus friction (copie-colle du code) — acceptable
vu que c'est un flow d'urgence (oubli password).

### Option 3 — Bypasser Supabase Email, envoyer le lien via Resend custom

Garder `admin.generateLink` côté serveur et envoyer le lien via Resend dans
un template custom.

**Rejet immédiat** : le scanner pré-clique TOUT lien dans le mail, peu
importe son émetteur (Supabase natif ou Resend custom). Ça ne change rien
à la cause racine. Cette option n'avance pas le problème.

---

## Décision

**Option 1 immédiate + Option 2 P1 Gate 6 étape 6.**

### Option 1 — livrée 2026-05-14

Implémentation effective (commit 2026-05-14 sur `feat/auth-password-pivot`) :

- `src/lib/auth/parse-hash-error.ts` (pure helper) + `parse-hash-error.test.ts`
- `src/components/HashErrorHandler.tsx` (Client Component invisible,
  attaché à la home `/`)
- `src/app/auth/error/page.tsx` (Server Component, lit `?code` + `?description`)
- Modification `src/app/auth/callback/ClientCallbackHandler.tsx` (traite
  aussi `#error=…`)
- Modification `src/app/auth/callback/page.tsx` (redirige `?error=…` vers
  `/auth/error?code=…` au lieu de `/login?error=…`)
- Modification `src/lib/site-url.ts` : ajout `normalizeSiteUrl` (défense en
  profondeur — retire schéma dupliqué + log warning, post-incident
  double-`https://`)
- Tests Vitest pour `parseHashError` et `normalizeSiteUrl`

### Option 2 — planifiée Gate 6 étape 6

Refactor en parallèle du flow lien existant (coexistence) :

1. Nouveau template `password-reset-otp.ts` qui inclut le code OTP en
   évidence (police monospace large) + le lien actionnable en fallback.
2. Server Action `requestPasswordResetAction` étendue : retourne le code
   OTP via la réponse JSON pour que l'UI puisse pré-remplir le contexte.
   ⚠️ Ne JAMAIS retourner le code lui-même dans la réponse Server Action
   (le code est privé, envoyé par mail uniquement). Le retour de la Server
   Action reste neutre (anti-énumération).
3. Page `/forgot-password-confirm` (ou modal sur `/forgot-password`) avec
   un champ OTP 6 chiffres + bouton « Valider », appelle `verifyOtp`.
4. Tests E2E couvrant le flow OTP de bout en bout.

**Effort estimé** : 2-3 jours.

### Décisions complémentaires actées dans cette ADR

- **Site URL Supabase** doit pointer sur l'**URL par branche** (`*-git-<branch>-…`)
  ou sur le **custom domain** Gate 7, **jamais sur l'URL par deploy**
  (`-<hash>-…`) qui change à chaque push. Migration à faire côté Board.
- **Fix défensif `normalizeSiteUrl`** dans `getSiteUrl()` : protège contre
  les erreurs de saisie env var (double schéma) avec un `console.warn`
  pour signaler la config foireuse dans les logs Vercel.

---

## Conséquences

### Bénéfices (Option 1)

- ✅ UX claire : l'utilisateur comprend ce qui s'est passé et sait quoi faire.
- ✅ Effort minimal (2-3h), bundle commit unique.
- ✅ Aucune migration BDD, aucun changement schema utilisateur.
- ✅ Code mutualisable avec Option 2 (`parseHashError`, `normalizeSiteUrl`,
  page `/auth/error`).

### Limites (Option 1)

- ⚠️ La cause racine (scanner) persiste — l'utilisateur peut devoir redemander
  plusieurs liens. Acceptable pour MVP interne AlyoS (5-6 users connaissant
  le contexte), insupportable pour l'ouverture multi-clients Phase 2.

### Bénéfices (Option 2 à venir)

- ✅ Résout 100 % du problème scanner.
- ✅ Pattern UX standard (banques, services SaaS) — accepté par les users.
- ✅ Coexiste avec le flow lien (les users sans scanner agressif peuvent
  toujours utiliser le lien).

### Limites (Option 2)

- ⚠️ Refactor 2-3 jours — à planifier Gate 6 étape 6.
- ⚠️ Légère friction UX (copie-colle 6 chiffres).

### Conséquences techniques

- Modification de l'API publique de `src/lib/site-url.ts` : nouveau symbole
  exporté `normalizeSiteUrl` (utilisable côté tests + futures Server Actions
  qui voudraient une URL normalisée).
- Nouveau composant client `HashErrorHandler` à attacher partout où Supabase
  pourrait fallback (aujourd'hui : la home `/` ; potentiellement plus tard
  d'autres routes si on change la stratégie Site URL).
- Nouvelle route applicative `/auth/error` — à ajouter à la whitelist des
  routes publiques du middleware si pertinent (à vérifier ; en pratique
  l'erreur ne devrait pas exiger une session active).

---

## Alternatives rejetées

### Bypasser Supabase Email → envoyer le lien via Resend custom (Option 3 du brief)

**Pourquoi rejeté** : le scanner pré-clique TOUT lien dans le mail, peu
importe son émetteur. Resend ne change rien à la mécanique. Aurait juste
ajouté de la complexité templates sans bénéfice.

### Supprimer le flow recovery par email et imposer un reset manuel admin

**Pourquoi rejeté** : génère une charge ops disproportionnée pour Yann
(ps_operator) qui devrait re-bootstrap manuellement chaque user oublieux.
Pas scalable au-delà de 5-6 users.

### Tunnel signed URL avec one-time anti-replay token côté app

**Pourquoi rejeté** : reconstruit un mécanisme que Supabase Auth implémente
déjà — sauf que ça ne résout pas le scanner non plus (le scanner clique
quel que soit le mécanisme one-time).

---

## Trace post-incident

Voir aussi :
- `notes-de-suivi/CC_260514_*.md` (note de suivi détaillée de la session
  bug double-https + scanner + livraison Option 1).
- Spike technique Option 2 : confirmé que `admin.generateLink` renvoie
  `email_otp` exploitable (réponse REST top-level, wrapping SDK sous
  `properties.email_otp`).
