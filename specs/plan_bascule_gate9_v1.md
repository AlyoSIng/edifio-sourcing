# Plan de bascule Gate 9 — edifio Sourcing v1.0

**Auteur** : [CEO Marc] + [CTO Sophie]
**Date** : 2026-05-10
**Statut** : Préparation Gate 9 — à exécuter en clôture de Gate 8 avec validation Board explicite
**Responsable bascule** : [CEO Marc] (décision finale), assisté de [CTO Sophie] (exécution technique) et [PS_OPERATOR Yann] (commandes Vercel/Supabase)

---

## 1. Vue d'ensemble

| Item | Valeur |
|------|--------|
| Type de bascule | First go-live, application interne AlyoS, utilisateurs : ~5-10 collaborateurs |
| Fenêtre cible | Mardi matin 10h-12h (faible trafic AO, équipe disponible toute la journée pour support) |
| Durée prévisionnelle | ~30 min côté technique + 1h démo interne + reste de la journée en astreinte |
| Réversibilité | Élevée — Vercel rollback en 1 clic, Supabase PITR 7 jours |
| Risque résiduel | Faible (audience restreinte, pas de SLA contractuel, pas de paiements traités) |

---

## 2. Pré-flight checks — Critères GO / NO-GO

**Tous les items ci-dessous doivent être ✅ pour passer en GO.** Un seul ❌ = NO-GO, on reprogramme.

### 2.1. Code & build

| # | Critère | Validation |
|---|---------|------------|
| 1 | Branche `main` à jour sur GitHub | `git status` clean |
| 2 | Tous les tests CI passent (unit + RLS pgTAP + Playwright E2E des 3 parcours) | GitHub Actions vert |
| 3 | Build production Vercel sans warning bloquant | Vercel deploy logs |
| 4 | Bundle size < 500 Ko gzip JavaScript initial | Vercel Analytics |
| 5 | Aucune dépendance avec vulnérabilité high/critical | `pnpm audit` propre |
| 6 | Aucun secret dans le diff `git log -p` des 100 derniers commits | grep `sk-`, `eyJ`, `re_`, `xkeysib` |

### 2.2. Sécurité

| # | Critère | Validation |
|---|---------|------------|
| 7 | Middleware `@alyosingenierie.fr` actif sur preview | Test manuel + test E2E |
| 8 | Email hors-domaine rejeté → page `/forbidden` | Playwright test passant |
| 9 | RLS Postgres FORCE sur 100 % tables multi-tenant | pgTAP cross-tenant denied |
| 10 | Audit log fonctionnel pour les 13 actions | Test E2E couvrant |
| 11 | CSP strict appliqué | `securityheaders.com` note A min |
| 12 | HTTPS / HSTS / X-Frame DENY confirmé | curl -I |
| 13 | MFA admin obligatoire | Supabase Auth setting |
| 14 | Audit OWASP des 48 contrôles : ≥ 45 ✅ | Référentiel `owasp_checklist_v1.md` |

### 2.3. RGPD & légal

| # | Critère | Validation |
|---|---------|------------|
| 15 | 6 DPA sous-traitants signés (Supabase, Vercel, Fly.io, Brevo, Resend, Anthropic) | Archive contractuelle AlyoS |
| 16 | Page `/legal` publiée et accessible | Test manuel |
| 17 | Mentions légales complétées (SIREN, adresse, DPO) | Revue [CEO] |
| 18 | Footer désinscription présent sur les 8 templates Brevo | Test envoi réel |
| 19 | Endpoint admin RGPD (export + erase) fonctionnel | Test E2E |

### 2.4. Infrastructure

| # | Critère | Validation |
|---|---------|------------|
| 20 | Projet Supabase `edifio-sourcing-prod` créé + plan Pro activé | Console Supabase |
| 21 | Migrations BDD appliquées sur prod | `supabase migration list` |
| 22 | Variables d'env Vercel `production` toutes renseignées | Console Vercel |
| 23 | Container Fly.io EU déployé et health OK | `fly status` |
| 24 | Sentry DSN configuré + premier test d'erreur capturé | Console Sentry |
| 25 | Backups quotidiens OVH Object Storage opérationnels | Test restauration ponctuelle |
| 26 | DNS prêt si custom domain (Gate 7 décision) | OVH zone DNS |

