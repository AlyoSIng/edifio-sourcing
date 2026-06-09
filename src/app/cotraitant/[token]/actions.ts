"use server";

/**
 * Server Actions publiques — page cotraitant /cotraitant/[token].
 *
 * PAS d'auth AlyoS requise ici — la sécurité repose entièrement sur :
 *  1. La validation du token UUID (existence, non-révoqué, non-expiré)
 *  2. La vérification que l'item appartient bien au share associé au token
 *  3. Le pattern SECURITY DEFINER (migration 0053) : aucune policy
 *     `TO anon` sur les tables, toute lecture/écriture passe par des
 *     functions Postgres qui re-vérifient la validité du share côté SQL.
 *
 * Actions exposées :
 *  - getCotraitantDownloadUrl : URL signée 1h pour télécharger une pièce originale
 *  - uploadSignedDocument     : upload d'une pièce signée dans le bucket cotraitant_signed
 *
 * IMPORTANT (ops) — bucket requis :
 *   Le bucket "cotraitant_signed" doit être créé dans le dashboard Supabase AVANT
 *   la 1re utilisation : Storage → New Bucket → Nom : "cotraitant_signed" → Private.
 */

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Bucket destination pour les pièces signées déposées par le cotraitant. */
const SIGNED_BUCKET = "cotraitant_signed";

/** Bucket source pour les pièces originales partagées (bibliothèque org). */
const ORIGINAL_BUCKET = "company_library";

/** Taille max des uploads cotraitant (20 MB). */
const MAX_SIZE_BYTES = 20 * 1024 * 1024;

/** Types MIME acceptés pour les dépôts signés. */
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

// ---------------------------------------------------------------------------
// getCotraitantDownloadUrl
// ---------------------------------------------------------------------------

/**
 * Génère une URL signée de téléchargement pour une pièce partagée.
 *
 * Sécurité :
 *  - Token validé (share existant, non-révoqué, non-expiré)
 *    → ces 3 conditions sont vérifiées DANS la SECURITY DEFINER function
 *    `get_cotraitant_item_original_path` (revoked_at IS NULL AND expires_at > now()).
 *    Si le share est inactif, la function retourne NULL → "share_invalid".
 *  - Anti-IDOR : la function joint cotraitant_share_items + cotraitant_shares
 *    et vérifie `csi.id = item_id AND cs.token = token`. Un visiteur muni
 *    d'un token actif ne peut pas télécharger un item d'un AUTRE share.
 *  - URL valable 1 heure.
 */
