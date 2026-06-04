"use client";

/**
 * Panneau « Déclencher manuellement » sur /sourcing/admin/crons.
 *
 * Chantier polish I3 — Steve 2026-06-04. 4 boutons (un par cron Vercel)
 * qui invoquent la Server Action triggerCronAction(name). Pendant le
 * fetch, le bouton est `disabled` et un spinner s'affiche. À la fin, on
 * pose un feedback transitoire (succès vert ou erreur rouge).
 *
 * Sécurité : la Server Action côté serveur revérifie le rôle superadmin
 * — ce composant n'est qu'une commodité UX.
 */

import { useState, useTransition } from "react";

import { triggerCronAction, type TriggerCronResult } from "./actions";

interface CronEntry {
  name: "sourcing-run" | "tandem-followup" | "library-expiry-digest" | "dossier-zip-cleanup";
  label: string;
  schedule: string;
  description: string;
}

const CRONS: CronEntry[] = [
  {
    name: "sourcing-run",
    label: "Sourcing matinal",
    schedule: "Lu-Ve 6h30",
    description: "Collecte BOAMP + déclenche scrapers PLACE / Francmarchés.",
  },
  {
    name: "tandem-followup",
    label: "Relance Tandem J+3",
    schedule: "Tous les jours 9h",
    description: "Relance les archis sans réponse 3 jours après sollicitation.",
  },
  {
    name: "library-expiry-digest",
    label: "Digest expirations biblio",
    schedule: "Lundi 8h",
    description: "Envoie un mail aux admins listant les docs expirant J−30.",
  },
  {
    name: "dossier-zip-cleanup",
    label: "Cleanup ZIPs orphelins",
    schedule: "Tous les jours 5h30",
    description: "Supprime du Storage les ZIPs dossier > 30j non référencés.",
  },
];

export function TriggerPanel() {
  const [isPending, startTransition] = useTransition();
  const [activeName, setActiveName] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<TriggerCronResult | null>(null);

  function handleTrigger(name: CronEntry["name"]) {
    setLastResult(null);
    setActiveName(name);
    startTransition(async () => {
      const result = await triggerCronAction(name);
      setLastResult(result);
      setActiveName(null);
    });
  }

  return (
    <section className="mb-8 rounded-lg border border-line bg-paper-2 p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-base font-semibold text-ink">Déclencher manuellement</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          Superadmin
        </span>
      </header>

      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {CRONS.map((cron) => {
          const isActive = activeName === cron.name && isPending;
          return (
            <li
              key={cron.name}
              className="flex flex-col gap-2 rounded-md border border-line bg-white p-3"
            >
              <div className="flex items-center justify-between">
                <p className="font-mono text-[11px] uppercase tracking-wider text-ink-2">
                  {cron.name}
                </p>
                <span className="text-[10px] text-muted">{cron.schedule}</span>
              </div>
              <p className="text-sm text-ink">{cron.label}</p>
              <p className="text-xs text-muted">{cron.description}</p>
              <button
                type="button"
                onClick={() => handleTrigger(cron.name)}
                disabled={isPending}
                className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isActive ? "Exécution en cours…" : "▶ Déclencher maintenant"}
              </button>
            </li>
          );
        })}
      </ul>

      {lastResult && (
        <div
          role={lastResult.ok ? "status" : "alert"}
          className={`mt-3 rounded-md border border-l-4 px-3 py-2 text-sm ${
            lastResult.ok
              ? "border-line border-l-success bg-success-bg text-success"
              : "border-line border-l-error bg-error-bg text-error"
          }`}
        >
          <p className="font-medium">
            {lastResult.ok ? "✓" : "✗"} {lastResult.cronName}
            {lastResult.httpStatus !== undefined && (
              <span className="ml-1 font-mono text-xs">HTTP {lastResult.httpStatus}</span>
            )}
            {lastResult.durationMs !== undefined && (
              <span className="ml-2 font-mono text-xs text-muted">
                ({(lastResult.durationMs / 1000).toFixed(1)} s)
              </span>
            )}
          </p>
          {lastResult.error && <p className="mt-1 font-mono text-xs">{lastResult.error}</p>}
          {lastResult.responsePreview && (
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-ink-2">
              {lastResult.responsePreview}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
