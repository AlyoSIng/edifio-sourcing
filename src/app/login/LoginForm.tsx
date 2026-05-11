"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { signInWithOtpAction } from "./actions";
import { initialLoginState, RESEND_COOLDOWN_MS, type LoginState } from "./types";
import { msToCeilSeconds, useCountdown } from "./useCountdown";

/**
 * Composant client — formulaire de connexion magic-link.
 *
 * Wraps la Server Action `signInWithOtpAction` (cf. `./actions.ts`) avec
 * `useFormState` (React 18 / Next 14). Trois états :
 *
 * - idle : formulaire vide, prêt à recevoir un email
 * - error : message d'erreur sous le champ (validation domaine, rate-limit,
 *   infra Supabase). En cas de rate-limit, un compteur countdown est affiché
 *   et le bouton de submit reste disabled tant que l'email saisi correspond
 *   à l'email rate-limité et que le cooldown n'est pas expiré.
 * - sent : état de confirmation conforme M7 (icône check + message). Le
 *   bouton « Renvoie-toi un lien » apparaît sous la confirmation et reste
 *   disabled pendant le cooldown.
 *
 * Un seul `useFormState` partagé entre le `<form>` idle/error et le
 * formulaire impératif de renvoi côté `<SuccessState />`. Permet à un
 * rate-limit reçu lors d'un renvoi (transition sent → error) de ré-afficher
 * le formulaire avec le compteur countdown au bon endroit.
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

  // Email courant saisi dans l'input (controlled). Sert à savoir si
  // l'utilisateur a modifié l'email après un rate-limit (auquel cas on
  // ré-active le submit immédiatement — le cooldown est par email).
  const [currentInputEmail, setCurrentInputEmail] = useState<string>("");

  // Référence au `<h3>` de l'état « sent » pour le focus management :
  // on déplace le focus dessus à la transition idle/error → sent pour que
  // les lecteurs d'écran annoncent la confirmation (cf. RGAA 8.9 et notre
  // pratique sur les changements de page logique).
  const successHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (state.status === "sent") {
      successHeading.current?.focus();
    }
  }, [state.status]);

  // Lit la deadline du rate-limit (le cas échéant) — null sinon → countdown
  // inactif.
  const deadlineMs =
    state.status === "error" && state.rateLimited ? state.rateLimited.deadlineMs : null;
  const remainingMs = useCountdown(deadlineMs);
  const remainingSec = msToCeilSeconds(remainingMs);
  const isCooldownActive = remainingMs > 0;

  if (state.status === "sent") {
    return (
      <SuccessState
        email={state.email}
        formAction={formAction}
        headingRef={successHeading}
        remainingSec={remainingSec}
        isCooldownActive={isCooldownActive}
      />
    );
  }

  // Disable du submit pendant le cooldown SI l'email saisi est exactement
  // celui pour lequel Supabase a rate-limité. Si l'utilisateur change
  // l'email, le cooldown ne s'applique plus.
  const sameEmailAsRateLimited =
    state.status === "error" &&
    state.rateLimited !== undefined &&
    state.rateLimited.email === currentInputEmail.trim().toLowerCase();
  const blockSubmit = isCooldownActive && sameEmailAsRateLimited;

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
          value={currentInputEmail}
          onChange={(e) => setCurrentInputEmail(e.target.value)}
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
          {blockSubmit ? (
            <>
              {" "}
              <CountdownText remainingSec={remainingSec} />
            </>
          ) : null}
        </p>
      ) : null}

      <SubmitButton blocked={blockSubmit} remainingSec={remainingSec} />
    </form>
  );
}

function SubmitButton({ blocked, remainingSec }: { blocked: boolean; remainingSec: number }) {
  const { pending } = useFormStatus();
  const disabled = pending || blocked;
  return (
    <button
      type="submit"
      disabled={disabled}
      className="rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
    >
      {pending
        ? "Envoi du lien…"
        : blocked
          ? `Réessaye dans ${remainingSec} s`
          : "Recevoir mon lien de connexion"}
    </button>
  );
}

/**
 * Affiche le countdown sous forme « Réessaye dans 47 s » dans un span
 * `aria-live="polite"` pour que les lecteurs d'écran annoncent la
 * progression du timer sans interrompre l'utilisateur.
 *
 * `aria-atomic="true"` garantit que le contenu entier du span est relu
 * à chaque mise à jour (et pas seulement le diff). Tick visuel à chaque
 * seconde (cf. useCountdown) — un futur audit RGAA avec Théo arbitrera
 * si on doit espacer les annonces (par exemple chaque 10 s).
 */
function CountdownText({ remainingSec }: { remainingSec: number }) {
  return (
    <span aria-live="polite" aria-atomic="true" className="font-mono">
      Réessaye dans {remainingSec} s
    </span>
  );
}

function SuccessState({
  email,
  formAction,
  headingRef,
  remainingSec,
  isCooldownActive,
}: {
  email: string;
  formAction: (formData: FormData) => void;
  headingRef: React.RefObject<HTMLHeadingElement>;
  remainingSec: number;
  isCooldownActive: boolean;
}) {
  // Le bouton de renvoi est disabled pendant le cooldown du dernier rate-limit
  // connu. À l'état `sent` initial (pas de rate-limit), pas de cooldown actif
  // → bouton actif immédiatement avec le wording « Renvoie-toi un lien dans
  //   60 secondes » (wording figé spec — c'est l'invitation de renvoi, pas
  //   une garde technique).
  const disabled = isCooldownActive;

  function onResend() {
    const fd = new FormData();
    fd.append("email", email);
    formAction(fd);
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center" role="status">
      <div
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700"
      >
        ✓
      </div>
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-lg font-semibold outline-none"
      >
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
        Pas reçu ?{" "}
        <button
          type="button"
          onClick={onResend}
          disabled={disabled}
          className="underline underline-offset-4 hover:no-underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
          data-testid="resend-button"
        >
          {disabled ? (
            <>
              Renvoie-toi un lien dans{" "}
              <span aria-live="polite" aria-atomic="true" className="font-mono">
                {remainingSec} secondes
              </span>
            </>
          ) : (
            "Renvoie-toi un lien dans 60 secondes"
          )}
        </button>
      </p>
      {/* Constante exposée pour les tests E2E : permet d'asserter la durée
          de cooldown attendue sans dépendre du wording exact. */}
      <span data-testid="cooldown-default-ms" hidden>
        {RESEND_COOLDOWN_MS}
      </span>
    </div>
  );
}
