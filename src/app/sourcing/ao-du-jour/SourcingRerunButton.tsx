"use client";

/**
 * Bouton « Relancer la recherche » — superadmin uniquement.
 *
 * Affichage piloté côté Server Component parent (`page.tsx`) via
 * `isSuperAdmin(profile)`. Ce composant ne refait PAS le check de rôle :
 * la Server Action `triggerSourcingRunAction` est la source de vérité
 * sécurité (UI cachée + action guardée + endpoint cron bearer-token).
 *
 * Comportement :
 *  - confirm() natif pour éviter les clics involontaires ;
 *  - useTransition pour la latence (~10-30 s typiques) ;
 *  - message inline succès/erreur (role status / alert pour a11y) ;
 *  - router.refresh() après succès pour recharger la liste d'AO de la page.
 *
 * Style aligné avec « + Ajouter un AO » (rounded-full, border-line,
 * bg-white, text-xs) — cf. page.tsx ligne 246.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { triggerSourcingRunAction } from "./admin-actions";

export function SourcingRerunButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function handleClick() {
    if (isPending) return;
    if (!confirm("Relancer le cron de sourcing maintenant ?")) return;
    setMessage(null);
    startTransition(async () => {
      const result = await triggerSourcingRunAction();
      if (result.ok) {
        setMessage({
          ok: true,
          text: `✓ Cron terminé : ${result.inserted} AO insérés sur ${result.totalProfiles} profils (${Math.round(result.durationMs / 1000)}s).`,
        });
        router.refresh();
      } else {
        setMessage({ ok: false, text: `✗ ${result.error}` });
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5 shrink-0"
          aria-hidden
        >
          <path d="M14 8a6 6 0 1 1-1.76-4.24" />
          <path d="M14 2v4h-4" />
        </svg>
        {isPending ? "Relance en cours…" : "Relancer la recherche"}
      </button>
      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={`text-xs ${message.ok ? "text-success" : "text-error"}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
