"use client";

/**
 * LibraryClient — composant Client de la bibliothèque entreprise AlyoS.
 *
 * Affiche une section par catégorie de document (kind). Pour chaque section :
 *  - Liste des documents existants avec nom, taille, date d'upload et badge
 *    d'expiration coloré.
 *  - Bouton "Supprimer" avec confirmation native.
 *  - Zone d'upload (fichier + date d'expiration optionnelle + notes optionnelles).
 *
 * Gestion d'état :
 *  - `useTransition` pour les Server Actions (indicateur de chargement).
 *  - `useState` pour les messages d'erreur inline par section.
 *
 * Source de vérité :
 *  - Spec PR-A module dossier IA (brief Board 2026-05-25)
 */

import { useRef, useState, useTransition } from "react";

import type { PresentationLibraryItem } from "@/db/schema/library";
import { deleteLibraryDoc, uploadLibraryDoc } from "./actions";
import {
  indexLibraryBatchAction,
  reindexLibraryItemAction,
  type IndexLibraryResult,
  type LibraryIndexDetail,
} from "./index-actions";

// ---------------------------------------------------------------------------
// Constantes : catégories de documents
// ---------------------------------------------------------------------------

/**
 * Catégories officielles de la bibliothèque entreprise AlyoS.
 * Ordre validé par Steve (2026-05-26) : formulaires DC d'abord, puis attestations
 * avec expiration, puis documents de présentation et références, "autre" en dernier.
 *
 * Étendu 2026-06-03 (Steve) : 3 rubriques « déclarations » ajoutées pour matcher
 * les pièces que les RC réclament fréquemment et que l'analyse Claude faisait
 * apparaître en « Manquant » sans qu'on puisse les attacher à la biblio :
 *  - Déclaration sur l'honneur (art. R2143-7 CCP)
 *  - Déclaration de chiffre d'affaires global et spécifique
 *  - Déclaration d'effectifs moyens annuels
 *
 * Note backward-compat : les documents existants avec un kind hors de cette liste
 * (ex. "bilan", "dc2_vierge", "dc4_vierge") sont automatiquement redirigés vers
 * la section "autre" dans la logique de groupement (cf. byKind fallback ci-dessous).
 */
export const LIBRARY_KINDS = [
  { key: "dc1", label: "DC1 — Déclaration du candidat", hasExpiry: false },
  { key: "dc2", label: "DC2 — Déclaration du candidat (lots)", hasExpiry: false },
  { key: "dc4", label: "DC4 — Déclaration de sous-traitance (optionnel)", hasExpiry: false },
  { key: "pouvoir_mandataire", label: "Pouvoir mandataire", hasExpiry: false },
  { key: "kbis", label: "Extrait Kbis", hasExpiry: true },
  { key: "urssaf", label: "Attestation URSSAF", hasExpiry: true },
  { key: "attestation_fiscale", label: "Attestation fiscale DGFiP", hasExpiry: true },
  { key: "assurance_rc", label: "Assurance RC professionnelle", hasExpiry: true },
  {
    key: "declaration_honneur",
    label: "Déclaration sur l'honneur (art. R2143-7 CCP)",
    hasExpiry: false,
  },
  {
    key: "declaration_ca",
    label: "Déclaration de chiffre d'affaires (global et prestations, 3 derniers exercices)",
    hasExpiry: false,
  },
  {
    key: "declaration_effectifs",
    label: "Déclaration d'effectifs moyens annuels et personnel d'encadrement",
    hasExpiry: false,
  },
  { key: "rib", label: "RIB bancaire", hasExpiry: false },
  { key: "presentation_entreprise", label: "Présentation de l'entreprise", hasExpiry: false },
  { key: "moyens_humains", label: "Moyens humains et matériels", hasExpiry: false },
  { key: "references", label: "Références de marchés", hasExpiry: false },
  { key: "memoire_rse", label: "Mémoire RSE / développement durable", hasExpiry: false },
  { key: "autre", label: "Autre document", hasExpiry: false },
] as const;

type KindKey = (typeof LIBRARY_KINDS)[number]["key"];

// ---------------------------------------------------------------------------
// Helpers de formatage
// ---------------------------------------------------------------------------

