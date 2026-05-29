/**
 * Page Profil — Tests guidés — edifio Sourcing (Server Component)
 *
 * Charge les `guided_tests` actifs ordonnés par display_order.
 * Pour chaque test, charge la dernière soumission de l'utilisateur courant
 * et le titre de la formation liée si applicable.
 * Rend un `GuidedTestPlayer` par test.
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { formations, guidedTestSubmissions, guidedTests } from "@/db/schema/superadmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { GuidedTestPlayer } from "./GuidedTestPlayer";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tests guidés — Mon profil — edifio Sourcing",
};

export default async function ProfilGuidedTestsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = user?.id ?? "";

  type TestWithSubmission = {
    test: typeof guidedTests.$inferSelect;
    previousSubmission: { score: number | null; submittedAt: Date } | null;
    formationTitle: string | null;
  };

  let testList: TestWithSubmission[] = [];

  try {
    const tests = await db
      .select()
      .from(guidedTests)
      .where(eq(guidedTests.isActive, true))
      .orderBy(asc(guidedTests.displayOrder));

    if (tests.length > 0 && userId) {
      testList = await Promise.all(
        tests.map(async (test) => {
          const submissions = await db
            .select({
              score: guidedTestSubmissions.score,
              submittedAt: guidedTestSubmissions.submittedAt,
            })
            .from(guidedTestSubmissions)
            .where(
              and(
                eq(guidedTestSubmissions.testId, test.id),
                eq(guidedTestSubmissions.userId, userId),
              ),
            )
            .orderBy(desc(guidedTestSubmissions.submittedAt))
            .limit(1);

          const latest = submissions[0] ?? null;

          /* Titre de la formation liée */
          let formationTitle: string | null = null;
          if (test.formationId) {
            const [linked] = await db
              .select({ title: formations.title })
              .from(formations)
              .where(eq(formations.id, test.formationId))
              .limit(1);
            formationTitle = linked?.title ?? null;
          }

          return {
            test,
            previousSubmission: latest
              ? { score: latest.score, submittedAt: latest.submittedAt }
              : null,
            formationTitle,
          };
        }),
      );
    } else {
      testList = tests.map((test) => ({
        test,
        previousSubmission: null,
        formationTitle: null,
      }));
    }
  } catch {
    return (
      <div>
        <h2 className="mb-4 font-display text-xl font-semibold text-ink">Tests guidés</h2>
        <div
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          Impossible de charger les tests pour le moment. Veuillez réessayer dans quelques instants.
        </div>
      </div>
    );
  }

  /* Stats côté serveur */
  const nbCompleted = testList.filter((t) => t.previousSubmission !== null).length;

  return (
    <div>
      <h2 className="mb-4 font-display text-xl font-semibold text-ink">Tests guidés</h2>

      {testList.length === 0 ? (
        <div className="flex flex-col items-center rounded-md border border-dashed border-line bg-paper-2 px-8 py-14 text-center">
          <span className="mb-3 text-4xl">📝</span>
          <p className="font-display text-base font-semibold text-ink">Tests guidés à venir</p>
          <p className="mt-1 max-w-xs text-sm text-muted">
            Les tests de validation des formations seront disponibles très prochainement.
          </p>
        </div>
      ) : (
        <>
          {/* En-tête statistiques */}
          <div className="mb-5 flex items-center gap-6 rounded-md border border-line bg-paper-2 px-5 py-3 text-sm">
            <span className="text-muted">
              <strong className="font-semibold text-ink">{nbCompleted}</strong>
              {" / "}
              <strong className="font-semibold text-ink">{testList.length}</strong> test
              {testList.length > 1 ? "s" : ""} complété
              {nbCompleted > 1 ? "s" : ""}
            </span>
          </div>

          <div className="flex flex-col gap-6">
            {testList.map(({ test, previousSubmission, formationTitle }) => {
              const nbSteps = (test.steps as unknown[])?.length ?? 0;

              return (
                <section
                  key={test.id}
                  className="rounded-md border border-line bg-white p-5 shadow-sm"
                >
                  <h3 className="mb-1 font-display text-base font-semibold text-ink">
                    {test.title}
                  </h3>

                  {formationTitle && (
                    <p className="mb-2 text-xs text-muted">
                      Formation liée :{" "}
                      <span className="font-medium text-ink">{formationTitle}</span>
                    </p>
                  )}

                  <p className="mb-4 text-xs text-muted">
                    {nbSteps} étape{nbSteps > 1 ? "s" : ""}
                  </p>

                  <GuidedTestPlayer test={test} previousSubmission={previousSubmission} />
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
