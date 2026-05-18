# ADR-011 — Stratégie d'auth face au scanner email d'entreprise

**Statut** : Acté Cowork 2026-05-14
**Date** : 2026-05-14
**Auteur** : [CTO Sophie] + [CEO Marc]
**Surclasse partiellement** : ADR-007 (auth email + mot de passe sur recovery flow uniquement)

---

## Contexte

Depuis le pivot magic-link → email+password (ADR-007), un autre piège est apparu en pratique sur le flow **« mot de passe oublié »** :

1. Utilisateur clique « Mot de passe oublié ? » sur `/login`
2. Resend envoie un email avec un lien de reset *(token Supabase recovery, usage unique, expiration 1h)*
3. Le scanner email d'entreprise AlyoS *(Microsoft Defender / Mimecast / SafeLinks)* **pré-clique automatiquement** le lien pour scanner sécu
4. Le token est consommé par le scanner
5. Quand l'utilisateur clique, Supabase répond `otp_expired` *(token déjà utilisé)*
6. L'utilisateur est redirigé vers la racine `/` avec `#error=access_denied&error_code=otp_expired` dans l'URL

**Le même piège que magic-link** (ADR-007 / décision 2026-05-10) — mais sur un autre flow.

→ Validé en pratique le 2026-05-14 : test mobile data *(bypass scanner)* fait passer le lien. Confirmation : scanner email d'entreprise.

## Décision

**Adopter une stratégie hybride en 3 couches** :

### Couche 1 — Connexion durable *(usage quotidien)*

**Email + mot de passe durable**, déjà acté ADR-007. **Inchangé.**

- Aucune dépendance à un lien email pour la connexion courante
- Session JWT 30 jours, refresh automatique
- Pas exposé au scanner email pour les logins quotidiens

### Couche 2 — Création de compte *(invitation admin)*

**Mot de passe provisoire envoyé en clair dans le mail**, déjà acté ADR-007. **Inchangé.**

- Pas de lien à cliquer = pas de token à consumer
- Le scanner peut « lire » le mail mais ne consume rien
- L'utilisateur lit le mot de passe + va sur `/login` manuellement et le saisit
- Expiration 24h (Q1/B Board)

### Couche 3 — Récupération *(« mot de passe oublié »)*

**Changement** : abandon du flow standard Supabase `resetPasswordForEmail()` qui envoie un **lien tokenisé** à usage unique *(consommable par le scanner)*.

**Nouveau flow recommandé** :

1. Utilisateur clique « Mot de passe oublié ? »
2. Côté serveur, la Server Action génère un **nouveau mot de passe provisoire** *(16 char URL-safe + 1 symbole)* via `supabase.auth.admin.updateUserById(userId, { password: <provisional>, user_metadata: { must_change_password: true } })`
3. Email Resend envoyé via le **même template D.9** *(welcome_provisional_password — réutilisation totale, pas de nouveau template)*
4. L'utilisateur reçoit le mot de passe en clair dans le mail
5. Il va sur `/login`, saisit son email + mot de passe provisoire
6. Force-redirect `/reset-password` *(must_change_password = true)*
7. Il choisit son mot de passe définitif

**Avantages** :
- ✅ Le scanner email peut « lire » mais ne consume rien *(pas de token, pas de lien)*
- ✅ Réutilise tout le pipeline existant *(template, validation, UI)*
- ✅ Cohérent avec le flow invitation admin *(même UX)*
- ✅ Pas de dépendance au flow Supabase Auth recovery
- ✅ Audit log standard *(`membership_change operation='password_reset'`)*

**Inconvénients** :
- ⚠️ Le mot de passe provisoire transite en clair par email *(intrinsèque au pattern, atténué par expiration 24h)*
- ⚠️ Le « bouton magique » disparait — l'utilisateur doit recopier le mot de passe au login *(friction +5 secondes)*
- ⚠️ Si quelqu'un d'autre lit le mail *(scanner anti-virus, archive, partage compte boîte)*, il pourrait théoriquement se connecter avant le user *(mais le force-change protège : à la première utilisation, le user choisit son propre mot de passe)*

### Couche bonus — Page d'erreur `/auth/error`

Pour les cas où l'utilisateur clique malgré tout sur un ancien lien recovery *(legacy, en cache, partagé)* :

- Détecter `#error=` dans l'URL côté frontend
- Rediriger automatiquement vers `/auth/error?reason=otp_expired`
- Afficher une UI claire : *« Le lien est expiré ou déjà utilisé. Demande un nouveau mot de passe ci-dessous. »* + bouton « Mot de passe oublié » qui pointe sur `/forgot-password`

→ Maquette M15 à produire par Théo.

## Conséquences

- ✅ Plus aucun lien tokenisé envoyé par email *(magic-link déjà éliminé ADR-007, recovery éliminé ici)*
- ✅ Cohérence du flow invitation et flow recovery *(même UX, même template, même server action variant)*
- ✅ Pas de dépendance résolveurs DNS scanner / pré-fetch
- ⚠️ Refacto Alex requis sur `forgot-password/actions.ts` *(remplacer `resetPasswordForEmail` par `updateUserById + sendWelcomeProvisionalPassword`)*
- ⚠️ La maquette M13 bis *(forgot-password)* reste valide visuellement mais le copy doit indiquer *« Tu vas recevoir un nouveau mot de passe par email »* au lieu de *« un lien de réinitialisation »*

## Alternatives rejetées

### A1 — Garder Supabase recovery + page `/auth/error`

- Pro : pas de refacto code
- Contra : le scanner continue à consumer les tokens → user reçoit un mail, clic = erreur → demande un nouveau → re-consume → boucle. UX intenable.

### A2 — Passer à OTP code 6 chiffres

- Pro : robuste, pas de lien
- Contra : refacto plus important *(UI saisie code, validation)*, divergence avec l'UX edifio Suivi *(qui utilise password)*

### A3 — Demander à l'IT AlyoS de whitelister Supabase

- Pro : laisse le flow standard
- Contra : long, fragile, dépendant de l'IT, pas scalable si AlyoS doit ajouter d'autres outils tokenisés

### A4 — Lien magic-link uniquement *(retour en arrière)*

- Pro : aucune saisie de mot de passe à long terme
- Contra : déjà éprouvé en échec côté scanner. Régression.

## Implications pour Alex

**Action immédiate** *(à intégrer dans la PR en cours `feat/auth-password-pivot` ou une PR follow-up immédiate)* :

1. Refacto `forgot-password/actions.ts` :
   ```ts
   // Remplacer :
   await supabase.auth.resetPasswordForEmail(email, { redirectTo });
   // Par :
   const tempPassword = generateProvisionalPassword();
   await supabase.auth.admin.updateUserById(userId, {
     password: tempPassword,
     user_metadata: { must_change_password: true, password_reset_at: now() }
   });
   await sendWelcomeProvisionalPassword(email, firstname, tempPassword);
   ```
2. Mettre à jour le template D.9 si nécessaire (sujet adapté quand c'est un reset vs une création)
3. Page `/auth/error` qui détecte les fragments d'erreur Supabase et propose de re-demander
4. Tests E2E : S4 du `plan_recette_gate7` à adapter au nouveau flow

**Action différée** *(Phase 2 si nécessaire)* :

- Implémenter le MFA TOTP optionnel pour les admins (déjà acté ADR-010 Q3)
- Évaluer une approche SSO Edifio si la fratrie unifie son auth

---

*ADR-011 acté côté Cowork. À intégrer par Alex en priorité haute dans la session courante.*
