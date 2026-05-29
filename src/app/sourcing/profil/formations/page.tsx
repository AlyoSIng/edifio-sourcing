/**
 * Page Profil — Formations — edifio Sourcing (Server Component)
 *
 * Charge les `formations` actives ordonnées par display_order puis created_at.
 * Grille 2 colonnes. Chaque carte indique le type (Vidéo/Document/Lien),
 * la durée estimée, et un badge "Test disponible" si un guided_test est associé.
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

import Link from "next/link";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { formations, guidedTests } from "@/db/schema/superadmin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Formations — Mon profil — edifio Sourcing",
};

const TYPE_LABELS: Record<string, string> = {
  video: "Vidéo",
  doc: "Document",
  external: "Lien",
};

const TYPE_ICONS: Record<string, string> = {
  video: "🎬",
  doc: "📄",
  external: "🔗",
};

const TYPE_BUTTON_LABELS: Record<string, string> = {
  video: "Regarder",
  doc: "Consulter",
  external: "Accéder",
};

const TYPE_BADGE_CLASSES: Record<string, string> = {
  video: "bg-violet-100 text-violet-700",
  doc: "bg-blue-100 text-blue-700",
  external: "bg-green-100 text-green-700",
};

export default async function ProfilFormationsPage() {
  let formationList: (typeof formations.$inferSelect)[] = [];
  let testFormationIds = new Set<string>();

  try {
    formationList = await db
      .select()
      .from(formations)
      .where(eq(formations.isActive, true))
      .orderBy(asc(formations.displayOrder), asc(formations.createdAt));

    if (formationList.length > 0) {
      const tests = await db
        .select({ formationId: guidedTests.formationId })
        .from(guidedTests)
        .where(eq(guidedTests.isActive, true));
      testFormationIds = new Set(
        tests.filter((t) => t.formationId !== null).map((t) => t.formationId as string),
      );
    }
  } catch {
    return (
      <div>
        <h2 className="mb-4 font-display text-xl font-semibold text-ink">Formations</h2>
        <div
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          Impossible de charger les formations pour le moment. Veuillez réessayer dans quelques
          instants.
        </div>
      </div>
    );
  }

  /* Stats calculées côté serveur */
  const N = formationList.length;
  const T = formationList.reduce((acc, f) => acc + (f.durationMin ?? 0), 0);
  const K = testFormationIds.size;

  return (
    <div>
      <h2 className="mb-4 font-display text-xl font-semibold text-ink">Formations</h2>

      {formationList.length === 0 ? (
        <div className="flex flex-col items-center rounded-md border border-dashed border-line bg-paper-2 px-8 py-14 text-center">
          <span className="mb-3 text-4xl">🎓</span>
          <p className="font-display text-base font-semibold text-ink">Formations à venir</p>
          <p className="mt-1 max-w-xs text-sm text-muted">
            Les ressources de formation seront disponibles très prochainement. Revenez dans quelques
            jours&nbsp;!
          </p>
        </div>
      ) : (
        <>
          {/* En-tête statistiques */}
          <div className="mb-5 flex items-center gap-6 rounded-md border border-line bg-paper-2 px-5 py-3 text-sm">
            <span className="text-muted">
              <strong className="font-semibold text-ink">{N}</strong> formation{N > 1 ? "s" : ""}
            </span>
            <span className="text-muted">
              <strong className="font-semibold text-ink">{T}</strong> min de contenu
            </span>
            <span className="text-muted">
              <strong className="font-semibold text-ink">{K}</strong> test{K > 1 ? "s" : ""}{" "}
              disponible{K > 1 ? "s" : ""}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {formationList.map((formation) => {
              const typeLabel = TYPE_LABELS[formation.type] ?? formation.type;
              const typeIcon = TYPE_ICONS[formation.type] ?? "";
              const buttonLabel = TYPE_BUTTON_LABELS[formation.type] ?? "Accéder";
              const badgeClass = TYPE_BADGE_CLASSES[formation.type] ?? "bg-gray-100 text-gray-700";
              const hasTest = testFormationIds.has(formation.id);

              return (
                <article
                  key={formation.id}
                  className="flex flex-col rounded-md border border-line bg-white p-5 shadow-sm"
                >
                  {/* Ligne badges + durée */}
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        badgeClass,
                      ].join(" ")}
                    >
                      {typeIcon} {typeLabel}
                    </span>
                    {hasTest && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        Test disponible
                      </span>
                    )}
                    {formation.durationMin != null && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                        ⏱ {formation.durationMin} min
                      </span>
                    )}
                  </div>

                  <h3 className="mb-2 font-display text-base font-semibold text-ink">
                    {formation.title}
                  </h3>

                  {formation.description && (
                    <p className="mb-3 flex-1 text-sm text-muted">{formation.description}</p>
                  )}

                  <div className="mt-auto flex items-center gap-3">
                    {formation.url ? (
                      <a
                        href={formation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md bg-violet-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-800"
                      >
                        {buttonLabel}
                      </a>
                    ) : (
                      <span className="rounded-md border border-dashed border-line px-3 py-1.5 text-xs italic text-muted">
                        Vidéo en cours d&apos;ajout…
                      </span>
                    )}
                    {hasTest && (
                      <Link
                        href="/sourcing/profil/guided-tests"
                        className="text-sm text-violet-700 underline underline-offset-2 hover:no-underline"
                      >
                        Passer le test
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
