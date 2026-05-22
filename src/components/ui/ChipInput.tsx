"use client";

/**
 * `ChipInput` — composant générique d'édition d'un `string[]` sous forme de chips.
 *
 * Pattern simple et accessible :
 *  - Une `<input>` libre pour saisir une nouvelle valeur
 *  - `Enter` ou `,` (virgule) valide la valeur courante et l'ajoute en chip
 *  - `Backspace` sur input vide supprime la dernière chip
 *  - Chaque chip a un bouton `×` pour la retirer individuellement
 *
 * Convention de nommage :
 *  - `name` : identifiant pour `aria-label` + `<label htmlFor>` parent
 *  - `values` / `onChange` : pattern contrôlé classique React (le parent
 *    détient la source de vérité)
 *  - `placeholder` : texte d'aide dans l'input
 *  - `validate?` : callback optionnel de validation locale par chip — retourne
 *    `null` si OK, ou un message d'erreur (string) à afficher inline et qui
 *    bloque l'ajout. Permet de filtrer côté client avant POST (cohérent avec
 *    Zod côté serveur).
 *  - `errors?` : erreurs serveur (Zod) à afficher inline sous le champ (le
 *    parent gère le passage depuis `fieldErrors`)
 *
 * Accessibilité :
 *  - Chaque chip a un `<button aria-label="Supprimer {value}">`
 *  - Erreurs `role="alert"`
 *  - Focus visible (`focus:ring-2 focus:ring-neutral-900`)
 *
 * Pourquoi pas une lib externe ? V1 simple, surface minimale, pas de drag/drop,
 * pas d'autocomplétion. Une centaine de lignes suffit. Si besoin Phase 2
 * (suggestion CPV depuis catalogue, drag-reorder), bascule sur react-select ou
 * cmdk + shadcn.
 */

import { useState, type KeyboardEvent } from "react";

interface ChipInputProps {
  /** Identifiant pour les labels / a11y. */
  name: string;
  /** Source de vérité : array de chips. */
  values: string[];
  /** Callback de mise à jour (le parent fait le `setState`). */
  onChange: (next: string[]) => void;
  /** Texte d'aide dans l'input vide. */
  placeholder?: string;
  /**
   * Callback de validation locale par chip — retourne `null` si OK, ou un
   * message d'erreur (string) qui bloque l'ajout et s'affiche inline. Optionnel.
   */
  validate?: (value: string) => string | null;
  /** Erreurs serveur (Zod) à afficher sous le champ. Optionnel. */
  errors?: string[];
  /** Désactive le composant (pendant submit). */
  disabled?: boolean;
}

export function ChipInput({
  name,
  values,
  onChange,
  placeholder,
  validate,
  errors,
  disabled,
}: ChipInputProps) {
  const [draft, setDraft] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function commitDraft() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (validate) {
      const err = validate(trimmed);
      if (err) {
        setLocalError(err);
        return;
      }
    }
    // dedup côté UI (le serveur dedup aussi via Zod transform, mais on évite
    // d'afficher la même chip 2x avant submit)
    if (values.includes(trimmed)) {
      setDraft("");
      setLocalError(null);
      return;
    }
    onChange([...values, trimmed]);
    setDraft("");
    setLocalError(null);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitDraft();
      return;
    }
    if (e.key === "Backspace" && draft === "" && values.length > 0) {
      e.preventDefault();
      onChange(values.slice(0, -1));
    }
  }

  function removeChip(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  const displayedErrors = [...(localError ? [localError] : []), ...(errors ?? [])];

  return (
    <div>
      <div
        className={`flex flex-wrap items-center gap-2 rounded-md border bg-white px-2 py-2 ${
          displayedErrors.length > 0
            ? "border-red-300 focus-within:border-red-500"
            : "border-neutral-300 focus-within:border-neutral-900"
        }`}
      >
        {values.map((value, index) => (
          <span
            key={`${value}-${index}`}
            className="inline-flex items-center gap-1 rounded-sm bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-800"
          >
            {value}
            <button
              type="button"
              onClick={() => removeChip(index)}
              disabled={disabled}
              aria-label={`Supprimer ${value}`}
              className="ml-0.5 rounded-sm px-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 disabled:opacity-40"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          name={name}
          aria-label={name}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            // Reset l'erreur locale dès que l'utilisateur retape
            if (localError) setLocalError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
          placeholder={values.length === 0 ? placeholder : ""}
          disabled={disabled}
          className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-neutral-400 disabled:cursor-not-allowed"
        />
      </div>
      {displayedErrors.length > 0 ? (
        <ul role="alert" className="mt-1 space-y-0.5 text-xs text-red-700">
          {displayedErrors.map((msg, i) => (
            <li key={i}>{msg}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
