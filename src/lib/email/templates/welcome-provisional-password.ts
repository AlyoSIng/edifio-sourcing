/**
 * Template — Email avec mot de passe provisoire.
 *
 * Deux variants partageant le même corps (réutilisation totale du pipeline) :
 *
 *  - `welcome` (défaut) : envoyé par `POST /api/admin/users` quand l'admin
 *    crée un nouveau collaborateur AlyoS. Sujet « Bienvenue ».
 *  - `reset` : envoyé par la Server Action `requestPasswordResetAction`
 *    (forgot-password) — ADR-011 couche 3. On regénère un mot de passe
 *    provisoire au lieu d'envoyer un lien recovery tokenisé (consommé par
 *    le scanner email d'entreprise AlyoS). Sujet et intro adaptés.
 *
 * Cf. `design/copy/templates_brevo_v1.md` D.9 (provisoire) et ADR-011.
 */

import { PROVISIONAL_PASSWORD_TTL_HOURS } from "@/lib/auth/constants";

export type WelcomeVariant = "welcome" | "reset";

export interface WelcomeProps {
  email: string;
  firstName: string;
  provisionalPassword: string;
  /** ISO 8601. */
  expiresAt: string;
  /** URL absolue de la page /login. */
  loginUrl: string;
  /** Welcome (admin invite) ou reset (forgot-password). Défaut : welcome. */
  variant?: WelcomeVariant;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function formatExpiresAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function renderWelcomeProvisionalPassword(props: WelcomeProps): RenderedEmail {
  const { email, firstName, provisionalPassword, expiresAt, loginUrl } = props;
  const variant: WelcomeVariant = props.variant ?? "welcome";
  const greeting = firstName ? `Bonjour ${firstName},` : "Bonjour,";
  const expiry = formatExpiresAt(expiresAt);

  const subject =
    variant === "reset"
      ? "Votre nouveau mot de passe — edifio Sourcing"
      : "Bienvenue sur edifio Sourcing — votre accès AlyoS";

  // Intro contextualisée — le reste du body (table identifiants + CTA + TTL)
  // est strictement identique entre les deux variants pour garder le pipeline
  // unique côté Resend et l'UX cohérente avec le flow invitation.
  const introHtml =
    variant === "reset"
      ? `<p>
    Vous avez demandé la réinitialisation de votre mot de passe sur
    <strong>edifio Sourcing</strong>. Nous vous avons généré un nouveau mot de
    passe provisoire — votre ancien mot de passe ne fonctionne plus.
  </p>`
      : `<p>
    Votre compte vient d'être créé sur <strong>edifio Sourcing</strong>, l'outil interne
    AlyoS Ingénierie pour le sourcing automatique de marchés publics BTP.
  </p>`;

  const introText =
    variant === "reset"
      ? "Vous avez demandé la réinitialisation de votre mot de passe sur edifio Sourcing. Nous vous avons généré un nouveau mot de passe provisoire — votre ancien mot de passe ne fonctionne plus."
      : "Votre compte vient d'être créé sur edifio Sourcing.";

  const credentialsLabelHtml =
    variant === "reset"
      ? "<strong>Vos nouveaux identifiants :</strong>"
      : "<strong>Vos identifiants de première connexion :</strong>";

  const credentialsLabelText =
    variant === "reset" ? "Nouveaux identifiants :" : "Identifiants de première connexion :";

  const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width:560px; margin:0 auto; padding:24px; color:#0f1828;">
  <h1 style="font-size:20px; margin:0 0 16px;">edifio Sourcing</h1>
  <p>${greeting}</p>
  ${introHtml}
  <p>${credentialsLabelHtml}</p>
  <table style="border-collapse:collapse; margin:16px 0;">
    <tr><td style="padding:4px 12px 4px 0; color:#555;">Email&nbsp;:</td><td><code>${email}</code></td></tr>
    <tr><td style="padding:4px 12px 4px 0; color:#555;">Mot de passe provisoire&nbsp;:</td><td><code style="font-size:15px; background:#f3f1ec; padding:2px 6px; border-radius:4px;">${provisionalPassword}</code></td></tr>
  </table>
  <p>
    Ce mot de passe provisoire est valable ${PROVISIONAL_PASSWORD_TTL_HOURS} heures
    (jusqu'au <strong>${expiry}</strong>). À votre prochaine connexion, vous serez
    invité à choisir un mot de passe durable. Si vous tardez, demandez à un
    administrateur AlyoS de regénérer un nouveau lien.
  </p>
  <p style="margin:24px 0;">
    <a href="${loginUrl}" style="background:#0f1828; color:#fff; text-decoration:none; padding:10px 20px; border-radius:6px; display:inline-block;">
      Me connecter
    </a>
  </p>
  <p style="font-size:12px; color:#555;">
    Si vous n'attendiez pas ce message, contactez l'équipe IT AlyoS.
  </p>
  <hr style="border:none; border-top:1px solid #eee; margin:24px 0;">
  <p style="font-size:11px; color:#888;">
    © AlyoS Ingénierie — Outil interne edifio Sourcing
  </p>
</body>
</html>`;

  const text = `${greeting}

${introText}

${credentialsLabelText}
  Email : ${email}
  Mot de passe provisoire : ${provisionalPassword}

Ce mot de passe provisoire est valable ${PROVISIONAL_PASSWORD_TTL_HOURS} heures (jusqu'au ${expiry}).
À votre prochaine connexion, vous serez invité à choisir un mot de passe durable.
Si vous tardez, demandez à un administrateur AlyoS de regénérer un nouveau lien.

Me connecter : ${loginUrl}

Si vous n'attendiez pas ce message, contactez l'équipe IT AlyoS.

— AlyoS Ingénierie — edifio Sourcing
`;

  return { subject, html, text };
}
