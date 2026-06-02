/**
 * Route de diagnostic temporaire — clés JWT architecte.
 * À SUPPRIMER une fois le bug identifié.
 *
 * GET /api/debug/jwt-keys
 * Requires: session superadmin (defense in depth + middleware).
 *
 * Retourne le format détecté de chaque variable et les premiers/derniers
 * caractères (jamais la clé entière) pour identifier les problèmes
 * d'encodage / de copier-coller.
 */

import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decodeKeyFromEnv } from "@/lib/tandem/jwt";

export const dynamic = "force-dynamic";

function describe(name: string, raw: string | undefined) {
  if (!raw) return { name, present: false };
  const trimmed = raw.trim();
  const looksLikePem = trimmed.startsWith("-----BEGIN");
  const looksLikeBase64Of_Pem = trimmed.startsWith("LS0tLS1");

  let decoded: string;
  try {
    decoded = decodeKeyFromEnv(raw);
  } catch (err) {
    return {
      name,
      present: true,
      length: raw.length,
      starts: trimmed.slice(0, 20),
      ends: trimmed.slice(-20),
      looksLikePem,
      looksLikeBase64Of_Pem,
      decodeError: err instanceof Error ? err.message : String(err),
    };
  }

  const decodedStarts = decoded.slice(0, 30);
  const decodedEnds = decoded.slice(-30);
  const decodedLineCount = decoded.split("\n").length;
  const hasBeginMarker = decoded.includes("-----BEGIN");
  const hasEndMarker = decoded.includes("-----END");

  // Test de chargement réel
  let cryptoTest: string;
  try {
    if (name.includes("PRIVATE")) {
      crypto.createPrivateKey(decoded);
      cryptoTest = "OK (private key valid)";
    } else {
      crypto.createPublicKey(decoded);
      cryptoTest = "OK (public key valid)";
    }
  } catch (err) {
    cryptoTest = `FAIL: ${err instanceof Error ? err.message : String(err)}`;
  }

  return {
    name,
    present: true,
    rawLength: raw.length,
    rawStarts: trimmed.slice(0, 20),
    rawEnds: trimmed.slice(-20),
    looksLikePem,
    looksLikeBase64Of_Pem,
    decodedLength: decoded.length,
    decodedStarts,
    decodedEnds,
    decodedLineCount,
    hasBeginMarker,
    hasEndMarker,
    cryptoTest,
  };
}

export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isSuperAdmin(toUserProfile(user))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    private: describe("ARCHITECT_JWT_PRIVATE_KEY", process.env.ARCHITECT_JWT_PRIVATE_KEY),
    public: describe("ARCHITECT_JWT_PUBLIC_KEY", process.env.ARCHITECT_JWT_PUBLIC_KEY),
  });
}
