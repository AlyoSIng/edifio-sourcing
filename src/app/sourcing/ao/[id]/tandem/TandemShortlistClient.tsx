"use client";

/**
 * Composant Client `TandemShortlistClient` — orchestre la short-list
 * architectes + la preview Brevo + l'envoi de sollicitation.
 *
 * Source de vérité :
 *  - `specs/module_tandem_engine_v1.md` §3.2 (M-D1 short-list + M-D2 preview)
 *  - `handoff/PLAN_TANDEM_NADIA_260522.md` §sous-étape 5
 *
 * Comportement :
 *  - Au mount : si la prop `initialData.proposals` est vide, déclenche
 *    `matchArchitectsForTender(tenderId)` (Server Action) — la 1re visite
 *    de la page après bascule en `selected_tandem` n'a pas encore de match.
 *    Une fois la 1re sollicitation envoyée, les match_proposals sont
 *    persistés et restent visibles aux visites suivantes.
 *  - Affichage : 1 card par archi, avec rank (1, 2, 3), score, rationale IA,
 *    spécialités, zones, nb de collabs passées, statut sollicitation
 *    (« déjà envoyé » badge si responseStatus !== null).
 *  - Bouton « Préparer la sollicitation » par archi → ouvre la modale
 *    `BrevoPreviewModal` qui affiche le mail rendu avec toggle TU/VOUS.
 *  - Bouton « Envoyer » dans la modale → `sendArchitectSolicitation` →
 *    mise à jour optimiste du statut + toast succès.
 *
 * Pas de WebSocket / Realtime ici — la confirmation arrive de toute façon
 * via l'archi (page tokenisée). On revalide via `router.refresh()` après
 * envoi pour rafraîchir la donnée serveur (tender status =
 * `awaiting_architect` après 1er envoi).
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  matchArchitectsForTender,
  sendArchitectSolicitation,
  type MatchScoreWithArchitect,
} from "./actions";
import { BrevoPreviewModal } from "./BrevoPreviewModal";
import type { TandemShortlistData } from "./page-data";
import type { BrevoRegister } from "@/lib/brevo/template-picker";
import type { ArchitectResponse } from "@/db/schema/selections";

interface Props {
  tenderId: string;
  initialData: TandemShortlistData;
}

interface ArchitectRow {
  /** Identifiant unique de la ligne (architectId). */
  architectId: string;
  rank: number;
  score: number;
  rationale: string;
  architect: MatchScoreWithArchitect["architect"];
  responseStatus: ArchitectResponse["status"] | null;
}

export function TandemShortlistClient({ tenderId, initialData }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<ArchitectRow[]>(() => buildRowsFromInitial(initialData));
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewFor, setPreviewFor] = useState<ArchitectRow | null>(null);
  const [, startTransition] = useTransition();

  // Au mount : si pas de match_proposals persistés, runner le matcher V1.
  useEffect(() => {
    if (initialData.proposals.length > 0) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      const result = await matchArchitectsForTender(tenderId, 3);
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(mapErrorToFr(result.error));
        setLoading(false);
        return;
      }
      const newRows: ArchitectRow[] = result.matches.map((m, idx) => ({
        architectId: m.architectId,
        rank: idx + 1,
        score: m.score,
        rationale: m.rationale,
        architect: m.architect,
        responseStatus: null,
      }));
      setRows(newRows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialData.proposals.length, tenderId]);

  function handleSelectArchitect(row: ArchitectRow) {
    setPreviewFor(row);
  }

  function handleClosePreview() {
    setPreviewFor(null);
  }

  function handleConfirmSend(register: BrevoRegister, customNote: string | undefined) {
    if (!previewFor) return;
    const row = previewFor;
    startTransition(async () => {
      const result = await sendArchitectSolicitation(tenderId, row.architectId, {
        register,
        customNote,
        score: row.score,
        rationale: row.rationale,
        rank: row.rank,
      });
      if (!result.ok) {
        setLoadError(mapErrorToFr(result.error));
        setPreviewFor(null);
        return;
      }
      // Mise à jour optimiste : on marque la ligne comme « envoyée ».
      setRows((prev) =>
        prev.map((r) =>
          r.architectId === row.architectId ? { ...r, responseStatus: "pending" } : r,
        ),
      );
      setPreviewFor(null);
      // On revalide la donnée serveur (status tender = awaiting_architect).
      router.refresh();
    });
  }

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-md border border-line bg-white p-8 text-center text-sm text-ink-2"
      >
        <div className="mb-2 text-2xl" aria-hidden>
          ⏳
        </div>
        Calcul de la short-list architectes en cours…
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        role="alert"
        className="rounded-md border border-l-4 border-line border-l-error bg-error-bg p-5 text-sm text-error"
      >
        {loadError}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        role="status"
        className="rounded-md border border-line bg-white p-8 text-center text-sm text-ink-2"
      >
        <div className="mb-2 text-2xl" aria-hidden>
          ∅
        </div>
        <p>
          Aucun architecte solicitable ne correspond à cet AO. Ajoute un architecte depuis
          l&rsquo;administration pour activer le mode Tandem.
        </p>
      </div>
    );
  }

  return (
    <>
      <ol className="flex flex-col gap-4" aria-label="Liste des architectes proposés">
        {rows.map((row) => (
          <li key={row.architectId}>
            <ArchitectCard row={row} onSelect={() => handleSelectArchitect(row)} />
          </li>
        ))}
      </ol>

      {previewFor ? (
        <BrevoPreviewModal
          architect={previewFor.architect}
          tender={{
            title: initialData.tender.title,
            buyer: initialData.tender.buyer,
            deadline: initialData.tender.deadline,
          }}
          onCancel={handleClosePreview}
          onConfirm={handleConfirmSend}
        />
      ) : null}
    </>
  );
}

