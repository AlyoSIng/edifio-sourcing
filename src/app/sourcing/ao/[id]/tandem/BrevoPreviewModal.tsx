"use client";

/**
 * Modale `BrevoPreviewModal` — preview avant envoi de sollicitation
 * Brevo (M-D2 dans la spec).
 *
 * Source de vérité :
 *  - `specs/module_tandem_engine_v1.md` §3.2 step 5-7 (preview + édition
 *    + toggle TU/VOUS)
 *  - `design/copy/email_sollicitation_architecte_v1.md` §A / §B (verbatim
 *    TU et VOUS)
 *  - Décision Q3 Board 2026-05-24 — bloc RGPD obligatoire au 1er envoi
 *  - Brief Board 2026-05-25 sous-étape 5 — preview avec HTML
 *    user-controlled échappé.
 *
 * Sécurité :
 *  - Le rendu utilise **uniquement** des nœuds React text/element (pas de
 *    `dangerouslySetInnerHTML`) — donc l'échappement XSS est automatique.
 *  - Le bloc RGPD est rendu en JSX text via `previewRgpdBlock()`, pas en
 *    HTML brut. La version envoyée au serveur (avec `<a href>`) est
 *    construite côté Server via `buildBrevoVariables` — la modale ne sert
 *    qu'à montrer un fac-similé.
 *
 * Comportement :
 *  - Toggle TU/VOUS — pré-rempli depuis `architect.tutoiement`, modifiable
 *  - Champ « note libre » (max 500 chars) — passé à `sendArchitectSolicitation`
 *    via `customNote` (loggé pour debug, pas envoyé dans le template
 *    Brevo en V1 — futur Phase 2)
 *  - Bouton « Annuler » et « Envoyer le mail »
 *
 * Accessibilité :
 *  - `role="dialog"` + `aria-modal` + focus trap minimal
 *  - Esc / click backdrop ferme la modale
 *  - `aria-labelledby` sur le title
 */

import { useEffect, useId, useState } from "react";

import { formatClotureFr, splitContactName } from "@/lib/brevo/variables";
import type { BrevoRegister } from "@/lib/brevo/template-picker";

interface ArchitectLike {
  id: string;
  cabinet: string;
  contactName: string | null;
  tutoiement: boolean;
}

interface TenderLike {
  title: string;
  buyer: string;
  deadline: Date | null;
}

interface Props {
  architect: ArchitectLike;
  tender: TenderLike;
  onCancel: () => void;
  onConfirm: (register: BrevoRegister, customNote: string | undefined) => void;
}

const MAX_NOTE_LEN = 500;

