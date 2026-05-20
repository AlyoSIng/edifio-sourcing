import Link from "next/link";

import { EdifioLogo } from "@/components/EdifioLogo";

export const metadata = {
  title: "Erreur d'authentification — edifio Sourcing",
};

/**
 * Page d'erreur d'authentification.
 *
 * Affichée quand Supabase Auth renvoie une erreur côté browser au lieu d'une
 * session valide. Cause la plus fréquente : un scanner email d'entreprise
 * (Microsoft Defender Safe Links, etc.) a pré-cliqué le lien recovery /
 * magic-link reçu → le token a été consommé avant que le user n'ait eu le
 * temps de cliquer.
 *
 * Sources d'arrivée :
 *   1. Fragment `#error=…` sur la home `/` (Supabase fallback Site URL en cas
 *      de token consumé) → intercepté par `HashErrorHandler` qui redirige ici
 *      avec les params en query string.
 *   2. Fragment `#error=…` sur `/auth/callback` → intercepté par
 *      `ClientCallbackHandler` qui redirige ici.
 *   3. Query string `?error=…` sur `/auth/callback` (cas server-side) →
 *      redirect direct vers ici par la page.
 *
 * Cf. ADR-011 (specs/adr_011_reset_password_scanner.md).
 */
export default function AuthErrorPage({
  searchParams,
}: {
  searchParams?: { code?: string; description?: string };
}) {
  const code = searchParams?.code ?? "unknown";
  const { title, message, actionLabel, actionHref } = describeError(code);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <EdifioLogo />
        </div>
        <h1 className="marketing-h1 mb-4 text-center">{title}</h1>
        <p
          data-testid="auth-error"
          role="alert"
          className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {message}
        </p>
        <div className="flex flex-col items-center gap-3">
          <Link
            href={actionHref}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            {actionLabel}
          </Link>
          <Link
            href="/login"
            className="text-xs text-neutral-600 underline-offset-4 hover:underline"
          >
            ← Retour à la connexion
          </Link>
        </div>
        <p className="mt-6 text-center text-xs text-neutral-500">
          <span className="font-mono text-[10px]">© AlyoS Ingénierie 2026 — Outil interne</span>
        </p>
      </div>
    </main>
  );
}

interface ErrorDescription {
  title: string;
  message: string;
  actionLabel: string;
  actionHref: string;
}

/**
 * Mapping code Supabase → libellé FR + CTA. Tout code inconnu tombe sur le
 * libellé générique pour ne jamais laisser un user sans guidance.
 */
function describeError(code: string): ErrorDescription {
  switch (code) {
    case "otp_expired":
    case "access_denied":
      return {
        title: "Lien expiré ou déjà utilisé",
        message:
          "Ton lien a déjà été utilisé ou a expiré. C'est souvent ta messagerie qui pré-charge le lien pour vérifier sa sécurité, ce qui consomme le token avant que tu n'aies eu le temps de cliquer. Demande simplement un nouveau lien — il restera valide pour ton premier clic.",
        actionLabel: "Demander un nouveau lien",
        actionHref: "/forgot-password",
      };
    case "server_error":
      return {
        title: "Erreur côté Supabase",
        message:
          "Une erreur technique côté serveur d'authentification est survenue. Réessaye dans quelques instants — si le problème persiste, contacte l'équipe IT AlyoS.",
        actionLabel: "Retour à la connexion",
        actionHref: "/login",
      };
    default:
      return {
        title: "Erreur d'authentification",
        message:
          "Une erreur est survenue pendant l'authentification. Réessaye depuis la page de connexion. Si le problème persiste, contacte l'équipe IT AlyoS.",
        actionLabel: "Retour à la connexion",
        actionHref: "/login",
      };
  }
}
