import { EdifioLogo } from "@/components/EdifioLogo";

import { UpdatePasswordForm } from "./UpdatePasswordForm";

export const metadata = {
  title: "Définir un nouveau mot de passe — edifio Sourcing",
};

/**
 * Page de définition d'un nouveau mot de passe — atterrissage du flow
 * « mot de passe oublié » Supabase, après que `RecoveryHashHandler` a
 * établi la session via `setSession({ access_token, refresh_token })`.
 *
 * Le user accède à cette page avec une session valide (cookies `sb-*`
 * posés), il peut donc appeler `supabase.auth.updateUser({ password })`
 * directement côté navigateur. Pas de Server Action ici — le token de
 * recovery est consommé côté client par setSession, et `updateUser`
 * a besoin de la session courante.
 *
 * Cf. INC-2026-05-18-02, pivot auth 2026-05-10 (CLAUDE.md §4).
 */
export default function UpdatePassword() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <EdifioLogo />
        </div>

        <h1 className="mb-2 text-center font-display text-2xl font-bold tracking-tight">
          Définir un nouveau mot de passe
        </h1>
        <p className="mb-6 text-center text-sm text-neutral-600">
          Choisis un mot de passe robuste — minimum 16 caractères, avec une majuscule, une
          minuscule, un chiffre et un caractère spécial. Les passphrases sont encouragées.
        </p>

        <UpdatePasswordForm />

        <p className="mt-6 text-center text-xs text-neutral-500">
          <span className="font-mono text-[10px]">© AlyoS Ingénierie 2026 — Outil interne</span>
        </p>
      </div>
    </main>
  );
}
