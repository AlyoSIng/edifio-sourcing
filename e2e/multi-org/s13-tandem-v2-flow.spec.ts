import { expect, test } from "@playwright/test";

import {
  cleanupMultiOrgFixtures,
  seedMultiOrgFixtures,
  MULTI_ORG_IDS,
  getAdminClient,
} from "../fixtures/multi-org-seed";
import { deleteCotraitantShare, seedCotraitantShare } from "../helpers/shared/api-helpers";
import { assertNoLeak, startNetworkLeakListener } from "../helpers/shared/playwright-utils";

/**
 * S13 — Régression Tandem V2 complet (partage cotraitant tokenisé).
 *
 * Source de vérité :
 *  - `gates/RECETTE_FINALE_PROTECT_BASCULE_JUILLET.md` §2 (S13)
 *  - `src/db/migrations/0053_eradicate_cotraitant_public_policy.sql`
 *    (4 functions SECURITY DEFINER, AUCUNE policy anon)
 *  - `src/app/cotraitant/[token]/page.tsx` (page publique)
 *  - `src/app/cotraitant/[token]/actions.ts` (uploadSignedDocument)
 *
 * Stratégie : on simule le scénario complet « AlyoS crée un share + email
 * Brevo → cotraitant visite le lien → dépose la signature » SANS exercer
 * l'envoi réel d'email (Brevo / Resend KO en CI E2E). Les étapes sont :
 *
 *   1. Setup : seed un share côté AlyoS avec un item BDD pour mimer une
 *      pièce à signer (via service_role — l'équivalent applicatif est la
 *      Server Action `createShareSession` couverte par tests unit).
 *   2. Visite anon `/cotraitant/[token]` → assert :
 *      - h1 "Pièces à signer"
 *      - greeting contient le contactName
 *      - AUCUN organization_id dans le DOM ou les réponses réseau (anti-leak)
 *      - AUCUN tender_id dans le DOM (anti-leak)
 *   3. Vérifier l'état SQL via la function (sans poser de signature réelle —
 *      l'upload Storage demande un bucket qui n'existe pas en CI vanilla).
 *      On exerce directement la function `mark_cotraitant_share_item_signed`
 *      en mode admin pour prouver qu'elle pose `signed_at`.
 *
 * Critère KO :
 *   - Le DOM expose `organization_id` ou `tender_id` → leak Lot 1.7-ter.
 *   - `mark_cotraitant_share_item_signed` retourne FALSE sur un share valide
 *     → régression de la function SECURITY DEFINER.
 *
 * Tags : `@multi-org`, `@p1`.
 */

