"use server";

/**
 * Server Actions admin de la page « AO du jour ».
 *
 * Périmètre actuel :
 *  - `triggerSourcingRunAction` : relance manuelle du cron sourcing
 *    (superadmin uniquement).
 *
 * Pourquoi côté Server Action plutôt qu'un fetch client direct vers
 * `/api/cron/sourcing-run` :
 *  - on garde le `CRON_SECRET` strictement server-side (jamais exposé au
 *    bundle client) ;
 *  - on rejoue le check d'autorisation côté serveur (defense in depth :
 *    UI cachée + Server Action guardée + endpoint cron bearer-token).
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Déclenche manuellement le cron `/api/cron/sourcing-run`.
 *
 * Réservé strictement aux superadmins (cf. CLAUDE.md / Gate 7 — accès
 * exclusif `/sourcing/superadmin`). Les admins classiques sont rejetés.
 *
 * Timeout 55 s pour rester sous la limite Vercel Edge (60 s) du handler
 * cron lui-même — au-delà, on considère le déclenchement comme échec
 * réseau côté caller, le cron continuant éventuellement à tourner.
 */
export async function triggerSourcingRunAction(): Promise<
  | { ok: true; inserted: number; totalProfiles: number; durationMs: number }
  | { ok: false; error: string }
> {
  // Guard superadmin
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Authentification requise." };
  if (!isSuperAdmin(toUserProfile(user))) {
    return { ok: false, error: "Réservé aux superadmins." };
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, error: "CRON_SECRET non configuré." };

  const startedAt = Date.now();
  try {
    const res = await fetch(`${getSiteUrl()}/api/cron/sourcing-run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(55_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Cron a répondu ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const json = (await res.json()) as {
      ok: boolean;
      totalProfiles?: number;
      results?: Array<{ inserted?: number }>;
    };
    const inserted = json.results?.reduce((acc, r) => acc + (r.inserted ?? 0), 0) ?? 0;
    return {
      ok: true,
      inserted,
      totalProfiles: json.totalProfiles ?? 0,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Erreur réseau: ${msg}` };
  }
}
