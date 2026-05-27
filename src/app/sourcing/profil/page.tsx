/**
 * Page Profil — Redirection vers /sourcing/profil/news
 *
 * La page racine `/sourcing/profil` redirige immédiatement vers la section
 * Actualités (point d'entrée naturel du module profil).
 *
 * Décision Board 2026-05-27 — module profil utilisateur edifio Sourcing.
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ProfilRootPage() {
  redirect("/sourcing/profil/news");
}
