/**
 * TrialBanner — bandeau global affiché dans l'AppShell pour signaler
 * l'approche de la fin du trial (Steve 2026-06-05, Stripe minimal MVP).
 *
 * Server Component pur — calcule l'état à partir de l'org chargée par
 * le layout `AppShell`. Pas d'I/O ici.
 *
 * Sévérités :
 *   - info    (orange clair) : 3 < daysLeft ≤ 15
 *   - warning (rouge orange) : 0 < daysLeft ≤ 3
 *   - danger  (rouge)        : daysLeft ≤ 0 → l'app est aussi verrouillée
 *
 * Pour le palier `danger`, la bannière est affichée même côté
 * `/trial-expired` (cohérence visuelle).
 */

import Link from "next/link";

import type { TrialState } from "@/lib/billing/trial";

interface TrialBannerProps {
  state: TrialState;
}

export function TrialBanner({ state }: TrialBannerProps) {
  if (!state.shouldShowBanner || state.bannerSeverity === null) return null;

  const cls = bannerClasses(state.bannerSeverity);
  const msg = bannerMessage(state);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-between gap-3 border-b px-4 py-2 text-sm md:px-6 ${cls}`}
    >
      <p>
        <span aria-hidden className="mr-1.5">
          {state.bannerSeverity === "danger"
            ? "⛔"
            : state.bannerSeverity === "warning"
              ? "⚠️"
              : "ℹ️"}
        </span>
        {msg}
      </p>
      <Link
        href="/pricing"
        className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-medium underline-offset-2 hover:underline"
      >
        Voir les offres
      </Link>
    </div>
  );
}

function bannerMessage(state: TrialState): string {
  if (state.status === "expired")
    return "Votre essai a expiré. Contactez contact@edifio.fr pour activer un abonnement.";
  if (state.status === "cancelled")
    return "Votre abonnement est annulé. Contactez contact@edifio.fr pour le réactiver.";

  // status === 'trial'
  if (state.daysLeft === null) return "Période d'essai en cours.";
  if (state.daysLeft <= 0)
    return "Votre essai gratuit a expiré aujourd'hui — contactez contact@edifio.fr pour souscrire.";
  if (state.daysLeft === 1)
    return "Votre essai gratuit se termine demain. Souscrivez pour ne pas perdre l'accès.";
  if (state.daysLeft <= 3)
    return `Votre essai gratuit se termine dans ${state.daysLeft} jours. Souscrivez pour continuer.`;
  return `Essai gratuit en cours — ${state.daysLeft} jours restants. Pensez à souscrire pour continuer après.`;
}

function bannerClasses(severity: "info" | "warning" | "danger"): string {
  switch (severity) {
    case "info":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "warning":
      return "border-orange-300 bg-orange-100 text-orange-900";
    case "danger":
      return "border-red-300 bg-red-100 text-red-900";
  }
}
