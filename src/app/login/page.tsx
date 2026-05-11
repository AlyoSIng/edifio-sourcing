import Link from "next/link";

import { EdifioLogo } from "@/components/EdifioLogo";

export const metadata = {
  title: "Connexion — edifio Sourcing",
};

/**
 * Page de connexion — Maquette M7 (`design/maquettes/maquettes_v1_2_auth.html`).
 *
 * État étape 2 Gate 6 : **stub non fonctionnel**. Le formulaire est désactivé
 * et n'envoie pas de magic-link tant que l'étape 3 (branchement Supabase Auth)
 * n'est pas terminée. L'UI est en place pour valider le rendu visuel et le
 * routing du middleware (redirection `/login?next=...`).
 *
 * Le wire-up Supabase magic-link (Server Action + `signInWithOtp`) sera ajouté
 * en étape 3 dans une PR dédiée. Le composant côté client ne change pas — seul
 * le handler de soumission devient effectif.
 */
export default function Login() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
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

        <form className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium text-neutral-700">
              Email AlyoS
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="prenom.nom@alyosingenierie.fr"
              disabled
              className="rounded-md border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm placeholder-neutral-400 disabled:cursor-not-allowed"
            />
            <span className="text-xs text-neutral-500">
              Aucun mot de passe à retenir — un lien sécurisé est envoyé à chaque connexion.
            </span>
          </div>

          <button
            type="submit"
            disabled
            className="rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-400"
          >
            Recevoir mon lien de connexion
          </button>

          <p className="text-center text-xs text-amber-700">
            Branchement Supabase Auth à venir à l&apos;étape 3 — formulaire désactivé.
          </p>
        </form>

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
