"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateUserRoleAction } from "./actions";

/**
 * Bouton de promotion / rétrogradation de rôle — affiché dans la colonne
 * « Actions » de la table admin utilisateurs, uniquement pour les comptes actifs
 * (mustChangePassword = false) dont le rôle est "admin" ou "user".
 *
 * Les viewers ne sont pas modifiables en MVP (aucun bouton rendu pour eux).
 *
 * Comportement :
 *  - user  → "Passer admin"   (style brand-red outline)
 *  - admin → "Retirer admin"  (style neutral outline)
 *
 * Sécurité côté UI :
 *  - `isSelf` bloque le bouton visuellement pour éviter le self-demotion
 *    (le guard serveur dans `actions.ts` reste la vraie protection).
 *
 * Résilience :
 *  - Erreur inline sous le bouton (pas de crash, pas de toast global).
 *  - `useTransition` pour l'indicateur de chargement sans bloquer la navigation.
 */

type ToggleRoleButtonProps = {
  /** UUID Supabase de l'utilisateur cible. */
  targetUserId: string;
  /** Rôle actuel de l'utilisateur cible. */
  currentRole: "admin" | "user";
  /** Indique si la ligne correspond à l'acteur connecté (bloque self-demotion). */
  isSelf: boolean;
};

/** Messages d'erreur lisibles pour les codes renvoyés par `updateUserRoleAction`. */
const ERROR_MESSAGES: Record<string, string> = {
  self_demotion: "Impossible de se rétrograder soi-même.",
  forbidden: "Action non autorisée.",
  unauthenticated: "Session expirée — rechargez la page.",
  invalid_user_id: "Identifiant utilisateur invalide.",
};

export function ToggleRoleButton({ targetUserId, currentRole, isSelf }: ToggleRoleButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [inlineError, setInlineError] = useState<string | null>(null);
  const router = useRouter();

  const newRole: "admin" | "user" = currentRole === "user" ? "admin" : "user";
  const label = currentRole === "user" ? "Passer admin" : "Retirer admin";
  const labelPending = currentRole === "user" ? "Passage…" : "Retrait…";

  // Styles distincts selon l'action — brand-red pour promotion, neutral pour rétrogradation
  const buttonClass =
    currentRole === "user"
      ? // Promotion → outline brand-red
        "rounded-full border border-brand-red px-2.5 py-1 text-[11px] font-semibold text-brand-red transition hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40"
      : // Rétrogradation → outline neutral
        "rounded-full border border-line-2 px-2.5 py-1 text-[11px] font-semibold text-ink transition hover:bg-paper-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40";

  function handleClick() {
    setInlineError(null);
    startTransition(async () => {
      const result = await updateUserRoleAction(targetUserId, newRole);
      if (!result.ok) {
        setInlineError(ERROR_MESSAGES[result.error] ?? `Erreur : ${result.error}`);
        return;
      }
      // Rafraîchit le Server Component parent pour afficher le nouveau rôle
      router.refresh();
    });
  }

  // Bloque visuellement si c'est l'acteur lui-même (guard UX — la vraie protection est côté serveur)
  const isDisabled = isPending || isSelf;
  const title = isSelf ? "Impossible de modifier votre propre rôle." : undefined;

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        title={title}
        className={buttonClass}
      >
        {isPending ? labelPending : label}
      </button>
      {inlineError !== null && (
        <span role="alert" className="text-[10px] font-medium text-error">
          {inlineError}
        </span>
      )}
    </div>
  );
}
