"use client";

/**
 * OrgBrandingForm — formulaire de personnalisation de l'organisation.
 *
 * Sections :
 *  1. Logo — upload PNG/JPEG/WebP/SVG (max 512 Ko), aperçu + suppression.
 *  2. Couleur dominante — color picker hex, synchronisé avec un input texte,
 *     aperçu live du bouton CTA avec la couleur choisie.
 *  3. Police d'affichage — select parmi 4 familles, aperçu live du titre.
 *
 * Chaque section dispose de son propre état de soumission indépendant
 * (useTransition) pour éviter un spinner global bloquant.
 *
 * Les actions couleur + police sont groupées dans un seul formulaire.
 * L'upload logo est un formulaire séparé (file FormData).
 */

import { useCallback, useRef, useState, useTransition } from "react";

import { FONT_OPTIONS, type OrgBranding } from "@/lib/admin/branding";

import {
  removeLogoAction,
  updateBrandingAction,
  uploadLogoAction,
  type BrandingActionResult,
} from "./actions";

interface OrgBrandingFormProps {
  branding: OrgBranding | null;
}

/* -------------------------------------------------------------------------- */
/*  Composant principal                                                        */
/* -------------------------------------------------------------------------- */

export function OrgBrandingForm({ branding }: OrgBrandingFormProps) {
  return (
    <div className="flex flex-col gap-8">
      <LogoSection currentLogoUrl={branding?.logoUrl ?? null} />
      <ColorFontSection
        currentColor={branding?.primaryColor ?? ""}
        currentFont={branding?.fontFamily ?? ""}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section Logo                                                               */
/* -------------------------------------------------------------------------- */

function LogoSection({ currentLogoUrl }: { currentLogoUrl: string | null }) {
  const [isPending, startTransition] = useTransition();
  const [isRemoving, startRemoveTransition] = useTransition();
  const [result, setResult] = useState<BrandingActionResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Aperçu immédiat local
      const localUrl = URL.createObjectURL(file);
      setPreviewUrl(localUrl);

      const formData = new FormData();
      formData.append("logo", file);

      startTransition(async () => {
        const res = await uploadLogoAction(formData);
        setResult(res);
        if (res.ok && res.logoUrl) {
          setPreviewUrl(res.logoUrl);
          URL.revokeObjectURL(localUrl);
        } else if (!res.ok) {
          setPreviewUrl(currentLogoUrl); // rollback aperçu
        }
      });
    },
    [currentLogoUrl],
  );

  const handleRemove = useCallback(() => {
    startRemoveTransition(async () => {
      const res = await removeLogoAction();
      setResult(res);
      if (res.ok) setPreviewUrl(null);
    });
  }, []);

  return (
    <section aria-labelledby="logo-heading">
      <h2 id="logo-heading" className="mb-3 font-display text-base font-semibold text-ink">
        Logo organisation
      </h2>
      <p className="mb-4 text-sm text-muted">
        Affiché dans la barre de navigation. PNG, JPEG, WebP ou SVG — max 512 Ko.
      </p>

      <div className="flex flex-wrap items-start gap-6">
        {/* Aperçu */}
        <div className="flex h-20 w-40 items-center justify-center rounded-md border border-line bg-paper">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Logo organisation"
              className="max-h-16 max-w-full object-contain"
            />
          ) : (
            <span className="text-xs text-muted">Aucun logo</span>
          )}
        </div>

        {/* Contrôles */}
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={handleUpload}
            aria-label="Choisir un logo"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending}
            className="rounded-sm border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper disabled:opacity-50"
          >
            {isPending ? "Envoi…" : previewUrl ? "Changer le logo" : "Ajouter un logo"}
          </button>

          {previewUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isRemoving}
              className="text-sm text-muted underline-offset-2 hover:underline disabled:opacity-50"
            >
              {isRemoving ? "Suppression…" : "Supprimer le logo"}
            </button>
          )}
        </div>
      </div>

      <ResultBanner result={result} />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section Couleur + Police                                                  */
/* -------------------------------------------------------------------------- */

