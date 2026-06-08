/**
 * Page Superadmin — Roadmap produit — edifio Sourcing
 *
 * Server Component — implémentation complète.
 *
 * Fonctionnalités :
 *   - Triple garde (session + domaine + superadmin)
 *   - Lecture de `app_content` WHERE key = 'roadmap_pdf_url' (Drizzle)
 *   - Si URL configurée : `RoadmapPdfViewer` (object PDF + bouton "Modifier l'URL")
 *   - Si pas d'URL : message + `RoadmapPdfForm` (formulaire de configuration initiale)
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { appContent } from "@/db/schema/superadmin";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { RoadmapPdfForm } from "./RoadmapPdfForm";
import { RoadmapPdfViewer } from "./RoadmapPdfViewer";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Roadmap produit — Superadmin — edifio Sourcing",
};

/** Clé BDD pour l'URL de la roadmap produit. Doit correspondre à `actions.ts`. */
const ROADMAP_PDF_KEY = "roadmap_pdf_url";

// ─── Page principale ──────────────────────────────────────────────────────────

export default async function SuperadminRoadmapPage() {
  // Garde 1 — session
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/superadmin/roadmap");

  // Garde 2 — domaine
  if (!isAuthorizedEmail(user.email)) redirect("/forbidden");

  // Garde 3 — superadmin
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  // ─── Lecture de l'URL configurée ─────────────────────────────────────────────
  let configuredUrl: string | null = null;
  let loadError: string | null = null;

  try {
    const [row] = await db
      .select({ contentUrl: appContent.contentUrl })
      .from(appContent)
      .where(eq(appContent.key, ROADMAP_PDF_KEY))
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
          <h2 className="font-display text-xl font-semibold text-ink">Roadmap produit</h2>
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
        Si URL configurée : RoadmapPdfViewer (object PDF + lien téléchargement + bouton "Modifier l'URL")
        Sinon : message + RoadmapPdfForm (configuration initiale)
      */}
      {!loadError &&
        (configuredUrl ? (
          <RoadmapPdfViewer url={configuredUrl} />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Aucune roadmap configurée. Collez l&apos;URL du PDF pour l&apos;afficher ici.
            </p>
            <RoadmapPdfForm />
          </div>
        ))}
    </div>
  );
}
