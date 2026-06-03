"use server";

/**
 * Server Action — envoi du dossier compilé à l'architecte mandataire (Tandem).
 *
 * Décision Steve 2026-06-03 :
 *  - Une fois le ZIP compilé sur la page Pièces, AlyoS peut l'envoyer à
 *    l'architecte sélectionné via un mail Brevo
 *  - Mécanisme : signed URL Supabase Storage 7j (pas de pièce jointe — léger)
 *  - Template : HTML hardcodé TU/VOUS (pas de templateId Brevo externe)
 *  - Re-envoi possible à volonté ; chaque envoi tracké dans `dossier_dispatches`
 *
 * Sécurité :
 *  - Auth + ownership tender + ownership archi (defense in depth)
 *  - Aucune donnée cliente utilisée pour le storage_path (lookup BDD strict)
 *  - Le signed URL est généré côté serveur via service-role, l'archi le reçoit
 *    par mail (pas de lien public exposé côté UI)
 *
 * Audit : entrée dans `audit_logs` avec action `dossier_sent_to_architect`.
 */

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { architects } from "@/db/schema/architects";
import { dossierDispatches } from "@/db/schema/dossier-dispatches";
import { responseFiles } from "@/db/schema/library";
import { tenders } from "@/db/schema/tenders";
import { toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { getBrevoClient } from "@/lib/brevo/client";
import { extractDepartment } from "@/lib/tandem/matching";
import { getSiteUrl } from "@/lib/site-url";
import {
  DOSSIER_SENT_BODY_TU,
  DOSSIER_SENT_BODY_VOUS,
  DOSSIER_SENT_SUBJECT_TU,
  DOSSIER_SENT_SUBJECT_VOUS,
} from "@/lib/brevo/dossier-sent-templates";
import { renderMustache } from "@/lib/brevo/render-template";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const BUCKET = "response_files";

/** Durée de validité de l'URL signée envoyée à l'archi : 7 jours. */
const SIGNED_URL_DAYS = 7;
const SIGNED_URL_SECONDS = SIGNED_URL_DAYS * 24 * 60 * 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Types de retour
// ---------------------------------------------------------------------------

export type SendDossierError =
  | "not_authenticated"
  | "invalid_input"
  | "tender_not_found"
  | "architect_not_found"
  | "architect_no_email"
  | "no_compiled_zip"
  | "signed_url_failed"
  | "brevo_send_failed"
  | "internal_error";

export type SendDossierResult =
  | {
      ok: true;
      dispatchId: string;
      sentAt: Date;
      signedUrlExpiresAt: Date;
      recipientEmail: string;
    }
  | { ok: false; error: SendDossierError; detail?: string };

// ---------------------------------------------------------------------------
// Action principale
// ---------------------------------------------------------------------------

/**
 * Envoie le dernier ZIP compilé du dossier à l'architecte sélectionné.
 *
 * @param tenderId      UUID du tender
 * @param architectId   UUID de l'archi destinataire (= `?archi=` sur la page Pièces)
 */
export async function sendDossierToArchitectAction(
  tenderId: string,
  architectId: string,
): Promise<SendDossierResult> {
  try {
    // 1. Validation input (defense in depth — UUID strict).
    if (!UUID_RE.test(tenderId)) return { ok: false, error: "invalid_input" };
    if (!UUID_RE.test(architectId)) return { ok: false, error: "invalid_input" };

    // 2. Auth + org.
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "not_authenticated" };
    const profile = toUserProfile(user);
    const orgId = await getRequiredOrgId(profile.id);

    // 3. Vérifie ownership du tender (orgId strict).
    const [tender] = await db
      .select({
        id: tenders.id,
        externalRef: tenders.externalRef,
        title: tenders.title,
        buyer: tenders.buyer,
        deadline: tenders.deadline,
        rawData: tenders.rawData,
        sourceUrl: tenders.sourceUrl,
      })
      .from(tenders)
      .where(and(eq(tenders.id, tenderId), eq(tenders.organizationId, orgId)))
      .limit(1);
    if (!tender) return { ok: false, error: "tender_not_found" };

    // 4. Vérifie ownership archi + récupère email + tutoiement.
    const [archi] = await db
      .select({
        id: architects.id,
        cabinet: architects.cabinet,
        contactName: architects.contactName,
        email: architects.email,
        tutoiement: architects.tutoiement,
      })
      .from(architects)
      .where(and(eq(architects.id, architectId), eq(architects.organizationId, orgId)))
      .limit(1);
    if (!archi) return { ok: false, error: "architect_not_found" };
    if (!archi.email) return { ok: false, error: "architect_no_email" };

    // 5. Cherche le dernier ZIP compilé pour ce tender + archi.
    //    Le ZIP a été inséré par compileDossierAction (kind=`dossier_zip`).
    //    On filtre strictement sur architect_id pour respecter le contexte
    //    multi-archi (pas de fuite cross-archi).
    const [zip] = await db
      .select({
        id: responseFiles.id,
        storagePath: responseFiles.storagePath,
        name: responseFiles.name,
        sizeBytes: responseFiles.sizeBytes,
        createdAt: responseFiles.createdAt,
      })
      .from(responseFiles)
      .where(
        and(
          eq(responseFiles.tenderId, tenderId),
          eq(responseFiles.organizationId, orgId),
          eq(responseFiles.kind, "dossier_zip"),
          eq(responseFiles.architectId, architectId),
        ),
      )
      .orderBy(desc(responseFiles.createdAt))
      .limit(1);

    if (!zip) {
      // Fallback : si le ZIP a été compilé sans architectId (compileDossierAction
      // Solo legacy ou bug archive), on cherche le dernier ZIP du tender sans
      // architect_id. Mais on n'envoie PAS — on demande explicitement à Steve
      // de recompiler avec le contexte archi.
      return { ok: false, error: "no_compiled_zip" };
    }

    // 6. Génère un signed URL Supabase Storage 7j.
    const supabaseAdmin = createSupabaseAdminClient();
    const displayName = zip.name.replace(/\s+\(\d+\s+fichiers?\)$/u, ""); // nettoie « (5 fichiers) »
    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(zip.storagePath, SIGNED_URL_SECONDS, {
        download: displayName,
      });
    if (signedError || !signedData?.signedUrl) {
      console.error("[dispatch:signed-url:fail]", signedError);
      return { ok: false, error: "signed_url_failed" };
    }

    // 7. Prépare le mail Brevo (mode raw, HTML pré-rendu côté Node — cf.
    //    contrainte Brevo Mustache : pas de blocks `{{#X}}`, pas de
    //    triple-accolade `{{{X}}}`).
    const register: "tu" | "vous" = archi.tutoiement ? "tu" : "vous";
    const isTu = register === "tu";
    const subjectTpl = isTu ? DOSSIER_SENT_SUBJECT_TU : DOSSIER_SENT_SUBJECT_VOUS;
    const bodyTpl = isTu ? DOSSIER_SENT_BODY_TU : DOSSIER_SENT_BODY_VOUS;

    // Variables Mustache (compatibles avec renderMustache simple).
    const params: Record<string, string> = {
      archi_prenom: extractFirstName(archi.contactName) ?? "",
      archi_nom: extractLastName(archi.contactName) ?? "",
      cabinet: archi.cabinet ?? "",
      ao_objet: tender.title,
      ao_acheteur: tender.buyer ?? "",
      ao_departement:
        extractDepartment({
          buyer: tender.buyer,
          rawData: tender.rawData,
        }) ?? "—",
      ao_cloture: tender.deadline ? formatClotureFr(tender.deadline) : "non précisée",
      lien_telechargement: signedData.signedUrl,
      lien_ao: tender.sourceUrl ?? `${getSiteUrl()}`,
      expiration_dl_jours: String(SIGNED_URL_DAYS),
    };

    const subject = renderMustache(subjectTpl, params);
    const htmlContent = renderMustache(bodyTpl, params);

    // 8. Envoie via Brevo (mode raw — pas de templateId).
    const brevoClient = getBrevoClient();
    const senderEmail = process.env.BREVO_SENDER_EMAIL ?? "no-reply@alyosingenierie.fr";
    const senderName = "AlyoS Ingénierie";
    const toName = archi.contactName || archi.cabinet || "Architecte";
    const sendResult = await brevoClient.send({
      to: { email: archi.email, name: toName },
      params: {},
      subject,
      htmlContent,
      sender: { email: senderEmail, name: senderName },
      customHeader: `tender:${tenderId};archi:${architectId};kind:dossier_dispatch`,
    });
    if (!sendResult.ok) {
      console.error("[dispatch:brevo:fail]", sendResult);
      return {
        ok: false,
        error: "brevo_send_failed",
        detail: sendResult.error,
      };
    }

    // 9. Insère le dispatch (traçabilité + audit).
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SIGNED_URL_SECONDS * 1000);
    const [inserted] = await db
      .insert(dossierDispatches)
      .values({
        tenderId,
        architectId,
        organizationId: orgId,
        zipStoragePath: zip.storagePath,
        zipDisplayName: displayName,
        zipSizeBytes: zip.sizeBytes,
        signedUrlExpiresAt: expiresAt,
        sentAt: now,
        sentBy: profile.id,
        recipientEmail: archi.email,
        recipientName: archi.contactName ?? archi.cabinet,
        brevoMessageId: sendResult.messageId,
        brevoTemplateRegister: register,
      })
      .returning({ id: dossierDispatches.id });

    revalidatePath(`/sourcing/ao/${tenderId}/dossier/pieces`);

    return {
      ok: true,
      dispatchId: inserted!.id,
      sentAt: now,
      signedUrlExpiresAt: expiresAt,
      recipientEmail: archi.email,
    };
  } catch (err) {
    console.error("[dispatch:unhandled]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ---------------------------------------------------------------------------
// Action lecture — pour afficher « dernier envoi »
// ---------------------------------------------------------------------------

/**
 * Récupère le dernier dispatch pour ce tender + archi (pour afficher la
 * timestamp côté UI : « Envoyé le DD/MM à HH:MM »).
 *
 * Retourne `null` si aucun envoi.
 */
export async function getLastDispatchAction(
  tenderId: string,
  architectId: string,
): Promise<{ sentAt: Date; recipientEmail: string; signedUrlExpiresAt: Date } | null> {
  try {
    if (!UUID_RE.test(tenderId) || !UUID_RE.test(architectId)) return null;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const profile = toUserProfile(user);
    const orgId = await getRequiredOrgId(profile.id);

    const [row] = await db
      .select({
        sentAt: dossierDispatches.sentAt,
        recipientEmail: dossierDispatches.recipientEmail,
        signedUrlExpiresAt: dossierDispatches.signedUrlExpiresAt,
      })
      .from(dossierDispatches)
      .where(
        and(
          eq(dossierDispatches.tenderId, tenderId),
          eq(dossierDispatches.architectId, architectId),
          eq(dossierDispatches.organizationId, orgId),
        ),
      )
      .orderBy(desc(dossierDispatches.sentAt))
      .limit(1);
    return row ?? null;
  } catch (err) {
    console.error("[dispatch:get-last:unhandled]", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function extractFirstName(full: string | null): string | null {
  if (!full) return null;
  const parts = full.trim().split(/\s+/);
  return parts[0] ?? null;
}

function extractLastName(full: string | null): string | null {
  if (!full) return null;
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(" ") : null;
}

/** Formate une date en DD/MM/YYYY (français). */
function formatClotureFr(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// (Aucun export non-server-action — fichier `"use server"`)
