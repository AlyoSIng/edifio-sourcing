# Lanceur E2E local avec les env vars nécessaires.
#
# Usage :
#   .\scripts\e2e-local.ps1                          # lance toute la suite E2E
#   .\scripts\e2e-local.ps1 e2e/sidebar-mobile.spec.ts  # lance un spec ciblé
#
# Pose :
#   - DATABASE_URL → postgres local (5433) — JAMAIS la BDD prod Supabase.
#   - E2E_TEST_ROUTES_ENABLED=1 → active /api/test/seed-session (triple-gate).
#
# Prérequis :
#   - docker container `edifio-pg-dry` (postgres:15) tourne sur 5433
#   - migrations appliquées sur ce postgres (sinon les pages /sourcing/*
#     renderont l'ErrorBanner, mais les tests sidebar mobile passent quand
#     même car ils n'exigent que le rendu du <h1>).
#
# Created 2026-05-25 dans le cadre PR #42 (sidebar mobile hamburger).

param(
  [Parameter(ValueFromRemainingArguments=$true)]
  [string[]]$Args
)

$env:DATABASE_URL = "postgres://postgres:postgres@localhost:5433/postgres"
$env:E2E_TEST_ROUTES_ENABLED = "1"

# On délègue à playwright via le binaire local (pnpm/corepack cassés, cf. MEMORY).
& "$PSScriptRoot\..\node_modules\.bin\playwright.cmd" test @Args
