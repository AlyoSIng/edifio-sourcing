/**
 * Template — Email de réinitialisation de mot de passe.
 *
 * Pivot Board 2026-05-11 — envoyé par la Server Action
 * `requestPasswordResetAction` (cf. `src/app/forgot-password/actions.ts`).
 *
 * Copy provisoire (placeholder) — Léa fournira le copy validé dans la matinée.
 */

export interface PasswordResetProps {
  /** Prénom optionnel — null si non disponible (on ne fetch pas le user
   *  pour le forgot-password pour préserver l'anti-énumération). */
  firstName: string | null;
  /** URL Supabase recovery (auth.admin.generateLink type='recovery'). */
  resetUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderPasswordReset(props: PasswordResetProps): RenderedEmail {
  const { firstName, resetUrl } = props;
  const greeting = firstName ? `Bonjour ${firstName},` : "Bonjour,";

  const subject = "Réinitialisation de votre mot de passe — edifio Sourcing";

  const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width:560px; margin:0 auto; padding:24px; color:#0f1828;">
  <h1 style="font-size:20px; margin:0 0 16px;">edifio Sourcing</h1>
  <p>${greeting}</p>
  <p>
    Vous avez demandé la réinitialisation de votre mot de passe sur
    <strong>edifio Sourcing</strong>. Cliquez sur le bouton ci-dessous pour
    en choisir un nouveau.
  </p>
  <p style="margin:24px 0;">
    <a href="${resetUrl}" style="background:#0f1828; color:#fff; text-decoration:none; padding:10px 20px; border-radius:6px; display:inline-block;">
      Réinitialiser mon mot de passe
    </a>
  </p>
  <p style="font-size:13px; color:#555;">
    Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce
    message — votre mot de passe actuel reste inchangé.
  </p>
  <p style="font-size:12px; color:#888;">
    Le lien expire après une durée limitée pour des raisons de sécurité. Si
    vous voyez s'afficher un message « lien expiré », refaites simplement
    une nouvelle demande depuis la page de connexion.
  </p>
  <hr style="border:none; border-top:1px solid #eee; margin:24px 0;">
  <p style="font-size:11px; color:#888;">
    © AlyoS Ingénierie — Outil interne edifio Sourcing
  </p>
</body>
</html>`;

  const text = `${greeting}

Vous avez demandé la réinitialisation de votre mot de passe sur edifio Sourcing.

Cliquez sur le lien suivant pour en choisir un nouveau :
${resetUrl}

Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message —
votre mot de passe actuel reste inchangé.

Le lien expire après une durée limitée pour des raisons de sécurité.

— AlyoS Ingénierie — edifio Sourcing
`;

  return { subject, html, text };
}
