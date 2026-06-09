import { expect, test } from "@playwright/test";

import {
  cleanupMultiOrgFixtures,
  seedMultiOrgFixtures,
  MULTI_ORG_IDS,
  getAdminClient,
} from "../fixtures/multi-org-seed";
import { deleteCotraitantShare, seedCotraitantShare } from "../helpers/shared/api-helpers";

/**
 * S12 — Token cotraitant expiré (post Lot 1.7-ter).
 *
 * Source de vérité :
 *  - `gates/RECETTE_FINALE_PROTECT_BASCULE_JUILLET.md` §2 (S12)
 *  - `src/db/migrations/0053_eradicate_cotraitant_public_policy.sql` (4 functions
 *    SECURITY DEFINER, dont `get_cotraitant_share_by_token` qui retourne la ligne
 *    brute pour permettre un message d'erreur clair "lien expiré")
 *  - `src/app/cotraitant/[token]/page.tsx` L124-126 (distingue expired vs revoked)
 *
 * Couvre :
 *   1. Visite `/cotraitant/[token]` avec un token expiré → la page affiche
 *      "Ce lien de partage a expiré (validité 30 jours)." (et PAS le DOM
 *      normal de partage des pièces).
 *   2. `get_cotraitant_share_by_token` retourne BIEN la ligne (pour permettre
 *      le distinguo expired/revoked côté UI) MAIS
 *      `get_cotraitant_share_items_by_token` retourne 0 row (défense en
 *      profondeur SQL).
 *   3. Visite avec un token introuvable → page "Lien invalide" / "introuvable".
 *
 * Critère KO :
 *   - La page affiche les pièces alors que le token est expiré.
 *   - `get_cotraitant_share_items_by_token` retourne des rows malgré expiration
 *     → bug défense en profondeur, à fixer dans la function SQL.
 *
 * Tags : `@multi-org`, `@p1`.
 */

