/**
 * Page de gestion du partage de pièces aux cotraitants.
 *
 * Route : /sourcing/ao/[id]/tandem/partage
 * Auth  : requise — domaine @alyosingenierie.fr (middleware.ts + vérif locale)
 *
 * Server Component qui :
 *  1. Vérifie l'auth Supabase
 *  2. Charge la bibliothèque de l'org (pour la sélection)
 *  3. Charge les partages existants pour cet AO
 *  4. Délègue le rendu interactif à PartageClient
 */

import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { cotraitantShareItems, cotraitantShares } from "@/db/schema/sharing";
import { presentationLibrary } from "@/db/schema/library";
import { isAuthorizedEmail } from "@/lib/auth/domain";
import { toUserProfile } from "@/lib/auth/types";
import { ALYOS_ORG_ID } from "@/lib/constants/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { PartageClient } from "./PartageClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Partage de pièces — edifio Sourcing" };

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// ---------------------------------------------------------------------------
// Types de données passées au Client Component
// ---------------------------------------------------------------------------

export interface LibraryItemForShare {
  id: string;
  name: string;
  kind: string;
  storagePath: string;
}

export interface ShareItemSummary {
  id: string;
  name: string;
  kind: string;
  signedAt: Date | null;
  signerName: string | null;
  signedFilename: string | null;
}

export interface ShareForDisplay {
  id: string;
  contactName: string;
  contactEmail: string;
  token: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  items: ShareItemSummary[];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PartageCotraitantPage({ params }: { params: { id: string } }) {
  // 1. Auth
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/sourcing/ao/${params.id}/tandem/partage`);
  }

  const profile = toUserProfile(user);
  if (!isAuthorizedEmail(profile.email)) {
    redirect("/forbidden");
  }

  if (!UUID_SHAPE.test(params.id)) {
    redirect("/sourcing/ao-du-jour");
  }

  // 2. Chargement données — try/catch absorbé : pas de crash brutal si BDD
  //    indisponible (pattern résilience Server Component, cf. MEMORY.md)
  let libraryItems: LibraryItemForShare[] = [];
  const existingShares: ShareForDisplay[] = [];

  try {
    // Bibliothèque de l'org (toutes catégories)
    const libRows = await db
      .select({
        id: presentationLibrary.id,
        name: presentationLibrary.name,
        kind: presentationLibrary.kind,
        storagePath: presentationLibrary.storagePath,
      })
      .from(presentationLibrary)
      .where(eq(presentationLibrary.organizationId, ALYOS_ORG_ID))
      .orderBy(presentationLibrary.kind, presentationLibrary.name);

    libraryItems = libRows;

    // Partages existants pour cet AO, par ordre décroissant
    const shareRows = await db
      .select()
      .from(cotraitantShares)
      .where(
        and(
          eq(cotraitantShares.tenderId, params.id),
          eq(cotraitantShares.organizationId, ALYOS_ORG_ID),
        ),
      )
      .orderBy(desc(cotraitantShares.createdAt));

    // Pour chaque partage, charger les items (N requêtes séquentielles — nb
    // faible en pratique, optimisable avec un JOIN en Phase 2)
    for (const share of shareRows) {
      const itemRows = await db
        .select({
          id: cotraitantShareItems.id,
          name: cotraitantShareItems.name,
          kind: cotraitantShareItems.kind,
          signedAt: cotraitantShareItems.signedAt,
          signerName: cotraitantShareItems.signerName,
          signedFilename: cotraitantShareItems.signedFilename,
        })
        .from(cotraitantShareItems)
        .where(eq(cotraitantShareItems.shareId, share.id));

      existingShares.push({
        id: share.id,
        contactName: share.contactName,
        contactEmail: share.contactEmail,
        token: share.token,
        expiresAt: share.expiresAt,
        revokedAt: share.revokedAt,
        createdAt: share.createdAt,
        items: itemRows,
      });
    }
  } catch (err) {
    console.error("[partage:load:fail]", err);
    // On continue avec des tableaux vides — l'UI affichera un état vide
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6">
        <a
          href={`/sourcing/ao/${params.id}/tandem`}
          className="text-sm text-brand-red hover:underline"
        >
          &larr; Retour à la short-list
        </a>
        <h1 className="mt-3 font-display text-2xl font-bold text-ink">Partage de pièces</h1>
        <p className="mt-1 text-sm text-muted">
          Générez un lien sécurisé pour que votre cotraitant télécharge les pièces, les signe et les
          redépose.
        </p>
      </header>

      <PartageClient
        tenderId={params.id}
        libraryItems={libraryItems}
        existingShares={existingShares}
      />
    </div>
  );
}
