/**
 * Façade d'envoi — assemble templates + transport Resend.
 *
 * On expose une fonction haut-niveau par cas d'usage métier
 * (`sendWelcomeEmail`, `sendPasswordResetEmail`) plutôt que d'exposer
 * `sendEmail` brut aux Server Actions. Bénéfices :
 *   - couplage faible : si on remplace Resend par Postmark / SES,
 *     un seul module à modifier ;
 *   - tests : on peut moquer cette façade via un override d'endpoint
 *     (cf. `RESEND_ENDPOINT_OVERRIDE` en test E2E).
 */

import { sendEmail } from "./resend";
import { renderPasswordReset, type PasswordResetProps } from "./templates/password-reset";
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

export async function sendWelcomeEmail(args: { to: string } & WelcomeProps): Promise<void> {
  const { to, ...templateProps } = args;
  const { subject, html, text } = renderWelcomeProvisionalPassword(templateProps);
  await sendEmail({ to, subject, html, text, endpoint: getResendEndpoint() });
}

export async function sendPasswordResetEmail(
  args: { to: string } & PasswordResetProps,
): Promise<void> {
  const { to, ...templateProps } = args;
  const { subject, html, text } = renderPasswordReset(templateProps);
  await sendEmail({ to, subject, html, text, endpoint: getResendEndpoint() });
}
