"use client";

import { useFormState, useFormStatus } from "react-dom";

import { signInWithOtpAction } from "./actions";
import { initialLoginState, type LoginState } from "./types";

/**
 * Composant client — formulaire de connexion magic-link.
 *
 * Wraps la Server Action `signInWithOtpAction` (cf. `./actions.ts`) avec
 * `useFormState` (React 18 / Next 14). Trois états :
 *
 * - idle : formulaire vide, prêt à recevoir un email
 * - error : message d'erreur sous le champ (validation domaine, infra Supabase)
 * - sent : état de confirmation conforme M7 (« Lien envoyé à alice@... »)
 *
 * Le composant ne valide PAS le domaine côté client — toute la garde de
 * domaine est centralisée dans la Server Action (réutilise `isAuthorizedEmail`
 * de l'étape 2). Le navigateur ne fait que de la validation de format basique
 * via `type="email"` et `pattern` (UX, pas de sécurité).
 */
export function LoginForm() {
  const [state, formAction] = useFormState<LoginState, FormData>(
    signInWithOtpAction,
    initialLoginState,
  );

  if (state.status === "sent") {
    return <SuccessState email={state.email} />;
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
        <span className="text-xs text-neutral-500">
          Aucun mot de passe à retenir — un lien sécurisé est envoyé à chaque connexion.
        </span>
      </div>

      {state.status === "error" ? (
        <p
          role="alert"
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
      {pending ? "Envoi du lien…" : "Recevoir mon lien de connexion"}
    </button>
  );
}

function SuccessState({ email }: { email: string }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center" role="status">
      <div
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700"
      >
        ✓
      </div>
      <h3 className="font-display text-lg font-semibold">
        Lien envoyé à{" "}
        <span className="text-neutral-900" style={{ overflowWrap: "anywhere" }}>
          {email}
        </span>
      </h3>
      <p className="text-sm text-neutral-600">
        Ouvre ta boîte mail — tu as 15 minutes pour cliquer sur le lien. Tu peux fermer cet onglet,
        l&apos;app s&apos;ouvrira automatiquement après le clic.
      </p>
      <p className="text-xs text-neutral-500">
        Pas reçu ? Vérifie tes spams ou réessaie après quelques minutes.
      </p>
    </div>
  );
}
