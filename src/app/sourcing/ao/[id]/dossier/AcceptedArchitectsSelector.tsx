"use client";

/**
 * AcceptedArchitectsSelector — sélecteur d'architecte pour le mode Tandem
 * multi-archi.
 *
 * Affiché quand au moins un architecte a accepté la sollicitation pour cet AO.
 * Deux états :
 *   1. Aucun archi sélectionné (`?archi=` absent ou invalide) — affiche la
 *      liste des architectes acceptés sous forme de cards, chacune avec un
 *      bouton « Préparer le dossier → » qui set `?archi=<uuid>`.
 *   2. Un archi sélectionné (`?archi=<uuid>` valide) — affiche un mini header
 *      compact « Dossier de [Cabinet] » + bouton « ← Changer d'architecte »
 *      qui retire le param.
 *
 * Phase 2 : la sélection ne modifie pas encore le pré-remplissage DC1/DC2
 * (réservé Phase 3). Elle prépare juste la prop côté DossierClient.
 *
 * Tokens DS uniquement.
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";

import type { AcceptedArchitect } from "./page-data";

/** Formate une Date en JJ/MM (court). */
function formatDateShort(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

interface AcceptedArchitectsSelectorProps {
  architects: AcceptedArchitect[];
  /** ID de l'archi actuellement sélectionné via `?archi=` (null sinon). */
  selectedArchitectId: string | null;
}

export function AcceptedArchitectsSelector({
  architects,
  selectedArchitectId,
}: AcceptedArchitectsSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedArchitect = useMemo(
    () =>
      selectedArchitectId ? (architects.find((a) => a.id === selectedArchitectId) ?? null) : null,
    [architects, selectedArchitectId],
  );

  /** Set le query param `?archi=<id>` en conservant les autres params. */
  const handleSelect = useCallback(
    (architectId: string) => {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      next.set("archi", architectId);
      router.push(`${pathname}?${next.toString()}`);
    },
    [pathname, router, searchParams],
  );

  /** Retire le query param `?archi`. */
  const handleClear = useCallback(() => {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.delete("archi");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, router, searchParams]);

  // État 2 — un archi est sélectionné : mini header compact.
  if (selectedArchitect) {
    return (
      <section
        aria-label="Architecte sélectionné"
        className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper-2 px-4 py-3"
      >
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Dossier de</p>
          <p className="mt-0.5 text-sm font-semibold text-ink">{selectedArchitect.cabinet}</p>
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="shrink-0 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-paper-3"
        >
          <span aria-hidden>&larr;</span> Changer d&apos;architecte
        </button>
      </section>
    );
  }

  // État 1 — aucun archi sélectionné : liste de cards.
  return (
    <section aria-labelledby="archis-selector-heading" className="mb-6">
      <h2
        id="archis-selector-heading"
        className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-ink"
      >
        Architectes acceptés ({architects.length})
      </h2>
      <p className="mb-3 text-xs text-ink-2">
        Plusieurs architectes ont accepté votre sollicitation. Préparez un dossier de candidature
        distinct pour chacun (DC1 mandataire, Pouvoir).
      </p>
      <ul className="grid gap-2 sm:grid-cols-2" role="list">
        {architects.map((archi) => (
          <li
            key={archi.id}
            className="flex flex-col gap-3 rounded-lg border border-line bg-white p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{archi.cabinet}</p>
              {archi.contactName && (
                <p className="mt-0.5 truncate text-xs text-ink-2">{archi.contactName}</p>
              )}
              <span className="mt-2 inline-flex items-center rounded-full bg-success-bg px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-success">
                Accepté le {formatDateShort(archi.signedAt)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleSelect(archi.id)}
              className="self-end rounded-full bg-brand-red px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              Préparer le dossier <span aria-hidden>&rarr;</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