export async function getCotraitantDownloadUrl(
  token: string,
  itemId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!UUID_SHAPE.test(token) || !UUID_SHAPE.test(itemId)) {
    return { ok: false, error: "invalid_input" };
  }

  try {
    // SECURITY DEFINER function : retourne NULL si share inactif OU si
    // l'item n'appartient pas au share. Aucune fuite d'organization_id.
    interface PathRow extends Record<string, unknown> {
      path: string | null;
    }
    const pathRows = await db.execute<PathRow>(
      sql`SELECT public.get_cotraitant_item_original_path(${token}::uuid, ${itemId}::uuid) AS path`,
    );
    const originalStoragePath = pathRows[0]?.path ?? null;

    if (!originalStoragePath) {
      // Le share est invalide (revoked/expired/not-found) OU l'item ne
      // correspond pas au token (anti-IDOR). On retourne un code générique
      // pour ne pas donner d'indice sur la raison exacte.
      return { ok: false, error: "share_invalid" };
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage
      .from(ORIGINAL_BUCKET)
      .createSignedUrl(originalStoragePath, 3600);

    if (error || !data?.signedUrl) {
      console.error("[cotraitant:download:storage:fail]", error);
      return { ok: false, error: "storage_error" };
    }

    return { ok: true, url: data.signedUrl };
  } catch (err) {
    console.error("[cotraitant:download:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}

// ---------------------------------------------------------------------------
// uploadSignedDocument
// ---------------------------------------------------------------------------

/**
 * Upload d'une pièce signée par le cotraitant.
 *
 * FormData attendu :
 *  - token      : UUID (token du partage)
 *  - itemId     : UUID (id de l'item à marquer comme signé)
 *  - file       : File (PDF, JPG ou PNG, max 20 MB)
 *  - signerName : string (optionnel — nom du signataire)
 *
 * Sécurité :
 *  - Validation MIME + taille côté serveur (avant tout appel BDD/Storage)
 *  - Sanitisation du nom de fichier pour le chemin Storage
 *  - Pré-check de validité du share via `get_cotraitant_item_original_path` :
 *    si NULL → share invalide ou item étranger au share → abort avant upload
 *    (évite de polluer le bucket signé avec des fichiers orphelins).
 *  - UPDATE atomique via `mark_cotraitant_share_item_signed` : la function
 *    refuse si share inactif OU item déjà signé (anti re-signature).
 *
 * IMPORTANT : le bucket "cotraitant_signed" doit exister dans Supabase Storage
 * avant la 1re exécution de cette action.
 */
export async function uploadSignedDocument(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = formData.get("token");
  const itemId = formData.get("itemId");
  const signerName = formData.get("signerName");
  const file = formData.get("file");

  // Validation des entrées
  if (typeof token !== "string" || !UUID_SHAPE.test(token)) {
    return { ok: false, error: "invalid_input" };
  }
  if (typeof itemId !== "string" || !UUID_SHAPE.test(itemId)) {
    return { ok: false, error: "invalid_input" };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "missing_file" };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, error: "file_too_large" };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false, error: "invalid_mime_type" };
  }

  const signerNameStr =
    typeof signerName === "string" && signerName.trim() !== "" ? signerName.trim() : null;

  try {
    // 1. Pré-check : le share est-il actif ET l'item lui appartient-il ?
    //    Réutilise `get_cotraitant_item_original_path` qui répond aux deux
    //    questions en un seul roundtrip (NULL si invalide).
    interface PathRow extends Record<string, unknown> {
      path: string | null;
    }
    const pathRows = await db.execute<PathRow>(
      sql`SELECT public.get_cotraitant_item_original_path(${token}::uuid, ${itemId}::uuid) AS path`,
    );

    if (!pathRows[0]?.path) {
      return { ok: false, error: "share_invalid" };
    }

    // 2. Chemin Storage : on a besoin du shareId pour préfixer.
    //    On le récupère via `get_cotraitant_share_by_token` (même SECURITY
    //    DEFINER pattern, share core sans organization_id).
    interface ShareIdRow extends Record<string, unknown> {
      id: string;
    }
    const shareIdRows = await db.execute<ShareIdRow>(
      sql`SELECT id FROM public.get_cotraitant_share_by_token(${token}::uuid)`,
    );
    const shareId = shareIdRows[0]?.id;
    if (!shareId) {
      return { ok: false, error: "share_invalid" };
    }

    // 3. Chemin Storage : {shareId}/{itemId}/{timestamp}_{safeFilename}
    const timestamp = Date.now();
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${shareId}/${itemId}/${timestamp}_${safeFilename}`;

    // 4. Upload vers le bucket cotraitant_signed
    const fileBuffer = await file.arrayBuffer();
    const admin = createSupabaseAdminClient();
    const { error: storageError } = await admin.storage
      .from(SIGNED_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (storageError) {
      console.error("[cotraitant:upload:storage:fail]", storageError);
      return { ok: false, error: "storage_upload_failed" };
    }

    // 5. UPDATE atomique via SECURITY DEFINER function. Retourne true si
    //    1 row affectée. Refuse silencieusement (false) si :
    //      - share inactif (revoked/expired)
    //      - item étranger au share
    //      - item DEJA signé (anti re-signature)
    interface MarkResultRow extends Record<string, unknown> {
      mark_cotraitant_share_item_signed: boolean;
    }
    const markResult = await db.execute<MarkResultRow>(
      sql`SELECT public.mark_cotraitant_share_item_signed(
            ${token}::uuid,
            ${itemId}::uuid,
            ${storagePath},
            ${signerNameStr},
            ${file.name}
          )`,
    );
    const success = markResult[0]?.mark_cotraitant_share_item_signed === true;

    if (!success) {
      // Nettoyage best-effort : le fichier est déjà uploadé mais l'UPDATE
      // BDD a échoué → on tente de le supprimer pour ne pas laisser de
      // dépôt orphelin. On ne fait pas planter l'action si le delete échoue.
      try {
        await admin.storage.from(SIGNED_BUCKET).remove([storagePath]);
      } catch (cleanupErr) {
        console.error("[cotraitant:upload:cleanup:fail]", cleanupErr);
      }
      return { ok: false, error: "share_invalid" };
    }

    revalidatePath(`/cotraitant/${token}`);
    return { ok: true };
  } catch (err) {
    console.error("[cotraitant:upload:fail]", err);
    return { ok: false, error: "internal_error" };
  }
}
