"use server";

/**
 * Server Actions — gestion des BE cotraitants attachés à un AO.
 *
 * Mode Cotraitance BE : AlyoS est mandataire d'un groupement avec 1 ou
 * plusieurs bureaux d'études cotraitants. Steve sélectionne les BE depuis
 * sa bibliothèque (`bureaux_etudes`) directement sur la page dossier de l'AO.
 *
 * Actions exposées :
 *   - `addBeCotraitant`     : ajoute un BE comme cotraitant pour un tender
 *                             (idempotent via `ON CONFLICT DO NOTHING`).
 *   - `removeBeCotraitant`  : retire un BE de la liste des cotraitants.
 *   - `searchBureauxEtudes` : recherche dans la bibliothèque BE de l'org
 *                             (search-as-you-type, ILIKE sur cabinet).
 *
 * Sécurité :
 *   - Auth check obligatoire (domaine `@alyosingenierie.fr` côté middleware
 *     + defense in depth ici).
 *   - Filtre `organizationId = orgId` sur toutes les requêtes BDD — un
 *     utilisateur ne peut pas attacher un BE d'une autre organisation, même
 *     en connaissant son UUID.
 *   - Validation UUID v4 défensive (la Server Action est une surface réseau).
 *
 * Source : brief Board Lot B 2026-06-02.
 */

import { revalidatePath } from "next/cache";
import { and, eq, ilike } from "drizzle-orm";

import { db } from "@/db/client";
import { bureauEtudes } from "@/db/schema/bureaux-etudes";
import { tenderBeCotraitants } from "@/db/schema/tender-cotraitants";
import { tenders } from "@/db/schema/tenders";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Longueur min/max pour le terme de recherche BE. */
const MIN_SEARCH_LENGTH = 1;
const MAX_SEARCH_LENGTH = 80;

/** Nombre max de résultats renvoyés par `searchBureauxEtudes`. */
const SEARCH_LIMIT = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AddBeCotraitantResult = { ok: true } | { ok: false; error: string };
export type RemoveBeCotraitantResult = { ok: true } | { ok: false; error: string };

export interface BureauEtudesSearchResult {
  id: string;
  cabinet: string;
  contactName: string | null;
  email: string | null;
  city: string | null;
}

// ---------------------------------------------------------------------------
// Helper auth
// ---------------------------------------------------------------------------

async function getAuthenticatedContext(): Promise<
  | { ok: true; userId: string; orgId: string }
  | { ok: false; error: "not_authenticated" | "forbidden_domain" }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };
  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) return { ok: false, error: "forbidden_domain" };
  const orgId = await getRequiredOrgId(user.id);
  return { ok: true, userId: user.id, orgId };
}

// ---------------------------------------------------------------------------
// Action : addBeCotraitant
// ---------------------------------------------------------------------------

/**
 * Ajoute un BE comme cotraitant pour un AO donné.
 *
 * Workflow :
 *   1. Auth + tenant
 *   2. Validation UUID v4 sur tenderId + beId
 *   3. Vérifie que le tender appartient à l'org
 *   4. Vérifie que le BE appartient à l'org
 *   5. INSERT avec `onConflictDoNothing()` (idempotent — ré-ajout sans erreur)
 *   6. revalidatePath de la page dossier
 *
 * Codes d'erreur :
 *   - `not_authenticated`   : pas de session
 *   - `forbidden_domain`    : email hors `@alyosingenierie.fr`
 *   - `invalid_input`       : UUID malformé
 *   - `tender_not_found`    : tender absent ou cross-tenant
 *   - `be_not_found`        : BE absent ou cross-tenant
 *   - `internal_error`      : erreur SQL/serveur
 */
