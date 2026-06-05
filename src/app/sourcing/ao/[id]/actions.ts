"use server";

/**
 * Server Actions pour `/sourcing/ao/[id]` — édition rapide des champs
 * éditables manuellement (Steve 2026-06-04).
 *
 * Au MVP, seul `buyer_address` est éditable depuis cette page. Les autres
 * champs viennent de BOAMP/scrapers et ne doivent pas être modifiés
 * manuellement (sinon risque de désynchronisation au prochain re-source).
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { tenders } from "@/db/schema/tenders";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { upsertBuyer } from "@/lib/buyers/upsert-buyer";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const MAX_ADDRESS_LENGTH = 300;

export interface UpdateBuyerAddressResult {
  ok: boolean;
  error?: "not_authenticated" | "forbidden_role" | "invalid_input" | "not_found" | "internal_error";
}

/**
 * Met à jour `tenders.buyer_address` pour un AO de l'organisation courante.
 * Réservé admin (édition manuelle d'une donnée tender).
 *
 * `null`-safe : passer `null` ou chaîne vide remet l'adresse à NULL.
 */
export async function updateBuyerAddressAction(
  tenderId: string,
  buyerAddress: string | null,
): Promise<UpdateBuyerAddressResult> {
  try {
    // 1. Auth
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "not_authenticated" };

    const profile = toUserProfile(user);
    if (!isAdmin(profile)) return { ok: false, error: "forbidden_role" };

    // 2. Validation
    if (!UUID_SHAPE.test(tenderId)) return { ok: false, error: "invalid_input" };

    const cleaned =
      typeof buyerAddress === "string" && buyerAddress.trim().length > 0
        ? buyerAddress.trim().slice(0, MAX_ADDRESS_LENGTH)
        : null;

    const orgId = await getRequiredOrgId(user.id);

    // 3. UPDATE avec filtre tenant — récupère aussi le buyer name pour
    //    enrichir l'annuaire en aval (Q2).
    const rows = await db
      .update(tenders)
      .set({ buyerAddress: cleaned, updatedAt: new Date() })
      .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, orgId)))
      .returning({ id: tenders.id, buyer: tenders.buyer });

    if (rows.length === 0) return { ok: false, error: "not_found" };

    // 4. Q2 — Auto-enrichissement de l'annuaire des acheteurs. Best-effort :
    //    si l'UPSERT échoue, la mise à jour du tender reste valide.
    const tenderRow = rows[0];
    if (tenderRow && tenderRow.buyer.trim().length > 0 && cleaned) {
      await upsertBuyer(db, {
        organizationId: orgId,
        name: tenderRow.buyer,
        address: cleaned,
        userId: user.id,
      });
    }

    revalidatePath(`/sourcing/ao/${tenderId}`);
    return { ok: true };
  } catch (err) {
    console.error("[ao-edit:update-buyer-address:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}
