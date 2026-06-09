"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { requestPasswordResetAction } from "./actions";
import { initialForgotPasswordState, type ForgotPasswordState } from "./types";

/**
 * Formulaire de demande de réinitialisation de mot de passe.
 *
 * Une seule réponse de succès affichée (anti-énumération) — on ne
 * distingue jamais « email inconnu » de « email envoyé ».
 */
export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<ForgotPasswordState, FormData>(
    requestPasswordResetAction,
    initialForgotPasswordState,
  );

  if (state.status === "sent") {
    return <SuccessState />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-ink">
          Email AlyoS
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="prenom.nom@alyosingenierie.fr"
          className="rounded-sm border border-line-2 px-3 py-2 text-sm placeholder-muted focus:border-ink-2 focus:outline-none focus:ring-1 focus:ring-ink-2"
        />
      </div>

      <SubmitButton />

      <p className="text-center text-xs text-ink-2">
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
      className="rounded-full bg-brand-red px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-red-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-line-2"
    >
      {pending ? "Envoi…" : "Recevoir un nouveau mot de passe"}
    </button>
  );
}

function SuccessState() {
  return (
    <div className="flex flex-col items-center gap-4 text-center" role="status">
      <div
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-full bg-success-bg text-2xl text-success"
      >
        ✓
      </div>
      <h3 className="font-display text-lg font-semibold">Demande prise en compte</h3>
      <p className="text-sm text-ink-2">
        Si un compte existe pour cet email, un nouveau mot de passe provisoire vient d&apos;être
        envoyé. Vérifie ta boîte mail puis connecte-toi avec ce mot de passe.
      </p>
      <p className="text-xs text-muted">
        Pas reçu ? Vérifie tes spams ou réessaie dans quelques minutes.
      </p>
      <Link href="/login" className="text-xs text-ink-2 underline-offset-4 hover:underline">
        ← Retour à la connexion
      </Link>
    </div>
  );
}
