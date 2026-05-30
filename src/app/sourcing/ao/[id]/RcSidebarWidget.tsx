"use client";

/**
 * RcSidebarWidget — widget sidebar affichant le statut du RC (Règlement de consultation)
 * et proposant un bouton d'import direct depuis la page détail d'un AO.
 *
 * 4 états :
 *   A — Pas de RC importé + dceUrl présente  → bouton "Importer le RC"
 *   B — Pas de RC importé + pas de dceUrl    → lien "Importer manuellement"
 *   C — RC importé, non analysé              → lien "Analyser →"
 *   D — RC importé ET analysé                → lien "Documents requis →" + "Dossier complet →"
 *
 * Après un import réussi (état A → C), le state React local est mis à jour
 * immédiatement — pas de revalidation requise pour l'UX immédiate.
 *
 * Contraintes :
 *   - Tokens DS uniquement (brand-red, ink, muted, line, paper-2, success, error, warn)
 *   - Boutons action = rounded-full
 *   - useTransition pour le pending state de l'import
 */

import { useTransition, useState } from "react";
import Link from "next/link";

import { downloadDceFromUrl } from "./dossier/actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RcDocumentInfo {
  id: string;
  name: string;
  sizeBytes: number | null;
  analyzed: boolean;
  uploadedAt: Date;
}

interface RcSidebarWidgetProps {
  tenderId: string;
  dceUrl: string | null;
  rcDocument: RcDocumentInfo | null;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** Formate une taille en octets en chaîne lisible (Ko / Mo). */
function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export function RcSidebarWidget({ tenderId, dceUrl, rcDocument }: RcSidebarWidgetProps) {
  const [isPending, startTransition] = useTransition();
  const [importError, setImportError] = useState<string | null>(null);

  // Après un import réussi : on pose un document local en mémoire (état C)
  // sans attendre le revalidatePath côté serveur.
  const [localDoc, setLocalDoc] = useState<RcDocumentInfo | null>(null);

  // Document effectif : priorité à localDoc (import venant de se produire),
  // sinon le document passé en props par le Server Component.
  const effectiveDoc = localDoc ?? rcDocument;

  // ---------------------------------------------------------------------------
  // Handler import
  // ---------------------------------------------------------------------------

  function handleImport() {
    setImportError(null);
    startTransition(async () => {
      const result = await downloadDceFromUrl(tenderId);
      if (result.ok) {
        // Passage immédiat à l'état C — nom générique, taille inconnue avant revalidation
        setLocalDoc({
          id: "pending",
          name: "RC.pdf",
          sizeBytes: null,
          analyzed: false,
          uploadedAt: new Date(),
        });
      } else {
        const msgs: Record<string, string> = {
          not_authenticated: "Vous devez être connecté pour importer le RC.",
          tender_not_found: "AO introuvable.",
          no_dce_url: "Aucune URL DCE renseignée sur cet AO.",
          invalid_dce_url: "L'URL DCE est invalide ou non autorisée (SSRF).",
          fetch_failed: "Échec du téléchargement — vérifiez que la plateforme est accessible.",
          not_a_pdf:
            "L'URL DCE ne pointe pas vers un PDF direct. Importez le RC manuellement depuis le dossier.",
          storage_upload_failed: "Erreur de stockage. Réessayez dans quelques instants.",
          db_insert_failed: "Erreur d'enregistrement en base. Réessayez.",
          internal_error: "Erreur interne. Contactez le support si le problème persiste.",
        };
        setImportError(msgs[result.error ?? "internal_error"] ?? "Erreur inconnue.");
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------------------

  return (
    <section className="rounded-md border border-line bg-white p-5">
      <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-muted">
        RC — Règlement de consultation
      </h2>

      {effectiveDoc === null ? (
        /* ---- État A ou B : pas de RC importé ---- */
        dceUrl ? (
          /* État A : URL DCE présente → bouton import */
          <div className="space-y-3">
            <p className="text-xs text-muted">RC non importé.</p>

            <button
              type="button"
              disabled={isPending}
              onClick={handleImport}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-red px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? (
                "Import en cours…"
              ) : (
                <>
                  {/* Icône téléchargement */}
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 shrink-0"
                    aria-hidden
                  >
                    <path d="M10 3v10m0 0-3-3m3 3 3-3" />
                    <path d="M3 14v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" />
                  </svg>
                  Importer le RC
                </>
              )}
            </button>

            {importError && (
              <>
                <p
                  role="alert"
                  className="rounded-md border border-error bg-error-bg px-3 py-2 text-xs text-error"
                >
                  {importError}
                </p>
                <Link
                  href={`/sourcing/ao/${tenderId}/dossier`}
                  className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
                >
                  Importer manuellement → Dossier
                </Link>
              </>
            )}
          </div>
        ) : (
          /* État B : pas d'URL DCE → import manuel uniquement */
          <div className="space-y-2">
            <p className="text-xs text-warn">URL DCE manquante.</p>
            <Link
              href={`/sourcing/ao/${tenderId}/dossier`}
              className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Importer manuellement → Dossier
            </Link>
          </div>
        )
      ) : effectiveDoc.analyzed ? (
        /* ---- État D : RC analysé ---- */
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            {/* Icône check */}
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 shrink-0 text-success"
              aria-hidden
            >
              <path d="M4 10l4.5 4.5L16 6" />
            </svg>
            <span className="text-sm font-medium text-success">RC analysé</span>
          </div>
          <p className="text-xs text-muted">
            {effectiveDoc.name}
            {effectiveDoc.sizeBytes ? ` · ${formatSize(effectiveDoc.sizeBytes)}` : ""}
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href={`/sourcing/ao/${tenderId}/dossier/pieces`}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-brand-red px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red"
            >
              Documents requis →
            </Link>
            <Link
              href={`/sourcing/ao/${tenderId}/dossier`}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:bg-paper-2"
            >
              Dossier complet →
            </Link>
          </div>
        </div>
      ) : (
        /* ---- État C : RC importé, non analysé ---- */
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            {/* Icône document */}
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 shrink-0 text-success"
              aria-hidden
            >
              <rect x="4" y="2" width="12" height="16" rx="1.5" />
              <path d="M7 7h6M7 10h6M7 13h4" />
            </svg>
            <span className="text-sm font-medium text-success">RC importé</span>
          </div>
          <p className="text-xs text-muted">
            {effectiveDoc.name}
            {effectiveDoc.sizeBytes ? ` · ${formatSize(effectiveDoc.sizeBytes)}` : ""}
          </p>
          <Link
            href={`/sourcing/ao/${tenderId}/dossier`}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-red px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red"
          >
            Analyser →
          </Link>
        </div>
      )}
    </section>
  );
}