// ============================================================================
// ArchitectCard — 1 ligne de la short-list
// ============================================================================

function ArchitectCard({ row, onSelect }: { row: ArchitectRow; onSelect: () => void }) {
  const sent = row.responseStatus !== null;
  return (
    <article
      className="rounded-md border border-line bg-white p-5 shadow-sm transition hover:border-line-2"
      data-architect-id={row.architectId}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-brand-red">
              #{row.rank}
            </span>
            <h3 className="font-display text-base font-bold text-ink">{row.architect.cabinet}</h3>
            {row.architect.preferred ? (
              <span className="rounded bg-warn-bg px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-warn">
                Préféré
              </span>
            ) : null}
            {sent ? (
              <span
                className="rounded bg-info-bg px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-info"
                data-testid="sent-badge"
              >
                {labelForResponseStatus(row.responseStatus)}
              </span>
            ) : null}
          </div>
          {row.architect.contactName ? (
            <p className="mt-1 text-sm text-ink-2">{row.architect.contactName}</p>
          ) : null}
          {row.rationale ? (
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{row.rationale}</p>
          ) : null}
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-4">
            <Mini label="Score" value={row.score.toFixed(0)} />
            <Mini
              label="Spécialités"
              value={
                row.architect.specialtyCodes.length === 0
                  ? "—"
                  : row.architect.specialtyCodes.slice(0, 2).join(", ")
              }
            />
            <Mini
              label="Zones"
              value={
                row.architect.geoZones.length === 0
                  ? "—"
                  : row.architect.geoZones.slice(0, 4).join(", ")
              }
            />
            <Mini label="Collabs" value={String(row.architect.pastCollabsCount)} />
          </dl>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={onSelect}
            disabled={sent}
            data-testid={`select-architect-${row.rank}`}
            className="rounded-md bg-brand-red px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {sent ? "Déjà sollicité" : "Préparer la sollicitation"}
          </button>
        </div>
      </div>
    </article>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}

// ============================================================================
// Helpers locaux
// ============================================================================

function buildRowsFromInitial(initial: TandemShortlistData): ArchitectRow[] {
  return initial.proposals.map((p) => ({
    architectId: p.architect.id,
    rank: p.rank,
    score: p.score,
    rationale: p.rationale ?? "",
    architect: {
      id: p.architect.id,
      cabinet: p.architect.cabinet,
      contactName: p.architect.contactName,
      tutoiement: p.architect.tutoiement,
      specialtyCodes: p.architect.specialtyCodes,
      geoZones: p.architect.geoZones,
      pastCollabsCount: p.architect.pastCollabsCount,
      preferred: p.architect.preferred,
    },
    responseStatus: p.responseStatus,
  }));
}

function labelForResponseStatus(status: ArchitectResponse["status"] | null): string {
  if (status === "pending") return "Envoyé · en attente";
  if (status === "accepted") return "Accepté";
  if (status === "declined") return "Refusé";
  if (status === "info_requested") return "Plus d'infos";
  return "Envoyé";
}

const ERROR_MESSAGES_FR: Record<string, string> = {
  not_authenticated: "Session expirée. Reconnecte-toi.",
  forbidden_domain: "Accès refusé.",
  invalid_input: "Paramètre invalide. Réessaye.",
  tender_not_found: "Cet AO n'existe plus.",
  architect_not_found: "Architecte introuvable.",
  architect_not_solicitable:
    "Cet architecte n'est plus solicitable (email manquant ou opposé RGPD).",
  invalid_state: "Cette sollicitation a déjà été traitée.",
  brevo_send_failed: "L'envoi du mail a échoué. Réessaye dans quelques instants.",
  internal_error: "Erreur technique. Réessaye dans quelques instants.",
};

function mapErrorToFr(code: string): string {
  return ERROR_MESSAGES_FR[code] ?? ERROR_MESSAGES_FR.internal_error ?? "Erreur technique.";
}
