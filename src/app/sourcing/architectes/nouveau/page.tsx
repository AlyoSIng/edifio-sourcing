import { redirect } from "next/navigation";
import Link from "next/link";

import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ArchitectCreateForm } from "./ArchitectCreateForm";

export const metadata = {
  title: "Ajouter un architecte — edifio Sourcing",
};

/**
 * Page création architecte — Server Component.
 * Réservée aux admins (redirect sinon).
 */
export const dynamic = "force-dynamic";

export default async function ArchitectNouveauPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/architectes/nouveau");
  const profile = toUserProfile(user);

  if (!isAdmin(profile)) {
    redirect("/sourcing/architectes");
  }

  return (
    <div className="mx-auto max-w-2xl">
      <nav aria-label="Fil d'Ariane" className="mb-4 text-xs text-muted">
        <Link href="/sourcing/architectes" className="hover:underline">
          Architectes
        </Link>
        {" / "}
        <span className="text-ink">Nouveau</span>
      </nav>

      <div className="rounded-md border border-line bg-white p-6">
        <h1 className="mb-6 font-display text-xl font-bold text-ink">Ajouter un architecte</h1>
        <ArchitectCreateForm />
      </div>
    </div>
  );
}
