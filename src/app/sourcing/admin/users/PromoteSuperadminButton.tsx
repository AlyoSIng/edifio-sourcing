"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { Role } from "@/lib/auth/types";

import { updateUserSuperadminAction } from "./actions";

/**
 * Bouton de promotion / rétrogradation vers le rôle superadmin.
 *
 * Visible uniquement si le viewer est lui-même superadmin (`viewerIsSuperAdmin`).
 * Seul un admin actif (role === "admin") peut être promu superadmin.
 * Un superadmin peut être rétrogradé vers admin.
 *
 * Comportement :
 *  - currentRole === "admin"      → "Passer superadmin" (style violet)
 *  - currentRole === "superadmin" → "Retirer superadmin" (style neutral)
 *  - currentRole === "user" | "viewer" → render null (admin d'abord)
 *  - viewerIsSuperAdmin === false       → render null
 *
 * Sécurité côté UI :
 *  - `isSelf` bloque le bouton visuellement pour éviter le self-demotion.
 *    Le guard serveur dans `actions.ts` reste la vraie protection.
 *
 * Résilience :
 *  - Erreur inline sous le bouton (pas de crash, pas de toast global).
 *  - `useTransition` pour l'indicateur de chargement sans bloquer la navigation.
 *
 * Décision Board 2026-05-27 — rôle superadmin éditeur edifio.
 */

type PromoteSuperadminButtonProps = {
  /** UUID Supabase de l'utilisateur cible. */
  targetUserId: string;
  /** Rôle actuel de l'utilisateur cible. */
  currentRole: Role;
  /** Indique si la ligne correspond à l'acteur connecté (bloque self-demotion). */
  isSelf: boolean;
  /** Indique si le viewer connecté est superadmin (seul lui peut utiliser ce bouton). */
  viewerIsSuperAdmin: boolean;
};

/** Messages d'erreur lisibles pour les codes renvoyés par `updateUserSuperadminAction`. */
const ERROR_MESSAGES: Record<string, string> = {
  self_demotion: "Impossible de se rétrograder soi-même.",
  forbidden: "Action non autorisée.",
  unauthenticated: "Session expirée — rechargez la page.",
  invalid_user_id: "Identifiant utilisateur invalide.",
  target_not_admin: "L'utilisateur doit être admin avant d'être promu superadmin.",
};

export function PromoteSuperadminButton({
  targetUserId,
  currentRole,
  isSelf,
  viewerIsSuperAdmin,
}: PromoteSuperadminButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [inlineError, setInlineError] = useState<string | null>(null);
  const router = useRouter();

  // Seul un superadmin peut utiliser ce bouton
  if (!viewerIsSuperAdmin) return null;
  // Seuls les admin et superadmin ont ce bouton (user/viewer : pas éligibles)
  if (currentRole !== "admin" && currentRole !== "superadmin") return null;

  const isPromotion = currentRole === "admin";
  const newRole: "superadmin" | "admin" = isPromotion ? "superadmin" : "admin";
  const label = isPromotion ? "Passer superadmin" : "Retirer superadmin";
  const labelPending = isPromotion ? "Promotion…" : "Rétrogradation…";

  // Style violet pour la promotion superadmin, neutral pour la rétrogradation
  const buttonClass = isPromotion
    ? "rounded-full border border-violet-500 px-2.5 py-1 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40"
    : "rounded-full border border-line-2 px-2.5 py-1 text-[11px] font-semibold text-ink transition hover:bg-paper-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40";

  function handleClick() {
    setInlineError(null);
    startTransition(async () => {
      const result = await updateUserSuperadminAction(targetUserId, newRole);
      if (!result.ok) {
        setInlineError(ERROR_MESSAGES[result.error] ?? `Erreur : ${result.error}`);
        return;
      }
      // Rafraîchit le Server Component parent pour afficher le nouveau rôle
      router.refresh();
    });
  }

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
