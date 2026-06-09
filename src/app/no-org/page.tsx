import { EdifioLogo } from "@/components/EdifioLogo";
import { signOutAction } from "@/components/app-shell/actions";

export const metadata = {
  title: "Compte non rattaché — edifio Sourcing",
};

/**
 * Page « pas d'organisation » — sécurité multi-tenant (Lot 1.6-bis Hugo).
 *
 * Affichée quand un utilisateur authentifié atteint une route applicative
 * mais n'a aucune ligne `memberships` côté BDD. C'est la sortie propre du
 * `NoOrganizationMembershipError` levé par `getRequiredOrgId` — sans cette
 * page, le call-site aurait dû soit fallback (réintroduisant la fuite cross-
 * tenant CC-2), soit crasher 500.
 *
 * Cas d'usage typiques :
 *  - flow d'invitation où l'admin oublie l'insert membership (cas signalé
 *    par Hugo dans `/api/admin/users` L142-150 — hardfail désormais) ;
 *  - user externe créé manuellement côté Supabase Auth sans `memberships` ;
 *  - bascule multi-tenant PROTECT où un user d'org X arrive sur l'app sans
 *    enregistrement org Y.
 *
 * L'utilisateur ne voit rien de l'org AlyoS — pas de logo personnalisé, pas
 * de branding, pas de données. Il est invité à contacter l'éditeur pour
 * débloquer l'invitation.
 *
 * Style : même habillage que `src/app/forbidden/page.tsx` (paper-2 + white
 * + line + brand-red), cohérence visuelle des pages d'erreur d'accès.
 */
export default function NoOrgPage() {
  const year = new Date().getFullYear();
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper-2 px-4 py-12">
      <div className="w-full max-w-lg rounded-lg border border-line bg-white p-10 text-center shadow-card">
        <div className="mb-6 flex justify-center">
          <EdifioLogo />
        </div>

        <div className="mb-6 text-5xl" aria-hidden>
          🔑
        </div>

        <h1 className="marketing-h1 mb-4 text-ink">Compte non rattaché</h1>

        <p className="mb-4 text-ink-2">
          Votre compte n&apos;est pas encore rattaché à une organisation.
        </p>
        <p className="mb-8 text-ink-2">
          Contactez l&apos;administrateur de votre organisation ou l&apos;éditeur edifio à{" "}
          <a
            href="mailto:sebastien@edifio.fr"
            className="font-medium text-brand-red hover:underline"
          >
            sebastien@edifio.fr
          </a>{" "}
          pour finaliser votre invitation.
        </p>

        <div className="flex justify-center gap-3">
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-full border border-line bg-transparent px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-paper-2"
            >
              Se déconnecter
            </button>
          </form>
          <a
            href="mailto:sebastien@edifio.fr"
            className="rounded-full bg-brand-red px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-red-dark"
          >
            Contacter le support
          </a>
        </div>

        <p className="mt-8 text-xs text-muted">
          Cet incident a été tracé dans le journal d&apos;audit pour la sécurité du système.
          <br />
          <span className="font-mono text-[10px]">© edifio · AlyoS Ingénierie {year}</span>
        </p>
      </div>
    </main>
  );
}
