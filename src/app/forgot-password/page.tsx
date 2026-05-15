import { EdifioLogo } from "@/components/EdifioLogo";

import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata = {
  title: "Mot de passe oublié — edifio Sourcing",
};

/**
 * Page « Mot de passe oublié » — délègue le formulaire au Client Component.
 *
 * Cette route est publique (cf. `lib/auth/routes.ts` — ajoutée à
 * `PUBLIC_ROUTES`) pour permettre la demande sans session.
 */
export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <EdifioLogo />
        </div>

        <h1 className="mb-2 text-center font-display text-2xl font-bold tracking-tight">
          Mot de passe oublié ?
        </h1>
        <p className="mb-6 text-center text-sm text-neutral-600">
          Saisissez votre email AlyoS — nous vous enverrons un nouveau mot de passe provisoire par
          email.
        </p>

        <ForgotPasswordForm />

        <p className="mt-6 text-center text-xs text-neutral-500">
          <span className="font-mono text-[10px]">© AlyoS Ingénierie 2026 — Outil interne</span>
        </p>
      </div>
    </main>
  );
}
