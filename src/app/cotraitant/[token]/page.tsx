/**
 * Page publique cotraitant — accessible sans auth AlyoS.
 *
 * Route : /cotraitant/[token]
 * Auth  : AUCUNE — sécurité par token UUID + vérification expiration/révocation.
 *
 * Cette page est INTENTIONNELLEMENT en dehors de /sourcing/ pour ne pas
 * être interceptée par le middleware AlyoS interne.
 *
 * Comportement :
 *  1. Valide le token (format UUID)
 *  2. Appelle la function SECURITY DEFINER `get_cotraitant_share_by_token`
 *     qui retourne le share core (PAS d'organization_id, anti-leak)
 *  3. Distingue les états : introuvable / révoqué / expiré
 *  4. Charge les items via `get_cotraitant_share_items_by_token`
 *     (la function ne retourne rien si le share est inactif → défense en profondeur)
 *  5. Rendu : CotraitantPageClient (téléchargement + upload)
 *
 * Sécurité (migration 0053 — éradication policies anon publiques) :
 *  - AUCUNE policy `FOR SELECT TO anon` sur cotraitant_shares / cotraitant_share_items
 *  - Le pattern utilise des SECURITY DEFINER functions qui s'exécutent avec
 *    les droits du propriétaire (postgres BYPASSRLS) et ne retournent JAMAIS
 *    organization_id ni tender_id (anti-leak cross-tenant).
 *  - La validité du share (revoked_at IS NULL AND expires_at > now()) est
 *    vérifiée DANS le SQL des functions (items / path / sign), pas seulement
 *    côté code applicatif.
 */

import { sql } from "drizzle-orm";

import { db } from "@/db/client";

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

/**
 * Forme brute retournée par `get_cotraitant_share_by_token` (snake_case SQL).
 * `extends Record<string, unknown>` requis par la contrainte de `db.execute<T>`.
 */
interface ShareRow extends Record<string, unknown> {
  id: string;
  contact_name: string;
  contact_email: string;
  expires_at: string | Date;
  revoked_at: string | Date | null;
}

/**
 * Forme brute retournée par `get_cotraitant_share_items_by_token` (snake_case SQL).
 * `extends Record<string, unknown>` requis par la contrainte de `db.execute<T>`.
 */
interface ItemRow extends Record<string, unknown> {
  id: string;
  name: string;
  kind: string;
  original_storage_path: string;
  signed_at: string | Date | null;
  signer_name: string | null;
  signed_filename: string | null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function CotraitantPage(props: PageProps) {
  const params = await props.params;
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
    // 1. Récupération du share core via SECURITY DEFINER function.
    //    La function bypass la RLS (post-0053) et NE retourne PAS
    //    organization_id/tender_id (anti-leak).
    //    Si le share n'existe pas : 0 row → introuvable.
    //    Si revoké/expiré : la function retourne quand même la ligne pour
    //    permettre un message d'erreur distinct (révoqué vs expiré).
    const shareResult = await db.execute<ShareRow>(
      sql`SELECT id, contact_name, contact_email, expires_at, revoked_at
            FROM public.get_cotraitant_share_by_token(${token}::uuid)`,
    );
    const share = shareResult[0];

    if (!share) {
      return <ErrorPage message="Ce lien est introuvable ou a expiré." />;
    }
    if (share.revoked_at) {
      return <ErrorPage message="Ce lien de partage a été révoqué." />;
    }
    if (new Date(share.expires_at) < new Date()) {
      return <ErrorPage message="Ce lien de partage a expiré (validité 30 jours)." />;
    }

    // 2. Récupération des items via SECURITY DEFINER function.
    //    Si share inactif côté SQL → la function retourne 0 row (défense en
    //    profondeur, double-check du share status).
    const itemsResult = await db.execute<ItemRow>(
      sql`SELECT id, name, kind, original_storage_path, signed_at, signer_name, signed_filename
            FROM public.get_cotraitant_share_items_by_token(${token}::uuid)`,
    );

    const items: CotraitantItemData[] = itemsResult.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      originalStoragePath: row.original_storage_path,
      signedAt: row.signed_at ? new Date(row.signed_at) : null,
      signerName: row.signer_name,
      signedFilename: row.signed_filename,
    }));

    shareData = {
      id: share.id,
      contactName: share.contact_name,
      expiresAt: new Date(share.expires_at),
      revokedAt: share.revoked_at ? new Date(share.revoked_at) : null,
      items,
    };
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
