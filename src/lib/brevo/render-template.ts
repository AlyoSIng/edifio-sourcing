/**
 * Mini moteur de template Mustache côté Node.js — pour pré-rendre les
 * subject + body Brevo avant envoi.
 *
 * Pourquoi : le moteur de template Brevo a des limitations (pas de blocs
 * conditionnels `{{#X}}{{/X}}`, pas de triple-accolade `{{{X}}}`). Pour
 * éviter ces frictions, on rend tout côté Node.js et on envoie à Brevo du
 * HTML / texte déjà résolu, sans aucune variable.
 *
 * Syntaxes supportées :
 *   {{ params.X }}    — substitution simple (HTML brut conservé)
 *   {{{ params.X }}}  — idem (compatibilité Mustache triple-accolade)
 *   {{ X }}           — fallback sans préfixe `params.`
 *
 * Pas d'échappement HTML : les variables sont produites côté code (pas
 * d'input utilisateur arbitraire) et peuvent contenir du HTML de confiance
 * (rgpd_block, presentation_societe, bloc_annonce_officielle).
 */

export type RenderableParams = Record<string, string | number | boolean | null | undefined>;

/**
 * Substitue les variables Mustache dans un template, en renvoyant la chaîne
 * résolue. Les variables non trouvées sont remplacées par "".
 *
 * Ordre des remplacements :
 *  1. `{{{ params.X }}}` — triple-accolade prioritaire (évite que le 2.
 *     mange les `}}` du milieu).
 *  2. `{{ params.X }}` — double-accolade avec préfixe `params.`.
 *  3. `{{ X }}` — fallback historique (variables sans préfixe).
 */
export function renderMustache(template: string, params: RenderableParams): string {
  if (!template) return "";

  const lookup = (key: string): string => {
    const v = params[key];
    if (v === null || v === undefined) return "";
    return String(v);
  };

  // 1. Triple-accolade `{{{ params.X }}}` ou `{{{ X }}}`
  let out = template.replace(/\{\{\{\s*(?:params\.)?(\w+)\s*\}\}\}/g, (_m, key: string) =>
    lookup(key),
  );

  // 2. Double-accolade `{{ params.X }}`
  out = out.replace(/\{\{\s*params\.(\w+)\s*\}\}/g, (_m, key: string) => lookup(key));

  // 3. Fallback `{{ X }}` (sans préfixe)
  out = out.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => lookup(key));

  return out;
}
