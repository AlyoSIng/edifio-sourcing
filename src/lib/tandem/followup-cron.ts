/**
 * Cron J+3 — relance des architectes sans réponse 3 jours après envoi initial.
 *
 * Source de vérité :
 *  - `specs/module_tandem_engine_v1.md` §3.7 (relance automatique J+3)
 *  - `design/copy/templates_brevo_v1.md` D.3 (relance TU) / D.4 (relance VOUS)
 *  - `DECISIONS.md` 2026-05-22 (c) — colonne `followup_sent_at` posée à
 *    l'étape 1 Tandem.
 *  - Brief Board 2026-05-25 sous-étape 5 — Vercel cron retenu (plus simple
 *    à tester E2E que pg_cron, pas de migration BDD).
 *
 * Fonctionnement :
 *  1. SELECT `architect_responses` WHERE status='pending' AND followup_sent_at
 *     IS NULL AND responded_at IS NULL — JOIN `architect_tokens` ON tokenId
 *     pour récupérer la date d'envoi (`architect_tokens.createdAt`).
 *  2. Filtrer côté code : `tokenCreatedAt <= now() - 3 jours` (on évite un
 *     calcul SQL d'INTERVAL pour rester portable + testable).
 *  3. Pour chaque : envoyer le template `architect_followup_TU|VOUS` via
 *     Brevo, UPDATE `followup_sent_at = now()`.
 *  4. Idempotence : `followup_sent_at` SET AT NULL après update — si le cron
 *     tourne 2× le même jour, la 2e tournée ne retrouve plus la ligne.
 *  5. Le cron est best-effort : si une relance échoue (Brevo down), on log
 *     l'erreur et on continue les autres. La ligne reste éligible au prochain
 *     run (followup_sent_at toujours NULL).
 *
 * Borne supérieure : max **1** relance (cf. spec §3.7 « Max 1 relance »).
 *
 * Module pur — pas d'I/O direct ici, tout est injecté via `deps` pour rester
 * testable sans Brevo réel.
 */

import { and, eq, isNull } from "drizzle-orm";

import type { db as defaultDb } from "@/db/client";
import { architects } from "@/db/schema/architects";
import {
  architectOppositionTokens,
  architectResponses,
  architectTokens,
} from "@/db/schema/selections";
import { brevoMessages } from "@/db/schema/integrations";
import { organizationProfiles } from "@/db/schema/messaging";
import { organizations } from "@/db/schema/organizations";
import { tenders } from "@/db/schema/tenders";
import type { BrevoClient } from "@/lib/brevo/client";
import { withTenantContext } from "@/lib/db/with-tenant-context";
import {
  defaultRegisterFromTutoiement,
  pickBrevoTemplateId,
  templateNameFor,
} from "@/lib/brevo/template-picker";
import { buildBrevoVariables } from "@/lib/brevo/variables";
// Phase A multi-tenant (2026-06-02) : on charge la liste des organisations
// présentes en BDD et on regroupe les profils société par `organizationId`
// avant la boucle d'envoi. Suppression de la dépendance à `ALYOS_ORG_ID`
// hardcodé — chaque relance utilise désormais `item.organizationId` (issu
// de `architect_responses.organization_id`).
import { extractDepartment } from "@/lib/tandem/matching";
import { signOppositionToken } from "@/lib/tandem/opposition-jwt";
import { getSiteUrl } from "@/lib/site-url";

type DrizzleClient = typeof defaultDb;

export interface RunFollowupDeps {
  db: DrizzleClient;
  brevoClient: BrevoClient;
  /** Surchargeable pour les tests — défaut = `new Date()`. */
  now?: () => Date;
  /** Limite de relances à traiter en un run (protection cron). */
  maxBatch?: number;
}

