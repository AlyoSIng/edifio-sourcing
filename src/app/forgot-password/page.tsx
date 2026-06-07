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
 *
 * Habillage DS edifio (cf. M13bis `design/maquettes/maquettes_v2_password_auth.html`)
 * aligné avec `/login` : surfaces `paper-2` + `white` + `line` + shadow `card`.
 */
export default function ForgotPasswordPage() {
  const year = new Date().getFullYear();
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper-2 px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-line bg-white p-8 shadow-card">
        <div className="mb-6 flex justify-center">
          <EdifioLogo />
        </div>

        <h1 className="mb-2 text-center font-display text-2xl font-bold tracking-tight text-ink">
          Mot de passe oublié ?
        </h1>
        <p className="mb-6 text-center text-sm text-ink-2">
          Saisissez votre email — nous vous enverrons un nouveau mot de passe provisoire.
        </p>

        <ForgotPasswordForm />

        <p className="mt-6 text-center text-xs text-muted">
          <span className="font-mono text-[10px]">
            © edifio {year} · édité par AlyoS Ingénierie
          </span>
        </p>
      </div>
    </main>
  );
}
