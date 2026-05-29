"use server";

/**
 * Server Action — édition du profil de recherche AlyoS (P2 Gate 6).
 *
 * Source de vérité :
 *  - `specs/audit_log_v1.md` §A3 (`search_profile_change`)
 *  - `specs/module_sourcing_engine_v1.md` §3.5 (consommé par filter.ts)
 *  - 5 recos Q1-Q5 Board 22/05 (cf. `DECISIONS.md`)
 *
 * Pattern aligné sur `src/app/sourcing/ao-du-jour/actions.ts` (PR n°5) :
 *  1. Auth check `createSupabaseServerClient().auth.getUser()`
 *  2. Defense-in-depth : domain `@alyosingenierie.fr` + role `admin`
 *  3. Parse Zod du payload côté serveur (jamais trust client)
 *  4. Lookup profil actif AlyoS via `getActiveSearchProfile(ALYOS_ORG_ID)`
 *  5. UPDATE Drizzle via `updateSearchProfile(...)` + RETURNING *
 *  6. Calcul du `diff` audit (champs modifiés uniquement, avant/après)
 *  7. Audit log A3 `search_profile_change` non-bloquant (best-effort)
 *  8. `revalidatePath` sur les 2 routes impactées :
 *     - `/sourcing/admin/profil` (form pré-rempli avec valeurs fraîches)
 *     - `/sourcing/ao-du-jour` (la liste AO est filtrée par ce profil)
 *  9. Return `{ ok: true } | { ok: false, error: <code>, ... }`
 *
 * Codes erreur retournés (mappés UI dans `ProfileForm`) :
 *  - `not_authenticated` : pas de session Supabase
 *  - `forbidden_domain`  : email hors `@alyosingenierie.fr`
 *  - `forbidden_role`    : user authentifié mais non-admin
 *  - `invalid_input`     : payload Zod invalide (erreurs détaillées exposées
 *                          côté UI via `fieldErrors` flatten)
 *  - `profile_not_found` : profil actif AlyoS introuvable (cas dégradé —
 *                          seed prod garantit qu'il existe, mais defense)
 *  - `internal_error`    : erreur inattendue (BDD, etc.) — log structuré
 */

import { revalidatePath } from "next/cache";

import { db as defaultDb } from "@/db/client";
import { audit } from "@/lib/audit";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import {
  getActiveSearchProfile,
  updateSearchProfile,
  type DrizzleClient,
} from "@/lib/profile/queries";
import { searchProfileUpdateSchema, type SearchProfileUpdateInput } from "@/lib/profile/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { SearchProfile } from "@/db/schema/config";

// ============================================================================
// Types publics
// ============================================================================

/**
 * Type minimal du client Supabase server (auth uniquement). Mock-friendly :
 * les tests injectent un faux client. Aligné `actions.ts` AO du jour.
 */
export interface AuthClientLike {
  auth: {
    getUser: () => Promise<{ data: { user: import("@supabase/supabase-js").User | null } }>;
  };
}

/** Type minimal du helper audit pour injection en tests (best-effort, void). */
export type AuditFn = typeof audit;

/**
 * Résultat de `updateProfileAction`. `fieldErrors` exposé côté `invalid_input`
 * pour afficher les erreurs inline dans le form (pattern Zod `.flatten()`).
 */
export type UpdateProfileResult =
  | { ok: true }
  | {
      ok: false;
      error: "not_authenticated" | "forbidden_domain" | "forbidden_role";
    }
  | {
      ok: false;
      error: "invalid_input";
      fieldErrors: Record<string, string[]>;
      formErrors: string[];
    }
  | {
      ok: false;
      error: "profile_not_found" | "internal_error";
    };

/** Dépendances injectables pour les tests (DI minimale, défauts en prod). */
interface ActionDeps {
  db?: DrizzleClient;
  authClient?: AuthClientLike;
  auditFn?: AuditFn;
}

// ============================================================================
// Helpers internes
// ============================================================================

/**
 * Étape commune : auth + domaine + admin. Retourne le userId OU un
 * `UpdateProfileResult` d'échec à propager tel quel.
 *
 * Différence vs `actions.ts` AO du jour : on rajoute le check `isAdmin`
 * (cette route est admin-only, le middleware filtre déjà mais on duplique
 * defense-in-depth).
 */
async function requireAlyosAdmin(
  authClient: AuthClientLike,
): Promise<
  | { ok: true; userId: string; orgId: string }
  | Exclude<
      UpdateProfileResult,
      { ok: true } | { ok: false; error: "invalid_input" | "profile_not_found" | "internal_error" }
    >
> {
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) return { ok: false, error: "forbidden_domain" };
  if (!isAdmin(profile)) return { ok: false, error: "forbidden_role" };

  const orgId = await getRequiredOrgId(user.id);
  return { ok: true, userId: user.id, orgId };
}

/**
 * Compare deux valeurs JSON-comparables et renvoie `true` si elles diffèrent.
 * Tolérant aux arrays et objets (comparaison structurelle via JSON.stringify
 * — suffisant pour le périmètre `searchProfiles` : arrays de string, objet
 * keywords plat, numerics en string).
 *
 * On ne dépend volontairement pas d'une lib externe (deep-equal) — coût de
 * bundle inutile pour le périmètre serveur.
 */
function jsonDiffers(before: unknown, after: unknown): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

/**
 * Construit le `diff` audit log A3 — uniquement les champs effectivement
 * modifiés (`{ field: [before, after] }`). Spec `audit_log_v1.md` §A3 :
 *   diff: { "keywords.positive": ["before", "after"] }
 *
 * On expose les clés en **snake_case** alignées sur les noms de colonne SQL
 * pour cohérence avec l'audit log (`profile_id`, `keywords.positive`, etc.).
 */
