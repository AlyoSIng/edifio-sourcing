/**
 * Schémas Zod pour les sorties IA — edifio Sourcing.
 *
 * Source de vérité : `specs/ai_prompts_v1.md` §P1 (rc_analysis_full).
 *
 * Contrainte Gate 5 §7 (provenance IA) :
 *   Chaque champ extrait du RC par Claude doit référencer sa page + citation courte.
 *   Ces schémas imposent le `provenance { page, citation }` sur TOUS les éléments
 *   structurés extraits.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schéma de provenance — partagé par toutes les sections
// ---------------------------------------------------------------------------

const provenanceSchema = z.object({
  /** Numéro de page dans le PDF source */
  page: z.number().int().min(1),
  /** Citation littérale courte (max ~200 chars conseillés) */
  citation: z.string().min(1),
});

// ---------------------------------------------------------------------------
// P1 — rc_analysis_full
// ---------------------------------------------------------------------------

/**
 * Analyse complète d'un Règlement de Consultation (RC) par Claude Sonnet 4.6.
 *
 * Retourné par `analyzeRc()` dans `src/lib/ai/analyze-rc.ts`.
 * Stocké dans `ai_runs.output.payload` et dans `tender_events.data`
 * (event_type = 'rc_analyzed').
 */
export const rcAnalysisSchema = z.object({
  /** Liste des pièces à fournir dans le dossier de candidature */
  pieces_demandees: z.array(
    z.object({
      nom: z.string().min(1),
      format: z.string().nullable().optional(),
      signature_requise: z.boolean(),
      obligatoire: z.boolean(),
      provenance: provenanceSchema,
    }),
  ),

  /** Échéances clés de l'AO (questions, visite, remise des plis, etc.) */
  echeances: z.array(
    z.object({
      type: z.enum(["questions", "visite", "remise_plis", "autre"]),
      /** Format libre — le modèle renvoie la date telle qu'écrite dans le RC */
      date: z.string().min(1),
      heure: z.string().nullable().optional(),
      provenance: provenanceSchema,
    }),
  ),

  /** Critères de jugement des offres avec pondérations */
  criteres_jugement: z.array(
    z.object({
      critere: z.string().min(1),
      ponderation_pct: z.number().min(0).max(100),
      sous_criteres: z.array(z.string()).nullable().optional(),
      provenance: provenanceSchema,
    }),
  ),

  /** Modalités de remise du pli */
  modalites_remise: z.object({
    plateforme: z.string().nullable().optional(),
    format_pli: z.string().nullable().optional(),
    signature: z.string().nullable().optional(),
    provenance: provenanceSchema.nullable().optional(),
  }),

  /** Clauses particulières à signaler (ex. interdictions de sous-traitance, clauses sociales) */
  clauses_specifiques: z.array(
    z.object({
      description: z.string().min(1),
      provenance: provenanceSchema,
    }),
  ),

  /** Compétences et qualifications exigées par le RC */
  competences_demandees: z
    .array(
      z.object({
        competence: z.string().min(1),
        /** "exigée" | "souhaitée" | "appréciée" | null si non précisé */
        niveau: z.string().nullable().optional(),
        provenance: provenanceSchema,
      }),
    )
    .optional()
    .default([]),

  /**
   * Alertes générées par le modèle (ex. délai très court, exigences inhabituelles,
   * informations absentes du document, etc.).
   */
  alertes: z.array(z.string()),
});

export type RcAnalysis = z.infer<typeof rcAnalysisSchema>;
