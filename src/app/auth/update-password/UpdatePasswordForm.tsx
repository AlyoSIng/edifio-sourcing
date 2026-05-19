"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Formulaire client — définit le mot de passe définitif après un flow
 * recovery (« mot de passe oublié »).
 *
 * Pré-requis : le composant `RecoveryHashHandler` (embarqué sur `/` et
 * `/login`) a déjà appelé `supabase.auth.setSession()` avec les tokens du
 * fragment recovery, posé les cookies `sb-*`, puis redirigé vers cette page.
 * On a donc une session Supabase valide côté navigateur — `updateUser` peut
 * être appelé directement.
 *
 * Règles de validation (`design/copy/templates_brevo_v1.md` D.10 + CLAUDE.md
 * « Décisions d'architecture 2026-05-10 » Q2/B) :
 * - minimum 16 caractères ;
 * - ≥ 1 majuscule, ≥ 1 minuscule, ≥ 1 chiffre, ≥ 1 caractère spécial ;
 * - les deux champs doivent correspondre.
 *
 * Cf. INC-2026-05-18-02, pivot auth 2026-05-10.
 */

const MIN_LENGTH = 16;

type FormStatus = { kind: "idle" } | { kind: "submitting" } | { kind: "error"; message: string };

/**
 * Validation pure (testable hors React). Retourne `null` si le mot de
 * passe est conforme, sinon un message d'erreur localisé en français.
 */
function validatePassword(password: string, confirmation: string): string | null {
  if (password.length < MIN_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_LENGTH} caractères.`;
  }
  if (!/[A-Z]/.test(password)) {
    return "Le mot de passe doit contenir au moins une lettre majuscule.";
  }
  if (!/[a-z]/.test(password)) {
    return "Le mot de passe doit contenir au moins une lettre minuscule.";
  }
  if (!/[0-9]/.test(password)) {
    return "Le mot de passe doit contenir au moins un chiffre.";
  }
  // Caractère spécial = tout ce qui n'est ni lettre ni chiffre. Couvre
  // ponctuation ASCII et symboles Unicode étendus (assez tolérant pour
  // accepter les passphrases avec espaces / accents).
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Le mot de passe doit contenir au moins un caractère spécial.";
  }
  if (password !== confirmation) {
    return "Les deux mots de passe ne correspondent pas.";
  }
  return null;
}

export function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState<FormStatus>({ kind: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status.kind === "submitting") return;

    const validationError = validatePassword(password, confirmation);
    if (validationError) {
      setStatus({ kind: "error", message: validationError });
      return;
    }

    setStatus({ kind: "submitting" });

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      console.error("[auth/update-password:updateUser]", error.message);
      // Localisation FR des erreurs Supabase les plus probables. Le reste
      // tombe dans un message générique pour éviter de fuiter le détail
      // interne (et garde une UX correcte).
      const message = mapSupabaseError(error.message);
      setStatus({ kind: "error", message });
      return;
    }

    // Cible du redirect post-changement : `/sourcing/ao-du-jour`, qui est
    // également la cible du CTA principal de la landing. Il n'y a pas de
    // route `/dashboard` dans le repo actuel — à arbitrer avec le Board
    // si une autre cible est souhaitée (cf. notes-de-suivi).
    router.replace("/sourcing/ao-du-jour");
  }

  const isSubmitting = status.kind === "submitting";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
          minLength={MIN_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isSubmitting}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm placeholder-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 disabled:cursor-not-allowed disabled:bg-neutral-100"
        />
        <span className="text-xs text-neutral-500">
          16 caractères minimum, majuscule, minuscule, chiffre, caractère spécial.
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="confirmation" className="text-sm font-medium text-neutral-700">
          Confirmation
        </label>
        <input
          id="confirmation"
          name="confirmation"
          type="password"
          required
          autoComplete="new-password"
          minLength={MIN_LENGTH}
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          disabled={isSubmitting}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm placeholder-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 disabled:cursor-not-allowed disabled:bg-neutral-100"
        />
      </div>

      {status.kind === "error" ? (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {status.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
      >
        {isSubmitting ? "Enregistrement…" : "Définir le mot de passe"}
      </button>
    </form>
  );
}

/**
 * Localise quelques messages d'erreur Supabase courants. Retourne le
 * message d'origine si aucun pattern ne matche — préférable à un message
 * générique aveugle qui cache le diagnostic.
 */
function mapSupabaseError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("same as the old") || lower.includes("should be different")) {
    return "Le nouveau mot de passe doit être différent de l'ancien.";
  }
  if (lower.includes("session") || lower.includes("jwt")) {
    return "Ta session a expiré. Recommence depuis l'email de récupération.";
  }
  if (lower.includes("weak") || lower.includes("password")) {
    return "Mot de passe refusé par le serveur. Vérifie qu'il respecte les règles ci-dessus.";
  }
  return `Impossible d'enregistrer le mot de passe : ${raw}`;
}
