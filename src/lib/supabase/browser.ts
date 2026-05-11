"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Client Supabase navigateur — pour les composants client (`"use client"`).
 *
 * Lit `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`
 * (variables exposées au bundle JS — la clé `anon` est protégée par RLS
 * côté Postgres et ne donne aucun privilège élevé).
 *
 * Source : `@supabase/ssr` 0.10 — pattern Next.js 14 App Router.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY manquant. Voir .env.example.",
    );
  }

  return createBrowserClient(url, anonKey);
}
