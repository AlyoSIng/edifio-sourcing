"use client";

/**
 * CotraitantsListClient — composant client de la bibliothèque cotraitants.
 *
 * Fonctionnalités :
 *  - Tableau : cabinet | contact | email | ville | actions
 *  - Bouton "Nouveau cotraitant" → panneau latéral avec formulaire contrôlé
 *  - Édition en ligne via le même panneau
 *  - Suppression (soft delete) avec confirmation window.confirm
 *  - Filtre texte local (côté client, sur la liste chargée)
 *
 * Pas de dépendance externe (pas de react-hook-form / hookform/resolvers).
 * Validation manuelle via Zod (déjà dans le projet).
 *
 * Source de vérité : demande Board 2026-05-26 (bibliothèque cotraitants).
 */

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";

import type { CotraitantRow } from "./actions";
import { createCotraitant, deleteCotraitant, updateCotraitant } from "./actions";

// ============================================================================
// Schéma Zod de validation
// ============================================================================

const cotraitantSchema = z.object({
  cabinet: z.string().min(1, "Le cabinet est obligatoire").max(200),
  contactName: z.string().max(200).optional(),
  email: z
    .string()
    .max(200)
    .optional()
    .refine((v) => !v || z.string().email().safeParse(v).success, { message: "Email invalide" }),
  phone: z.string().max(30).optional(),
  siret: z
    .string()
    .max(14)
    .optional()
    .refine((v) => !v || /^\d{14}$/.test(v), { message: "SIRET : 14 chiffres attendus" }),
  zip: z.string().max(10).optional(),
  city: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
});

// ============================================================================
// Types du formulaire
// ============================================================================

interface FormState {
  cabinet: string;
  contactName: string;
  email: string;
  phone: string;
  siret: string;
  zip: string;
  city: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  cabinet: "",
  contactName: "",
  email: "",
  phone: "",
  siret: "",
  zip: "",
  city: "",
  notes: "",
};

// ============================================================================
// Props
// ============================================================================

interface Props {
  cotraitants: CotraitantRow[];
  isAdmin: boolean;
}

// ============================================================================
// Composant principal
// ============================================================================

