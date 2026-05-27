/**
 * Page Profil — Démo vidéo — edifio Sourcing (Server Component)
 *
 * Charge l'URL de la démo depuis `app_content` (clé 'demo_video_url').
 * Si présente : rend DemoViewer.
 * Sinon : message d'indisponibilité.
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { appContent } from "@/db/schema/superadmin";

import { DemoViewer } from "./DemoViewer";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Démo — Mon profil — edifio Sourcing",
};

export default async function ProfilDemoPage() {
  let demoUrl: string | null = null;

  try {
    const [row] = await db
      .select({ contentUrl: appContent.contentUrl })
      .from(appContent)
      .where(eq(appContent.key, "demo_video_url"))
      .limit(1);

    demoUrl = row?.contentUrl ?? null;
  } catch {
    return (
      <div>
        <h2 className="mb-4 font-display text-xl font-semibold text-ink">Démo vidéo</h2>
        <div
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          Impossible de charger la démo pour le moment. Veuillez réessayer dans quelques instants.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4 font-display text-xl font-semibold text-ink">Démo vidéo</h2>

      {demoUrl ? (
        <DemoViewer url={demoUrl} />
      ) : (
        <div className="rounded-md border border-line bg-paper-2 px-6 py-10 text-center text-sm text-muted">
          La démo vidéo n&apos;est pas encore disponible. Contactez l&apos;équipe edifio Sourcing.
        </div>
      )}
    </div>
  );
}
