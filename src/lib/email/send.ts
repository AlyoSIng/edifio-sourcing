/**
 * Façade d'envoi — assemble templates + transport Resend.
 *
 * On expose une fonction haut-niveau par cas d'usage métier
 * (`sendWelcomeProvisionalPassword`) plutôt que `sendEmail` brut. Bénéfices :
 *   - couplage faible : si on remplace Resend par Postmark / SES,
 *     un seul module à modifier ;
 *   - tests : on peut moquer cette façade via un override d'endpoint
 *     (cf. `RESEND_ENDPOINT_OVERRIDE` en test E2E).
 *
 * ADR-011 : depuis le pivot recovery → mot de passe provisoire, le flow
 * forgot-password réutilise le même template (variant `reset`). On a donc une
 * seule fonction `sendWelcomeProvisionalPassword` paramétrée par `variant`.
 * `sendWelcomeEmail` reste exporté comme alias rétrocompatible utilisé par les
 * routes admin (création / regénération de compte).
 */

import { sendEmail } from "./resend";
import {
  renderWelcomeProvisionalPassword,
  type WelcomeProps,
} from "./templates/welcome-provisional-password";

/**
 * Endpoint Resend overridable via env — utilisé par les tests E2E pour
 * router les appels vers un serveur de mock. Non utilisé en preview / prod.
 */
function getResendEndpoint(): string | undefined {
  return process.env.RESEND_ENDPOINT_OVERRIDE || undefined;
}

export async function sendWelcomeProvisionalPassword(
  args: { to: string } & WelcomeProps,
): Promise<void> {
  const { to, ...templateProps } = args;
  const { subject, html, text } = renderWelcomeProvisionalPassword(templateProps);
  await sendEmail({ to, subject, html, text, endpoint: getResendEndpoint() });
}

/**
 * Alias rétrocompatible — variant `welcome` par défaut. Conservé pour les
 * routes admin `POST /api/admin/users` et `POST /api/admin/users/[id]/regenerate-password`
 * qui s'en servent depuis le pivot Board 2026-05-11.
 */
export async function sendWelcomeEmail(args: { to: string } & WelcomeProps): Promise<void> {
  await sendWelcomeProvisionalPassword({ ...args, variant: args.variant ?? "welcome" });
}
