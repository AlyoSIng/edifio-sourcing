"use client";

import { useEffect, useState } from "react";

/**
 * Hook de countdown — calcule le temps restant (en ms) jusqu'à une deadline
 * absolue, avec un tick toutes les 500 ms (compromis entre fluidité affichée
 * et coût CPU négligeable). Quand `deadlineMs` est `null`, le countdown est
 * inactif et la valeur retournée est `0` (signifie « pas de cooldown
 * actif »).
 *
 * Source de vérité du temps : `Date.now()` — robuste à la mise en veille de
 * l'onglet (la valeur recalculée au tick suivant rattrape la dérive), aux
 * changements d'horloge système non garantis monotonic, etc. Pas de
 * comptage par décrément d'un compteur local (dérive cumulée).
 *
 * Cleanup explicite via `clearInterval` dans le retour de `useEffect` — pas
 * de fuite de timer si le composant démonte (par exemple quand l'état
 * passe à `sent` et que `<SuccessState />` remplace `<form>`).
 *
 * Pas d'attache à `requestAnimationFrame` : on n'a besoin de précision que
 * pour l'affichage d'un compteur de secondes, et `rAF` est freiné quand
 * l'onglet est en arrière-plan (ce qui retarderait artificiellement la fin
 * du cooldown).
 *
 * @param deadlineMs — timestamp absolu (ms) auquel le countdown doit
 *   atteindre 0. Si `null`, retourne 0 sans démarrer de timer.
 * @returns le nombre de millisecondes restantes (toujours ≥ 0).
 */
export function useCountdown(deadlineMs: number | null): number {
  const [remaining, setRemaining] = useState<number>(() => computeRemaining(deadlineMs));

  useEffect(() => {
    // Recalcule immédiatement à chaque changement de `deadlineMs` (par
    // exemple quand un nouveau rate-limit est posé) — évite d'afficher la
    // valeur stale du tick précédent.
    setRemaining(computeRemaining(deadlineMs));

    // Pas de timer quand inactif.
    if (deadlineMs === null) return;

    const id = setInterval(() => {
      const next = computeRemaining(deadlineMs);
      setRemaining(next);
      // Optimisation : on coupe le timer dès qu'on atteint 0 — inutile de
      // continuer à tick une fois le cooldown expiré.
      if (next <= 0) {
        clearInterval(id);
      }
    }, 500);

    return () => clearInterval(id);
  }, [deadlineMs]);

  return remaining;
}

/**
 * Calcule la valeur courante (ms restant jusqu'à `deadlineMs`). Pure et
 * exportée pour faciliter les tests unitaires sans monter de composant
 * React.
 */
export function computeRemaining(deadlineMs: number | null): number {
  if (deadlineMs === null) return 0;
  return Math.max(0, deadlineMs - Date.now());
}

/**
 * Convertit un nombre de millisecondes en nombre entier de secondes
 * arrondi vers le haut (`ceil`). Utilisé pour l'affichage utilisateur :
 * tant qu'il reste 500 ms, on affiche « 1 s » et non « 0 s ».
 */
export function msToCeilSeconds(ms: number): number {
  return Math.ceil(ms / 1000);
}
