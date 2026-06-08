import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { presentationLibrary } from "@/db/schema/library";
import { isAdmin, toUserProfile } from "@/lib/auth/types";
import { getRequiredOrgId } from "@/lib/auth/get-required-org-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";

import { LibraryClient } from "./LibraryClient";
import { loadLibraryIndexDetails, type LibraryIndexDetail } from "./index-actions";
import type { PresentationLibraryItem } from "@/db/schema/library";

export const metadata = {
  title: "Bibliothèque entreprise · edifio Sourcing",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Page admin — bibliothèque des documents fixes AlyoS.
 *
 * Permet à l'admin d'uploader les pièces réutilisables (Kbis, URSSAF,
 * attestation fiscale, assurance RC, bilan, RIB, références, DC2/DC4 vierges,
 * autres) qui seront pré-attachées aux dossiers de candidature.
 *
 * Architecture :
 *  - Server Component : auth check + chargement BDD via Drizzle.
 *  - `LibraryClient` (Client Component) : UI upload/suppression par catégorie.
 *  - Résilience : try/catch absorbé (règle MEMORY — pattern /ao-du-jour).
 */
export default async function BibliothequeAdminPage() {
  // 1. Auth check — admin uniquement
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/sourcing/admin/bibliotheque");

  const profile = toUserProfile(user);
  if (!isAdmin(profile)) redirect("/sourcing/ao-du-jour?error=forbidden");

  // Résolution dynamique de l'org (Phase A multi-tenant).
  // Try/catch propre : si la requête memberships échoue, fallback sur ALYOS_ORG_ID
  // plutôt que crash 500 de la page entière.
  let orgId: string;
  try {
    orgId = await getRequiredOrgId(user.id);
  } catch (err) {
    console.error("[admin-bibliotheque:org-resolution-failed]", err);
    orgId = ALYOS_ORG_ID;
  }

  // 2. Chargement des documents (try/catch résilience — règle MEMORY)
  let items: PresentationLibraryItem[] = [];
  let indexDetails: LibraryIndexDetail[] = [];
  let fetchError: string | null = null;

  try {
    items = await db
      .select()
      .from(presentationLibrary)
      .where(eq(presentationLibrary.organizationId, orgId))
      .orderBy(presentationLibrary.kind, presentationLibrary.createdAt);

    // Détails d'indexation IA (chantier E + G1). Helper internalement
    // try/catch isolé : si la migration 0041 n'est pas appliquée, retourne `[]`
    // et l'UI dégrade silencieusement.
    indexDetails = await loadLibraryIndexDetails();
  } catch (err) {
    console.error("[bibliotheque:fetch:fail]", err);
    // NB : message brut non transmis à l'UI (fuite d'info DB en prod).
    fetchError = "db-error";
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* En-tête */}
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Bibliothèque entreprise
        </h1>
        <p className="mt-1 text-sm text-muted">
          Documents fixes AlyoS réutilisés pour chaque dossier de candidature (Kbis, attestations,
          bilan, RIB, références…). Taille max par fichier : 50 Mo.
        </p>
      </header>

      {/* Erreur chargement BDD */}
      {fetchError ? (
        <ErrorBanner
          message={fetchError}
          title="Bibliothèque indisponible"
          description="Impossible de charger les documents. Réessayez dans quelques instants — si le problème persiste, contactez l'administrateur."
        />
      ) : (
        <LibraryClient entries={items} indexDetails={indexDetails} />
      )}
    </div>
  );
}
