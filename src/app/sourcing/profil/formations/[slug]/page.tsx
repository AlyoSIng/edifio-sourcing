/**
 * Page détail d'un guide formation — edifio Sourcing (Server Component)
 *
 * Route : /sourcing/profil/formations/[slug]
 *
 * Charge la formation par son slug depuis la BDD, rend le contentMd
 * en HTML via un parser markdown minimal (pas de dépendance externe).
 *
 * Pivot 2026-05-29 : contenu intégré BDD, pas d'URL externe, pas de vidéo.
 */

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db/client";
import { formations, guidedTests } from "@/db/schema/superadmin";

export const dynamic = "force-dynamic";

// ─── Metadata dynamique ───────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: { slug: string } }) {
  try {
    const rows = await db
      .select({ title: formations.title })
      .from(formations)
      .where(eq(formations.slug, params.slug))
      .limit(1);
    const title = rows[0]?.title ?? "Formation";
    return { title: `${title} — Formations — edifio Sourcing` };
  } catch {
    return { title: "Formation — edifio Sourcing" };
  }
}

// ─── Rendu markdown minimal ───────────────────────────────────────────────────
//
// Suffisant pour les guides : titres H2/H3, gras, italique, listes ul/ol.
// Pas de dépendance externe — rendu côté serveur.

function renderMarkdown(md: string): string {
  let html = md
    // Échapper les caractères HTML sensibles
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // H3 (### titre)
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    // H2 (## titre)
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    // Gras (**text**)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italique (*text*)
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Éléments de liste (- item)
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    // Éléments de liste ordonnée (1. item)
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

  // Regrouper les <li> consécutifs dans un <ul>
  html = html.replace(/((<li>.*?<\/li>\n?)+)/gs, "<ul>$1</ul>");

  // Paragraphes : blocs séparés par une ligne vide
  html = html
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("<h") || trimmed.startsWith("<ul") || trimmed.startsWith("<li")) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, " ")}</p>`;
    })
    .join("\n");

  return html;
}

// ─── Composant d'erreur ───────────────────────────────────────────────────────

function ErrorBanner() {
  return (
    <div
      role="alert"
      className="rounded-md border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
    >
      Impossible de charger ce guide. Réessayez dans quelques instants.
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default async function FormationDetailPage({ params }: { params: { slug: string } }) {
  let formation: typeof formations.$inferSelect | undefined;
  let hasTest = false;

  try {
    const rows = await db
      .select()
      .from(formations)
      .where(eq(formations.slug, params.slug))
      .limit(1);
    formation = rows[0];

    if (formation) {
      const tests = await db
        .select({ id: guidedTests.id })
        .from(guidedTests)
        .where(eq(guidedTests.formationId, formation.id))
        .limit(1);
      hasTest = tests.length > 0;
    }
  } catch {
    return <ErrorBanner />;
  }

  if (!formation) notFound();

  const htmlContent = formation.contentMd ? renderMarkdown(formation.contentMd) : "";

  return (
    <div className="mx-auto max-w-3xl">
      {/* Fil d'Ariane */}
      <nav aria-label="Fil d'Ariane" className="mb-4 text-sm text-muted">
        <Link href="/sourcing/profil/formations" className="hover:text-ink hover:underline">
          ← Formations
        </Link>
      </nav>

      {/* En-tête */}
      <header className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-info-bg px-2 py-0.5 text-xs font-semibold text-info">
            📄 Guide
          </span>
          {formation.durationMin != null && (
            <span className="rounded-full bg-paper-2 px-2 py-0.5 text-xs font-semibold text-ink-2">
              ⏱ {formation.durationMin} min
            </span>
          )}
        </div>
        <h1 className="font-display text-2xl font-bold text-ink">{formation.title}</h1>
        {formation.description && (
          <p className="mt-2 text-sm text-muted">{formation.description}</p>
        )}
      </header>

      {/* Corps du guide */}
      {htmlContent ? (
        <div
          className="prose prose-sm max-w-none text-ink [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-display [&_h3]:text-base [&_h3]:font-semibold [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      ) : (
        <p className="text-sm italic text-muted">Contenu non disponible.</p>
      )}

      {/* CTA test guidé */}
      {hasTest && (
        <div className="mt-8 rounded-md border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-medium text-amber-800">
            Tu as lu le guide ? Vérifie tes acquis avec le test guidé.
          </p>
          <Link
            href="/sourcing/profil/guided-tests"
            className="mt-2 inline-flex rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
          >
            Passer le test →
          </Link>
        </div>
      )}
    </div>
  );
}
