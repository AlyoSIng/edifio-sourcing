/**
 * Page Superadmin — Plaquette commerciale — edifio Sourcing
 *
 * Server Component — implémentation complète.
 *
 * Fonctionnalités :
 *   - Double garde (session + superadmin) — ADR-014 retire la garde domaine
 *   - Lecture de `app_content` WHERE key = 'pitch_pdf_url' (Drizzle)
 *   - Si URL configurée : `PitchPdfViewer` (object PDF + bouton "Modifier l'URL")
 *   - Si pas d'URL : message + `PitchPdfForm` (formulaire de configuration initiale)
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { appContent } from "@/db/schema/superadmin";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { PitchPdfForm } from "./PitchPdfForm";
import { PitchPdfViewer } from "./PitchPdfViewer";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Plaquette commerciale — Superadmin — edifio Sourcing",
};

/** Clé BDD pour l'URL de la plaquette commerciale. Doit correspondre à `actions.ts`. */
const PITCH_PDF_KEY = "pitch_pdf_url";

// ─── Page principale ──────────────────────────────────────────────────────────

export default async function SuperadminPitchPage() {
  // Garde 1 — session
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/superadmin/pitch");

  // Garde 2 — superadmin (ADR-014 : garde domaine retirée)
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  // ─── Lecture de l'URL configurée ─────────────────────────────────────────────
  let configuredUrl: string | null = null;
  let loadError: string | null = null;

  try {
    const [row] = await db
      .select({ contentUrl: appContent.contentUrl })
      .from(appContent)
      .where(eq(appContent.key, PITCH_PDF_KEY))
      .limit(1);

    configuredUrl = row?.contentUrl ?? null;
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Erreur de chargement de la configuration.";
  }

  return (
    <div>
      {/* En-tête */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">Plaquette commerciale</h2>
          <p className="mt-0.5 font-mono text-xs text-muted">
            {configuredUrl ? "PDF configuré" : "Aucune URL configurée"}
          </p>
        </div>
        <Link
          href="/sourcing/superadmin"
          className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Retour au dashboard
        </Link>
      </div>

      {/* Erreur de chargement */}
      {loadError && (
        <div
          role="alert"
          className={[
            "mb-5 rounded-md border border-l-4 border-line border-l-error",
            "bg-error-bg px-4 py-3 text-sm text-error",
          ].join(" ")}
        >
          <strong className="mr-1 font-semibold">Erreur de chargement :</strong>
          {loadError}
        </div>
      )}

      {/*
        Si URL configurée : PitchPdfViewer (object PDF + lien téléchargement + bouton "Modifier l'URL")
        Sinon : message + PitchPdfForm (configuration initiale)
      */}
      {!loadError &&
        (configuredUrl ? (
          <PitchPdfViewer url={configuredUrl} />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Aucune plaquette configurée. Collez l&apos;URL du PDF pour l&apos;afficher ici.
            </p>
            <PitchPdfForm />
          </div>
        ))}
    </div>
  );
}
