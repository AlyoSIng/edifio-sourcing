"use client";

/**
 * Éditeur de template d'e-mail — composant Client.
 *
 * Responsabilités :
 *  - Formulaire objet + corps avec palette de variables cliquables.
 *  - Soumission via `saveTemplateAction` (Server Action).
 *  - Affiche les erreurs RGPD de façon bloquante et explicite.
 *  - Aperçu simple des variables non substituées.
 *
 * Source de vérité :
 *  - `handoff/SPEC_ADDENDUM_260525_ARCHITECTES_MENU_ET_TRAME_MAIL.md` §C
 */

import { useState, useTransition, type FormEvent } from "react";

import { saveTemplateAction, type SaveTemplateResult } from "./actions";
import { TEMPLATE_META, type TemplateKey } from "@/lib/email/template-resolver";

/* -------------------------------------------------------------------------- */
/*  Palette de variables par catégorie                                         */
/* -------------------------------------------------------------------------- */

const VAR_PALETTE_BY_CHANNEL: Record<
  "brevo" | "resend",
  Array<{ label: string; vars: string[] }>
> = {
  brevo: [
    {
      label: "Architecte",
      vars: ["{{civilite}}", "{{archi_prenom}}", "{{archi_nom}}", "{{cabinet}}"],
    },
    {
      label: "Appel d'offres",
      vars: [
        "{{ao_objet}}",
        "{{ao_acheteur}}",
        "{{ao_departement}}",
        "{{ao_cloture}}",
        "{{lien_ao}}",
      ],
    },
    {
      label: "RGPD (obligatoires 1er contact)",
      vars: ["{{lien_opposition}}", "{{rgpd_block}}"],
    },
    {
      label: "Société",
      vars: ["{{presentation_societe}}"],
    },
  ],
  resend: [
    {
      label: "Utilisateur",
      vars: ["{{user_prenom}}", "{{mot_de_passe_provisoire}}", "{{lien_reset}}"],
    },
    {
      label: "Appel d'offres",
      vars: ["{{ao_objet}}", "{{ao_acheteur}}", "{{lien_ao}}"],
    },
    {
      label: "Société",
      vars: ["{{presentation_societe}}"],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/*  Props                                                                      */
/* -------------------------------------------------------------------------- */

interface TemplateEditorProps {
  templateKey: TemplateKey;
  initialSubject: string;
  initialBody: string;
  version: number;
  fromDatabase: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Composant                                                                  */
/* -------------------------------------------------------------------------- */

export function TemplateEditor({
  templateKey,
  initialSubject,
  initialBody,
  version,
  fromDatabase,
}: TemplateEditorProps) {
  const meta = TEMPLATE_META[templateKey];
  const palette = VAR_PALETTE_BY_CHANNEL[meta.channel];

  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [result, setResult] = useState<SaveTemplateResult | null>(null);
  const [isPending, startTransition] = useTransition();

  /** Insère une variable à la fin du corps (textarea). */
  function insertVar(variable: string) {
    setBody((prev) => prev + variable);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("key", templateKey);
    fd.set("subject", subject);
    fd.set("body", body);

    startTransition(async () => {
      const res = await saveTemplateAction(fd);
      setResult(res);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* En-tête template */}
      <div className="flex items-center gap-3">
        <span className="rounded bg-paper-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-2">
          {meta.channel}
        </span>
        <span className="font-mono text-xs text-muted">
          {fromDatabase ? `v${version} · BDD` : "v0 · défaut"}
        </span>
      </div>

      {/* Objet */}
      <div>
        <label
          htmlFor={`subject-${templateKey}`}
          className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-ink-2"
        >
          Objet
        </label>
        <input
          id={`subject-${templateKey}`}
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          maxLength={998}
          className="w-full rounded border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
        />
      </div>

      {/* Palette variables */}
      <div className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-ink-2">
          Variables disponibles
        </p>
        {palette.map((group) => (
          <div key={group.label}>
            <p className="mb-1 text-[11px] text-muted">{group.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {group.vars.map((v) => {
                const isRequired = meta.requiredVars.includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVar(v)}
                    title={isRequired ? "Variable obligatoire — non supprimable" : undefined}
                    className={`rounded px-2 py-0.5 font-mono text-[10px] transition hover:opacity-80 ${
                      isRequired
                        ? "ring-error/30 bg-error-bg text-error ring-1"
                        : "bg-paper-3 text-ink-2"
                    }`}
                  >
                    {v}
                    {isRequired && " *"}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {meta.requiredVars.length > 0 && (
          <p className="text-[11px] text-error">
            * Variables obligatoires — leur absence bloque l&apos;enregistrement.
          </p>
        )}
      </div>

      {/* Corps */}
      <div>
        <label
          htmlFor={`body-${templateKey}`}
          className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-ink-2"
        >
          Corps du message
        </label>
        <textarea
          id={`body-${templateKey}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={16}
          className="w-full rounded border border-line bg-white px-3 py-2 font-mono text-xs text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
        />
      </div>

      {/* Erreurs RGPD — bloquantes */}
      {result && !result.ok && result.error === "rgpd_guard" && result.rgpdErrors && (
        <div
          role="alert"
          className="rounded-md border border-l-4 border-line border-l-error bg-error-bg px-4 py-3 text-sm text-error"
        >
          <strong className="mb-1 block font-semibold">Garde-fous RGPD non respectés :</strong>
          <ul className="list-inside list-disc space-y-1">
            {result.rgpdErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Erreurs génériques */}
      {result && !result.ok && result.error !== "rgpd_guard" && (
        <div
          role="alert"
          className="rounded-md border border-l-4 border-line border-l-error bg-error-bg px-4 py-3 text-sm text-error"
        >
          <strong className="mr-1 font-semibold">Erreur :</strong>
          {errorLabel(result.error)}
          {result.detail && <code className="ml-1 text-xs opacity-70">{result.detail}</code>}
        </div>
      )}

      {/* Succès */}
      {result?.ok && (
        <div
          role="status"
          className="rounded-md border border-l-4 border-line border-l-success bg-success-bg px-4 py-2.5 text-sm text-success"
        >
          Template enregistré (version {result.version}).
        </div>
      )}

      {/* Soumission */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="hover:bg-ink/80 rounded bg-ink px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
        >
          {isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

function errorLabel(code: string): string {
  switch (code) {
    case "not_authenticated":
      return "Session expirée — reconnectez-vous.";
    case "forbidden_domain":
      return "Accès refusé — domaine @alyosingenierie.fr requis.";
    case "forbidden_role":
      return "Accès refusé — rôle admin requis.";
    case "invalid_input":
      return "Données invalides.";
    default:
      return "Erreur interne — réessayez.";
  }
}
