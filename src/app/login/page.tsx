import Link from "next/link";

import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Connexion — edifio Sourcing",
};

/**
 * Page de connexion — refonte UI v1 alignée DS edifio.
 *
 * Source de vérité : `design/maquettes/maquettes_v1_2_auth.html` (M7).
 * Pas d'AppShell (page publique hors middleware) — fond `--paper-2`, carte
 * centrée fond `white` shadow doux, logo edifio en haut.
 *
 * Server Component qui :
 * - lit `?error=...` (erreurs callback historiques ou nouvelles)
 * - lit `?notice=password_updated` pour afficher un message neutre après
 *   reset de mot de passe
 * - lit `?next=...` pour propager la destination au formulaire
 *
 * Pivot Board 2026-05-11 : email + password (cf. `signInWithPasswordAction`).
 */
export default function Login({
  searchParams,
}: {
  searchParams?: { error?: string; notice?: string; next?: string };
}) {
  const errorParam = searchParams?.error;
  const noticeParam = searchParams?.notice;
  const next = searchParams?.next;

  const errorMessage = mapErrorToMessage(errorParam);
  const noticeMessage = mapNoticeToMessage(noticeParam);
  const year = new Date().getFullYear();

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper-2 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo + carte centrée */}
        <div className="rounded-lg border border-line bg-white p-8 shadow-card">
          <div className="mb-6 flex flex-col items-center gap-3">
            <span
              className="grid h-12 w-12 place-items-center rounded-full bg-brand-red shadow-logo"
              aria-hidden
            >
              <svg viewBox="0 0 20 24" fill="none" className="h-7 w-6">
                <path
                  d="M 10 0 C 16 0 20 4 20 10 C 20 17 10 24 10 24 C 10 24 0 17 0 10 C 0 4 4 0 10 0 Z"
                  fill="white"
                />
                <circle cx="10" cy="10" r="4" fill="#ff0033" />
              </svg>
            </span>
            <div className="text-center">
              <p className="font-display text-2xl font-bold tracking-tight text-ink">
                edifio <span className="font-medium text-muted">Sourcing</span>
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[1px] text-muted">
                Outil interne AlyoS Ingénierie
              </p>
            </div>
          </div>

          <div className="mb-5 rounded-sm bg-paper-2 px-3 py-2 text-center text-xs text-muted">
            Accès réservé aux emails <code className="font-mono text-ink">@alyosingenierie.fr</code>
            .
          </div>

          <h1 className="mb-1 text-center font-display text-xl font-semibold text-ink">
            Connectez-vous
          </h1>
          <p className="mb-6 text-center text-sm text-muted">
            Saisissez votre email AlyoS et votre mot de passe.
          </p>

          {noticeMessage ? (
            <p
              role="status"
              className="mb-4 rounded-sm border-l-4 border-success bg-success-bg px-3 py-2 text-sm text-success"
            >
              {noticeMessage}
            </p>
          ) : null}

          {errorMessage ? (
            <p
              role="alert"
              className="mb-4 rounded-sm border-l-4 border-warn bg-warn-bg px-3 py-2 text-sm text-warn"
            >
              {errorMessage}
            </p>
          ) : null}

          <LoginForm next={next} />

          <p className="mt-6 text-center text-xs text-muted">
            <Link href="/about" className="underline-offset-4 hover:underline">
              À propos d&apos;edifio Sourcing
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center font-mono text-[10px] text-muted">
          © AlyoS Ingénierie {year} — Outil interne
        </p>
      </div>
    </main>
  );
}

/**
 * Mappe une valeur `?error=...` vers un message FR utilisateur.
 * Liste blanche stricte pour éviter d'afficher un message arbitraire injecté
 * par un attaquant.
 */
function mapErrorToMessage(code: string | undefined): string | null {
  switch (code) {
    case "magic_link_invalid":
      // Historique — peut encore arriver si un vieux lien traîne. Inoffensif.
      return "Le lien est expiré ou a déjà été utilisé. Connectez-vous à nouveau ci-dessous.";
    case "recovery_invalid":
      return "Le lien de réinitialisation est invalide ou a expiré. Refaites une demande.";
    case "forbidden":
      return "Vous n'avez pas accès à cette section. Contactez un administrateur AlyoS.";
    case "provisional_expired":
      return "Votre mot de passe provisoire a expiré. Demande à un administrateur AlyoS un nouveau lien d'accès.";
    default:
      return null;
  }
}

function mapNoticeToMessage(code: string | undefined): string | null {
  switch (code) {
    case "password_updated":
      return "Mot de passe mis à jour. Connectez-vous avec votre nouveau mot de passe.";
    default:
      return null;
  }
}