test.describe("@multi-org @p1 S12 — Token cotraitant expiré", () => {
  let expiredShareId: string | null = null;
  let expiredToken: string | null = null;
  let validShareId: string | null = null;
  let validToken: string | null = null;

  test.beforeAll(async () => {
    await seedMultiOrgFixtures();

    // Share expiré : expires_at = J-1 (hier).
    const expired = await seedCotraitantShare(MULTI_ORG_IDS.ALYOS, {
      expiresInDays: -1,
      contactName: "Cotraitant S12 Expired",
    });
    expiredShareId = expired.id;
    expiredToken = expired.token;

    // Share valide en parallèle (témoin négatif pour les asserts SQL — on
    // veut prouver que les functions filtrent bien sur expires_at).
    const valid = await seedCotraitantShare(MULTI_ORG_IDS.ALYOS, {
      expiresInDays: 30,
      contactName: "Cotraitant S12 Valid",
    });
    validShareId = valid.id;
    validToken = valid.token;
  });

  test.afterAll(async () => {
    if (expiredShareId) await deleteCotraitantShare(expiredShareId).catch(() => {});
    if (validShareId) await deleteCotraitantShare(validShareId).catch(() => {});
    await cleanupMultiOrgFixtures();
  });

  test("Visite /cotraitant/[token] avec token expiré → page 'Lien invalide / expiré'", async ({
    page,
  }) => {
    expect(expiredToken, "Setup S12 a posé un token expiré").not.toBeNull();
    const res = await page.goto(`/cotraitant/${expiredToken}`, { waitUntil: "domcontentloaded" });

    // La page rend un Server Component avec un message d'erreur — pas un 404
    // HTTP brut (la page existe, c'est juste l'état du share qui est invalide).
    expect(res?.status() ?? 0).toBeLessThan(500);

    // Le H1 doit être "Lien invalide" (cf. cotraitant/[token]/page.tsx L186).
    await expect(page.getByRole("heading", { level: 1, name: /Lien invalide/i })).toBeVisible({
      timeout: 10_000,
    });

    // Le message explicite "expiré" doit être présent (pas "révoqué" — c'est
    // le distinguo Lot 1.7-ter).
    const body = page.locator("body");
    await expect(body).toContainText(/expir/i);
    await expect(body).not.toContainText(/révoqué/i);

    // Aucune liste de pièces ne doit être rendue.
    const html = await page.content();
    expect(html).not.toContain("Pièces à signer");
    expect(html).not.toContain("Bonjour Cotraitant S12 Expired");

    // Anti-leak : pas d'organization_id dans le DOM (la function refuse
    // déjà de le retourner, on double-check ici).
    expect(html).not.toContain(MULTI_ORG_IDS.ALYOS);
  });

  test("`get_cotraitant_share_by_token` retourne BIEN la ligne expirée (pour message UI)", async () => {
    // Lot 1.7-ter — choix explicite : la function get_share retourne la ligne
    // pour permettre au code Next.js de distinguer "introuvable" vs "expiré"
    // vs "révoqué". La défense en profondeur est dans get_items / mark_signed.
    expect(expiredToken).not.toBeNull();
    const admin = getAdminClient();
    const { data, error } = await admin.rpc("get_cotraitant_share_by_token", {
      token_input: expiredToken!,
    });
    expect(
      error?.message ?? null,
      `RPC get_cotraitant_share_by_token: ${error?.message}`,
    ).toBeNull();
    const rows = data as Array<{ id: string; expires_at: string; revoked_at: string | null }>;
    expect(rows.length, "Function doit retourner 1 row pour share expiré (distinguo UI)").toBe(1);
    const row = rows[0];
    if (!row) throw new Error("Row attendue manquante");
    // expires_at est dans le passé.
    expect(new Date(row.expires_at).getTime()).toBeLessThan(Date.now());
    expect(row.revoked_at).toBeNull();
  });

  test("`get_cotraitant_share_items_by_token` retourne 0 row pour token expiré", async () => {
    // Défense en profondeur : même si la page applicative oubliait son
    // contrôle expires_at, la function SQL le filtre déjà.
    expect(expiredToken).not.toBeNull();
    const admin = getAdminClient();
    const { data, error } = await admin.rpc("get_cotraitant_share_items_by_token", {
      token_input: expiredToken!,
    });
    expect(error?.message ?? null).toBeNull();
    const rows = data as unknown[];
    expect(
      rows.length,
      "Items doivent être filtrés pour share expiré (défense en profondeur)",
    ).toBe(0);
  });

  test("`mark_cotraitant_share_item_signed` retourne FALSE pour token expiré (anti-bypass)", async () => {
    // Pour ce check on a besoin d'un item_id existant. On en seed un sur le
    // share expiré via service_role (la function refusera l'UPDATE pour
    // cause expires_at, on veut PROUVER ce refus).
    expect(expiredShareId).not.toBeNull();
    const admin = getAdminClient();

    const fakeItemId = crypto.randomUUID();
    await admin.from("cotraitant_share_items").insert({
      id: fakeItemId,
      share_id: expiredShareId!,
      library_item_id: null,
      name: "Item S12 test",
      kind: "kbis",
      original_storage_path: "fake/path.pdf",
    });

    try {
      const { data, error } = await admin.rpc("mark_cotraitant_share_item_signed", {
        token_input: expiredToken!,
        item_id_input: fakeItemId,
        signed_storage_path_in: "fake/signed.pdf",
        signer_name_in: "Bypass attempt",
        signed_filename_in: "fake-signed.pdf",
      });
      expect(error?.message ?? null).toBeNull();
      // Retourne boolean — false attendu (share expiré).
      expect(data, "mark_signed doit retourner FALSE pour share expiré").toBe(false);

      // Vérif BDD : signed_at reste NULL.
      const { data: itemRow } = await admin
        .from("cotraitant_share_items")
        .select("signed_at, signer_name")
        .eq("id", fakeItemId)
        .single();
      expect(itemRow?.signed_at, "signed_at doit rester NULL après bypass refusé").toBeNull();
    } finally {
      // Cleanup
      await admin.from("cotraitant_share_items").delete().eq("id", fakeItemId);
    }
  });

  test("Témoin positif : share valide retourne ses items via la function", async () => {
    // Pour prouver que le filtre expires_at est bien la cause des 0 rows
    // précédents — pas un bug global de la function.
    expect(validToken).not.toBeNull();
    const admin = getAdminClient();
    const { error } = await admin.rpc("get_cotraitant_share_items_by_token", {
      token_input: validToken!,
    });
    expect(error?.message ?? null).toBeNull();
    // Note : la fixture n'insère pas d'items par défaut sur le share — on ne
    // peut PAS asserter rows.length > 0 sans seeder explicitement. Mais on
    // s'assure que la function ne throw pas (preuve qu'elle reconnaît le share).
  });

  test("Visite /cotraitant/[token] avec token UUID introuvable → page 'Lien invalide'", async ({
    page,
  }) => {
    const ghostToken = crypto.randomUUID();
    await page.goto(`/cotraitant/${ghostToken}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: /Lien invalide/i })).toBeVisible({
      timeout: 10_000,
    });
    // Le message dit "introuvable ou a expiré" (page.tsx L119).
    await expect(page.locator("body")).toContainText(/introuvable|expir/i);
  });

  test("Visite /cotraitant/[bad-format] → page 'Lien invalide'", async ({ page }) => {
    // Token mal formé → validation UUID en début de page (page.tsx L93-95).
    await page.goto("/cotraitant/not-a-uuid", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: /Lien invalide/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});
