/**
 * Sélection de template Brevo selon le registre (TU/VOUS) et le type de
 * communication (sollicitation 1er envoi, relance, ack refus).
 *
 * Source de vérité :
 *  - `design/copy/email_sollicitation_architecte_v1.md` (1er envoi TU/VOUS)
 *  - `design/copy/templates_brevo_v1.md` (D.1 → D.4, D.8)
 *  - `specs/module_tandem_engine_v1.md` §3.3, §3.7
 *  - `.env.example` (5 IDs Brevo posés par Nadia étape 2 — cf. lignes 65-70)
 *
 * Le picker mappe :
 *   - `template='solicitation'` + `register='tu'`   → ID `..._SOLICITATION_TU`
 *   - `template='solicitation'` + `register='vous'` → ID `..._SOLICITATION_VOUS`
 *   - `template='followup'`     + `register='tu'`   → ID `..._FOLLOWUP_TU`
 *   - `template='followup'`     + `register='vous'` → ID `..._FOLLOWUP_VOUS`
 *   - `template='decline_ack'`  + (registre ignoré)→ ID `..._DECLINE_ACKNOWLEDGMENT`
 *
 * Override : la Server Action peut forcer le `register` (UI permet à
 * l'utilisateur de basculer TU↔VOUS avant l'envoi — cf. M-D2). Par défaut
 * le caller utilise `architects.tutoiement` pour pré-remplir.
 */

export type BrevoTemplateKind = "solicitation" | "followup" | "decline_ack";
export type BrevoRegister = "tu" | "vous";

/**
 * Mapping vers les noms de var d'env. Permet aux tests de surcharger les IDs
 * sans dépendre de l'env global.
 */
export const ENV_VAR_BY_TEMPLATE: Record<
  BrevoTemplateKind,
  Record<BrevoRegister, string> | { neutral: string }
> = {
  solicitation: {
    tu: "BREVO_TEMPLATE_ID_ARCHITECT_SOLICITATION_TU",
    vous: "BREVO_TEMPLATE_ID_ARCHITECT_SOLICITATION_VOUS",
  },
  followup: {
    tu: "BREVO_TEMPLATE_ID_ARCHITECT_FOLLOWUP_TU",
    vous: "BREVO_TEMPLATE_ID_ARCHITECT_FOLLOWUP_VOUS",
  },
  decline_ack: { neutral: "BREVO_TEMPLATE_ID_ARCHITECT_DECLINE_ACKNOWLEDGMENT" },
};

/**
 * Détermine le nom de template logique pour audit / logs / DB
 * (`brevo_messages.template_name`).
 *
 * Aligné conventions specs :
 *  - `architect_solicitation_TU`  / `_VOUS`
 *  - `architect_followup_TU`      / `_VOUS`
 *  - `architect_decline_acknowledgment`
 */
export function templateNameFor(kind: BrevoTemplateKind, register: BrevoRegister): string {
  if (kind === "decline_ack") return "architect_decline_acknowledgment";
  const suffix = register === "tu" ? "TU" : "VOUS";
  return kind === "solicitation"
    ? `architect_solicitation_${suffix}`
    : `architect_followup_${suffix}`;
}

/**
 * Renvoie l'ID Brevo (entier) pour un (kind, register).
 *
 * @throws `Error` si la var d'env n'est pas posée. L'admin a la responsabilité
 *   de coller les 5 IDs Brevo dans `.env.local` + Vercel (cf. `.env.example`).
 */
export function pickBrevoTemplateId(
  kind: BrevoTemplateKind,
  register: BrevoRegister,
  envSource: NodeJS.ProcessEnv = process.env,
): number {
  const map = ENV_VAR_BY_TEMPLATE[kind];
  const envVar = "neutral" in map ? map.neutral : map[register];
  const raw = envSource[envVar];
  if (!raw) {
    throw new Error(
      `Template Brevo non configuré : ${envVar} manquant dans l'env. ` +
        `Voir .env.example lignes 65-70.`,
    );
  }
  const id = parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`Template Brevo invalide : ${envVar}=${raw} n'est pas un entier positif`);
  }
  return id;
}

/**
 * Choisit le registre par défaut depuis le flag `architects.tutoiement`.
 * Override possible côté UI (M-D2 — toggle TU/VOUS).
 */
export function defaultRegisterFromTutoiement(tutoiement: boolean): BrevoRegister {
  return tutoiement ? "tu" : "vous";
}
