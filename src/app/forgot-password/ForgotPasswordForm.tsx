"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";

import { requestPasswordResetAction } from "./actions";
import { initialForgotPasswordState, type ForgotPasswordState } from "./types";

/**
 * Formulaire de demande de réinitialisation de mot de passe.
 *
 * Une seule réponse de succès affichée (anti-énumération) — on ne
 * distingue jamais « email inconnu » de « email envoyé ».
 */
export function ForgotPasswordForm() {
  const [state, formAction] = useFormState<ForgotPasswordState, FormData>(
    requestPasswordResetAction,
    initialForgotPasswordState,
  );

  if (state.status === "sent") {
    return <SuccessState />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-neutral-700">
          Email AlyoS
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="prenom.nom@alyosingenierie.fr"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm placeholder-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
        />
      </div>

      <SubmitButton />

      <p className="text-center text-xs text-neutral-600">
        <Link href="/login" className="underline-offset-4 hover:underline">
          ← Retour à la connexion
        </Link>
      </p>
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
      {pending ? "Envoi…" : "Recevoir un lien de réinitialisation"}
    </button>
  );
}

function SuccessState() {
  return (
    <div className="flex flex-col items-center gap-4 text-center" role="status">
      <div
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700"
      >
        ✓
      </div>
      <h3 className="font-display text-lg font-semibold">Demande prise en compte</h3>
      <p className="text-sm text-neutral-600">
        Si un compte existe pour cet email, un lien de réinitialisation vient d&apos;être envoyé.
        Vérifie ta boîte mail.
      </p>
      <p className="text-xs text-neutral-500">
        Pas reçu ? Vérifie tes spams ou réessaie dans quelques minutes.
      </p>
      <Link href="/login" className="text-xs text-neutral-600 underline-offset-4 hover:underline">
        ← Retour à la connexion
      </Link>
    </div>
  );
}
