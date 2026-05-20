"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { MIN_LENGTH } from "@/lib/auth/constants";
import { passwordErrorLabel, validatePasswordStrength } from "@/lib/auth/password";

import { updatePasswordAction } from "./actions";
import { initialResetPasswordState, type ResetPasswordState } from "./types";

/**
 * Formulaire de définition du mot de passe définitif (ADR-011 couche 3).
 *
 * Un seul contexte d'usage : le user vient de se connecter via mot de passe
 * provisoire et le middleware l'a force-redirigé ici. La session est posée,
 * `must_change_password === true`. Pas de hidden field `code` ni de mode —
 * la Server Action n'a plus qu'à update le password sur la session courante.
 *
 * Indicateur de force visuel — on réutilise `validatePasswordStrength` pour
 * la même règle UI / serveur. Affichage live à chaque keystroke (composant
 * controlled). Le bouton submit reste actif même si invalide — la Server
 * Action est la source de vérité (défense en profondeur).
 */
export function ResetPasswordForm() {
  const [state, formAction] = useFormState<ResetPasswordState, FormData>(
    updatePasswordAction,
    initialResetPasswordState,
  );
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");

  const strength = validatePasswordStrength(pwd);
  const confirmMismatch = confirm.length > 0 && pwd !== confirm;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Choisissez un mot de passe durable. Votre mot de passe provisoire ne sera plus utilisable
        après ce changement.
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium text-neutral-700">
          Nouveau mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm placeholder-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
        />
        <PassphraseHint />
        <StrengthHint pwd={pwd} errors={strength.errors} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="confirm" className="text-sm font-medium text-neutral-700">
          Confirmation
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm placeholder-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
        />
        {confirmMismatch ? (
          <span className="text-xs text-red-700">Les deux saisies diffèrent.</span>
        ) : null}
      </div>

      {state.status === "error" ? (
        <p
          role="alert"
          data-testid="auth-error"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.message}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
    >
      {pending ? "Mise à jour…" : "Définir mon mot de passe"}
    </button>
  );
}

/**
 * Astuce passphrase — Board Q2/A.3 2026-05-12.
 *
 * Recommandation visible (et non un placeholder agressif) qui incite à
 * utiliser une passphrase : plus longue, plus mémorisable, plus sûre qu'un
 * mot de passe complexe court.
 */
function PassphraseHint() {
  return (
    <p className="mt-1 text-xs text-neutral-500">
      <strong className="font-medium">Astuce</strong> : une passphrase facile à retenir et sûre.
      Exemple :{" "}
      <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono">
        montagne bleue sourire café 7 !
      </code>
    </p>
  );
}

function StrengthHint({
  pwd,
  errors,
}: {
  pwd: string;
  errors: ReturnType<typeof validatePasswordStrength>["errors"];
}) {
  if (pwd.length === 0) {
    return (
      <span className="text-xs text-neutral-500">
        {MIN_LENGTH} caractères minimum, avec majuscule, minuscule, chiffre et symbole.
      </span>
    );
  }
  if (errors.length === 0) {
    return <span className="text-xs text-green-700">Mot de passe robuste.</span>;
  }
  return (
    <ul className="mt-1 list-disc pl-5 text-xs text-amber-800">
      {errors.map((e) => (
        <li key={e}>{passwordErrorLabel(e)}</li>
      ))}
    </ul>
  );
}
