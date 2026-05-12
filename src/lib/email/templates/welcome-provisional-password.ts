/**
 * Template — Email de bienvenue avec mot de passe provisoire.
 *
 * Pivot Board 2026-05-11 — envoyé par `POST /api/admin/users` quand l'admin
 * crée un nouveau collaborateur AlyoS.
 *
 * Copy provisoire (placeholder) — Léa fournira le copy validé dans la matinée.
 * Quand Léa livre, remplacer le contenu de `renderHtml` / `renderText` sans
 * toucher à la shape des `Props`.
 */

import { PROVISIONAL_PASSWORD_TTL_HOURS } from "@/lib/auth/constants";

export interface WelcomeProps {
  email: string;
  firstName: string;
  provisionalPassword: string;
  /** ISO 8601. */
  expiresAt: string;
  /** URL absolue de la page /login. */
  loginUrl: string;
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
  const greeting = firstName ? `Bonjour ${firstName},` : "Bonjour,";
  const expiry = formatExpiresAt(expiresAt);

  const subject = "Bienvenue sur edifio Sourcing — votre accès AlyoS";

  const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width:560px; margin:0 auto; padding:24px; color:#0f1828;">
  <h1 style="font-size:20px; margin:0 0 16px;">edifio Sourcing</h1>
  <p>${greeting}</p>
  <p>
    Votre compte vient d'être créé sur <strong>edifio Sourcing</strong>, l'outil interne
    AlyoS Ingénierie pour le sourcing automatique de marchés publics BTP.
  </p>
  <p><strong>Vos identifiants de première connexion :</strong></p>
  <table style="border-collapse:collapse; margin:16px 0;">
    <tr><td style="padding:4px 12px 4px 0; color:#555;">Email&nbsp;:</td><td><code>${email}</code></td></tr>
    <tr><td style="padding:4px 12px 4px 0; color:#555;">Mot de passe provisoire&nbsp;:</td><td><code style="font-size:15px; background:#f3f1ec; padding:2px 6px; border-radius:4px;">${provisionalPassword}</code></td></tr>
  </table>
  <p>
    Ce mot de passe provisoire est valable ${PROVISIONAL_PASSWORD_TTL_HOURS} heures
    (jusqu'au <strong>${expiry}</strong>). À votre première connexion, vous serez
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

Votre compte vient d'être créé sur edifio Sourcing.

Identifiants de première connexion :
  Email : ${email}
  Mot de passe provisoire : ${provisionalPassword}

Ce mot de passe provisoire est valable ${PROVISIONAL_PASSWORD_TTL_HOURS} heures (jusqu'au ${expiry}).
À votre première connexion, vous serez invité à choisir un mot de passe durable.
Si vous tardez, demandez à un administrateur AlyoS de regénérer un nouveau lien.

Me connecter : ${loginUrl}

Si vous n'attendiez pas ce message, contactez l'équipe IT AlyoS.

— AlyoS Ingénierie — edifio Sourcing
`;

  return { subject, html, text };
}
