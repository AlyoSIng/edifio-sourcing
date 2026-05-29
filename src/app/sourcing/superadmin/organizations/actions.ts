"use server";

/**
 * Server Actions — module organisations superadmin — edifio Sourcing
 *
 * Actions disponibles :
 *   - `createOrgAction`  : crée une organisation + revalidate
 *   - `updateOrgAction`  : met à jour nom/tier/siren/siret + revalidate
 *
 * Note : la garde triple (session + domaine + superadmin) est prise en charge
 * par le layout superadmin. Ces actions ajoutent néanmoins une validation
 * métier stricte des données entrantes.
 *
 * Source de vérité schema : `src/db/schema/organizations.ts`.
 */

import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { createOrganization, updateOrganization } from "@/lib/superadmin/organizations-queries";

// ─── Valeurs autorisées ───────────────────────────────────────────────────────

const VALID_TIERS = ["sourcing", "cotraitance", "studio"] as const;
type SubscriptionTier = (typeof VALID_TIERS)[number];

function isValidTier(value: string): value is SubscriptionTier {
  return (VALID_TIERS as readonly string[]).includes(value);
}

// ─── Helpers de validation ────────────────────────────────────────────────────

/** Valide un SIREN : 9 chiffres exactement, ou null si vide. */
function validateSiren(raw: string): { value: string | null; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null };
  if (!/^\d{9}$/.test(trimmed))
    return { value: null, error: "Le SIREN doit comporter 9 chiffres exactement." };
  return { value: trimmed };
}

/** Valide un SIRET : 14 chiffres exactement, ou null si vide. */
function validateSiret(raw: string): { value: string | null; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null };
  if (!/^\d{14}$/.test(trimmed))
    return { value: null, error: "Le SIRET doit comporter 14 chiffres exactement." };
  return { value: trimmed };
}

// ─── createOrgAction ──────────────────────────────────────────────────────────

/**
 * Crée une nouvelle organisation depuis le formulaire inline NewOrgForm.
 * Reçoit un FormData avec les champs : name, subscriptionTier, siren, siret.
 */
export async function createOrgAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const tierRaw = (formData.get("subscriptionTier") as string | null)?.trim() ?? "studio";
  const sirenRaw = (formData.get("siren") as string | null) ?? "";
  const siretRaw = (formData.get("siret") as string | null) ?? "";

  // Validation — nom obligatoire
  if (!name) return { ok: false, error: "Le nom de l'organisation est obligatoire." };
  if (name.length > 255) return { ok: false, error: "Le nom ne peut pas dépasser 255 caractères." };

  // Validation — tier
  if (!isValidTier(tierRaw)) {
    return { ok: false, error: "Palier de souscription invalide." };
  }

  // Validation — SIREN
  const sirenResult = validateSiren(sirenRaw);
  if (sirenResult.error) return { ok: false, error: sirenResult.error };

  // Validation — SIRET
  const siretResult = validateSiret(siretRaw);
  if (siretResult.error) return { ok: false, error: siretResult.error };

  try {
    await createOrganization(
      {
        name,
        subscriptionTier: tierRaw,
        siren: sirenResult.value,
        siret: siretResult.value,
      },
      db,
    );

    revalidatePath("/sourcing/superadmin/organizations");
    return { ok: true };
  } catch (err) {
    // Erreur contrainte UNIQUE sur siren
    const msg = err instanceof Error ? err.message : "Erreur inconnue lors de la création.";
    if (msg.includes("organizations_siren_unique") || msg.includes("unique")) {
      return { ok: false, error: "Ce SIREN est déjà utilisé par une autre organisation." };
    }
    return { ok: false, error: msg };
  }
}

// ─── updateOrgAction ──────────────────────────────────────────────────────────

/**
 * Met à jour les paramètres d'une organisation.
 * Reçoit un FormData avec les champs : id, name, subscriptionTier, siren, siret.
 */
export async function updateOrgAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const id = (formData.get("id") as string | null)?.trim() ?? "";
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const tierRaw = (formData.get("subscriptionTier") as string | null)?.trim() ?? "studio";
  const sirenRaw = (formData.get("siren") as string | null) ?? "";
  const siretRaw = (formData.get("siret") as string | null) ?? "";

  // Validation — id
  if (!id || id.length < 10) return { ok: false, error: "Identifiant d'organisation invalide." };

  // Validation — nom obligatoire
  if (!name) return { ok: false, error: "Le nom de l'organisation est obligatoire." };
  if (name.length > 255) return { ok: false, error: "Le nom ne peut pas dépasser 255 caractères." };

  // Validation — tier
  if (!isValidTier(tierRaw)) {
    return { ok: false, error: "Palier de souscription invalide." };
  }

  // Validation — SIREN
  const sirenResult = validateSiren(sirenRaw);
  if (sirenResult.error) return { ok: false, error: sirenResult.error };

  // Validation — SIRET
  const siretResult = validateSiret(siretRaw);
  if (siretResult.error) return { ok: false, error: siretResult.error };

  try {
    const updated = await updateOrganization(
      id,
      {
        name,
        subscriptionTier: tierRaw,
        siren: sirenResult.value,
        siret: siretResult.value,
      },
      db,
    );

    if (!updated) return { ok: false, error: "Organisation introuvable." };

    revalidatePath("/sourcing/superadmin/organizations");
    revalidatePath(`/sourcing/superadmin/organizations/${id}`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur inconnue lors de la mise à jour.";
    if (msg.includes("organizations_siren_unique") || msg.includes("unique")) {
      return { ok: false, error: "Ce SIREN est déjà utilisé par une autre organisation." };
    }
    return { ok: false, error: msg };
  }
}
