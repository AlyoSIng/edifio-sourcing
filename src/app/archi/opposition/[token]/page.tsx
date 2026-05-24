/**
 * Page tokenisée publique opposition RGPD — `/archi/opposition/[token]`.
 *
 * Source de vérité :
 *  - `specs/architects_data_and_admin_v1.md` §5
 *  - `specs/module_tandem_engine_v1.md` §3 (lien opposition dans chaque mail)
 *  - Brief Board 2026-05-24 (sous-étape 4 : JWT séparé `aud=opposition`)
 *
 * Server Component public — middleware Supabase contourné via
 * `PUBLIC_ARCHITECT_PREFIX`. Auth = JWT `aud=opposition` (audience strict).
 *
 * Comportement :
 *   - GET → affiche la confirmation « Voulez-vous exercer votre opposition ? »
 *     + bouton « Oui, me désinscrire » (Form action → Server Action).
 *   - POST via Server Action → exécute `opposeArchitect(token)` + redirige
 *     vers la même page avec `?done=1`.
 *   - Token invalide / expiré / déjà utilisé → page d'erreur générique.
 *
 * Résilience runtime (memory `feedback_nextjs_runtime_page_resilience`) :
 *   try/catch absorbé autour de `opposeArchitect` (qui fait `db.update`).
 *
 * **Pas de leak** : un attaquant qui découvre un token-like ne doit pas
 * pouvoir distinguer « token inconnu » de « token déjà utilisé ». Le rendu
 * est identique dans les deux cas (TokenInvalidPage neutre).
 */

import { ErrorBanner } from "@/app/sourcing/ao-du-jour/ErrorBanner";

import { TokenInvalidPage } from "../../[token]/TokenInvalidPage";
import { OppositionForm } from "./OppositionForm";
import { opposeArchitect } from "./actions";
import { verifyOppositionToken } from "@/lib/tandem/opposition-jwt";
import { architectOppositionTokens } from "@/db/schema/selections";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // crypto natif RS256

export const metadata = {
  title: "Droit d'opposition — edifio Sourcing",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: { token: string };
  searchParams: { done?: string };
}

export default async function OppositionPage({ params, searchParams }: PageProps) {
  // 1. Si `?done=1` (post-opposition), affiche la confirmation.
  if (searchParams.done === "1") {
    return <OppositionDonePage />;
  }

  // 2. Verify JWT pré-affichage (validation passive, pas de mutation).
  //    On veut afficher la page d'opposition uniquement si le token est valide.
  let verifyOk = false;
  let fetchError: string | null = null;
  try {
    const verifyResult = await verifyOppositionToken(params.token, async (jti) => {
      try {
        const rows = await db
          .select({ usedAt: architectOppositionTokens.usedAt })
          .from(architectOppositionTokens)
          .where(eq(architectOppositionTokens.jti, jti))
          .limit(1);
        if (!rows[0]) return "unknown";
        if (rows[0].usedAt !== null) return "already_used";
        return "valid";
      } catch {
        return "unknown";
      }
    });
    verifyOk = verifyResult.ok;
  } catch (err) {
    console.error("[opposition-page:verify_fail]", err);
    fetchError = err instanceof Error ? err.message : String(err);
  }

  if (fetchError) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <ErrorBanner message={fetchError} />
      </main>
    );
  }
  if (!verifyOk) {
    return <TokenInvalidPage />;
  }

  // 3. Server Action lié au bouton de confirmation. On la définit inline ici
  //    pour qu'elle close sur `params.token` côté serveur (le client ne voit
  //    JAMAIS le token JWT — il fait juste un POST form vers la SA).
  async function executeOpposition() {
    "use server";
    const result = await opposeArchitect(params.token);
    if (!result.ok) {
      // L'archi voit la page d'erreur générique au retour (next() redirige
      // vers la même URL — la verify rejouera et echouera).
      return { ok: false };
    }
    return { ok: true };
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <article className="rounded-md border border-line bg-white p-6">
        <header>
          <span className="pill-eyebrow">RGPD — Droit d&rsquo;opposition</span>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
            Vous souhaitez ne plus recevoir nos sollicitations ?
          </h1>
        </header>
        <p className="mt-4 text-sm text-ink-2">
          En cliquant sur le bouton ci-dessous, vous exercez votre droit d&rsquo;opposition
          conformément à l&rsquo;article 21 du Règlement Général sur la Protection des Données
          (RGPD). Votre fiche sera désactivée dans notre base&nbsp;: vous ne recevrez plus de mails
          de sollicitation pour des appels d&rsquo;offres publics.
        </p>
        <p className="mt-3 text-sm text-ink-2">
          Cette action est <strong>définitive</strong> côté outil&nbsp;: pour réactiver votre fiche,
          contactez l&rsquo;équipe AlyoS Ingénierie.
        </p>
        <div className="mt-6">
          <OppositionForm action={executeOpposition} />
        </div>
      </article>
      <footer className="mt-10 border-t border-line pt-4 text-center text-xs text-muted">
        edifio Sourcing — AlyoS Ingénierie. Contact RGPD&nbsp;: dpo@alyosingenierie.fr
      </footer>
    </main>
  );
}

function OppositionDonePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <article
        className="rounded-md border border-l-4 border-line border-l-success bg-success-bg p-6"
        role="status"
      >
        <h1 className="font-display text-xl font-semibold text-success">
          Votre opposition est enregistrée
        </h1>
        <p className="mt-3 text-sm text-ink-2">
          Votre fiche est désactivée. Vous ne recevrez plus de mails de sollicitation de notre part.
          Pour toute question relative au traitement de vos données, contactez&nbsp;:
          dpo@alyosingenierie.fr.
        </p>
      </article>
    </main>
  );
}
