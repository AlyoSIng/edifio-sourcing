"use client";

import { useEffect, useState } from "react";

/**
 * Hook utilitaire — countdown réactif jusqu'à un timestamp absolu.
 *
 * Conçu pour le cooldown rate-limit login (Board Q4/A 2026-05-12), mais
 * générique et réutilisable (autres cooldowns à venir : confirmation OTP,
 * relances diffusion architecte, etc.).
 *
 * Comportement :
 *   - `deadlineMs === null` → countdown inactif (state stable `0` / `false`).
 *   - `deadlineMs <= Date.now()` → idem (déjà expiré).
 *   - Sinon : tick toutes les 500 ms, expose `remainingSec` mis à jour.
 *
 * On lit `Date.now()` à chaque tick plutôt que de décrémenter un compteur
 * interne — cela évite la dérive (timer ralenti par onglet inactif) et
 * garantit que le countdown reflète l'horloge réelle quand l'utilisateur
 * revient sur la page.
 *
 * Note SSR : le hook est tagué `"use client"` et se monte uniquement côté
 * browser — pas de risque de fuite serveur.
 */

export interface UseCountdownResult {
  /** Secondes restantes (entier, écrêté à 0 minimum). */
  remainingSec: number;
  /** `true` si un countdown est en cours (deadline future). */
  isActive: boolean;
}

const TICK_MS = 500;

/**
 * Calcule le nombre de secondes restantes avant la deadline.
 * Exporté pour testabilité (le hook lui-même requiert un DOM).
 *
 * @param deadlineMs — timestamp absolu (Date.now-relatif) ou null.
 * @param now — injectable pour les tests (défaut : `Date.now()`).
 */
export function computeRemaining(deadlineMs: number | null, now: number = Date.now()): number {
  if (deadlineMs === null) return 0;
  const diff = Math.max(0, deadlineMs - now);
  return Math.ceil(diff / 1000);
}

export function useCountdown(deadlineMs: number | null): UseCountdownResult {
  const [remainingSec, setRemainingSec] = useState<number>(() => computeRemaining(deadlineMs));

  useEffect(() => {
    // Recalcul immédiat à chaque changement de deadline (ex : nouvelle erreur
    // 429 qui prolonge le cooldown).
    setRemainingSec(computeRemaining(deadlineMs));

    if (deadlineMs === null) return undefined;
    if (deadlineMs <= Date.now()) return undefined;

    const id = window.setInterval(() => {
      const next = computeRemaining(deadlineMs);
      setRemainingSec(next);
      // Auto-cleanup quand on atteint 0 — évite un tick inutile.
      if (next <= 0) window.clearInterval(id);
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [deadlineMs]);

  return {
    remainingSec,
    isActive: deadlineMs !== null && remainingSec > 0,
  };
}