export function CotraitantsListClient({ cotraitants: initialList, isAdmin }: Props) {
  const router = useRouter();

  // Liste locale (mise à jour optimiste après suppression)
  const [list, setList] = useState<CotraitantRow[]>(initialList);

  // Panneau latéral
  const [panelOpen, setPanelOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CotraitantRow | null>(null);

  // Formulaire contrôlé
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // États mutation
  const [, startTransition] = useTransition();

  // Filtre texte local
  const [searchQuery, setSearchQuery] = useState("");
  const filtered = list.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.cabinet.toLowerCase().includes(q) ||
      (c.contactName ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.city ?? "").toLowerCase().includes(q)
    );
  });

  // --- Ouvrir en mode création ---
  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setMutationError(null);
    setPanelOpen(true);
  }

  // --- Ouvrir en mode édition ---
  function openEdit(row: CotraitantRow) {
    setEditTarget(row);
    setForm({
      cabinet: row.cabinet,
      contactName: row.contactName ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      siret: row.siret ?? "",
      zip: row.zip ?? "",
      city: row.city ?? "",
      notes: row.notes ?? "",
    });
    setFieldErrors({});
    setMutationError(null);
    setPanelOpen(true);
  }

  // --- Mise à jour d'un champ ---
  function updateField(name: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
    // Efface l'erreur du champ dès que l'utilisateur retape
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  // --- Soumission ---
  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setMutationError(null);

      // Validation Zod
      const parsed = cotraitantSchema.safeParse({
        cabinet: form.cabinet,
        contactName: form.contactName || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        siret: form.siret || undefined,
        zip: form.zip || undefined,
        city: form.city || undefined,
        notes: form.notes || undefined,
      });

      if (!parsed.success) {
        const errors: Partial<Record<keyof FormState, string>> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path[0] as keyof FormState | undefined;
          if (key && !errors[key]) errors[key] = issue.message;
        }
        setFieldErrors(errors);
        return;
      }

      const payload = {
        cabinet: parsed.data.cabinet,
        contactName: parsed.data.contactName ?? null,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        siret: parsed.data.siret ?? null,
        zip: parsed.data.zip ?? null,
        city: parsed.data.city ?? null,
        notes: parsed.data.notes ?? null,
      };

      setSubmitting(true);

      startTransition(async () => {
        if (editTarget) {
          const result = await updateCotraitant(editTarget.id, payload);
          setSubmitting(false);
          if (!result.ok) {
            setMutationError(mapError(result.error));
            return;
          }
          // Mise à jour optimiste
          setList((prev) =>
            prev.map((c) =>
              c.id === editTarget.id ? { ...c, ...payload, updatedAt: new Date() } : c,
            ),
          );
        } else {
          const result = await createCotraitant(payload);
          setSubmitting(false);
          if (!result.ok) {
            setMutationError(mapError(result.error));
            return;
          }
          // Rafraîchissement complet pour récupérer l'id + createdAt
          router.refresh();
        }
        setPanelOpen(false);
      });
    },
    [form, editTarget, router],
  );

  // --- Suppression (soft delete) ---
  const handleDelete = useCallback((row: CotraitantRow) => {
    if (
      !window.confirm(
        `Archiver le cotraitant "${row.cabinet}" ?\nCette action est réversible par un administrateur.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteCotraitant(row.id);
      if (!result.ok) {
        alert(`Erreur : ${mapError(result.error)}`);
        return;
      }
      setList((prev) => prev.filter((c) => c.id !== row.id));
    });
  }, []);

  return (
    <>
      {/* Barre de contrôle */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Recherche cabinet, contact, email, ville…"
          className="focus:ring-brand-red/40 h-8 flex-1 rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2"
          aria-label="Filtrer les cotraitants"
        />
        {isAdmin ? (
          <button
            type="button"
            onClick={openCreate}
            className="hover:bg-brand-red/90 focus:ring-brand-red/40 inline-flex h-8 items-center gap-1.5 rounded-md bg-brand-red px-4 text-xs font-medium text-white focus:outline-none focus:ring-2"
          >
            + Nouveau cotraitant
          </button>
        ) : null}
      </div>

      {/* Tableau */}
      {filtered.length === 0 ? (
        <EmptyState hasFilter={!!searchQuery.trim()} />
      ) : (
        <div className="overflow-x-auto rounded-md border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface border-b border-line">
                <th className="px-4 py-2.5 text-left font-medium text-ink">Cabinet</th>
                <th className="px-4 py-2.5 text-left font-medium text-ink">Contact</th>
                <th className="px-4 py-2.5 text-left font-medium text-ink">Email</th>
                <th className="px-4 py-2.5 text-left font-medium text-ink">Ville</th>
                {isAdmin ? (
                  <th className="px-4 py-2.5 text-left font-medium text-ink">
                    <span className="sr-only">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-surface/60 border-b border-line last:border-0">
                  <td className="px-4 py-2.5 font-medium text-ink">{row.cabinet}</td>
                  <td className="px-4 py-2.5 text-ink-2">{row.contactName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink-2">
                    {row.email ? (
                      <a
                        href={`mailto:${row.email}`}
                        className="focus:ring-brand-red/40 text-brand-red hover:underline focus:outline-none focus:ring-2"
                      >
                        {row.email}
                      </a>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-ink-2">
                    {row.city ? (
                      <>
                        {row.zip ? `${row.zip} ` : ""}
                        {row.city}
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  {isAdmin ? (
                    <td className="px-4 py-2.5">
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="focus:ring-brand-red/40 text-xs text-muted hover:text-ink focus:outline-none focus:ring-2"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          className="focus:ring-error/40 text-xs text-muted hover:text-error focus:outline-none focus:ring-2"
                        >
                          Archiver
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Panneau latéral (création / édition) */}
      {panelOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editTarget ? "Modifier le cotraitant" : "Nouveau cotraitant"}
          className="fixed inset-0 z-50 flex"
        >
          {/* Overlay */}
          <div
            className="flex-1 bg-black/40"
            onClick={() => setPanelOpen(false)}
            aria-hidden="true"
          />
          {/* Panneau */}
          <div className="flex w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
            {/* En-tête */}
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="font-display text-lg font-semibold text-ink">
                {editTarget ? "Modifier le cotraitant" : "Nouveau cotraitant"}
              </h2>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="focus:ring-brand-red/40 rounded p-1 text-muted hover:text-ink focus:outline-none focus:ring-2"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            {/* Formulaire */}
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 px-6 py-5">
              <Field label="Cabinet *" error={fieldErrors.cabinet}>
                <input
                  type="text"
                  value={form.cabinet}
                  onChange={(e) => updateField("cabinet", e.target.value)}
                  placeholder="Nom du cabinet / entreprise"
                  className={inputCls(!!fieldErrors.cabinet)}
                />
              </Field>

              <Field label="Contact" error={fieldErrors.contactName}>
                <input
                  type="text"
                  value={form.contactName}
                  onChange={(e) => updateField("contactName", e.target.value)}
                  placeholder="Prénom Nom"
                  className={inputCls(!!fieldErrors.contactName)}
                />
              </Field>

              <Field label="Email" error={fieldErrors.email}>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="contact@cabinet.fr"
                  className={inputCls(!!fieldErrors.email)}
                />
              </Field>

              <Field label="Téléphone" error={fieldErrors.phone}>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  placeholder="06 00 00 00 00"
                  className={inputCls(!!fieldErrors.phone)}
                />
              </Field>

              <Field label="SIRET" error={fieldErrors.siret}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.siret}
                  onChange={(e) => updateField("siret", e.target.value)}
                  placeholder="14 chiffres"
                  maxLength={14}
                  className={inputCls(!!fieldErrors.siret)}
                />
              </Field>

              <div className="flex gap-3">
                <Field label="Code postal" error={fieldErrors.zip} className="w-28 shrink-0">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.zip}
                    onChange={(e) => updateField("zip", e.target.value)}
                    placeholder="38000"
                    className={inputCls(!!fieldErrors.zip)}
                  />
                </Field>
                <Field label="Ville" error={fieldErrors.city} className="flex-1">
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => updateField("city", e.target.value)}
                    placeholder="Grenoble"
                    className={inputCls(!!fieldErrors.city)}
                  />
                </Field>
              </div>

              <Field label="Notes internes" error={fieldErrors.notes}>
                <textarea
                  value={form.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                  rows={3}
                  placeholder="Spécialités, contexte de collaboration…"
                  className={inputCls(!!fieldErrors.notes) + " resize-none"}
                />
              </Field>

              {mutationError ? (
                <p role="alert" className="rounded-md bg-error-bg px-3 py-2 text-xs text-error">
                  {mutationError}
                </p>
              ) : null}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="hover:bg-surface focus:ring-brand-red/40 rounded-md border border-line bg-white px-4 py-2 text-sm text-ink focus:outline-none focus:ring-2"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="hover:bg-brand-red/90 focus:ring-brand-red/40 rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 disabled:opacity-50"
                >
                  {submitting ? "Enregistrement…" : editTarget ? "Enregistrer" : "Créer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ============================================================================
// Sous-composants internes
// ============================================================================

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div
      role="status"
      className="rounded-md border border-line bg-white px-6 py-12 text-center text-sm text-muted"
    >
      {hasFilter
        ? "Aucun cotraitant ne correspond à cette recherche."
        : "L'annuaire est vide. Ajoutez un cotraitant via « Nouveau cotraitant »."}
    </div>
  );
}

function Field({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-ink-2">{label}</label>
      {children}
      {error ? <p className="mt-0.5 text-[11px] text-error">{error}</p> : null}
    </div>
  );
}

function inputCls(hasError: boolean): string {
  return [
    "w-full rounded-md border bg-white px-3 py-1.5 text-sm text-ink",
    "placeholder:text-muted focus:outline-none focus:ring-2",
    hasError ? "border-error focus:ring-error/40" : "border-line focus:ring-brand-red/40",
  ].join(" ");
}

function mapError(code: string): string {
  const messages: Record<string, string> = {
    not_authenticated: "Session expirée, veuillez vous reconnecter.",
    forbidden_domain: "Accès refusé : domaine non autorisé.",
    forbidden_role: "Vous n'avez pas les droits nécessaires pour cette action.",
    invalid_input: "Données invalides. Vérifiez les champs du formulaire.",
    not_found: "Enregistrement introuvable.",
    already_associated: "Un cotraitant est déjà associé à cet AO.",
    internal_error: "Erreur interne. Réessayez dans quelques instants.",
  };
  return messages[code] ?? "Erreur inconnue.";
}
