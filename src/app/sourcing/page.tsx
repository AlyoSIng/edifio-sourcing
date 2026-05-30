import { redirect } from "next/navigation";

/**
 * Page racine `/sourcing` — point d'entrée du PWA (`start_url` dans manifest.webmanifest).
 *
 * Redirige immédiatement vers `/sourcing/ao-du-jour`.
 * Le middleware interceptera la requête et renverra vers `/login` si l'utilisateur
 * n'est pas authentifié.
 */
export default function SourcingRootPage() {
  redirect("/sourcing/ao-du-jour");
}
