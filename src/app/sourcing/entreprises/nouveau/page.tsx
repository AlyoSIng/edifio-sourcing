import { redirect } from "next/navigation";
import Link from "next/link";

import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { CompanyCreateForm } from "./CompanyCreateForm";

export const metadata = {
  title: "Ajouter une entreprise — edifio Sourcing",
};

/**
 * Page création entreprise — Server Component.
 * Réservée aux admins.
 */
export const dynamic = "force-dynamic";

export default async function EntrepriseNouveauPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/entreprises/nouveau");
  const profile = toUserProfile(user);

  if (!isAdmin(profile)) {
    redirect("/sourcing/entreprises");
  }

  return (
    <div className="mx-auto max-w-2xl">
      <nav aria-label="Fil d'Ariane" className="mb-4 text-xs text-muted">
        <Link href="/sourcing/entreprises" className="hover:underline">
          Entreprises / Majors
        </Link>
        {" / "}
        <span className="text-ink">Nouvelle</span>
      </nav>

      <div className="rounded-md border border-line bg-white p-6">
        <h1 className="mb-6 font-display text-xl font-bold text-ink">Ajouter une entreprise</h1>
        <CompanyCreateForm />
      </div>
    </div>
  );
}