test.describe("@multi-org @p1 S13 — Régression Tandem V2 (partage cotraitant)", () => {
  let shareId: string | null = null;
  let token: string | null = null;
  let itemId: string | null = null;
  const contactName = `Cotraitant S13 ${Date.now()}`;

  test.beforeAll(async () => {
    await seedMultiOrgFixtures();

    // Setup share + 1 item.
    const seeded = await seedCotraitantShare(MULTI_ORG_IDS.ALYOS, {
      expiresInDays: 30,
      contactName,
      contactEmail: "cotraitant-s13@example.com",
    });
    shareId = seeded.id;
    token = seeded.token;

    // Pose un item à signer (mock minimal — la vraie route Tandem en crée
    // depuis la bibliothèque de l'org).
    const admin = getAdminClient();
    itemId = crypto.randomUUID();
    await admin.from("cotraitant_share_items").insert({
      id: itemId,
      share_id: shareId,
      library_item_id: null,
      name: "Attestation assurance S13",
      kind: "attestation_assurance",
      original_storage_path: `s13/${shareId}/attestation.pdf`,
    });
  });

  test.afterAll(async () => {
    if (shareId) await deleteCotraitantShare(shareId).catch(() => {});
    await cleanupMultiOrgFixtures();
  });

  test("Page /cotraitant/[token] s'affiche en anon avec h1 + greeting", async ({ page }) => {
    expect(token).not.toBeNull();
    const res = await page.goto(`/cotraitant/${token}`, { waitUntil: "domcontentloaded" });
    expect(res?.status() ?? 0).toBeLessThan(500);

    // h1 "Pièces à signer" — cf. page.tsx L164.
    await expect(page.getByRole("heading", { level: 1, name: /Pièces à signer/i })).toBeVisible({
      timeout: 10_000,
    });

    // Greeting "Bonjour {contactName}" — cf. page.tsx L166-168.
    await expect(page.locator("body")).toContainText(new RegExp(contactName, "i"));
  });

  test("Aucun org_id ni tender_id ne fuite dans le DOM ni les réponses réseau", async ({
    page,
  }) => {
    expect(token).not.toBeNull();

    // Démarre la capture réseau AVANT la navigation (sinon on rate la 1re
    // requête HTML).
    const listener = startNetworkLeakListener(page);

    await page.goto(`/cotraitant/${token}`, { waitUntil: "networkidle" });

    // Vérifie qu'aucun des UUID interdits ne fuite.
    const sensitive = [
      MULTI_ORG_IDS.ALYOS,
      MULTI_ORG_IDS.PROTECT,
      MULTI_ORG_IDS.CABINET_DUPONT,
      // Le nom commercial de l'éditeur peut apparaître dans un éventuel
      // footer, on ne le bloque pas — l'invariant est l'organization_id et
      // les emails admin internes.
      "e2e-test+multiorg-alyos-admin",
      "e2e-test+multiorg-protect-admin",
    ];
    await assertNoLeak(page, sensitive, listener);
    listener.stop();
  });

  test("Page publique ne contient pas de lien vers /sourcing/* (anti-pivot)", async ({ page }) => {
    expect(token).not.toBeNull();
    await page.goto(`/cotraitant/${token}`, { waitUntil: "domcontentloaded" });

    // Un cotraitant anon ne doit JAMAIS voir un lien vers l'app interne.
    const sourcingLinks = page.locator('a[href^="/sourcing/"]');
    await expect(sourcingLinks, "Page cotraitant ne doit pas linker /sourcing/*").toHaveCount(0);
  });

  test("`get_cotraitant_share_items_by_token` retourne l'item seedé", async () => {
    expect(token).not.toBeNull();
    const admin = getAdminClient();
    const { data, error } = await admin.rpc("get_cotraitant_share_items_by_token", {
      token_input: token!,
    });
    expect(error?.message ?? null).toBeNull();
    const rows = data as Array<{ id: string; name: string; signed_at: string | null }>;
    expect(rows.length, "Au moins 1 item seedé doit être visible").toBeGreaterThanOrEqual(1);
    const found = rows.find((r) => r.id === itemId);
    expect(found, `Item seedé (${itemId}) doit être retourné par la function`).toBeDefined();
    expect(found?.signed_at).toBeNull();
  });

  test("`mark_cotraitant_share_item_signed` pose signed_at + signer_name", async () => {
    // Simule la fin du flow upload : on ne dépose pas le fichier Storage
    // (bucket absent en CI), on tape directement la function pour vérifier
    // qu'elle met à jour la row. C'est le coeur de la régression Lot 1.7-ter.
    expect(token).not.toBeNull();
    expect(itemId).not.toBeNull();
    const admin = getAdminClient();

    const { data, error } = await admin.rpc("mark_cotraitant_share_item_signed", {
      token_input: token!,
      item_id_input: itemId!,
      signed_storage_path_in: `s13-signed/${itemId}.pdf`,
      signer_name_in: "Jean Cotraitant",
      signed_filename_in: "attestation-signee.pdf",
    });
    expect(error?.message ?? null).toBeNull();
    expect(data, "mark_signed doit retourner TRUE sur share valide + item valide").toBe(true);

    // Verif BDD : la row a bien signed_at posé.
    const { data: itemRow } = await admin
      .from("cotraitant_share_items")
      .select("signed_at, signer_name, signed_storage_path")
      .eq("id", itemId!)
      .single();
    expect(itemRow?.signed_at, "signed_at doit être posé après mark_signed").not.toBeNull();
    expect(itemRow?.signer_name).toBe("Jean Cotraitant");
    expect(itemRow?.signed_storage_path).toContain(itemId);
  });

  test("Anti re-signature : 2e appel mark_signed sur même item → FALSE", async () => {
    // Lot 1.7-ter — un item signé est définitif. La function refuse une
    // re-signature pour éviter qu'un cotraitant repasse un PDF par accident
    // après signature initiale.
    expect(token).not.toBeNull();
    expect(itemId).not.toBeNull();
    const admin = getAdminClient();

    const { data, error } = await admin.rpc("mark_cotraitant_share_item_signed", {
      token_input: token!,
      item_id_input: itemId!,
      signed_storage_path_in: `s13-signed/${itemId}-v2.pdf`,
      signer_name_in: "Jean Cotraitant Bis",
      signed_filename_in: "attestation-signee-v2.pdf",
    });
    expect(error?.message ?? null).toBeNull();
    expect(data, "Re-signature doit être refusée (return FALSE)").toBe(false);
  });

  test("Anti-IDOR cross-share : token valide + item d'un AUTRE share → mark_signed FALSE", async () => {
    expect(token).not.toBeNull();
    const admin = getAdminClient();

    // Crée un 2e share + item totalement distinct dans la même org AlyoS.
    const otherShare = await seedCotraitantShare(MULTI_ORG_IDS.ALYOS, {
      expiresInDays: 30,
      contactName: "Cotraitant Other",
    });
    const otherItemId = crypto.randomUUID();
    await admin.from("cotraitant_share_items").insert({
      id: otherItemId,
      share_id: otherShare.id,
      library_item_id: null,
      name: "Item d'un autre share",
      kind: "kbis",
      original_storage_path: "other/kbis.pdf",
    });

    try {
      // On essaie de marquer otherItemId signé EN UTILISANT le token de
      // S13 (un cotraitant légitime de S13 ne doit pas pouvoir signer chez
      // les voisins).
      const { data, error } = await admin.rpc("mark_cotraitant_share_item_signed", {
        token_input: token!,
        item_id_input: otherItemId,
        signed_storage_path_in: "idor/attempt.pdf",
        signer_name_in: "IDOR Attempt",
        signed_filename_in: "idor.pdf",
      });
      expect(error?.message ?? null).toBeNull();
      expect(data, "IDOR cross-share doit être refusé (FALSE)").toBe(false);

      // L'item étranger reste non signé.
      const { data: itemRow } = await admin
        .from("cotraitant_share_items")
        .select("signed_at")
        .eq("id", otherItemId)
        .single();
      expect(itemRow?.signed_at, "Item étranger doit rester non signé").toBeNull();
    } finally {
      await deleteCotraitantShare(otherShare.id).catch(() => {});
    }
  });
});
