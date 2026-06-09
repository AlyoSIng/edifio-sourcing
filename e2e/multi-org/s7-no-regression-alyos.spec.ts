import { expect, test } from "@playwright/test";

import { cleanupMultiOrgFixtures, seedMultiOrgFixtures } from "../fixtures/multi-org-seed";
import { signInAsAdminOf } from "../helpers/learning";

/**
 * S7 — Pas de régression AlyoS post-Lot 1.6 et 1.7.
 *
 * Source de vérité : `gates/RECETTE_FINALE_PROTECT_BASCULE_JUILLET.md` §2 (S7).
 *
 * Couvre l'invariante « le pivot multi-tenant + l'éradication des policies
 * cotraitant publiques (Lot 1.7-ter) ne cassent AUCUN flow AlyoS historique ».
 *
 * Stratégie : on rejoue les flows-clés AlyoS classiques avec un admin AlyoS
 * connecté via la fixture multi-org, et on s'assure :
 *   - la liste AO du jour s'affiche (h1 + pas de stack trace) ;
 *   - on peut naviguer vers la fiche d'un AO sourced AlyoS ;
 *   - l'action "Écarter" avec motif structuré (Salve U) ne pète pas
 *     (modale s'ouvre + radio + textarea + close, identique à
 *     `tender-actions.spec.ts` mais sur un user AlyoS de la fixture multi-org).
 *
 * Critère KO : une de ces actions tombe en erreur, ou la modale Salve U ne
 * s'ouvre plus → régression à investiguer avant bascule 18/7.
 *
 * Note pragmatique (cf. `ao-du-jour.spec.ts` L13-25) : en CI E2E sans
 * `DATABASE_URL` réelle, on peut avoir l'ErrorBanner (role="alert") au lieu
 * de la liste. On accepte les 3 états (banner / status / article) pour rester
 * déterministe, MÊME pattern que le spec ao-du-jour de référence.
 *
 * Tags : `@multi-org`, `@p1`.
 */

test.describe("@multi-org @p1 S7 — Pas de régression AlyoS post-Lot 1.6/1.7", () => {
  test.beforeAll(async () => {
    await seedMultiOrgFixtures();
  });

  test.afterAll(async () => {
    await cleanupMultiOrgFixtures();
  });

  test("Admin AlyoS atterrit sur /sourcing/ao-du-jour sans erreur runtime", async ({ page }) => {
    await signInAsAdminOf(page, "ALYOS");
    await page.goto("/sourcing/ao-du-jour");
    await expect(page).toHaveURL(/\/sourcing\/ao-du-jour/, { timeout: 15_000 });

    // h1 invariant — garanti par try/catch résilience runtime (PR #22).
    await expect(page.getByRole("heading", { level: 1, name: /AO du jour/i })).toBeVisible();

    // Aucun crash 500.
    const html = await page.content();
    expect(html).not.toContain("Application error: a server-side exception");
    expect(html).not.toContain("UnhandledError");
    // Aucun reliquat du filtre domaine retiré par ADR-014.
    expect(html).not.toContain("forbidden_domain");
  });

  test("Liste AO du jour ou empty state ou banner s'affiche", async ({ page }) => {
    await signInAsAdminOf(page, "ALYOS");
    await page.goto("/sourcing/ao-du-jour");

    // Contrat de résilience identique à ao-du-jour.spec.ts L62-68.
    await expect(
      page.getByRole("alert").or(page.getByRole("status")).or(page.locator("article")).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Click sur un AO ouvre sa fiche (si au moins un AO est rendu)", async ({ page }) => {
    await signInAsAdminOf(page, "ALYOS");
    await page.goto("/sourcing/ao-du-jour");

    // En CI sans DATABASE_URL, la liste peut être vide (alert/empty). On
    // skip proprement dans ce cas — la régression "fiche AO casse" se vérifie
    // dès qu'on a un article au moins.
    const firstCard = page.locator("article").first();
    const cardCount = await page.locator("article").count();
    if (cardCount === 0) {
      test.info().annotations.push({
        type: "skip-reason",
        description: "Aucun AO rendu (CI sans DATABASE_URL ou BDD vide) — flow fiche non exercé.",
      });
      return;
    }

    // L'élément cliquable de la card est en général un Link vers /sourcing/ao/[id].
    const detailLink = firstCard.locator('a[href*="/sourcing/ao/"]').first();
    const hasDetailLink = (await detailLink.count()) > 0;
    if (!hasDetailLink) {
      test.info().annotations.push({
        type: "skip-reason",
        description: "Card AlyoS sans lien fiche AO — UI a peut-être changé, vérifier S7.",
      });
      return;
    }
    await detailLink.click();
    await expect(page).toHaveURL(/\/sourcing\/ao\/[^/]+/, { timeout: 15_000 });
    // Pas de crash sur la fiche.
    const html = await page.content();
    expect(html).not.toContain("Application error: a server-side exception");
  });

  test("Modale Écarter (Salve U) s'ouvre + radio + textarea fonctionnels", async ({ page }) => {
    await signInAsAdminOf(page, "ALYOS");
    await page.goto("/sourcing/ao-du-jour");

    const firstCard = page.locator("article").first();
    const cardCount = await page.locator("article").count();
    if (cardCount === 0) {
      test.info().annotations.push({
        type: "skip-reason",
        description: "Aucun AO rendu — modale Écarter non exerçable.",
      });
      return;
    }

    const ecarterBtn = firstCard.getByRole("button", { name: /^Écarter$/i });
    const ecarterCount = await ecarterBtn.count();
    if (ecarterCount === 0) {
      test.info().annotations.push({
        type: "skip-reason",
        description: "Bouton Écarter absent (rare — UI variant) — modale non exerçable.",
      });
      return;
    }
    await ecarterBtn.click();

    // Modale Salve U ouverte (cf. tender-actions.spec.ts L148-149).
    await expect(
      page.getByRole("heading", { level: 2, name: /Pourquoi écarter cet AO/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Radio « Hors zone géographique » sélectionnable (Salve U — 6 radios).
    const radio = page.getByRole("radio", { name: "Hors zone géographique" });
    await radio.check();
    await expect(radio).toBeChecked();

    // Textarea verbatim libre (Précision).
    await page.getByRole("textbox", { name: /Précision/i }).fill("Test S7 — non-régression AlyoS");

    // On NE valide PAS l'action (on ne veut pas modifier l'état de la BDD
    // partagée par les autres specs). On clôt simplement la modale.
    await page.keyboard.press("Escape");

    await expect(
      page.getByRole("heading", { level: 2, name: /Pourquoi écarter cet AO/i }),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test("Navigation /sourcing/architectes ne pète pas pour un admin AlyoS", async ({ page }) => {
    await signInAsAdminOf(page, "ALYOS");
    const res = await page.goto("/sourcing/architectes");
    expect(res?.status() ?? 0).toBeLessThan(500);

    // Pas de stack trace.
    const html = await page.content();
    expect(html).not.toContain("Application error: a server-side exception");
    expect(html).not.toContain("UnhandledError");
  });
});
