/**
 * RcAnalysisCard — Section "Analyse RC" dans la fiche AO.
 *
 * Server Component : ne nécessite pas de "use client".
 * Affiche les résultats de l'analyse IA du Règlement de Consultation :
 *   - Alerte visite de site (si échéance de type "visite" présente)
 *   - Critères de jugement avec pondérations
 *   - Compétences demandées (Gate 5 §7 — champ ajouté v2)
 *   - Résumé pièces demandées + lien vers le dossier
 *   - Alertes IA
 *
 * Source de vérité : `handoff/BRIEF_CHANTIER_260527.md` §Feature RC Brief v2
 */

import type { RcAnalysis } from "@/lib/ai/schemas";

interface Props {
  analysis: RcAnalysis;
  tenderId: string;
}

export function RcAnalysisCard({ analysis, tenderId }: Props) {
  // Visite de site : cherche dans echeances type === "visite"
  const visite = analysis.echeances.find((e) => e.type === "visite");

  return (
    <section className="rounded-md border border-line bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted">
          Analyse RC
        </h2>
        <span className="rounded-full bg-paper-3 px-2 py-0.5 text-[10px] font-medium text-ink-2">
          IA · Claude Sonnet 4.6
        </span>
      </div>

      {/* Alerte visite de site */}
      {visite && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3"
        >
          <span aria-hidden className="shrink-0 text-lg">
            ⚠️
          </span>
          <div>
            <p className="text-sm font-semibold text-amber-800">Visite de site</p>
            <p className="mt-0.5 text-xs text-amber-700">
              {visite.date}
              {visite.heure ? ` à ${visite.heure}` : ""}
            </p>
          </div>
        </div>
      )}

      {/* Critères de jugement */}
      {analysis.criteres_jugement.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Critères de jugement
          </h3>
          <ul className="space-y-1.5">
            {analysis.criteres_jugement.map((c, i) => (
              <li key={i} className="flex items-start justify-between gap-2">
                <span className="text-sm text-ink">{c.critere}</span>
                <span className="bg-brand-red/10 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-brand-red">
                  {c.ponderation_pct}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Compétences demandées */}
      {analysis.competences_demandees && analysis.competences_demandees.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Compétences demandées
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {analysis.competences_demandees.map((c, i) => (
              <li
                key={i}
                className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
              >
                {c.competence}
                {c.niveau && <span className="ml-1 text-blue-500">· {c.niveau}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Résumé pièces */}
      {analysis.pieces_demandees.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Pièces demandées
          </h3>
          <p className="text-sm text-ink">
            {analysis.pieces_demandees.length} pièce
            {analysis.pieces_demandees.length > 1 ? "s" : ""} —{" "}
            {analysis.pieces_demandees.filter((p) => p.obligatoire).length} obligatoire
            {analysis.pieces_demandees.filter((p) => p.obligatoire).length > 1 ? "s" : ""}
          </p>
          <a
            href={`/sourcing/ao/${tenderId}/dossier`}
            className="mt-1 inline-block text-xs text-brand-red underline-offset-2 hover:underline"
          >
            Voir le dossier →
          </a>
        </div>
      )}

      {/* Alertes IA */}
      {analysis.alertes.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Alertes
          </h3>
          <ul className="space-y-1">
            {analysis.alertes.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-amber-700">
                <span aria-hidden className="shrink-0">
                  •
                </span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
