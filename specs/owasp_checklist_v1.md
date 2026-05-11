# Checklist OWASP — edifio Sourcing v1.0

**Auteur** : [CTO Sophie Vasseur] + [CEO Marc]
**Date** : 2026-05-10
**Statut** : Préparation Gate 8 — à auditer formellement par [CTO] lors de la séance Gate 8
**Référentiel** : OWASP Top 10 (2021) + ASVS Level 2 sur les points critiques

---

## A01:2021 — Broken Access Control

| Contrôle | Implémentation edifio Sourcing | Statut prévu Gate 8 |
|----------|----------------------------|---------------------|
| Restriction d'accès au domaine `@alyosingenierie.fr` | Middleware Next.js `middleware.ts` (cf. `specs/middleware_domain_gate.md`) | ✅ à valider via E2E |
| RLS Postgres FORCE sur 100 % tables multi-tenant | `tenant_isolation` policy sur 20 tables (cf. `schema_v1.sql`) | ✅ à valider via pgTAP |
| RBAC `admin` / `user` / `viewer` | Enum `membership_role` + politiques RLS conditionnelles | ✅ à valider |
| Tokens JWT architectes 30 j révocables | Table `architect_tokens` + endpoint admin de révocation | ✅ à valider |
| Pas de bypass `service_role` côté app | FORCE RLS + revue de code | ⚠️ revue manuelle Gate 8 |
| Diffusion dossier par `user` → audit log + push admin | Conformité arbitrage Board Gate 2 (3/A) | ✅ à valider |

**Tests bloquants** : pgTAP cross-tenant denied · Playwright accès `@gmail.com` rejeté · check CI sur présence middleware.

---

## A02:2021 — Cryptographic Failures

| Contrôle | Implémentation | Statut |
|----------|----------------|--------|
| TLS 1.3 partout | Vercel + Supabase native | ✅ par défaut |
| HSTS header | À configurer dans `next.config.js` | ⚠️ à activer Gate 6 |
| Secrets API | Supabase Vault (org-scoped) | ✅ |
| Secrets en local | `.env.local` dans `.gitignore` | ✅ |
| Mots de passe en base | Pas applicable (Supabase Auth gère via magic-link) | ✅ |
| Chiffrement at-rest | Supabase native AES-256 | ✅ |
| JWT architecte | RS256 (signature asymétrique) | ⚠️ à valider implémentation |

**Action Gate 8** : audit `git log -p .env` pour vérifier qu'aucun secret n'a fui dans l'historique.

---

## A03:2021 — Injection

| Contrôle | Implémentation | Statut |
|----------|----------------|--------|
| ORM avec paramètres préparés | Drizzle ou Prisma (selon spike) | ✅ par défaut |
| Pas de SQL string concat | Revue de code | ⚠️ revue Gate 8 |
| Échappement XSS | React JSX auto-escape | ✅ par défaut |
| `dangerouslySetInnerHTML` | À auditer (proscrit sauf cas justifié) | ⚠️ grep + revue |
| Validation des inputs côté serveur | Zod sur toutes les API routes | ⚠️ à standardiser |
| Validation des prompts IA | Zod sur outputs Claude (cf. `ai_prompts_v1.md`) | ✅ |

**Action Gate 8** : `grep -r "dangerouslySetInnerHTML" src/` doit retourner zéro résultat ou des cas justifiés et commentés.

---

## A04:2021 — Insecure Design

| Contrôle | Implémentation | Statut |
|----------|----------------|--------|
| Threat model documenté | À écrire en Gate 8 | ⚠️ à produire |
| Rate limiting | Vercel Edge Middleware (100 req/min/IP public, 1000 req/min/user auth) | ⚠️ à implémenter Gate 6 |
| Quota IA par compte | 20 AO Studio inclus + 1,50 €/AO sup, alerte 80 % | ⚠️ à implémenter Gate 6 |
| Limites d'upload | 50 Mo max par fichier DCE | ⚠️ à configurer |
| Validation logique métier multi-step | Workflow guardé par état (status enum) | ✅ par design |

**Action Gate 8** : écrire un mini-threat-model (1 page) couvrant 5 scenarios d'attaque.

---

## A05:2021 — Security Misconfiguration

| Contrôle | Implémentation | Statut |
|----------|----------------|--------|
| Headers sécurité (CSP, X-Frame, Referrer-Policy) | À configurer dans `next.config.js` headers | ⚠️ Gate 6 |
| Désactiver `X-Powered-By` | Next.js : `poweredByHeader: false` | ⚠️ Gate 6 |
| Environnements séparés (preview vs prod) | 2 projets Supabase distincts (acté Gate 5) | ✅ |
| Versions à jour | Dependabot activé + `pnpm audit` à chaque PR | ⚠️ à configurer |
| Pas de stack trace en prod | Sentry capture, pas d'affichage utilisateur | ✅ par défaut Next.js |
| Robots.txt sur app fermé | Disallow / sur `/sourcing/*` | ⚠️ à activer Gate 7 |

