"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { parseHashError } from "@/lib/auth/parse-hash-error";

/**
 * Intercepteur de fragment d'erreur Supabase Auth.
 *
 * Contexte : quand le token recovery / magic-link a déjà été consommé (souvent
 * par un scanner email d'entreprise — Microsoft Defender Safe Links,
 * Proofpoint, etc. qui pré-cliquent les liens entrants pour vérification
 * sécurité), Supabase redirige sur le **Site URL** (configuré dans Dashboard)
 * avec un fragment d'erreur de la forme :
 *
 *   /#error=access_denied&error_code=otp_expired&error_description=...
 *
 * Le fragment ne traverse jamais la requête HTTP → impossible à lire côté
 * Server Component. Sans ce handler, le user voit la landing page edifio
 * sans aucune indication de ce qui s'est passé.
 *
 * Ce composant lit `window.location.hash` au mount, détecte la présence d'un
 * paramètre d'erreur, nettoie le fragment (`history.replaceState`) puis
 * redirige vers `/auth/error?code=…&description=…` qui affiche un message
 * UX clair + un CTA pour redemander un nouveau lien.
 *
 * Cf. ADR-011 (specs/adr_011_reset_password_scanner.md).
 */
export function HashErrorHandler() {
  const router = useRouter();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const hash = window.location.hash.slice(1);
    const error = parseHashError(hash);
    if (!error) return;

    // Nettoyer le fragment pour ne pas le voir traîner dans la barre d'URL
    // après la redirection (UX + ne pas re-déclencher en cas de back).
    window.history.replaceState(null, "", window.location.pathname);

    const params = new URLSearchParams();
    params.set("code", error.code);
    if (error.description) params.set("description", error.description);
    router.replace(`/auth/error?${params.toString()}`);
  }, [router]);

  return null;
}
