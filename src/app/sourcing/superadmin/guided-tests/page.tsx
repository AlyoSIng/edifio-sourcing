/**
 * Page Superadmin — Tests guidés — edifio Sourcing
 *
 * Server Component — implémentation complète.
 *
 * Fonctionnalités :
 *   - Triple garde (session + domaine + superadmin)
 *   - Liste des tests guidés avec comptage de soumissions et score moyen (SQL)
 *   - Bouton "+ Nouveau test" pour afficher GuidedTestForm
 *   - GuidedTestCard pour chaque test (édition d'étapes + soumissions)
 *   - Résilience : try/catch absorbé sur la requête BDD
 *
 * Décision Board 2026-05-27 — module superadmin éditeur edifio.
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { type GuidedTest, guidedTestSubmissions, guidedTests } from "@/db/schema/superadmin";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { GuidedTestCard } from "./GuidedTestCard";
import { NewTestToggle } from "./NewTestToggle";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tests guidés — Superadmin — edifio Sourcing",
};

// ─── Types internes ───────────────────────────────────────────────────────────

interface GuidedTestRow extends GuidedTest {
  submissionsCount: number;
  avgScore: number | null;
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default async function SuperadminGuidedTestsPage() {
  // Garde 1 — session
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/superadmin/guided-tests");

  // Garde 2 — domaine
  if (!isAuthorizedEmail(user.email)) redirect("/forbidden");

  // Garde 3 — superadmin
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  // ─── Chargement des tests avec agrégats ──────────────────────────────────────
  let tests: GuidedTestRow[] = [];
  let loadError: string | null = null;

  try {
    // Requête : guided_tests LEFT JOIN guided_test_submissions avec COUNT + AVG
    const rows = await db
      .select({
        id: guidedTests.id,
        title: guidedTests.title,
        formationId: guidedTests.formationId,
        steps: guidedTests.steps,
        isActive: guidedTests.isActive,
        displayOrder: guidedTests.displayOrder,
        createdAt: guidedTests.createdAt,
        updatedAt: guidedTests.updatedAt,
        submissionsCount: sql<number>`cast(count(${guidedTestSubmissions.id}) as integer)`,
        avgScore: sql<number | null>`cast(avg(${guidedTestSubmissions.score}) as numeric(5,1))`,
      })
      .from(guidedTests)
      .leftJoin(guidedTestSubmissions, eq(guidedTestSubmissions.testId, guidedTests.id))
      .groupBy(guidedTests.id)
      .orderBy(asc(guidedTests.displayOrder), asc(guidedTests.createdAt));

    tests = rows.map((r) => ({
      ...r,
      submissionsCount: r.submissionsCount ?? 0,
      avgScore: r.avgScore !== null ? Number(r.avgScore) : null,
    }));
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Erreur de chargement des tests guidés.";
  }

  return (
    <div>
      {/* En-tête */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">Tests guidés</h2>
          <p className="mt-0.5 font-mono text-xs text-muted">
            {tests.length > 0
              ? `${tests.length} test${tests.length > 1 ? "s" : ""} configuré${tests.length > 1 ? "s" : ""}`
              : "Aucun test configuré"}
          </p>
        </div>
        <Link
          href="/sourcing/superadmin"
          className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Retour au dashboard
        </Link>
      </div>

      {/* Bouton + formulaire de création (affiché uniquement si des tests existent déjà) */}
      {!loadError && tests.length > 0 && (
        <div className="mb-5">
          <NewTestToggle />
        </div>
      )}

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

      {!loadError && (
        <>
          {/* Liste vide : NewTestToggle ouvert par défaut */}
          {tests.length === 0 ? (
            <div className="space-y-5">
              <p className="text-sm text-muted">
                Aucun test créé pour le moment. Créez votre premier test guidé.
              </p>
              <NewTestToggle defaultOpen />
            </div>
          ) : (
            <div className="space-y-4">
              {tests.map((test) => (
                <GuidedTestCard
                  key={test.id}
                  test={test}
                  submissionsCount={test.submissionsCount}
                  avgScore={test.avgScore}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