**Action Gate 8** : audit avec `securityheaders.com` sur l'URL preview. Cible : note A minimum.

---

## A06:2021 — Vulnerable and Outdated Components

| Contrôle | Implémentation | Statut |
|----------|----------------|--------|
| `pnpm audit` à chaque ajout de dépendance | Convention équipe + CI bloquant si vulnérabilité critique | ⚠️ à automatiser |
| Dependabot GitHub | À activer dans Settings du repo | ⚠️ à activer |
| Veille CVE Next.js / Supabase SDK | Newsletter sécurité + check trimestriel | ⚠️ à instaurer |
| Pas de librairie tierce non auditée | Toute lib > 10k DL/sem ou requise pour MVP, sinon escalade CTO | ✅ politique posée |

**Action Gate 8** : exécution complète `pnpm audit --audit-level=moderate` → 0 résultat attendu.

---

## A07:2021 — Identification and Authentication Failures

| Contrôle | Implémentation | Statut |
|----------|----------------|--------|
| Magic-link Supabase Auth | Pas de mot de passe à gérer | ✅ |
| MFA admin obligatoire | À forcer côté Supabase pour les rôles `admin` | ⚠️ à activer |
| Timeout session | Refresh token Supabase 1h, session inactivity 30 jours | ✅ par défaut |
| Brute-force resistance | Magic-link rate-limité Supabase | ✅ |
| Pas d'énumération d'utilisateurs | Réponse identique connue/inconnue au magic-link | ✅ par défaut |

**Action Gate 8** : test E2E forcer MFA pour les comptes admin.

---

## A08:2021 — Software and Data Integrity Failures

| Contrôle | Implémentation | Statut |
|----------|----------------|--------|
| Signature commits Git | À recommander (pas obligatoire en MVP) | ⚠️ Phase 2 |
| Hash des fichiers DCE | À calculer pour audit log + détection corruption | ⚠️ Gate 6 si jugé utile |
| CI/CD pipeline sécurisé | GitHub Actions secrets + `permissions:` minimaux | ⚠️ Gate 6 |
| Pas de `eval()` ou équivalent | grep de revue | ✅ par défaut |
| Validation des webhooks Brevo | Signature HMAC à vérifier | ⚠️ Gate 6 |

**Action Gate 8** : vérifier que les webhooks `/api/webhooks/brevo` valident la signature HMAC.

---

## A09:2021 — Security Logging and Monitoring Failures

| Contrôle | Implémentation | Statut |
|----------|----------------|--------|
| Audit log immutable 13 actions | Table `audit_logs` + triggers (cf. `audit_log_v1.md`) | ✅ |
| Rétention 5 ans | Politique documentée | ✅ |
| Monitoring erreurs | Sentry à connecter (Gate 6) | ⚠️ Gate 6 |
| Monitoring perf | Vercel Analytics (gratuit) | ✅ |
| Logs Supabase | Logflare ou équivalent | ⚠️ à activer |
| Alertes sur événements critiques | Webhook Sentry vers email admin AlyoS | ⚠️ Gate 6 |

**Action Gate 8** : test que chaque action sensible déclenche bien un audit log (12 tests E2E).

---

## A10:2021 — Server-Side Request Forgery (SSRF)

| Contrôle | Implémentation | Statut |
|----------|----------------|--------|
| Validation URL avant scraping | Whitelist domaines BOAMP / PLACE / Francmarchés / MP.info | ⚠️ Gate 6 |
| Pas de fetch côté serveur depuis input utilisateur | Audit de code | ⚠️ revue Gate 8 |
| Container Fly.io isolé du réseau interne | Configuration réseau Fly.io | ✅ par défaut |
| Pas de proxy URL dans l'app | grep de revue | ✅ par défaut |

**Action Gate 8** : revue du code de scraping pour confirmer pas d'URL utilisateur en input.

---

## Récapitulatif statut prévu Gate 8

| Statut | Nb items | % |
|--------|----------|---|
| ✅ Conforme par défaut | 18 | 38 % |
| ⚠️ À implémenter ou auditer en Gate 6/7 | 27 | 56 % |
| ❌ Non couvert | 3 | 6 % |
| **Total** | **48** | **100 %** |

Les 3 non couverts (signature commits Git, hash fichiers DCE, threat model écrit) sont reportés Phase 2 ou jugés non bloquants MVP — à acter avec Board en clôture Gate 8.

---

## Tests bloquants Gate 8

1. **pgTAP cross-tenant** : un utilisateur org A ne peut JAMAIS lire/écrire org B
2. **Playwright middleware** : 6 tests selon `middleware_domain_gate.md`
3. **Audit log E2E** : 13 actions × 1 test = 13 tests
4. **Headers sécurité** : `securityheaders.com` note A
5. **`pnpm audit`** : 0 vulnérabilité high/critical
6. **Test RLS deny** : aucun INSERT/UPDATE/DELETE sur `audit_logs`

---

*Checklist à actualiser en début Gate 8 avec les conditions réelles. Conditions bloquantes à acter avec Board.*
