"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";

import { formatCountdownMinSec } from "@/lib/auth/password";

import { signInWithPasswordAction } from "./actions";
import { initialLoginState, type LoginState } from "./types";
import { useCountdown } from "./useCountdown";

/**
 * Formulaire de connexion — email + password (pivot Board 2026-05-11).
 *
 * Ajustement Board Q4/A 2026-05-12 — affichage d'un countdown rate-limit
 * quand Supabase Auth répond 429 (« Trop de tentatives. Réessaye dans X »).
 *
 * Trois états visuels :
 *   - idle : formulaire vide / saisie en cours
 *   - error simple : message d'erreur sous les champs (validation, identifiants)
 *   - error rate-limited : message + countdown mm:ss + submit disabled
 *
 * Le composant ne valide pas le domaine côté client — toute la garde est
 * centralisée dans la Server Action. Validation HTML5 basique (`required`,
 * `type="email"`) pour l'UX uniquement.
 */
export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useFormState<LoginState, FormData>(
    signInWithPasswordAction,
    initialLoginState,
  );

  const rateLimitedUntil =
    state.status === "error" && typeof state.rateLimitedUntil === "number"
      ? state.rateLimitedUntil
      : null;
  const { remainingSec, isActive: isRateLimited } = useCountdown(rateLimitedUntil);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* `next` propagé via hidden input — la Server Action s'occupe de la
          sanitization (anti open-redirect). */}
      {next ? <input type="hidden" name="next" value={next} /> : null}

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

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium text-neutral-700">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm placeholder-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
        />
      </div>

      {state.status === "error" ? (
        <div
          role="alert"
          data-testid="auth-error"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          <p>{state.message}</p>
          {isRateLimited ? (
            <p className="mt-1 font-mono text-xs">
              Réessaye dans{" "}
              <span data-testid="rate-limit-countdown">{formatCountdownMinSec(remainingSec)}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <SubmitButton disabled={isRateLimited} />

      <p className="text-center text-xs text-neutral-600">
        <Link href="/forgot-password" className="underline-offset-4 hover:underline">
          Mot de passe oublié ?
        </Link>
      </p>
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;
  return (
    <button
      type="submit"
      disabled={isDisabled}
      className="rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
    >
      {pending ? "Connexion…" : disabled ? "Patiente…" : "Se connecter"}
    </button>
  );
}
