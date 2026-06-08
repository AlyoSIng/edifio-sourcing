"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { formatCountdownMinSec } from "@/lib/auth/password";

import { signInWithPasswordAction } from "./actions";
import { initialLoginState, type LoginState } from "./types";
import { useCountdown } from "./useCountdown";

/**
 * Formulaire de connexion — email + password (pivot Board 2026-05-11).
 *
 * Habillage DS edifio v1 — champs bordure `--line-2`, bouton primaire
 * `bg-brand-red`, erreurs en `--error-bg` / `--error`, countdown rate-limit
 * en mono.
 *
 * Trois états visuels :
 *   - idle : formulaire vide / saisie en cours
 *   - error simple : message d'erreur sous les champs (validation, identifiants)
 *   - error rate-limited : message + countdown mm:ss + submit disabled
 *
 * Le composant ne valide pas le domaine côté client — toute la garde est
 * centralisée dans la Server Action.
 */
export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(
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
          className="rounded-sm border border-line-2 bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium text-ink">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-sm border border-line-2 bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red"
        />
      </div>

      {state.status === "error" ? (
        <div
          role="alert"
          data-testid="auth-error"
          className="rounded-sm border-l-4 border-error bg-error-bg px-3 py-2 text-sm text-error"
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

      <p className="text-center text-xs text-muted">
        <Link href="/forgot-password" className="underline-offset-4 hover:underline">
          Mot de passe oublié&nbsp;?
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
      className="rounded-full bg-brand-red px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-red-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-line-2"
    >
      {pending ? "Connexion…" : disabled ? "Patiente…" : "Se connecter"}
    </button>
  );
}