/**
 * Formate une taille en octets en Ko ou Mo lisible.
 * < 1 024 octets → "X Ko"
 * >= 1 024 octets → "X.x Mo"
 */
function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} Ko`;
  return `${(kb / 1024).toFixed(1)} Mo`;
}

/** Formate une date ISO (YYYY-MM-DD ou timestamp) en dd/MM/yyyy. */
function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Badge d'expiration
// ---------------------------------------------------------------------------

/** Calcule le nombre de jours restants avant expiration (peut être négatif). */
function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  // Comparaison en jours entiers
  const diffMs = target.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0);
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

interface ExpiryBadgeProps {
  validUntil: string | null | undefined;
}

function ExpiryBadge({ validUntil }: ExpiryBadgeProps) {
  const days = daysUntil(validUntil);

  if (days === null) return null;

  if (days <= 0) {
    return (
      <span className="inline-flex items-center rounded bg-error-bg px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-error">
        Expiré
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="inline-flex items-center rounded bg-error-bg px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-error">
        J−{days}
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-amber-700">
        J−{days}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded bg-success-bg px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-success">
      {formatDate(validUntil)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

interface LibraryClientProps {
  entries: PresentationLibraryItem[];
  /**
   * Détails d'indexation IA (chantier E + G1 polish). Sérialisé Server → Client
   * (Date en ISO string). Utilisé pour :
   *  - afficher le badge « ✓ Indexé » sur chaque item
   *  - dévoiler un panneau dépliable avec extracted_title, keywords, summary, doc_type
   *  - permettre la ré-indexation 1-clic d'un item via reindexLibraryItemAction
   */
  indexDetails?: LibraryIndexDetail[];
}

export function LibraryClient({ entries, indexDetails = [] }: LibraryClientProps) {
  // Groupe les entrées par kind pour accès O(1) dans chaque section
  const byKind = new Map<KindKey, PresentationLibraryItem[]>();
  for (const kind of LIBRARY_KINDS) {
    byKind.set(kind.key, []);
  }
  for (const item of entries) {
    const key = item.kind as KindKey;
    if (byKind.has(key)) {
      byKind.get(key)!.push(item);
    } else {
      // Catégorie inconnue → regroupée sous "autre" pour robustesse
      byKind.get("autre")!.push(item);
    }
  }

  // Map locale itemId → détails — mutable pour optimistic update après ré-index.
  const [indexMap, setIndexMap] = useState<Map<string, LibraryIndexDetail>>(
    () => new Map(indexDetails.map((d) => [d.libraryItemId, d])),
  );

  // État indexation IA (chantier E).
  const [isIndexing, startIndexing] = useTransition();
  const [indexResult, setIndexResult] = useState<IndexLibraryResult | null>(null);

  function handleIndex() {
    setIndexResult(null);
    startIndexing(async () => {
      const result = await indexLibraryBatchAction();
      setIndexResult(result);
      if (result.ok) {
        // Optimistic : on ne sait pas exactement quels items ont été indexés,
        // mais on déclenche un router.refresh côté server via revalidatePath.
        // Le re-render passera de toute façon par les props server.
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Barre d'actions IA — bouton « Indexer avec IA » + résumé du dernier run */}
      <section className="flex flex-col gap-2 rounded-lg border border-line bg-paper-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-ink-2">
          <strong className="text-ink">🤖 Indexation IA</strong>
          <p className="mt-0.5 text-xs text-muted">
            Claude analyse chaque doc pour extraire titre, mots-clés et type. Améliore le matching
            futur avec les RC. ~3-5s par doc, traité par lots de 15.
          </p>
        </div>
        <button
          type="button"
          onClick={handleIndex}
          disabled={isIndexing}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isIndexing ? "Indexation en cours…" : "Indexer la bibliothèque"}
        </button>
      </section>

      {/* Résultat du dernier indexing — feedback transitoire */}
      {indexResult && (
        <div
          role={indexResult.ok ? "status" : "alert"}
          className={`rounded-md border border-l-4 px-4 py-3 text-sm ${
            indexResult.ok
              ? "border-line border-l-success bg-success-bg text-success"
              : "border-line border-l-error bg-error-bg text-error"
          }`}
        >
          {indexResult.ok ? (
            <>
              <strong>Indexation terminée — </strong>
              {indexResult.indexed} doc{indexResult.indexed > 1 ? "s" : ""} indexé
              {indexResult.indexed > 1 ? "s" : ""}, {indexResult.skipped} inchangé
              {indexResult.skipped > 1 ? "s" : ""}, {indexResult.failed} échec
              {indexResult.failed > 1 ? "s" : ""}.
              {indexResult.remaining > 0 && (
                <>
                  {" "}
                  {indexResult.remaining} restant{indexResult.remaining > 1 ? "s" : ""} — relancez
                  pour continuer.
                </>
              )}
              {indexResult.errors && indexResult.errors.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-xs">
                  {indexResult.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>
                      <strong>{e.name}</strong> : {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>Erreur — {indexResult.error}</>
          )}
        </div>
      )}

      {LIBRARY_KINDS.map((kindMeta) => (
        <KindSection
          key={kindMeta.key}
          kindKey={kindMeta.key}
          label={kindMeta.label}
          hasExpiry={kindMeta.hasExpiry}
          items={byKind.get(kindMeta.key) ?? []}
          indexMap={indexMap}
          onItemReindexed={(detail) => {
            setIndexMap((prev) => {
              const next = new Map(prev);
              next.set(detail.libraryItemId, detail);
              return next;
            });
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section par catégorie
// ---------------------------------------------------------------------------

interface KindSectionProps {
  kindKey: KindKey;
  label: string;
  hasExpiry: boolean;
  items: PresentationLibraryItem[];
  /** Map détaillée { itemId → métadonnées IA } (chantier E + G1). */
  indexMap?: Map<string, LibraryIndexDetail>;
  /** Callback après ré-indexation 1-item réussie (MAJ optimistic côté parent). */
  onItemReindexed?: (detail: LibraryIndexDetail) => void;
}

function KindSection({
  kindKey,
  label,
  hasExpiry,
  items,
  indexMap,
  onItemReindexed,
}: KindSectionProps) {
  // Items dont le panneau « détails IA » est ouvert. ID-set local par section.
  const [openDetailIds, setOpenDetailIds] = useState<Set<string>>(new Set());
  // ID de l'item en cours de ré-indexation (un seul à la fois — UX claire).
  const [reindexingId, setReindexingId] = useState<string | null>(null);
  const [reindexError, setReindexError] = useState<string | null>(null);
  const [isReindexPending, startReindex] = useTransition();

  function toggleDetails(id: string) {
    setOpenDetailIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleReindex(id: string) {
    setReindexError(null);
    setReindexingId(id);
    startReindex(async () => {
      const result = await reindexLibraryItemAction(id);
      if (result.ok) {
        onItemReindexed?.(result.details);
        // Auto-ouvre le panneau détail pour qu'on voie ce que Claude a sorti.
        setOpenDetailIds((prev) => new Set(prev).add(id));
      } else {
        setReindexError(`${id.slice(0, 8)}… : ${result.message ?? result.error}`);
      }
      setReindexingId(null);
    });
  }
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const notesInputRef = useRef<HTMLTextAreaElement>(null);

  // --- Suppression ---
  function handleDelete(id: string, storagePath: string, name: string) {
    if (!confirm(`Supprimer « ${name} » ? Cette action est irréversible.`)) return;

    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteLibraryDoc(id, storagePath);
      if (!result.ok) {
        setDeleteError(deleteErrorLabel(result.error));
      }
    });
  }

  // --- Upload ---
  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploadError(null);

    const fd = new FormData(e.currentTarget);
    fd.set("kind", kindKey);

    startTransition(async () => {
      const result = await uploadLibraryDoc(fd);
      if (result.ok) {
        // Réinitialise les champs du formulaire après succès
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (dateInputRef.current) dateInputRef.current.value = "";
        if (notesInputRef.current) notesInputRef.current.value = "";
      } else {
        setUploadError(uploadErrorLabel(result.error));
      }
    });
  }

  return (
    <section
      className="rounded-md border border-line bg-white"
      aria-labelledby={`section-${kindKey}`}
    >
      {/* En-tête de section */}
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 id={`section-${kindKey}`} className="font-display text-sm font-semibold text-ink">
          {label}
        </h2>
        <span className="font-mono text-xs text-muted">
          {items.length} document{items.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-4 px-4 py-3">
        {/* Liste des documents existants */}
        {items.length > 0 ? (
          <ul className="divide-y divide-line" role="list">
            {items.map((item) => {
              const detail = indexMap?.get(item.id);
              const isOpen = openDetailIds.has(item.id);
              const isThisReindexing = reindexingId === item.id && isReindexPending;
              return (
                <li key={item.id} className="flex flex-col gap-2 py-2.5">
                  <div className="flex items-start gap-3">
                    {/* Icône fichier */}
                    <div className="mt-0.5 shrink-0 text-muted" aria-hidden>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        width={16}
                        height={16}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>

                    {/* Infos document */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">{item.name}</span>
                        {item.validUntil && <ExpiryBadge validUntil={item.validUntil} />}
                        {detail && (
                          <button
                            type="button"
                            onClick={() => toggleDetails(item.id)}
                            className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 transition hover:bg-emerald-100"
                            title="Cliquer pour voir les métadonnées extraites par Claude"
                            aria-expanded={isOpen}
                          >
                            ✓ Indexé {isOpen ? "▴" : "▾"}
                          </button>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted">
                        <span>{formatBytes(item.sizeBytes)}</span>
                        <span>Ajouté le {formatDate(item.createdAt)}</span>
                        {item.notes && <span className="italic">{item.notes}</span>}
                      </div>
                    </div>

                    {/* Actions : ré-indexer + supprimer */}
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleReindex(item.id)}
                        disabled={isReindexPending}
                        className="rounded px-2 py-1 text-xs font-medium text-ink-2 transition hover:bg-paper-2 disabled:opacity-50"
                        title={
                          detail
                            ? "Force une nouvelle analyse Claude (bypass cache)"
                            : "Lance l'analyse Claude pour cet item"
                        }
                        aria-label={`Ré-indexer ${item.name}`}
                      >
                        {isThisReindexing ? "🤖 …" : "🤖 Ré-indexer"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id, item.storagePath, item.name)}
                        disabled={isPending}
                        className="rounded px-2 py-1 text-xs font-medium text-error transition hover:bg-error-bg disabled:opacity-50"
                        aria-label={`Supprimer ${item.name}`}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>

                  {/* Panneau dépliable — détails IA */}
                  {isOpen && detail && (
                    <div className="ml-7 rounded-md border border-emerald-100 bg-emerald-50/50 p-3 text-xs text-ink-2">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {detail.extractedTitle && (
                          <div className="sm:col-span-2">
                            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                              Titre IA
                            </span>
                            <p className="mt-0.5 text-sm font-medium text-ink">
                              {detail.extractedTitle}
                            </p>
                          </div>
                        )}
                        {detail.docType && (
                          <div>
                            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                              Type détecté
                            </span>
                            <p className="mt-0.5">
                              <code className="rounded bg-white px-1.5 py-0.5 text-[11px] text-ink">
                                {detail.docType}
                              </code>
                            </p>
                          </div>
                        )}
                        <div>
                          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                            Indexé le
                          </span>
                          <p className="mt-0.5">
                            {new Date(detail.indexedAtIso).toLocaleString("fr-FR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {detail.modelVersion && (
                              <span className="ml-1.5 text-muted">({detail.modelVersion})</span>
                            )}
                          </p>
                        </div>
                      </div>
                      {detail.summary && (
                        <div className="mt-2">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                            Résumé
                          </span>
                          <p className="mt-0.5 text-sm italic">{detail.summary}</p>
                        </div>
                      )}
                      {detail.keywords.length > 0 && (
                        <div className="mt-2">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                            Mots-clés
                          </span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {detail.keywords.map((kw) => (
                              <span
                                key={kw}
                                className="rounded-full bg-white px-2 py-0.5 text-[10px] text-ink-2"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {Object.keys(detail.extractedEntities).length > 0 && (
                        <div className="mt-2">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                            Entités structurées
                          </span>
                          <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-[11px] text-ink-2">
                            {JSON.stringify(detail.extractedEntities, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-1 text-sm italic text-muted">Aucun document dans cette catégorie.</p>
        )}

        {/* Erreur de suppression */}
        {deleteError && (
          <p role="alert" className="text-sm text-error">
            {deleteError}
          </p>
        )}

        {/* Erreur de ré-indexation 1-item (G1). */}
        {reindexError && (
          <p role="alert" className="text-sm text-error">
            Ré-indexation : {reindexError}
          </p>
        )}

        {/* Formulaire d'upload */}
        <form onSubmit={handleUpload} className="rounded border border-dashed border-line p-3">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink-2">
            Ajouter un document
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Champ fichier */}
            <div className="sm:col-span-2">
              <label
                htmlFor={`file-${kindKey}`}
                className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted"
              >
                Fichier (PDF, Word, Excel, image — max 50 Mo)
              </label>
              <input
                ref={fileInputRef}
                id={`file-${kindKey}`}
                name="file"
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
                required
                disabled={isPending}
                className="hover:file:bg-ink/80 w-full rounded border border-line bg-paper px-2 py-1.5 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-ink file:px-2 file:py-1 file:text-xs file:font-medium file:text-white disabled:opacity-50"
              />
            </div>

            {/* Date d'expiration (uniquement pour les catégories avec hasExpiry) */}
            {hasExpiry && (
              <div>
                <label
                  htmlFor={`valid-until-${kindKey}`}
                  className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted"
                >
                  Date d&apos;expiration (optionnelle)
                </label>
                <input
                  ref={dateInputRef}
                  id={`valid-until-${kindKey}`}
                  name="validUntil"
                  type="date"
                  disabled={isPending}
                  className="w-full rounded border border-line bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red disabled:opacity-50"
                />
              </div>
            )}

            {/* Notes (optionnelles, toutes catégories) */}
            <div className={hasExpiry ? "" : "sm:col-span-2"}>
              <label
                htmlFor={`notes-${kindKey}`}
                className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted"
              >
                Notes (optionnel)
              </label>
              <textarea
                ref={notesInputRef}
                id={`notes-${kindKey}`}
                name="notes"
                rows={2}
                maxLength={500}
                disabled={isPending}
                placeholder="Ex. version 2024, agence Normandie…"
                className="w-full rounded border border-line bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red disabled:opacity-50"
              />
            </div>
          </div>

          {/* Erreur d'upload */}
          {uploadError && (
            <p role="alert" className="mt-2 text-sm text-error">
              {uploadError}
            </p>
          )}

          {/* Bouton submit */}
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={isPending}
              className="hover:bg-ink/80 rounded bg-ink px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50"
            >
              {isPending ? "Envoi en cours…" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Labels d'erreur lisibles
// ---------------------------------------------------------------------------

function uploadErrorLabel(code: string | undefined): string {
  switch (code) {
    case "not_authenticated":
      return "Session expirée — reconnectez-vous.";
    case "forbidden_role":
      return "Accès refusé — rôle admin requis.";
    case "missing_file":
      return "Veuillez sélectionner un fichier.";
    case "missing_kind":
      return "Catégorie manquante — rechargez la page.";
    case "invalid_kind":
      return "Catégorie invalide — rechargez la page.";
    case "file_too_large":
      return "Fichier trop volumineux (max 50 Mo).";
    case "invalid_mime_type":
      return "Type de fichier non autorisé (PDF, Word, Excel, image uniquement).";
    case "invalid_valid_until":
      return "Date d'expiration invalide (format YYYY-MM-DD attendu).";
    case "storage_upload_failed":
      return "Erreur lors de l'upload vers le stockage — réessayez.";
    case "db_insert_failed":
      return "Erreur d'enregistrement en base — le fichier a été supprimé du stockage.";
    default:
      return "Erreur inattendue — réessayez ou contactez l'administrateur.";
  }
}

function deleteErrorLabel(code: string | undefined): string {
  switch (code) {
    case "not_authenticated":
      return "Session expirée — reconnectez-vous.";
    case "forbidden_role":
      return "Accès refusé — rôle admin requis.";
    case "document_not_found":
      return "Document introuvable — rechargez la page.";
    case "storage_delete_failed":
      return "Erreur lors de la suppression du fichier — réessayez.";
    case "db_delete_failed":
      return "Erreur de suppression en base — réessayez.";
    default:
      return "Erreur inattendue — réessayez ou contactez l'administrateur.";
  }
}
