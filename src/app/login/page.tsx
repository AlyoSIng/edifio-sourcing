import Link from "next/link";

import { RecoveryHashHandler } from "@/components/auth/RecoveryHashHandler";
import { EdifioLogo } from "@/components/EdifioLogo";

import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Connexion — edifio Sourcing",
};

/**
 * Page de connexion — conforme M7 (`design/maquettes/maquettes_v1_2_auth.html`).
 *
 * Server Component qui :
 * - lit le paramètre `?error=...` posé par le callback handler en cas d'échec
 *   d'échange de code (magic-link expiré, invalid, déjà consommé) ;
 * - délègue le formulaire au Client Component `<LoginForm />` qui consomme la
 *   Server Action `signInWithOtpAction` (cf. `./actions.ts`).
 *
 * Le paramètre `?next=` reste en query string et est lu par la Server Action
 * pour le `emailRedirectTo` (transmis ensuite au handler de callback).
 */
export default function Login({ searchParams }: { searchParams?: { error?: string } }) {
  const callbackError = searchParams?.error === "magic_link_invalid";

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      {/*
       * Embed `RecoveryHashHandler` ici aussi : Supabase Site URL peut être
       * pointée sur `/login` selon la config Vercel, ou un user déjà connecté
       * peut être redirigé sur cette page avec un fragment recovery résiduel.
       * Cf. INC-2026-05-18-02.
       */}
      <RecoveryHashHandler />
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <EdifioLogo />
        </div>

        <div className="mb-6 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center text-xs text-neutral-600">
          🔒 Outil interne AlyoS Ingénierie. Accès réservé aux emails{" "}
          <code className="font-mono">@alyosingenierie.fr</code>.
        </div>

        <h1 className="mb-2 text-center font-display text-2xl font-bold tracking-tight">
          Connectez-vous
        </h1>
        <p className="mb-6 text-center text-sm text-neutral-600">
          Saisissez votre email AlyoS — vous recevrez un lien de connexion.
        </p>

        {callbackError ? (
          <p
            role="alert"
            className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            Le lien magic-link est expiré ou a déjà été utilisé. Demande un nouveau lien ci-dessous.
          </p>
        ) : null}

        <LoginForm />

        <p className="mt-6 text-center text-xs text-neutral-500">
          <Link href="/about" className="underline-offset-4 hover:underline">
            À propos d&apos;edifio Sourcing
          </Link>
          <br />
          <span className="font-mono text-[10px]">© AlyoS Ingénierie 2026 — Outil interne</span>
        </p>
      </div>
    </main>
  );
}
