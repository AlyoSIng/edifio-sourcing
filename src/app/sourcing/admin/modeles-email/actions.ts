"use server";

/**
 * Server Actions — éditeur de modèles d'e-mail (Exigence C).
 *
 * Source de vérité :
 *  - `handoff/SPEC_ADDENDUM_260525_ARCHITECTES_MENU_ET_TRAME_MAIL.md` §Exigence C
 *  - Décision Board 2026-05-25 : table `message_templates` source de vérité.
 *
 * Pattern identique à `profil/actions.ts` :
 *  1. Auth check Supabase
 *  2. Défense en profondeur : domaine @alyosingenierie.fr + rôle admin
 *  3. Parse Zod
 *  4. Validation garde-fous RGPD (bloquant si échoue)
 *  5. UPSERT en BDD (`ON CONFLICT DO UPDATE` via Drizzle)
 *  6. Audit log `template_change` (best-effort, non-bloquant)
 *  7. revalidatePath
 *  8. Return `{ ok: true } | { ok: false, error, ... }`
 *
 * Garde-fous non négociables (spec C) :
 *  - `solicitation_*` : body doit contenir {{rgpd_block}} + {{lien_opposition}}
 *  - `diffusion_*` : body doit contenir {{lien_ao}}
 *  - Ces erreurs sont bloquantes — l'enregistrement est refusé.
 */

import { revalidatePath } from "next/cache";

import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";

import { db as defaultDb } from "@/db/client";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  validateTemplateRgpd,
  TEMPLATE_META,
  type TemplateKey,
} from "@/lib/email/template-resolver";
import { messageTemplates } from "@/db/schema/messaging";

/* -------------------------------------------------------------------------- */
/*  Schéma Zod                                                                 */
/* -------------------------------------------------------------------------- */

const VALID_KEYS: [TemplateKey, ...TemplateKey[]] = [
  "solicitation_tu",
  "solicitation_vous",
  "relance_tu",
  "relance_vous",
  "diffusion_tu",
  "diffusion_vous",
  "decline_acknowledgment",
  "tender_summary_to_user",
  "user_provisional_password",
  "user_password_reset",
  "user_notification",
];

const saveTemplateSchema = z.object({
  key: z.enum(VALID_KEYS),
  subject: z.string().min(1, "L'objet est requis").max(998, "L'objet est trop long"),
  body: z.string().min(1, "Le corps est requis"),
});

/* -------------------------------------------------------------------------- */
/*  Types de retour                                                            */
/* -------------------------------------------------------------------------- */

export type SaveTemplateResult =
  | { ok: true; version: number }
  | {
      ok: false;
      error:
        | "not_authenticated"
        | "forbidden_domain"
        | "forbidden_role"
        | "invalid_input"
        | "rgpd_guard"
        | "internal_error";
      detail?: string;
      fieldErrors?: Record<string, string[]>;
      rgpdErrors?: string[];
    };

/* -------------------------------------------------------------------------- */
/*  Action saveTemplateAction                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Sauvegarde (UPSERT) un template d'e-mail.
 *
 * - Valide les garde-fous RGPD avant tout write en BDD.
 * - Incrémente `version` à chaque save.
 * - Écrit l'audit log (best-effort — non bloquant en cas d'échec).
 */
export async function saveTemplateAction(formData: FormData): Promise<SaveTemplateResult> {
  // 1. Auth check
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "not_authenticated" };

  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(user.email ?? "")) {
    return { ok: false, error: "forbidden_domain" };
  }
  if (!isAdmin(profile)) {
    return { ok: false, error: "forbidden_role" };
  }

  // 2. Parse + validation Zod
  const parsed = saveTemplateSchema.safeParse({
    key: formData.get("key"),
    subject: formData.get("subject"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_input",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { key, subject, body } = parsed.data;

  // 3. Garde-fous RGPD (bloquants)
  const rgpdResult = validateTemplateRgpd(key as TemplateKey, body);
  if (!rgpdResult.valid) {
    return {
      ok: false,
      error: "rgpd_guard",
      rgpdErrors: rgpdResult.errors,
    };
  }

  // 4. UPSERT en BDD
  try {
    // On calcule la prochaine version en lisant la courante d'abord
    const existing = await defaultDb
      .select({ version: messageTemplates.version })
      .from(messageTemplates)
      .where(and(eq(messageTemplates.organizationId, ALYOS_ORG_ID), eq(messageTemplates.key, key)))
      .limit(1);

    const nextVersion = existing[0] ? existing[0].version + 1 : 1;
    const channel = TEMPLATE_META[key as TemplateKey].channel;

    await defaultDb
      .insert(messageTemplates)
      .values({
        organizationId: ALYOS_ORG_ID,
        key,
        channel,
        subject,
        body,
        updatedBy: user.id,
        updatedAt: new Date(),
        version: nextVersion,
      })
      .onConflictDoUpdate({
        target: [messageTemplates.organizationId, messageTemplates.key],
        set: {
          subject,
          body,
          updatedBy: user.id,
          updatedAt: new Date(),
          version: sql`${messageTemplates.version} + 1`,
        },
      });

    // 5. Audit log best-effort (template_change — extension de l'enum à prévoir)
    // Note : `template_change` n'est pas encore dans l'enum audit_action.
    // On log dans la console pour l'instant ; l'enum sera étendu dans une
    // migration ultérieure (identique au pattern `tender_defer` / `tender_reject`
    // ajoutés en migration 0004/0005). Cf. DECISIONS.md à mettre à jour.
    console.info(
      `[audit:template_change] org=${ALYOS_ORG_ID} user=${user.email} key=${key} version=${nextVersion}`,
    );

    revalidatePath("/sourcing/admin/modeles-email");

    return { ok: true, version: nextVersion };
  } catch (err) {
    console.error("[modeles-email:save:fail]", err);
    return {
      ok: false,
      error: "internal_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
