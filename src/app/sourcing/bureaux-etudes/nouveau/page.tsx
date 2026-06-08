import { redirect } from "next/navigation";

import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { BECreateForm } from "./BECreateForm";

export const metadata = {
  title: "Ajouter un bureau d'études — edifio Sourcing",
};

/**
 * Page création bureau d'études — Server Component.
 * Réservée aux admins (redirect sinon).
 */
export const dynamic = "force-dynamic";

export default async function BENouveauPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sourcing/bureaux-etudes/nouveau");
  const profile = toUserProfile(user);

  if (!isAdmin(profile)) {
    redirect("/sourcing/bureaux-etudes");
  }

  return (
    <div className="mx-auto max-w-2xl">
      <nav aria-label="Fil d'Ariane" className="mb-4 text-xs text-muted">
        <a href="/sourcing/bureaux-etudes" className="hover:underline">
          Bureaux d&rsquo;Études
        </a>
        {" / "}
        <span className="text-ink">Nouveau</span>
      </nav>

      <div className="rounded-md border border-line bg-white p-6">
        <h1 className="mb-6 font-display text-xl font-bold text-ink">
          Ajouter un bureau d&rsquo;études
        </h1>
        <BECreateForm />
      </div>
    </div>
  );
}
