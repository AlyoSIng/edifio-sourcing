"use client";

import { useTransition } from "react";

import { signOutAction } from "./actions";

/**
 * Bouton « Déconnexion » du Topbar — Client Component minimal.
 *
 * Appelle la Server Action `signOutAction` qui :
 *   1. Invalide la session Supabase (`auth.signOut`)
 *   2. Redirige vers `/login`
 *
 * Pourquoi un Client Component ? Le bouton vit dans un Server Component
 * (`Topbar`), mais on veut un `useTransition` pour griser pendant l'appel +
 * un onClick stylé. Pas de form HTML utilisé pour rester compact.
 */
export function SignOutButton() {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await signOutAction();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      title="Se déconnecter"
      aria-label="Se déconnecter"
      className="rounded-sm border border-line-2 bg-white px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted outline-none transition hover:border-line-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1 disabled:opacity-50"
    >
      {isPending ? "…" : "Déco"}
    </button>
  );
}
