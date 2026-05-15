import Link from "next/link";

import { EdifioLogo } from "@/components/EdifioLogo";

import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Connexion — edifio Sourcing",
};

/**
 * Page de connexion — conforme M7 (`design/maquettes/maquettes_v1_2_auth.html`).
 *
 * Server Component qui :
 * - lit `?error=...` (erreurs callback historiques ou nouvelles) ;
 * - lit `?notice=password_updated` pour afficher un message neutre après
 *   reset de mot de passe ;
 * - lit `?next=...` pour propager la destination au formulaire.
 *
 * Pivot Board 2026-05-11 : le formulaire utilise email + password (cf.
 * `signInWithPasswordAction` dans `./actions.ts`).
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <EdifioLogo />
        </div>

        <div className="mb-6 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center text-xs text-neutral-600">
          Outil interne AlyoS Ingénierie. Accès réservé aux emails{" "}
          <code className="font-mono">@alyosingenierie.fr</code>.
        </div>

        <h1 className="marketing-h1 mb-2 text-center">Connectez-vous</h1>
        <p className="mb-6 text-center text-sm text-neutral-600">
          Saisissez votre email AlyoS et votre mot de passe.
        </p>

        {noticeMessage ? (
          <p
            role="status"
            className="mb-4 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900"
          >
            {noticeMessage}
          </p>
        ) : null}

        {errorMessage ? (
          <p
            role="alert"
            className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            {errorMessage}
          </p>
        ) : null}

        <LoginForm next={next} />

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
