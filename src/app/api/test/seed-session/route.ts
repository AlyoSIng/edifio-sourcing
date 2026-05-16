import { NextResponse, type NextRequest } from "next/server";

import { isTestRouteEnabled } from "@/lib/auth/test-routes";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserMetadata } from "@/lib/auth/types";

/**
 * POST /api/test/seed-session — pose une session Supabase déterministe pour
 * les tests E2E Playwright (cf. brief Board 2026-05-16, option α).
 *
 * **Cette route N'EST PAS une feature applicative.** Elle existe uniquement
 * pour décoreller la chaîne « pose de session » de la chaîne « form login »
 * dans les tests middleware-domain.spec.ts / auth-password.spec.ts. Elle solde
 * le ticket backlog Phase 2 « refactor helper signInWith + ré-application
 * propagation cookies » (cf. DECISIONS.md 2026-05-15 § rollback propagation
 * cookies — `test.fixme` sur S3/C4/C7/C10/C12).
 *
 * Triple-gate sécurité (anti-énumération + anti-prod) — voir
 * `@/lib/auth/test-routes` pour la sémantique exacte. En résumé : dev OU
 * preview Vercel, ET opt-in explicite `E2E_TEST_ROUTES_ENABLED === "1"`.
 *
 * Si le triple-gate ne passe pas → **404**, pas 403. Anti-énumération : on
 * ne révèle pas l'existence d'une route de test à un attaquant qui balaie
 * l'API en prod.
 *
 * Restriction email : la route accepte uniquement les emails qui matchent
 * `^(e2e-test\+|alice|bob)[^@]*@` — préfixes maîtrisés. Un attaquant qui aurait
 * réussi à activer le triple-gate (ce qui suppose déjà un accès server) ne
 * peut pas créer un compte avec un email arbitraire.
 *
 * Body JSON accepté :
 *   - `{ email: string, password: string }` → user durable (`must_change_password:false`)
 *   - `{ email: string, out_of_domain: true }` → user temporaire jetable
 *     créé via `admin.createUser` puis signe la session via
 *     `signInWithPassword`. Permet de tester C4/C7/C10/C12 sans dépendre
 *     d'un user pré-existant côté Supabase.
 *
 * Log de sécurité : `console.warn("[security:test-route-invoked]", {...})`
 * à chaque invocation autorisée — **jamais le password en clair**.
 */

const TEST_EMAIL_PATTERN = /^(e2e-test\+|alice|bob)[^@]*@/i;
/** Mot de passe imposé pour les users out-of-domain temporaires (jamais en clair côté caller). */
const SEED_OUT_OF_DOMAIN_PASSWORD = "Seed-E2E-Out-Of-Domain-2026!";

interface SeedBody {
  email?: unknown;
  password?: unknown;
  out_of_domain?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ---------- Triple-gate (404 silencieux si KO) ----------
  if (!isTestRouteEnabled()) {
    return new NextResponse("Not Found", { status: 404 });
  }

  let body: SeedBody;
  try {
    body = (await req.json()) as SeedBody;
  } catch {
    return jsonError(400, "invalid_json");
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !TEST_EMAIL_PATTERN.test(email)) {
    return jsonError(400, "email_not_in_test_pattern");
  }

  console.warn("[security:test-route-invoked]", {
    email,
    ts: new Date().toISOString(),
  });

  try {
    if (body.out_of_domain === true) {
      await seedOutOfDomainUser(email);
      return await signInAndReturn(email, SEED_OUT_OF_DOMAIN_PASSWORD);
    }
    if (typeof body.password !== "string" || body.password.length === 0) {
      return jsonError(400, "missing_password");
    }
    // Chemin standard : user durable, sign-in immédiat. Le user est (re)créé
    // côté admin pour garantir un mot de passe connu — déterminisme E2E.
    await ensureDurableUser(email, body.password);
    return await signInAndReturn(email, body.password);
  } catch (err) {
    console.error("[security:test-route-error]", {
      email,
      message: err instanceof Error ? err.message : String(err),
    });
    return jsonError(500, "seed_failed");
  }
}

/**
 * Garantit qu'un user existe avec le password fourni et metadata standard
 * (role=user, must_change_password=false). Supprime + recrée s'il existait
 * déjà — c'est ce que faisait l'ancien helper E2E `ensureUserWithKnownPassword`.
 */
async function ensureDurableUser(email: string, password: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = (data?.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  if (found) {
    await admin.auth.admin.deleteUser(found.id);
  }
  const metadata: UserMetadata = {
    role: "user",
    must_change_password: false,
    provisional_password_expires_at: null,
    first_name: "E2E",
    last_name: "Seed",
  };
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata as Record<string, unknown>,
  });
  if (error) {
    throw new Error(`seed:createDurable(${email}): ${error.message}`);
  }
}

/**
 * Variante out-of-domain — même logique mais on impose le password de seed
 * connu pour pouvoir réutiliser `signInWithPassword` derrière. Supabase
 * `admin.createUser` accepte n'importe quel domaine (la garde
 * `@alyosingenierie.fr` est applicative, posée par le middleware).
 */
async function seedOutOfDomainUser(email: string): Promise<void> {
  await ensureDurableUser(email, SEED_OUT_OF_DOMAIN_PASSWORD);
}

/**
 * Signe la session Supabase côté serveur — `signInWithPassword` pose les
 * cookies `sb-*` sur la response courante via le client `createServerClient`
 * + `cookies()` du helper standard. Renvoie un `200 { ok:true }`. Les cookies
 * accompagnent la réponse, le browser Playwright les enregistre.
 */
async function signInAndReturn(email: string, password: string): Promise<NextResponse> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return jsonError(401, `sign_in_failed:${error.message}`);
  }
  return NextResponse.json({ ok: true, email }, { status: 200 });
}

function jsonError(status: number, code: string): NextResponse {
  return NextResponse.json({ ok: false, error: code }, { status });
}