### 2.5. Comm & support

| # | Critère | Validation |
|---|---------|------------|
| 27 | Plan de comm interne Gate 9 lancé à J-7 | Mail Léa envoyé |
| 28 | Démo interne Gate 9 programmée | Invitation calendrier |
| 29 | Guide utilisateur 1 page publié (PDF + version web) | Lien public |
| 30 | Astreinte technique Alex + Yann confirmée J0 + J+1 | Engagement écrit |
| 31 | Canal Slack `#edifio-sourcing-retours` ouvert | Test message |
| 32 | Email `dpo@alyosingenierie.fr` actif | Test envoi/réception |

**Décision GO** : 32/32 critères ✅ → CEO + CTO signent l'avis GO. Board (TEISSIER) valide explicitement par message Cowork.

**Décision NO-GO** : tout critère ❌ déclenche le report + plan de remédiation. Pas de bascule sous pression de calendrier.

---

## 3. Procédure de bascule J0

### Étape 1 (T-15 min) — Annonce de bascule

[CEO] envoie un message dans Slack/Teams AlyoS :

> *« Démarrage bascule edifio Sourcing dans 15 minutes. Astreinte tech assurée par Alex et Yann. Si vous avez une question, vous pouvez me joindre directement. À tout de suite pour la démo dans la salle. »*

### Étape 2 (T0) — Promotion preview → production sur Vercel

[PS_OPERATOR Yann] exécute :

```powershell
cd C:\Dev\edifio-sourcing
git checkout main
git pull origin main

# Vérifier que c'est bien la branche main, pas une feature branch
git status

# Promote la dernière build preview vers production
vercel --prod
# OU via interface web : Vercel Dashboard → Deployments → Promote to Production
```

→ Attendre la confirmation Vercel (~ 2 min). URL prod active.

### Étape 3 (T+5 min) — Smoke tests prod

[CTO Sophie] exécute le checklist :

```
☐ Page d'accueil charge en < 3 s
☐ Login avec un compte @alyosingenierie.fr fonctionne (magic-link reçu)
☐ Login avec un compte @gmail.com rejeté → /forbidden
☐ Création d'un profil de recherche fonctionne
☐ Insertion d'un AO de test fonctionne (script SQL ou UI)
☐ Sélection en Solo → opportunité Odoo créée (si Odoo connecté) OU log présent
☐ Envoi d'un mail de test via Brevo (sandbox)
☐ Notification push PWA reçue sur 1 téléphone test
☐ Audit log présent dans Supabase (vérifier `select * from audit_logs limit 5`)
```

Tous les items ✅ → on continue. Un seul ❌ critique → ROLLBACK (cf. § 4).

### Étape 4 (T+15 min) — Activation du cron sourcing

[DEV Alex] :

```powershell
# Activer le cron job Supabase / Vercel pour le sourcing quotidien
# (à HH:MM Europe/Paris configuré dans le profil par défaut)
```

→ Vérifier dans les logs que le cron est armé pour le lendemain matin 6h30.

### Étape 5 (T+20 min) — Annonce go-live

[CEO] envoie l'email de go-live (cf. `plan_comm_interne_gate9_v1.md` § J0).

### Étape 6 (T+30 min) — Démo interne

[CMO Léa] + [CEO Marc] animent la démo 1h en salle.

### Étape 7 (T+90 min) — Création des comptes utilisateurs

Pendant la démo, Léa lance la création des comptes pour chaque collaborateur AlyoS présent. Test de connexion en direct.

### Étape 8 (Toute la journée) — Astreinte active

Alex + Yann disponibles sur Slack. Léa fait le tour des bureaux dans l'après-midi pour s'assurer que personne n'est bloqué.

---

## 4. Plan de rollback

### Critères de déclenchement

ROLLBACK IMMÉDIAT si :
- App ne charge pas en production (500 / 502 / 504 persistants > 5 min)
- Login impossible pour tous les utilisateurs AlyoS testés
- Faille de sécurité avérée (middleware désactivé, données cross-tenant visibles)
- Perte de données détectée

