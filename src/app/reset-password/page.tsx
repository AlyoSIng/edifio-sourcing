import Link from "next/link";

import { EdifioLogo } from "@/components/EdifioLogo";
import { toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata = {
  title: "Définir mon mot de passe — edifio Sourcing",
};

/**
 * Page de définition / réinitialisation du mot de passe.
 *
 * **ADR-011 couche 3** : un seul flow d'arrivée valide — l'utilisateur est
 * déjà connecté via mot de passe provisoire (invitation admin ou regénération
 * forgot-password) et le middleware l'a force-redirigé ici parce que
 * `must_change_password === true`. Plus de PKCE (`?code`), plus de recovery
 * implicit (fragment `#access_token`).
 *
 * Cas non valide :
 *   - pas de session → message + lien forgot-password.
 */
export default async function ResetPasswordPage() {
  let hasSession = false;

  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      // On ne contraint pas `must_change_password === true` côté page parce
      // que le middleware l'a déjà fait : si le user est ici, c'est qu'il y
      // a été légitimement redirigé. Permet aussi à un user de re-changer
      // son password volontairement en venant directement sur la route.
      const _profile = toUserProfile(user);
      void _profile;
      hasSession = true;
    }
  } catch {
    // Defensive — pas de session, on tombera dans le cas « invalide » plus bas.
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <EdifioLogo />
        </div>

        <h1 className="mb-2 text-center font-display text-2xl font-bold tracking-tight">
          Définir mon mot de passe
        </h1>

        {hasSession ? (
          <>
            <p className="mb-6 text-center text-sm text-neutral-600">
              Choisis un mot de passe durable et conserve-le en lieu sûr.
            </p>
            <ResetPasswordForm />
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
        Session expirée. Recommence depuis « Mot de passe oublié » pour recevoir un nouveau mot de
        passe par email.
      </p>
      <Link
        href="/forgot-password"
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
      >
        Mot de passe oublié
      </Link>
      <Link href="/login" className="text-xs text-neutral-600 underline-offset-4 hover:underline">
        ← Retour à la connexion
      </Link>
    </div>
  );
}
