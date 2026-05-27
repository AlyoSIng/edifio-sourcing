/**
 * Page Profil — Tests guidés — edifio Sourcing (Server Component)
 *
 * Charge les `guided_tests` actifs ordonnés par display_order.
 * Pour chaque test, charge la dernière soumission de l'utilisateur courant.
 * Rend un `GuidedTestPlayer` par test.
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { guidedTestSubmissions, guidedTests } from "@/db/schema/superadmin";
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

          return {
            test,
            previousSubmission: latest
              ? { score: latest.score, submittedAt: latest.submittedAt }
              : null,
          };
        }),
      );
    } else {
      testList = tests.map((test) => ({ test, previousSubmission: null }));
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

  return (
    <div>
      <h2 className="mb-4 font-display text-xl font-semibold text-ink">Tests guidés</h2>

      {testList.length === 0 ? (
        <div className="rounded-md border border-line bg-paper-2 px-6 py-10 text-center text-sm text-muted">
          Aucun test disponible pour le moment.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {testList.map(({ test, previousSubmission }) => (
            <section key={test.id} className="rounded-md border border-line bg-white p-5 shadow-sm">
              <h3 className="mb-4 font-display text-base font-semibold text-ink">{test.title}</h3>
              <GuidedTestPlayer test={test} previousSubmission={previousSubmission} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