function computeAuditDiff(
  before: SearchProfile,
  after: SearchProfile,
): Record<string, [unknown, unknown]> {
  const diff: Record<string, [unknown, unknown]> = {};

  // keywords (objet JSONB) — on remonte le diff au niveau global ET par sous-clé
  // pour faciliter la lecture côté audit (la spec donne `keywords.positive` en
  // exemple, donc on suit cette granularité).
  for (const sub of ["positive", "negative", "exact"] as const) {
    const b = before.keywords[sub];
    const a = after.keywords[sub];
    if (jsonDiffers(b, a)) {
      diff[`keywords.${sub}`] = [b, a];
    }
  }

  if (jsonDiffers(before.cpvCodes, after.cpvCodes)) {
    diff.cpv_codes = [before.cpvCodes, after.cpvCodes];
  }
  if (jsonDiffers(before.geoZones, after.geoZones)) {
    diff.geo_zones = [before.geoZones, after.geoZones];
  }
  if (jsonDiffers(before.marketTypes, after.marketTypes)) {
    diff.market_types = [before.marketTypes, after.marketTypes];
  }
  if (jsonDiffers(before.amountMin, after.amountMin)) {
    diff.amount_min = [before.amountMin, after.amountMin];
  }
  if (jsonDiffers(before.amountMax, after.amountMax)) {
    diff.amount_max = [before.amountMax, after.amountMax];
  }

  return diff;
}

/**
 * Convertit un montant `number | null` (côté form/Zod) en string numeric
 * Postgres (côté Drizzle `numeric` precision 14 scale 2). On garde 2
 * décimales pour aligner sur l'unité euro/cent.
 *
 * `null` reste `null` (pas de borne).
 */
function toNumericString(value: number | null): string | null {
  if (value === null) return null;
  return value.toFixed(2);
}

// ============================================================================
// updateProfileAction
// ============================================================================

/**
 * Met à jour le profil de recherche actif de l'organisation AlyoS.
 *
 * V1 mono-tenant + mono-profil (Q2 Board 22/05) :
 *  - L'`organizationId` est `ALYOS_ORG_ID` (constante).
 *  - Le `profileId` est dérivé via `getActiveSearchProfile()` côté serveur
 *    (l'UI ne le passe PAS — defense contre cross-tenant + simplicité form).
 *
 * @param input — payload brut (typé `unknown` car vient du client) — validé
 *                par Zod
 * @param deps  — dépendances optionnelles pour les tests (DI)
 */
export async function updateProfileAction(
  input: unknown,
  deps: ActionDeps = {},
): Promise<UpdateProfileResult> {
  const dbInstance = deps.db ?? defaultDb;
  const authClient = deps.authClient ?? createSupabaseServerClient();
  const auditFn = deps.auditFn ?? audit;

  // 1. Auth + domaine + admin
  const authResult = await requireAlyosAdmin(authClient);
  if (!authResult.ok) return authResult;
  const { orgId } = authResult;

  // 2. Validation Zod côté serveur — JAMAIS trust client
  const parsed = searchProfileUpdateSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      ok: false,
      error: "invalid_input",
      // `fieldErrors` est `Record<string, string[] | undefined>` côté Zod ;
      // on filtre les `undefined` pour la stabilité du type côté UI.
      fieldErrors: Object.fromEntries(
        Object.entries(flat.fieldErrors)
          .filter(([, v]) => Array.isArray(v) && v.length > 0)
          .map(([k, v]) => [k, v as string[]]),
      ),
      formErrors: flat.formErrors,
    };
  }
  const validated: SearchProfileUpdateInput = parsed.data;

  // 3. Lookup profil actif AlyoS (le `profileId` ne vient PAS du client)
  let before: SearchProfile | null;
  try {
    before = await getActiveSearchProfile(orgId, dbInstance);
  } catch (err) {
    console.error("[admin-profil:fetch-active:fail]", err);
    return { ok: false, error: "internal_error" };
  }
  if (!before) return { ok: false, error: "profile_not_found" };

  // 4. UPDATE Drizzle (`updateSearchProfile` lève `Error('profile_not_found')`
  // si le row a disparu entre la lecture et l'écriture — defense race).
  let after: SearchProfile;
  try {
    after = await updateSearchProfile(
      orgId,
      before.id,
      {
        keywords: validated.keywords,
        cpvCodes: validated.cpv_codes,
        geoZones: validated.geo_zones,
        marketTypes: validated.market_types,
        amountMin: toNumericString(validated.amount_min),
        amountMax: toNumericString(validated.amount_max),
      },
      dbInstance,
    );
  } catch (err) {
    if (err instanceof Error && err.message === "profile_not_found") {
      return { ok: false, error: "profile_not_found" };
    }
    console.error("[admin-profil:update:fail]", err);
    return { ok: false, error: "internal_error" };
  }

  // 5. Audit A3 — best-effort non-bloquant (cf. `src/lib/audit/index.ts`).
  // Le `diff` ne contient que les champs effectivement modifiés. Si le user
  // soumet un form identique à l'état actuel, `diff = {}` mais on log quand
  // même l'opération (utile pour tracer une consultation/sauvegarde sans
  // effet).
  const diff = computeAuditDiff(before, after);
  await auditFn({
    action: "search_profile_change",
    subjectType: "search_profile",
    subjectId: after.id,
    data: {
      profile_id: after.id,
      profile_name: after.name,
      operation: "update",
      diff,
    },
  });

  // 6. Revalidate les 2 routes impactées (le profil pilote la liste AO).
  revalidatePath("/sourcing/admin/profil");
  revalidatePath("/sourcing/ao-du-jour");

  return { ok: true };
}