ROLLBACK PROGRAMMÉ (dans la journée) si :
- Bug fonctionnel bloquant sur un parcours-clé sans contournement
- Performance dégradée majeure (LCP > 8 s persistant)
- Dépassement infrastructure non maîtrisé (alerte Anthropic 100 € en 1h, etc.)

### Procédure de rollback Vercel

```powershell
# Option 1 — via Dashboard Vercel (recommandé)
# Vercel Dashboard → edifio-sourcing → Deployments → Click sur l'avant-dernier deploy
# → 3 dots menu → "Promote to Production"

# Option 2 — via CLI
vercel rollback
# Sélectionner le déploiement cible dans la liste
```

→ Bascule effective en < 1 min. URL prod redirige vers l'ancien déploiement.

### Procédure de rollback BDD

Si bug lié à une migration :

```bash
# Restore depuis PITR Supabase (au plus tard avant le déploiement problématique)
# Dashboard Supabase → Database → Backups → Point in Time Recovery
# Sélectionner timestamp avant la bascule → Restore
```

→ ⚠️ Recovery PITR = downtime ~10-30 min. À utiliser **seulement** si nécessaire.

### Procédure de rollback Vault / secrets

Si une clé API a fuité accidentellement avec le déploiement :

1. **Révoquer immédiatement** la clé compromise dans la console du service
2. **Générer une nouvelle clé**
3. Mettre à jour Vercel Environment Variables (Production)
4. **Re-deploy** avec les nouvelles clés
5. Audit log + entrée dans `DECISIONS.md`

### Communication en cas de rollback

[CEO] envoie un message direct dans Slack/Teams AlyoS :

> *« Petit souci détecté sur edifio Sourcing en prod. On bascule sur la version précédente pour réinvestiguer. Aucune donnée perdue. On vous tient au courant dans l'heure. »*

Transparence totale. Pas de tentative de masquer l'incident.

---

## 5. Plan de support intensif J+1 à J+7

### Astreinte renforcée

- **J+1 (lendemain go-live)** : Alex + Yann disponibles 8h-19h sur Slack. Premier digest sourcing à 6h30 (vérifié par Léa à 9h).
- **J+2 à J+7** : Alex disponible en mode normal (8h-18h, réponse < 4h). Yann en backup.

### Tableau de bord de monitoring

À ouvrir et surveiller chaque matin J+1 à J+7 :

| Surface | À vérifier |
|---------|------------|
| Vercel Analytics | LCP, FCP, taux d'erreur |
| Sentry | Erreurs nouvelles, fréquence |
| Supabase | Connexions, requêtes lentes |
| Brevo / Resend | Taux de delivery, bounces |
| Anthropic console | Coût quotidien |
| Fly.io | Container health, mémoire |

### Indicateurs alertes

| Métrique | Seuil alerte | Action |
|----------|--------------|--------|
| Taux d'erreur > 1 % | Sentry alert | Investigation immédiate |
| LCP > 4 s sur 5 min | Vercel alert | Investigation perf |
| Cron sourcing échoue 2 jours de suite | Manual check Léa | Escalade Alex |
| Coût Anthropic > 5 €/jour | Console alert | Investigation usage |
| Disponibilité < 99 % sur 24h | Manual check | Investigation infra |

### Retour utilisateur

Léa fait un tour de bureau jour par jour (J+1 → J+3), puis hebdomadaire. Note les retours dans un doc partagé. Tickets bugs dans GitHub Issues du repo.

---

## 6. Bilan formel J+30

Cf. `plan_comm_interne_gate9_v1.md` § J+30. Présentation des KPIs réels vs les cibles Gate 1, témoignages, prochaines évolutions priorisées.

---

## 7. Signature finale Gate 9

| Rôle | Validation requise |
|------|---------------------|
| [CTO] Sophie | Pré-flight 1-14 (code + sécu) |
| [CEO] Marc | Pré-flight 15-32 (légal + comm + support) |
| [BOARD] TEISSIER | Décision finale GO sur message Cowork explicite |

Aucune bascule sans les 3 signatures.

---

*Plan figé. Toute modification de procédure passe par revue [CTO + CEO] et acceptation Board.*
