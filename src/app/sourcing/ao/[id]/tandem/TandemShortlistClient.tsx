"use client";

/**
 * Composant Client `TandemShortlistClient` — orchestre la short-list
 * architectes + la preview Brevo + l'envoi de sollicitation.
 *
 * Source de vérité :
 *  - `specs/module_tandem_engine_v1.md` §3.2 (M-D1 short-list + M-D2 preview)
 *  - `handoff/PLAN_TANDEM_NADIA_260522.md` §sous-étape 5
 *
 * Comportement V2 (Tandem V2) :
 *  - Short-list jusqu'à 100 architectes, paginés par 10 côté UI.
 *  - Checkboxes par architecte + barre d'action groupée "Envoyer les sollicitations sélectionnées".
 *  - Ajout manuel d'un architecte via recherche inline (debounce 300ms).
 *  - Relevance learning : le matcher V1 booste les architectes ayant historiquement accepté.
 *  - Le bouton individuel "Préparer la sollicitation" est conservé (BrevoPreviewModal).
 *
 * Pas de WebSocket / Realtime ici — la confirmation arrive de toute façon
 * via l'archi (page tokenisée). On revalide via `router.refresh()` après
 * envoi pour rafraîchir la donnée serveur.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  matchArchitectsForTender,
  persistMatchProposals,
  searchArchitectsForShortlist,
  sendArchitectSolicitation,
  sendBulkArchitectSolicitation,
  type MatchScoreWithArchitect,
  type SearchArchitectsResult,
} from "./actions";
import { BrevoPreviewModal } from "./BrevoPreviewModal";
import type { TandemShortlistData } from "./page-data";
import type { BrevoRegister } from "@/lib/brevo/template-picker";
import type { ArchitectResponse } from "@/db/schema/selections";

const PAGE_SIZE = 10;

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

// Résultat unitaire d'une recherche (sous-ensemble des champs publics)
type SearchResultItem = Extract<SearchArchitectsResult, { ok: true }>["architects"][number];

export function TandemShortlistClient({ tenderId, initialData }: Props) {
  const router = useRouter();

  // --- État principal ---
  const [rows, setRows] = useState<ArchitectRow[]>(() => buildRowsFromInitial(initialData));
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // --- Sélection pour envoi groupé ---
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  // --- Prévisualisation individuelle (modale Brevo) ---
  const [previewFor, setPreviewFor] = useState<ArchitectRow | null>(null);
  const [, startTransition] = useTransition();

  // --- Ajout manuel ---
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Au mount : si pas de match_proposals persistés, runner le matcher V1.
  useEffect(() => {
    if (initialData.proposals.length > 0) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      const result = await matchArchitectsForTender(tenderId, 10);
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
      setPage(0);
      setLoading(false);
      // Persistance fire-and-forget — on ne bloque pas l'UI
      // rank = position dans le tableau trié par score desc (1-indexed)
      void persistMatchProposals(
        tenderId,
        result.matches.map((m, idx) => ({
          architectId: m.architectId,
          score: m.score,
          rank: idx + 1,
          rationale: m.rationale,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [initialData.proposals.length, tenderId]);

  // --- Handlers prévisualisation individuelle ---
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
      router.refresh();
    });
  }

  // --- Handler envoi groupé ---
  async function handleBulkSend() {
    const selected = rows.filter((r) => checked.has(r.architectId) && r.responseStatus === null);
    if (selected.length === 0) return;

    setSending(true);
    setSendError(null);
    setSendSuccess(null);

    const result = await sendBulkArchitectSolicitation(
      tenderId,
      selected.map((r) => ({
        architectId: r.architectId,
        score: r.score,
        rationale: r.rationale,
        rank: r.rank,
      })),
    );

    setSending(false);

    if (!result.ok) {
      setSendError(mapErrorToFr(result.error));
      return;
    }

    // Mise à jour optimiste des lignes envoyées
    setRows((prev) =>
      prev.map((r) =>
        checked.has(r.architectId) && r.responseStatus === null
          ? { ...r, responseStatus: "pending" }
          : r,
      ),
    );
    setChecked(new Set());

    const failMsg =
      result.failed.length > 0
        ? ` (${result.failed.length} échec${result.failed.length > 1 ? "s" : ""})`
        : "";
    setSendSuccess(
      `${result.sent} sollicitation${result.sent > 1 ? "s" : ""} envoyée${result.sent > 1 ? "s" : ""}${failMsg}.`,
    );
    router.refresh();
  }

  // --- Handler toggle checkbox ---
  function handleToggleCheck(architectId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(architectId)) {
        next.delete(architectId);
      } else {
        next.add(architectId);
      }
      return next;
    });
  }

  // --- Recherche architecte (debounce 300ms) ---
  const runSearch = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setSearchResults([]);
        return;
      }
      setSearching(true);
      const excludeIds = rows.map((r) => r.architectId);
      const result = await searchArchitectsForShortlist(q.trim(), excludeIds);
      setSearching(false);
      if (result.ok) {
        setSearchResults(result.architects);
      } else {
        setSearchResults([]);
      }
    },
    [rows],
  );

  function handleSearchQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(q);
    }, 300);
  }

  function handleAddFromSearch(item: SearchResultItem) {
    const newRow: ArchitectRow = {
      architectId: item.id,
      rank: rows.length + 1,
      score: 50,
      rationale: "Ajouté manuellement",
      architect: {
        id: item.id,
        cabinet: item.cabinet,
        contactName: item.contactName,
        tutoiement: false,
        specialtyCodes: item.specialtyCodes,
        geoZones: item.geoZones,
        pastCollabsCount: 0,
        preferred: item.preferred,
      },
      responseStatus: null,
    };
    setRows((prev) => [...prev, newRow]);
    // Réinitialise la recherche
    setSearchQuery("");
    setSearchResults([]);
    setShowSearch(false);
  }

  // --- Rendu ---

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
          l&rsquo;administration pour activer le mode Cotraitance.
        </p>
      </div>
    );
  }

  // Pagination
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Nombre de cochés éligibles à l'envoi (pas déjà sollicités)
  const eligibleCheckedCount = rows.filter(
    (r) => checked.has(r.architectId) && r.responseStatus === null,
  ).length;

  return (
    <>
      {/* Barre d'action groupée */}
      <div className="mb-4 flex items-center justify-between gap-4 rounded-md border border-line bg-white px-4 py-3">
        <span className="text-sm text-ink-2">
          {eligibleCheckedCount > 0 ? (
            <>
              <strong className="text-ink">{eligibleCheckedCount}</strong> architecte
              {eligibleCheckedCount > 1 ? "s" : ""} sélectionné{eligibleCheckedCount > 1 ? "s" : ""}
            </>
          ) : (
            <span className="text-muted">Cochez les architectes à solliciter en groupe</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => void handleBulkSend()}
          disabled={eligibleCheckedCount === 0 || sending}
          className="rounded-md bg-brand-red px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          {sending ? "Envoi…" : "Envoyer les sollicitations sélectionnées"}
        </button>
      </div>

      {/* Feedback envoi groupé */}
      {sendSuccess && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 rounded-md border border-l-4 border-line border-l-success bg-success-bg p-4 text-sm text-success"
        >
          {sendSuccess}
        </div>
      )}
      {sendError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-l-4 border-line border-l-error bg-error-bg p-4 text-sm text-error"
        >
          {sendError}
        </div>
      )}

      {/* Liste des architectes */}
      <ol
        className="flex flex-col gap-4"
        aria-label={`Liste des architectes proposés (${rows.length})`}
      >
        {pageRows.map((row) => (
          <li key={row.architectId}>
            <ArchitectCard
              row={row}
              checked={checked.has(row.architectId)}
              onToggleCheck={() => handleToggleCheck(row.architectId)}
              onSelect={() => handleSelectArchitect(row)}
            />
          </li>
        ))}
      </ol>

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-sm border border-line-2 px-3 py-1 text-xs font-medium text-ink transition hover:bg-paper-2 disabled:opacity-40"
          >
            &larr; Précédent
          </button>
          <span className="text-xs text-muted">
            Page {page + 1} / {totalPages} &middot; {rows.length} architectes
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="rounded-sm border border-line-2 px-3 py-1 text-xs font-medium text-ink transition hover:bg-paper-2 disabled:opacity-40"
          >
            Suivant &rarr;
          </button>
        </div>
      ) : null}

      {/* Section ajout manuel */}
      <div className="mt-6">
        {!showSearch ? (
          <button
            type="button"
            onClick={() => setShowSearch(true)}
            className="rounded-md border border-dashed border-line bg-white px-4 py-3 text-sm font-medium text-ink-2 transition hover:border-brand-red hover:text-brand-red focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1"
          >
            + Ajouter un architecte
          </button>
        ) : (
          <div className="rounded-md border border-line bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Rechercher un architecte</span>
              <button
                type="button"
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery("");
                  setSearchResults([]);
                }}
                className="text-xs text-muted hover:text-ink"
                aria-label="Fermer la recherche"
              >
                Fermer
              </button>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchQueryChange}
              placeholder="Rechercher par cabinet ou nom…"
              className="w-full rounded border border-line bg-neutral-50 px-3 py-2 text-sm text-ink placeholder-muted focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red"
              autoFocus
            />
            {searching && <p className="mt-2 text-xs text-muted">Recherche en cours…</p>}
            {!searching && searchResults.length > 0 && (
              <ul className="mt-2 divide-y divide-line rounded border border-line bg-white shadow-sm">
                {searchResults.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleAddFromSearch(item)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-red"
                    >
                      <span>
                        <span className="font-medium text-ink">{item.cabinet}</span>
                        {item.contactName ? (
                          <span className="ml-2 text-ink-2">{item.contactName}</span>
                        ) : null}
                      </span>
                      {item.preferred ? (
                        <span className="rounded bg-warn-bg px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-warn">
                          Préféré
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
              <p className="mt-2 text-xs text-muted">Aucun résultat.</p>
            )}
          </div>
        )}
      </div>

      {/* Lien vers la gestion du cotraitant de l'AO */}
      <div className="mt-6 border-t border-line pt-4">
        <a
          href={`/sourcing/ao/${tenderId}/tandem/cotraitant`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-red hover:underline"
        >
          &#8599; Cotraitant — gestion et documents
        </a>
        <p className="mt-0.5 text-xs text-muted">
          Associez un cotraitant à cet AO et gérez les pièces échangées.
        </p>
      </div>

      {/* Modale de prévisualisation individuelle */}
      {previewFor ? (
        <BrevoPreviewModal
          architect={previewFor.architect}
          tender={{
            title: initialData.tender.title,
            buyer: initialData.tender.buyer,
            deadline: initialData.tender.deadline,
          }}
          nomCommercial="AlyoS Ingénierie"
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

function ArchitectCard({
  row,
  checked,
  onToggleCheck,
  onSelect,
}: {
  row: ArchitectRow;
  checked: boolean;
  onToggleCheck: () => void;
  onSelect: () => void;
}) {
  const sent = row.responseStatus !== null;
  return (
    <article
      className="rounded-md border border-line bg-white p-5 shadow-sm transition hover:border-line-2"
      data-architect-id={row.architectId}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Checkbox de sélection groupée */}
        <div className="mt-0.5 flex-shrink-0">
          <input
            type="checkbox"
            id={`check-${row.architectId}`}
            checked={checked}
            disabled={sent}
            onChange={onToggleCheck}
            aria-label={`Sélectionner ${row.architect.cabinet}`}
            className="h-4 w-4 rounded border-line accent-brand-red disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

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
