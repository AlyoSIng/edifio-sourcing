"use server";

/**
 * Server Actions pour la page /sourcing/admin/crons (chantier polish I3).
 *
 * Steve 2026-06-04. Permet de déclencher manuellement un cron Vercel
 * depuis l'UI plutôt que d'attendre le tick scheduled. Utile pour :
 *  - tester immédiatement après déploiement d'une migration cron_run_log
 *  - re-jouer une tâche après un échec sans attendre 24h
 *  - debug rapide en dev
 *
 * Sécurité :
 *  - Restriction superadmin (vérif `isSuperAdmin(profile)` côté serveur)
 *  - Le CRON_SECRET est ajouté côté serveur dans le header Authorization,
 *    jamais exposé au client
 *  - Whitelist stricte des cron_name autorisés (pas d'injection de path)
 *
 * Le cron tape son propre handler interne via fetch() qui passe par le
 * load balancer Vercel. C'est OK : pas de boucle, le handler est pur
 * (lit la DB, écrit la DB, envoie des mails — pas de redéclenchement).
 */

import { revalidatePath } from "next/cache";

import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Whitelist des cron_name déclenchables manuellement. Chaque clé mappe sur
 * le path de la route Vercel correspondante. Pas de slugify, pas de
 * concaténation libre — seulement ces 4 valeurs sont acceptées.
 */
const CRON_PATHS = {
  "sourcing-run": "/api/cron/sourcing-run",
  "tandem-followup": "/api/cron/tandem-followup",
  "library-expiry-digest": "/api/cron/library-expiry-digest",
  "dossier-zip-cleanup": "/api/cron/dossier-zip-cleanup",
} as const satisfies Record<string, string>;

export type TriggerableCronName = keyof typeof CRON_PATHS;

export interface TriggerCronResult {
  ok: boolean;
  cronName: TriggerableCronName;
  httpStatus?: number;
  durationMs?: number;
  responsePreview?: string;
  error?: string;
}

export async function triggerCronAction(cronName: string): Promise<TriggerCronResult> {
  // 1. Auth + superadmin.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, cronName: cronName as TriggerableCronName, error: "Non authentifié" };
  }
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) {
    return { ok: false, cronName: cronName as TriggerableCronName, error: "Forbidden" };
  }

  // 2. Whitelist.
  if (!(cronName in CRON_PATHS)) {
    return {
      ok: false,
      cronName: cronName as TriggerableCronName,
      error: `Cron inconnu : ${cronName}`,
    };
  }
  const typedName = cronName as TriggerableCronName;
  const path = CRON_PATHS[typedName];

  // 3. Récupère le secret côté serveur.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[admin-crons:trigger] CRON_SECRET non configuré");
    return { ok: false, cronName: typedName, error: "CRON_SECRET non configuré côté serveur" };
  }

  // 4. POST sur l'URL interne avec le secret. On utilise POST pour
  //    discriminer dans les logs des vrais ticks Vercel qui tapent GET.
  const url = `${getSiteUrl()}${path}`;
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "user-agent": "edifio-admin-trigger/1.0",
      },
      // Pas de body — les routes cron ignorent la payload.
    });
    const durationMs = Date.now() - startedAt;
    let responsePreview = "";
    try {
      const text = await res.text();
      responsePreview = text.slice(0, 200);
    } catch {
      // ignore
    }

    // 5. Force le rafraîchissement de la page pour voir la nouvelle row.
    revalidatePath("/sourcing/admin/crons");

    return {
      ok: res.ok,
      cronName: typedName,
      httpStatus: res.status,
      durationMs,
      responsePreview,
    };
  } catch (err) {
    console.error("[admin-crons:trigger:fail]", typedName, err);
    return {
      ok: false,
      cronName: typedName,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
    };
  }
}
