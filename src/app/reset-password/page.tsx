import Link from "next/link";

import { EdifioLogo } from "@/components/EdifioLogo";
import { mustChangePassword, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata = {
  title: "Définir mon mot de passe — edifio Sourcing",
};

/**
 * Page de définition / réinitialisation du mot de passe.
 *
 * Deux contextes :
 *   - `?code=...` ou `?token_hash=...` ou `?token=...` : flow recovery. Le
 *     code arrive depuis le lien Resend → Supabase. On le passe au form qui
 *     le renverra dans la Server Action.
 *   - pas de code mais user authentifié avec must_change_password=true :
 *     flow first-login. Pas de code, le form opère sur la session courante.
 *
 * Cas non valide :
 *   - pas de code ET pas de session valide → message + lien forgot-password.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: { code?: string; token?: string; token_hash?: string; error?: string };
}) {
  // Supabase peut renvoyer `code`, `token` ou `token_hash` selon la version
  // de l'auth helper utilisée — on prend le premier non vide.
  const code = searchParams?.code ?? searchParams?.token ?? searchParams?.token_hash;

  // Si pas de code, on vérifie qu'on a une session valide (flow first-login).
  let firstLoginEligible = false;
  if (!code) {
    try {
      const supabase = createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const profile = toUserProfile(user);
        if (mustChangePassword(profile)) {
          firstLoginEligible = true;
        }
      }
    } catch {
      // Defensive — pas de session, on tombera dans le cas « invalide » plus bas.
    }
  }

  const showForm = Boolean(code) || firstLoginEligible;
  const mode: "recovery" | "first_login" = code ? "recovery" : "first_login";

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <EdifioLogo />
        </div>

        <h1 className="mb-2 text-center font-display text-2xl font-bold tracking-tight">
          Définir mon mot de passe
        </h1>

        {showForm ? (
          <>
            <p className="mb-6 text-center text-sm text-neutral-600">
              Choisis un mot de passe durable et conserve-le en lieu sûr.
            </p>
            <ResetPasswordForm code={code} mode={mode} />
          </>
        ) : (
          <InvalidStateBlock />
        )}

        <p className="mt-6 text-center text-xs text-neutral-500">
          <span className="font-mono text-[10px]">© AlyoS Ingénierie 2026 — Outil interne</span>
        </p>
      </div>
    </main>
  );
}

function InvalidStateBlock() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p
        role="alert"
        className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
      >
        Lien invalide ou expiré. Refais une demande de réinitialisation.
      </p>
      <Link
        href="/forgot-password"
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
      >
        Demander un nouveau lien
      </Link>
      <Link href="/login" className="text-xs text-neutral-600 underline-offset-4 hover:underline">
        ← Retour à la connexion
      </Link>
    </div>
  );
}