function ColorFontSection({
  currentColor,
  currentFont,
}: {
  currentColor: string;
  currentFont: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BrandingActionResult | null>(null);
  const [color, setColor] = useState(currentColor || "#ff0033");
  const [colorText, setColorText] = useState(currentColor || "#ff0033");
  const [font, setFont] = useState(currentFont || "space-grotesk");

  // Synchronise le color picker ↔ l'input texte
  const handleColorPickerChange = (v: string) => {
    setColor(v);
    setColorText(v);
  };

  const handleColorTextChange = (v: string) => {
    setColorText(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      setColor(v);
    }
  };

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData();
      formData.set("primaryColor", /^#[0-9a-fA-F]{6}$/.test(color) ? color : "");
      formData.set("fontFamily", font);
      startTransition(async () => {
        const res = await updateBrandingAction(formData);
        setResult(res);
      });
    },
    [color, font],
  );

  const selectedFontOption = FONT_OPTIONS.find((f) => f.value === font);
  const fontCssMap: Record<string, string> = {
    "space-grotesk": "'Space Grotesk', sans-serif",
    outfit: "'Outfit', sans-serif",
    "playfair-display": "'Playfair Display', serif",
    inter: "'Inter', sans-serif",
  };

  return (
    <form onSubmit={handleSubmit} aria-labelledby="style-heading">
      <h2 id="style-heading" className="mb-3 font-display text-base font-semibold text-ink">
        Couleur et police
      </h2>

      <div className="flex flex-col gap-6">
        {/* Couleur dominante */}
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">
            Couleur dominante
            <span className="ml-1 text-xs text-muted">(boutons, liens actifs, accents)</span>
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={(e) => handleColorPickerChange(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded-sm border border-line bg-white p-0.5"
              aria-label="Sélecteur de couleur"
            />
            <input
              type="text"
              value={colorText}
              onChange={(e) => handleColorTextChange(e.target.value)}
              placeholder="#ff0033"
              maxLength={7}
              className="w-28 rounded-sm border border-line bg-white px-2 py-1.5 font-mono text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-brand-red"
              aria-label="Valeur hexadécimale"
            />
            {/* Aperçu bouton */}
            <div
              className="inline-flex items-center rounded-sm px-3 py-1.5 text-sm font-semibold text-white"
              style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#ff0033" }}
              aria-hidden
            >
              Aperçu →
            </div>
          </div>
          <p className="mt-1 text-xs text-muted">
            Couleur par défaut edifio :{" "}
            <button
              type="button"
              onClick={() => handleColorPickerChange("#ff0033")}
              className="font-mono underline-offset-2 hover:underline"
            >
              #ff0033
            </button>
          </p>
        </div>

        {/* Police d'affichage */}
        <div>
          <label htmlFor="fontFamily" className="mb-1 block text-sm font-medium text-ink">
            Police des titres
          </label>
          <select
            id="fontFamily"
            value={font}
            onChange={(e) => setFont(e.target.value)}
            className="w-64 rounded-sm border border-line bg-white px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand-red"
          >
            {FONT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} — {opt.preview}
              </option>
            ))}
          </select>

          {/* Aperçu titre */}
          <p
            className="mt-2 text-lg font-semibold text-ink"
            style={{ fontFamily: fontCssMap[font] ?? "'Space Grotesk', sans-serif" }}
            aria-hidden
          >
            {selectedFontOption?.label ?? "Space Grotesk"} — Aperçu du titre
          </p>
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="mt-6 rounded-sm bg-brand-red px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-red-dark disabled:opacity-50"
      >
        {isPending ? "Enregistrement…" : "Enregistrer les modifications"}
      </button>

      <ResultBanner result={result} />
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sous-composant feedback                                                   */
/* -------------------------------------------------------------------------- */

function ResultBanner({ result }: { result: BrandingActionResult | null }) {
  if (!result) return null;

  if (result.ok) {
    return (
      <p role="status" className="mt-3 text-sm font-medium text-emerald-700">
        ✓ Modifications enregistrées.
      </p>
    );
  }

  const messages: Record<string, string> = {
    not_authenticated: "Vous devez être connecté.",
    forbidden_domain: "Accès non autorisé (domaine email).",
    forbidden_role: "Action réservée aux administrateurs.",
    invalid_input: result.detail ?? "Données invalides.",
    internal_error: result.detail ?? "Erreur serveur, réessayez.",
  };

  return (
    <p role="alert" className="mt-3 text-sm font-medium text-red-600">
      ✗ {messages[result.error] ?? "Une erreur est survenue."}
    </p>
  );
}