export function BrevoPreviewModal({ architect, tender, onCancel, onConfirm }: Props) {
  const titleId = useId();
  const [register, setRegister] = useState<BrevoRegister>(architect.tutoiement ? "tu" : "vous");
  const [customNote, setCustomNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Esc ferme
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  function onBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !busy) onCancel();
  }

  function handleSend() {
    if (busy) return;
    setBusy(true);
    onConfirm(register, customNote.trim() || undefined);
  }

  const { prenom } = splitContactName(architect.contactName);
  const isTu = register === "tu";

  // Salutation aligné copy validé. Si pas de prénom, fallback générique.
  const salut = isTu ? `Salut ${prenom} !` : `Bonjour ${prenom},`;
  const cloture = formatClotureFr(tender.deadline);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onBackdropClick}
      className="fixed inset-0 z-50 flex items-start justify-center bg-[#0F1A2E]/45 p-4 sm:p-6"
    >
      <div className="my-6 w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="border-b border-line px-6 py-4">
          <div className="font-mono text-[11px] uppercase tracking-wider text-brand-red">
            Preview du mail · Brevo
          </div>
          <h2 id={titleId} className="mt-1 font-display text-lg font-bold leading-snug text-ink">
            Sollicitation cotraitance — {architect.cabinet}
          </h2>
        </div>

        {/* Toggle TU / VOUS */}
        <div
          role="radiogroup"
          aria-label="Registre du mail (tutoiement ou vouvoiement)"
          className="flex items-center gap-2 border-b border-line px-6 py-3"
        >
          <span className="text-xs font-medium uppercase tracking-wider text-muted">
            Registre :
          </span>
          <RegisterButton
            current={register}
            value="tu"
            label="Tutoiement"
            onSelect={() => setRegister("tu")}
            disabled={busy}
          />
          <RegisterButton
            current={register}
            value="vous"
            label="Vouvoiement"
            onSelect={() => setRegister("vous")}
            disabled={busy}
          />
          <span className="ml-auto text-[11px] text-muted">
            Pré-rempli depuis le profil archi · modifiable
          </span>
        </div>

        {/* Preview du mail (texte rendu, jamais d'innerHTML) */}
        <div
          className="max-h-[55vh] overflow-y-auto bg-paper-2 px-6 py-5"
          data-testid="brevo-preview-body"
        >
          <div className="rounded-md border border-line bg-white p-6 font-sans text-sm leading-relaxed text-ink">
            <p className="font-semibold">Objet : Cotraitance — {tender.title}</p>
            <hr className="my-3 border-line" />
            <p>{salut}</p>
            <p className="mt-3">
              {isTu
                ? "Chez AlyoS Ingénierie, on prépare une réponse à un AO public et on aimerait te proposer une cotraitance."
                : "Chez AlyoS Ingénierie, nous préparons une réponse à un AO public et nous aimerions vous proposer une cotraitance."}
            </p>
            <ul className="mt-3 space-y-1 text-sm text-ink-2">
              <li>
                <strong className="text-ink">AO :</strong> {tender.title}
              </li>
              <li>
                <strong className="text-ink">Acheteur :</strong> {tender.buyer}
              </li>
              <li>
                <strong className="text-ink">Clôture :</strong> {cloture}
              </li>
            </ul>
            <p className="mt-3">
              {isTu
                ? "Si tu es partant ou si tu veux plus d'infos, clique sur le bouton ci-dessous — un lien sécurisé t'amène sur la fiche AO complète."
                : "Si vous êtes partant ou si vous souhaitez plus d'informations, cliquez sur le bouton ci-dessous — un lien sécurisé vous amène sur la fiche AO complète."}
            </p>
            <p className="mt-3">
              <span className="inline-block rounded-md bg-brand-red px-4 py-2 text-xs font-semibold text-white">
                Voir l&rsquo;AO complet (lien sécurisé)
              </span>
            </p>
            <p className="mt-3 text-sm">
              {isTu ? "À très vite," : "Bien cordialement,"}
              <br />
              L&rsquo;équipe AlyoS Ingénierie
            </p>

            {/* Bloc RGPD art.14 — affiché en preview pour validation user */}
            <p
              className="mt-6 border-t border-line pt-3 text-xs italic leading-snug text-muted"
              data-testid="preview-rgpd-block"
            >
              Vous recevez ce message car AlyoS Ingénierie a identifié {architect.cabinet} comme
              partenaire potentiel pour une réponse en cotraitance à des marchés publics de maîtrise
              d&rsquo;œuvre. Vos coordonnées professionnelles proviennent de bases professionnelles
              et publiques (dont les données ouvertes SIRENE). AlyoS Ingénierie traite ces données
              dans le seul but de vous proposer des opportunités de cotraitance, sur la base de son
              intérêt légitime. Vous disposez d&rsquo;un droit d&rsquo;accès, de rectification et
              d&rsquo;opposition — un lien d&rsquo;opposition figure dans le mail envoyé.
            </p>
          </div>
        </div>

        {/* Note libre user (V1 : logguée, V2 : injectée dans template) */}
        <div className="border-t border-line px-6 py-3">
          <label
            htmlFor="custom-note"
            className="block text-xs font-medium uppercase tracking-wider text-muted"
          >
            Note interne (optionnel — non envoyée à l&rsquo;archi en V1)
          </label>
          <textarea
            id="custom-note"
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value.slice(0, MAX_NOTE_LEN))}
            rows={2}
            maxLength={MAX_NOTE_LEN}
            disabled={busy}
            placeholder="Ex. mentionne que c'est urgent…"
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-red focus:outline-none"
          />
          <p className="mt-0.5 text-right text-[10px] text-muted">
            {customNote.length} / {MAX_NOTE_LEN}
          </p>
        </div>

        {/* Footer actions */}
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink-2 transition hover:bg-paper-2 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={busy}
            data-testid="send-solicitation-button"
            className="rounded-md bg-brand-red px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Envoi en cours…" : "Envoyer le mail"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RegisterButton({
  current,
  value,
  label,
  onSelect,
  disabled,
}: {
  current: BrevoRegister;
  value: BrevoRegister;
  label: string;
  onSelect: () => void;
  disabled: boolean;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      disabled={disabled}
      data-register={value}
      className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
        selected
          ? "bg-brand-red text-white"
          : "border border-line bg-white text-ink-2 hover:bg-paper-2"
      } disabled:opacity-50`}
    >
      {label}
    </button>
  );
}
