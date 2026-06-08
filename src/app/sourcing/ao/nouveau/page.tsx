/**
 * Page création d'un AO manuel — `/sourcing/ao/nouveau`.
 *
 * Server Component protégé.
 * Réservée aux admins : un AO manuel (consultation privée ou gré à gré)
 * engage la société, seul l'admin est habilité à le créer.
 *
 * Fonctionnalité :
 *  - Saisie manuelle des informations du marché (titre, acheteur, deadline, etc.)
 *  - Upload optionnel du DCE (PDF / ZIP, max 50 Mo) vers le bucket
 *    `tender_documents`
 *  - Insertion en BDD avec platformCode = 'prive' (migration 0023)
 *  - Redirection vers la page de détail de l'AO créé
 *
 * Source de vérité : brief Board feat/boamp-dce-ao-manuel (2026-05-27).
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { PrivateTenderForm } from "./PrivateTenderForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Nouvelle consultation privée — edifio Sourcing",
};

export default async function NouvelAOPage() {
  // Auth check
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/ao/nouveau");
  // ADR-014 (2026-06-05) — garde domaine `isAuthorizedEmail` retirée :
  // ouverture multi-tenant (PROTECT + orgs futures). La garde de rôle
  // admin reste appliquée juste après.
  const profile = toUserProfile(user);

  // Réservé aux admins
  if (!isAdmin(profile)) {
    redirect("/sourcing/ao-du-jour");
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Fil d'Ariane */}
      <nav className="mb-4 flex items-center gap-2 text-xs text-muted" aria-label="Fil d'Ariane">
        <Link href="/sourcing/ao-du-jour" className="hover:text-ink hover:underline">
          AO du jour
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink">Nouvelle consultation</span>
      </nav>

      <div className="rounded-md border border-line bg-white p-6 shadow-sm">
        <header className="mb-6">
          <span className="pill-eyebrow">Consultation privée</span>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink">
            Nouvelle consultation
          </h1>
          <p className="mt-1 text-sm text-muted">
            Saisissez les informations d&apos;une consultation privée ou d&apos;un marché de gré à
            gré. Vous pourrez ensuite utiliser le workflow habituel (dossier IA, sollicitation
            architectes).
          </p>
        </header>

        <PrivateTenderForm />
      </div>
    </div>
  );
}
