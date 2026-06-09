# Changelog

Toutes les modifications notables d'edifio Sourcing sont consignées dans ce fichier.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased] — Migrations 0050-0053 — 10 juin 2026

### Added
- Apprentissage par écartement (Salve U) : 6 motifs structurés + suggestions auto
- Page `/no-org` pour utilisateurs sans organisation
- Monitoring cron sourcing-run avec mail alert si KO
- 4 functions SECURITY DEFINER pour le flow cotraitant
- Tests E2E Playwright multi-org (14 specs)

### Changed
- Helper Supabase `createSupabaseServerClient` devient async (alignement monorepo)
- Helper `getRequiredOrgId` throw si pas de membership (sécurité)
- Refactor RLS sur 3 tables avec FORCE + helper `public.current_user_org_id()`

### Removed
- Filtre domaine `@alyosingenierie.fr` (ADR-014, ouverture multi-org)
- Policies anon publiques `cotraitant_shares_select_public` (sécurité)
- Fallback `ALYOS_ORG_ID` dans 29 pages Server Components

### Security
- Vulnérabilité CC-2 corrigée (fallback ALYOS_ORG_ID)
- RLS forced sur companies, bureaux_etudes, cotraitant_shares, cotraitant_share_items
- Bombe à retardement cotraitant_shares_select_public éradiquée

### Tech
- Migrations Drizzle : 0050 + 0051 + 0052 + 0053 (4 migrations)
- Tests vitest : 1268/1268 verts
- Husky : pre-commit léger + pre-push strict (résout bug git switch)