export async function addBeCotraitant(
  tenderId: string,
  beId: string,
): Promise<AddBeCotraitantResult> {
  try {
    // 1. Auth + tenant
    const auth = await getAuthenticatedContext();
    if (!auth.ok) return { ok: false, error: auth.error };

    // 2. Validation UUID défensive (surface réseau Server Action)
    if (!UUID_SHAPE.test(tenderId) || !UUID_SHAPE.test(beId)) {
      return { ok: false, error: "invalid_input" };
    }

    // 3. Vérifier que le tender appartient à l'org
    const [tenderRow] = await db
      .select({ id: tenders.id })
      .from(tenders)
      .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, auth.orgId)))
      .limit(1);

    if (!tenderRow) return { ok: false, error: "tender_not_found" };

    // 4. Vérifier que le BE appartient à l'org
    const [beRow] = await db
      .select({ id: bureauEtudes.id })
      .from(bureauEtudes)
      .where(and(eq(bureauEtudes.id, beId), eq(bureauEtudes.organizationId, auth.orgId)))
      .limit(1);

    if (!beRow) return { ok: false, error: "be_not_found" };

    // 5. INSERT idempotent — un BE déjà ajouté retourne ok:true sans erreur
    await db
      .insert(tenderBeCotraitants)
      .values({
        tenderId,
        beId,
        organizationId: auth.orgId,
        addedBy: auth.userId,
      })
      .onConflictDoNothing({
        target: [tenderBeCotraitants.tenderId, tenderBeCotraitants.beId],
      });

    // 6. Revalidation cache page dossier
    revalidatePath(`/sourcing/ao/${tenderId}/dossier`);
    return { ok: true };
  } catch (err) {
    console.error("[be-cotraitants:add:unhandled]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ---------------------------------------------------------------------------
// Action : removeBeCotraitant
// ---------------------------------------------------------------------------

/**
 * Retire un BE de la liste des cotraitants d'un AO.
 *
 * Workflow :
 *   1. Auth + tenant
 *   2. Validation UUID v4
 *   3. DELETE avec filtre tenant (defense in depth — un user d'une autre org
 *      ne peut pas retirer un BE même en connaissant l'UUID)
 *   4. revalidatePath
 *
 * Note : pas d'erreur si le BE n'était pas cotraitant (DELETE silencieux).
 */
export async function removeBeCotraitant(
  tenderId: string,
  beId: string,
): Promise<RemoveBeCotraitantResult> {
  try {
    // 1. Auth + tenant
    const auth = await getAuthenticatedContext();
    if (!auth.ok) return { ok: false, error: auth.error };

    // 2. Validation UUID
    if (!UUID_SHAPE.test(tenderId) || !UUID_SHAPE.test(beId)) {
      return { ok: false, error: "invalid_input" };
    }

    // 3. DELETE avec filtre tenant
    await db
      .delete(tenderBeCotraitants)
      .where(
        and(
          eq(tenderBeCotraitants.tenderId, tenderId),
          eq(tenderBeCotraitants.beId, beId),
          eq(tenderBeCotraitants.organizationId, auth.orgId),
        ),
      );

    // 4. Revalidation cache page dossier
    revalidatePath(`/sourcing/ao/${tenderId}/dossier`);
    return { ok: true };
  } catch (err) {
    console.error("[be-cotraitants:remove:unhandled]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ---------------------------------------------------------------------------
// Action : searchBureauxEtudes
// ---------------------------------------------------------------------------

/**
 * Recherche dans la bibliothèque BE de l'org courante (search-as-you-type).
 *
 * Filtres :
 *   - Tenant : `organizationId = orgId` strict
 *   - Cabinet : `ILIKE '%query%'`
 *   - Actif : `active = TRUE` (les BE désactivés / RGPD opposition ne
 *     remontent pas dans la recherche)
 *
 * Limite : 10 résultats max (UI dropdown — pas un explorateur).
 *
 * En cas d'auth fail ou query trop courte → tableau vide (pas d'erreur, le
 * composant client gère un état "tapez 1 caractère ou plus").
 */
export async function searchBureauxEtudes(query: string): Promise<BureauEtudesSearchResult[]> {
  try {
    const auth = await getAuthenticatedContext();
    if (!auth.ok) return [];

    const trimmed = query.trim();
    if (trimmed.length < MIN_SEARCH_LENGTH || trimmed.length > MAX_SEARCH_LENGTH) return [];

    const term = `%${trimmed}%`;

    const rows = await db
      .select({
        id: bureauEtudes.id,
        cabinet: bureauEtudes.cabinet,
        contactName: bureauEtudes.contactName,
        email: bureauEtudes.email,
        city: bureauEtudes.city,
      })
      .from(bureauEtudes)
      .where(
        and(
          eq(bureauEtudes.organizationId, auth.orgId),
          eq(bureauEtudes.active, true),
          ilike(bureauEtudes.cabinet, term),
        ),
      )
      .orderBy(bureauEtudes.cabinet)
      .limit(SEARCH_LIMIT);

    return rows;
  } catch (err) {
    console.error("[be-cotraitants:search:unhandled]", err);
    return [];
  }
}