export interface FollowupRunResult {
  /** Nombre total de candidats trouvés (avant filtre `>= 3 jours`). */
  totalCandidates: number;
  /** Nombre de candidats éligibles après filtre J+3. */
  eligibleCount: number;
  /** Nombre de relances effectivement envoyées (Brevo OK). */
  sentCount: number;
  /** Nombre d'échecs (Brevo KO ou erreur applicative). */
  failedCount: number;
  /** Liste des architectIds relancés avec succès. */
  sentArchitectIds: string[];
  /** Détail des échecs (architectId + cause). */
  failures: Array<{ tenderId: string; architectId: string; reason: string }>;
  durationMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_BATCH = 100;
const FOLLOWUP_THRESHOLD_MS = 3 * DAY_MS;

/**
 * Lance la passe de relance J+3.
 *
 * Comportement attendu :
 *  - Ne touche QUE les `architect_responses.status = 'pending'`
 *  - Skippe ceux dont `followup_sent_at IS NOT NULL` (idempotence)
 *  - Skippe ceux dont `responded_at IS NOT NULL` (l'archi a répondu entre temps)
 *  - Skippe ceux dont le token (`architect_tokens.createdAt`) date de moins
 *    de 3 jours
 *  - Skippe ceux dont l'architecte n'est plus solicitable (opposé RGPD,
 *    désactivé, ou sans email)
 *
 * @returns un summary structuré (compteurs + détails) — pour logs Vercel.
 */
export async function runTandemFollowups(deps: RunFollowupDeps): Promise<FollowupRunResult> {
  const { db, brevoClient } = deps;
  const now = deps.now ? deps.now() : new Date();
  const maxBatch = deps.maxBatch ?? DEFAULT_MAX_BATCH;
  const startedAt = Date.now();

  // 1. Charger les candidats — JOIN architect_tokens pour récupérer la date
  //    d'envoi initial. Filtre côté SQL sur `status='pending'`,
  //    `followup_sent_at IS NULL`, `responded_at IS NULL`.
  const candidates = await db
    .select({
      responseId: architectResponses.id,
      tenderId: architectResponses.tenderId,
      organizationId: architectResponses.organizationId,
      architectId: architectResponses.architectId,
      tokenCreatedAt: architectTokens.createdAt,
      // Architect + tender snapshots pour construire le mail Brevo.
      architect: {
        id: architects.id,
        cabinet: architects.cabinet,
        contactName: architects.contactName,
        tutoiement: architects.tutoiement,
        email: architects.email,
        active: architects.active,
        solicitable: architects.solicitable,
      },
      tender: {
        id: tenders.id,
        title: tenders.title,
        buyer: tenders.buyer,
        deadline: tenders.deadline,
        rawData: tenders.rawData,
        sourceUrl: tenders.sourceUrl,
      },
    })
    .from(architectResponses)
    .innerJoin(architectTokens, eq(architectTokens.id, architectResponses.tokenId))
    .innerJoin(architects, eq(architects.id, architectResponses.architectId))
    .innerJoin(tenders, eq(tenders.id, architectResponses.tenderId))
    .where(
      and(
        eq(architectResponses.status, "pending"),
        isNull(architectResponses.followupSentAt),
        isNull(architectResponses.respondedAt),
      ),
    )
    .limit(maxBatch);

  const totalCandidates = candidates.length;

  // 2. Filtrer côté code : tokenCreatedAt <= now - 3j
  const eligible = candidates.filter((c) => {
    if (!c.tokenCreatedAt) return false;
    const age = now.getTime() - c.tokenCreatedAt.getTime();
    return age >= FOLLOWUP_THRESHOLD_MS;
  });

  // Phase A multi-tenant : on charge le profil société de CHAQUE organisation
  // référencée par au moins un éligible. Évite N+1 (1 query par org au lieu
  // de 1 par item) tout en restant correct multi-tenant.
  //
  // Pourquoi pas un IN(...) global ? `withTenantContext` pose
  // `app.current_organization_id` à chaque appel — la valeur doit être unique
  // par requête pour que la policy RLS FORCE soit correcte. On itère donc
  // une fois par organisation distincte.
  //
  // Fallback : si un profil est absent ou si la lecture échoue (RLS, BDD
  // indisponible), on continue avec `undefined` côté variables Brevo —
  // `buildBrevoVariables` gère ce cas (valeurs par défaut).
  type OrgProfile = { presentationSociete?: string; nomCommercial?: string };
  const orgProfiles = new Map<string, OrgProfile>();

  const distinctOrgIds = Array.from(new Set(eligible.map((c) => c.organizationId)));

  // Sanity-check multi-tenant : on vérifie que chaque organizationId rencontré
  // existe bien dans la table `organizations`. Une ligne orpheline (org
  // supprimée hors workflow normal) génère un warn structuré mais on n'arrête
  // pas le run — l'INSERT brevo_messages remontera une violation FK si besoin.
  // Évite aussi qu'une faute de schéma silencieuse passe inaperçue en prod.
  if (distinctOrgIds.length > 0) {
    try {
      const knownOrgs = await db.select({ id: organizations.id }).from(organizations);
      const knownOrgIds = new Set(knownOrgs.map((o) => o.id));
      for (const orgId of distinctOrgIds) {
        if (!knownOrgIds.has(orgId)) {
          console.warn("[tandem-followup:unknown_org]", { organizationId: orgId });
        }
      }
    } catch {
      // Best-effort — sanity-check non bloquant.
    }
  }

  // Charge le profil de chaque org (1 query par org, contexte RLS posé).
  for (const orgId of distinctOrgIds) {
    try {
      const orgRows = await withTenantContext(orgId, db, (client) =>
        client
          .select({
            presentationBlock: organizationProfiles.presentationBlock,
            commercialName: organizationProfiles.commercialName,
          })
          .from(organizationProfiles)
          .where(eq(organizationProfiles.organizationId, orgId))
          .limit(1),
      );
      const profile: OrgProfile = {};
      const block = orgRows[0]?.presentationBlock;
      if (block) profile.presentationSociete = block;
      const cname = orgRows[0]?.commercialName;
      if (cname) profile.nomCommercial = cname;
      orgProfiles.set(orgId, profile);
    } catch {
      // Fallback silencieux : profil vide → `buildBrevoVariables` utilise
      // ses propres defaults.
      orgProfiles.set(orgId, {});
    }
  }

  const sentArchitectIds: string[] = [];
  const failures: FollowupRunResult["failures"] = [];

  // 3. Pour chaque éligible : envoi Brevo + UPDATE followup_sent_at
  for (const item of eligible) {
    // Skipper si archi opposé / inactif / sans email (garde-fou supplémentaire).
    if (!item.architect.active || !item.architect.solicitable || !item.architect.email) {
      failures.push({
        tenderId: item.tenderId,
        architectId: item.architectId,
        reason: "architect_not_solicitable",
      });
      continue;
    }

    const register = defaultRegisterFromTutoiement(item.architect.tutoiement);
    const templateName = templateNameFor("followup", register);

    let templateId: number;
    try {
      templateId = pickBrevoTemplateId("followup", register);
    } catch (err) {
      failures.push({
        tenderId: item.tenderId,
        architectId: item.architectId,
        reason: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    // Construit les variables — on réutilise la SAME logique que la 1re envoi,
    // sauf qu'on n'a pas le `tokenJti` ici (le lien `lien_ao` est le même
    // que la 1re fois — le token est encore valide 30 j).
    let variables;
    try {
      // Lien_ao : on doit reconstruire l'URL avec le JWT. On lit le JWT row
      // (1 query par item — acceptable pour MVP, micro-volume).
      // En V2 on pourra inclure le JWT direct dans le SELECT initial.
      const tokenRows = await db
        .select({ jwtId: architectTokens.jwtId })
        .from(architectTokens)
        .where(
          and(
            eq(architectTokens.tenderId, item.tenderId),
            eq(architectTokens.architectId, item.architectId),
            eq(architectTokens.revoked, false),
          ),
        )
        .limit(1);
      if (!tokenRows[0]) {
        failures.push({
          tenderId: item.tenderId,
          architectId: item.architectId,
          reason: "token_not_found",
        });
        continue;
      }
      // NB : `jwt_id` est le `jti`, pas le JWT signé. Pour reconstruire l'URL
      // de manière 100 % fidèle on devrait re-signer. En V1, on choisit
      // d'envoyer le lien d'opposition mais PAS de relancer avec un nouveau
      // JWT signé : le mail de relance contient un message « voici le lien
      // précédent », et l'archi clique sur le mail d'origine. Cf. spec §3.7
      // — comportement acceptable pour MVP (Phase 2 : re-sign + nouveau lien).
      // Le `lien_ao` est donc volontairement un placeholder qui pointe vers
      // la racine `/archi/` (sans token) — Brevo l'affichera mais on attend
      // que l'archi clique sur l'ancien mail.

      const tenderForBrevo = {
        title: item.tender.title,
        buyer: item.tender.buyer,
        deadline: item.tender.deadline,
        rawData: item.tender.rawData,
        sourceUrl: item.tender.sourceUrl,
      };
      const department = extractDepartment(tenderForBrevo);

      // Construit l'URL du lien d'opposition à partir du jti racine — le
      // mail de relance reproduit le même lien d'opposition que la 1re fois
      // (lookup `architect_opposition_tokens` actif).
      // Relance : on re-signe un nouveau JWT d'opposition. La V1 réutilisait
      // le `jti` brut (UUID racine) avec la même URL `/archi/oppose/...` — ce
      // qui produisait un 404 (route inexistante + payload non-JWT). On signe
      // donc un token frais pour que le lien soit cliquable depuis le mail
      // de relance lui-même, sans dépendre du mail d'origine.
      const oppoJti = await fetchActiveOppositionJti(db, item.architectId, item.organizationId);
      let lienOpposition: string;
      if (oppoJti) {
        // Signature + insert sont enveloppés dans un seul try/catch défensif :
        // si les clés JWT ne sont pas chargées (CI / tests / blip KMS) ou si
        // l'insert BDD échoue, on retombe sur le lien neutre `/no-token` qui
        // affiche `TokenInvalidPage` plutôt qu'un 404 brutal.
        try {
          const fresh = signOppositionToken({
            architectId: item.architectId,
            organizationId: item.organizationId,
          });
          await db.insert(architectOppositionTokens).values({
            jti: fresh.jti,
            architectId: item.architectId,
            organizationId: item.organizationId,
            expiresAt: fresh.expiresAt,
          });
          lienOpposition = `${getSiteUrl()}/archi/opposition/${fresh.token}`;
        } catch {
          lienOpposition = `${getSiteUrl()}/archi/opposition/no-token`;
        }
      } else {
        lienOpposition = `${getSiteUrl()}/archi/opposition/no-token`;
      }

      // Profil société de l'org qui PORTE cette sollicitation (item.organizationId).
      // Multi-tenant : un même run de cron peut envoyer pour plusieurs orgs,
      // chacune avec sa présentation et son nom commercial.
      const itemOrgProfile = orgProfiles.get(item.organizationId) ?? {};

      variables = buildBrevoVariables({
        architect: { cabinet: item.architect.cabinet, contactName: item.architect.contactName },
        tender: tenderForBrevo,
        tenderDepartment: department,
        // Lien de relance : on rappelle dans le template que c'est une
        // relance. Le lien réel reste celui de la 1re sollicitation (l'archi
        // doit ouvrir l'ancien mail). En V2, re-sign + nouveau jwt.
        lienAo: `${getSiteUrl()}/archi/`,
        lienOpposition,
        register,
        presentationSociete: itemOrgProfile.presentationSociete,
        nomCommercial: itemOrgProfile.nomCommercial,
      });
      void tokenRows; // pour silence linter
    } catch (err) {
      failures.push({
        tenderId: item.tenderId,
        architectId: item.architectId,
        reason: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const toName = [variables.archi_prenom, variables.archi_nom].filter(Boolean).join(" ");
    const sendResult = await brevoClient.send({
      templateId,
      to: { email: item.architect.email, name: toName || variables.cabinet },
      params: {
        greeting: variables.greeting,
        nom_commercial: variables.nom_commercial,
        archi_prenom: variables.archi_prenom,
        archi_nom: variables.archi_nom,
        cabinet: variables.cabinet,
        ao_objet: variables.ao_objet,
        ao_acheteur: variables.ao_acheteur,
        ao_departement: variables.ao_departement,
        ao_cloture: variables.ao_cloture,
        lien_ao: variables.lien_ao,
        lien_opposition: variables.lien_opposition,
        presentation_societe: variables.presentation_societe,
        rgpd_block: variables.rgpd_block,
      },
      customHeader: `tender:${item.tenderId};archi:${item.architectId};kind:followup`,
    });

    if (!sendResult.ok) {
      failures.push({
        tenderId: item.tenderId,
        architectId: item.architectId,
        reason: `brevo_${sendResult.error}`,
      });
      continue;
    }

    // UPDATE followup_sent_at + INSERT brevo_messages (best-effort)
    try {
      await db
        .update(architectResponses)
        .set({ followupSentAt: now })
        .where(eq(architectResponses.id, item.responseId));

      await db.insert(brevoMessages).values({
        tenderId: item.tenderId,
        architectId: item.architectId,
        organizationId: item.organizationId,
        templateName,
        register,
        brevoMessageId: sendResult.messageId,
        sentAt: now,
      });

      sentArchitectIds.push(item.architectId);
    } catch (err) {
      // Si l'UPDATE échoue, le mail est parti mais on n'a pas tracé la
      // relance — on risque un double envoi au prochain run. Acceptable
      // au MVP (vol max 1 supplémentaire), mais on trace l'erreur.
      console.error("[tandem-followup:update_fail]", {
        responseId: item.responseId,
        err: err instanceof Error ? err.message : String(err),
      });
      failures.push({
        tenderId: item.tenderId,
        architectId: item.architectId,
        reason: "update_failed",
      });
    }
  }

  return {
    totalCandidates,
    eligibleCount: eligible.length,
    sentCount: sentArchitectIds.length,
    failedCount: failures.length,
    sentArchitectIds,
    failures,
    durationMs: Date.now() - startedAt,
  };
}

/** Lookup du jti d'opposition actif pour un architecte donné. */
async function fetchActiveOppositionJti(
  db: DrizzleClient,
  architectId: string,
  organizationId: string,
): Promise<string | null> {
  const rows = await db
    .select({ jti: architectOppositionTokens.jti })
    .from(architectOppositionTokens)
    .where(
      and(
        eq(architectOppositionTokens.architectId, architectId),
        eq(architectOppositionTokens.organizationId, organizationId),
        isNull(architectOppositionTokens.usedAt),
      ),
    )
    .limit(1);
  return rows[0]?.jti ?? null;
}
