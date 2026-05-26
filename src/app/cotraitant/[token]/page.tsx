/**
 * Page publique cotraitant — accessible sans auth AlyoS.
 *
 * Route : /cotraitant/[token]
 * Auth  : AUCUNE — sécurité par token UUID + vérification expiration/révocation.
 *
 * Cette page est INTENTIONNELLEMENT en dehors de /sourcing/ pour ne pas
 * être interceptée par le middleware @alyosingenierie.fr.
 * Cf. src/middleware.ts : le matcher couvre uniquement /sourcing/* et
 * les routes app internes.
 *
 * Comportement :
 *  1. Valide le token (format UUID, existence, non-révoqué, non-expiré)
 *  2. Charge les items du partage
 *  3. Rendu : CotraitantPageClient (téléchargement + upload)
 */

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { cotraitantShareItems, cotraitantShares } from "@/db/schema/sharing";

import { CotraitantPageClient } from "./CotraitantPageClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pièces à signer — edifio Sourcing" };

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CotraitantItemData {
  id: string;
  name: string;
  kind: string;
  originalStoragePath: string;
  signedAt: Date | null;
  signerName: string | null;
  signedFilename: string | null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  params: { token: string };
}

export default async function CotraitantPage({ params }: PageProps) {
  const { token } = params;

  // Validation format UUID (empêche les scans de chemins arbitraires)
  if (!UUID_SHAPE.test(token)) {
    return <ErrorPage message="Lien invalide." />;
  }

  let shareData: {
    id: string;
    contactName: string;
    expiresAt: Date;
    revokedAt: Date | null;
    items: CotraitantItemData[];
  } | null = null;

  try {
    const shareRows = await db
      .select({
        id: cotraitantShares.id,
        contactName: cotraitantShares.contactName,
        expiresAt: cotraitantShares.expiresAt,
        revokedAt: cotraitantShares.revokedAt,
      })
      .from(cotraitantShares)
      .where(eq(cotraitantShares.token, token))
      .limit(1);

    const share = shareRows[0];

    if (!share) {
      return <ErrorPage message="Ce lien est introuvable ou a expiré." />;
    }
    if (share.revokedAt) {
      return <ErrorPage message="Ce lien de partage a été révoqué." />;
    }
    if (new Date(share.expiresAt) < new Date()) {
      return <ErrorPage message="Ce lien de partage a expiré (validité 30 jours)." />;
    }

    const itemRows = await db
      .select({
        id: cotraitantShareItems.id,
        name: cotraitantShareItems.name,
        kind: cotraitantShareItems.kind,
        originalStoragePath: cotraitantShareItems.originalStoragePath,
        signedAt: cotraitantShareItems.signedAt,
        signerName: cotraitantShareItems.signerName,
        signedFilename: cotraitantShareItems.signedFilename,
      })
      .from(cotraitantShareItems)
      .where(eq(cotraitantShareItems.shareId, share.id));

    shareData = { ...share, items: itemRows };
  } catch (err) {
    console.error("[cotraitant-page:load:fail]", err);
    return <ErrorPage message="Erreur de chargement. Veuillez réessayer." />;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-8 text-center">
        <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-brand-red">
          edifio Sourcing
        </div>
        <h1 className="font-display text-2xl font-bold text-ink">Pièces à signer</h1>
        <p className="mt-2 text-sm text-muted">
          Bonjour {shareData.contactName} — voici les pièces qui vous ont été partagées pour
          signature.
        </p>
      </header>

      <CotraitantPageClient shareId={shareData.id} token={token} items={shareData.items} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Composant d'erreur (inline — simple, pas de layout complexe)
// ---------------------------------------------------------------------------

function ErrorPage({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-lg px-4 py-20 text-center">
      <div className="font-mono text-[11px] uppercase tracking-wider text-brand-red">
        edifio Sourcing
      </div>
      <h1 className="mt-4 font-display text-xl font-bold text-ink">Lien invalide</h1>
      <p className="mt-2 text-sm text-muted">{message}</p>
    </main>
  );
}
