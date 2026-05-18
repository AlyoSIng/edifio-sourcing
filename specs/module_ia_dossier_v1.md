# Spec — Module Préparation dossier IA

**Auteurs** : [CTO Sophie] + [DEV Alex en pré-spec]
**Date** : 2026-05-14
**Statut** : Spec préparée pour Alex après module Tandem
**Cible** : Gate 6 étape finale *(le module le plus complexe et différenciant)*
**Référence** : `specs/ai_prompts_v1.md` (P1, P2, P3, P10, P12) · `specs/schema_v1.sql` (tables `tender_documents`, `response_files`, `presentation_library`, `ai_runs`) · `design/maquettes/maquettes_v1.html` (M5 side-by-side)

---

## 1. Vue d'ensemble

Le module **Préparation dossier IA** orchestre l'analyse automatique du Règlement de Consultation, le mapping de la bibliothèque entreprise vers les pièces demandées, le pré-remplissage des CERFA, et la génération du mémoire technique. C'est le **module le plus complexe** de Gate 6 et celui qui justifie le Tier Studio IA *(790 €/mois)*.

**Trigger** : statut tender = `architect_accepted` *(Tandem)* ou `selected_solo` *(Solo)* + clic « Préparer le dossier automatiquement » par le user.

**Output** : statut tender = `dossier_review_required` → revue manuelle obligatoire side-by-side → `dossier_ready` → diffusion architecte *(Tandem)* ou remise pli *(Solo)*.

---

## 2. Pipeline complet *(parcours détaillé)*

```
[User] tap "Préparer le dossier automatiquement"
   │
   ▼
[Server Action] start-dossier-preparation
   │
   ├── 1. Vérifs (status tender éligible, DCE uploadé, quota Studio OK)
   ├── 2. Création ai_run racine (parent_run_id pour les sous-appels)
   └── 3. Enqueue jobs Edge Function (async)
   │
   ▼
[Edge Function async] preparation-orchestrator
   │
   ├── Phase A : Analyse RC (P1, Sonnet 4.6)
   │   └── Output : 14 pièces, 3 échéances, 5 critères pondérés, 2 clauses
   │
   ├── Phase B : Mapping bibliothèque (P10, Haiku 4.5 — 1 appel par pièce)
   │   └── Output : statut par pièce (vert/orange/rouge), recommandation
   │
   ├── Phase C : Pré-remplissage CERFA (P3, Sonnet 4.6)
   │   └── Output : DC1/DC2/DC4/ATTRI1 avec champs remplis + à_compléter
   │
   ├── Phase D : Génération mémoire technique (P12 intro Haiku + P2 sections Sonnet)
   │   └── Output : mémoire 12-18 pages markdown + PDF
   │
   └── Phase E : Compilation + notification
       └── Status → dossier_review_required, push notif user
   │
   ▼
[User] reçoit la notif → ouvre la fiche AO → side-by-side IA
   │
   ├── Revue pièce par pièce (M5)
   ├── Édition manuelle si nécessaire
   └── Validation finale
   │
   ▼
[User] tap "Compiler le dossier"
   │
   ├── ZIP final généré
   ├── Status → dossier_ready
   └── Si Tandem : envoi automatique à l'architecte (template D.5/D.6 dossier_diffusion)
```

---

## 3. Composants à implémenter

### 3.1. Upload DCE + parse PDF

**Fichier** : `src/app/sourcing/ao/[id]/upload-dce/page.tsx` + `actions.ts`

```typescript
'use server';

export async function uploadDce(tenderId: UUID, files: File[]): Promise<UploadResult> {
  await ensureUserCanAct(tenderId);

  for (const file of files) {
    // 1. Validation : PDF seulement, max 50 Mo/fichier
    if (!file.type.startsWith('application/pdf')) throw new Error('PDF only');
    if (file.size > 50 * 1024 * 1024) throw new Error('Max 50 MB');

    // 2. Upload Supabase Storage (bucket privé RLS)
    const storagePath = `tender_documents/${orgId}/${tenderId}/${kebab(file.name)}`;
    await supabase.storage.from('tender_documents').upload(storagePath, file);

    // 3. Insert tender_documents
    await supabase.from('tender_documents').insert({
      tender_id: tenderId,
      organization_id: orgId,
      kind: classifyDocument(file.name),  // 'RC', 'CCAP', 'CCTP', 'BPU', 'DPGF', 'plans', 'attestation', etc.
      name: file.name,
      format: 'pdf',
      storage_path: storagePath,
      size_bytes: file.size,
      analyzed: false,
    });

    // 4. Audit log
    await audit('tender_document_upload', { tenderId, kind, size: file.size });
  }
}
```

### 3.2. Server Action start-preparation

**Fichier** : `src/app/sourcing/ao/[id]/actions.ts`

```typescript
export async function startDossierPreparation(tenderId: UUID): Promise<{ runId: UUID }> {
  // 1. Vérifs
  const tender = await getTender(tenderId);
  if (!['selected_solo', 'architect_accepted'].includes(tender.status)) {
    throw new Error('Tender status not eligible');
  }
  const rcDoc = await getRcDocument(tenderId);
  if (!rcDoc) throw new Error('RC not uploaded');

  // 2. Vérif quota Studio IA
  const quotaUsed = await getStudioQuotaUsedThisMonth(orgId);
  if (quotaUsed >= 20) {
    // Demande confirmation overage 1.50 €/AO
    const approved = await checkOverageApproval(orgId);
    if (!approved) throw new Error('Studio quota exceeded, overage not approved');
  }

  // 3. Création ai_run racine
  const { data: rootRun } = await supabase.from('ai_runs').insert({
    organization_id: orgId,
    prompt_id: null,  // run parent, pas un prompt spécifique
    tender_id: tenderId,
    input_hash: hashTender(tender),
    model: 'sonnet-4-6',  // model dominant
    started_at: new Date().toISOString(),
  }).select().single();

  // 4. Update tender status
  await supabase.from('tenders').update({ status: 'dossier_preparing' }).eq('id', tenderId);

  // 5. Trigger Edge Function async (Supabase functions.invoke)
  await supabase.functions.invoke('dossier-orchestrator', {
    body: { tenderId, runId: rootRun.id },
  });

  // 6. Audit log
  await audit('dossier_preparation_start', { tenderId, runId: rootRun.id });

  return { runId: rootRun.id };
}
```

### 3.3. Edge Function orchestrator

**Fichier** : `supabase/functions/dossier-orchestrator/index.ts`

```typescript
Deno.serve(async (req) => {
  const { tenderId, runId } = await req.json();

  try {
    // Phase A : Analyse RC
    const rcAnalysis = await runPhaseA_AnalyzeRc(tenderId, runId);
    // → Insertion structured json dans tender_events ou table dédiée tender_rc_analysis

    // Phase B : Mapping bibliothèque (parallèle pour les 14 pièces)
    const libraryMapping = await runPhaseB_MapLibrary(tenderId, runId, rcAnalysis.pieces_demandees);

    // Phase C : CERFA pré-remplissage
    const cerfaData = await runPhaseC_PrefillCerfa(tenderId, runId, rcAnalysis);

    // Phase D : Mémoire technique (sections en parallèle)
    const memoirePdf = await runPhaseD_GenerateMemoire(tenderId, runId, rcAnalysis);

    // Phase E : Compilation + statut + notif
    await runPhaseE_Finalize(tenderId, runId, { rcAnalysis, libraryMapping, cerfaData, memoirePdf });

    return new Response('OK', { status: 200 });
  } catch (err) {
    await supabase.from('ai_runs').update({
      ended_at: new Date().toISOString(),
      succeeded: false,
      error_message: String(err),
    }).eq('id', runId);
    await supabase.from('tenders').update({ status: 'dossier_preparation_failed' }).eq('id', tenderId);
    // Push notif user "préparation IA a échoué"
    return new Response(`Error: ${err}`, { status: 500 });
  }
});
```

### 3.4. Phase A — Analyse RC (P1 Sonnet 4.6)

**Fichier** : `src/lib/ia/phases/analyze-rc.ts`

```typescript
async function runPhaseA_AnalyzeRc(tenderId: UUID, parentRunId: UUID) {
  const rcDoc = await getRcDocument(tenderId);
  const pdfText = await extractTextFromPdf(rcDoc.storage_path);  // pdf2text via library

  // Récup prompt versionné P1 depuis ai_prompts
  const prompt = await getActiveAiPrompt('rc_analysis_full');

  // Appel Anthropic
  const start = Date.now();
  const resp = await anthropic.messages.create({
    model: prompt.model,  // 'sonnet-4-6'
    max_tokens: 4000,
    system: prompt.system_prompt,
    messages: [{ role: 'user', content: prompt.user_prompt_template.replace('<<RC_TEXT>>', pdfText) }],
  });
  const latency = Date.now() - start;

  // Parse JSON output via Zod (rcAnalysisSchema défini dans ai_prompts_v1.md)
  const json = JSON.parse(extractJsonFromResponse(resp.content[0].text));
  const validated = rcAnalysisSchema.parse(json);

  // Log ai_run enfant
  await supabase.from('ai_runs').insert({
    organization_id: orgId,
    prompt_id: prompt.id,
    tender_id: tenderId,
    parent_run_id: parentRunId,
    input_hash: hash(pdfText),
    output: validated,
    cost_usd: resp.usage.estimated_cost_usd,  // à calculer selon tokens
    latency_ms: latency,
    model: prompt.model,
    succeeded: true,
  });

  // Store le résultat sur le tender (nouvelle table ou colonne JSONB sur tender_events)
  await supabase.from('tender_events').insert({
    tender_id: tenderId, organization_id: orgId,
    event_type: 'rc_analyzed',
    data: validated,
  });

  return validated;
}
```

### 3.5. Phase B — Mapping bibliothèque (P10 Haiku, parallèle)

```typescript
async function runPhaseB_MapLibrary(tenderId, parentRunId, piecesDemandees: PieceDemandee[]) {
  const library = await getOrgLibrary(orgId);

  // Pour chaque pièce demandée, appel parallèle P10
  const results = await Promise.all(
    piecesDemandees.map(async (piece) => {
      const prompt = await getActiveAiPrompt('library_piece_match');
      const userPrompt = prompt.user_prompt_template
        .replace('<<PIECE_RC>>', JSON.stringify(piece))
        .replace('<<LIBRARY_ITEMS>>', JSON.stringify(library));

      const resp = await anthropic.messages.create({
        model: 'haiku-4-5', max_tokens: 500,
        system: prompt.system_prompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const json = JSON.parse(extractJsonFromResponse(resp.content[0].text));
      const validated = libraryMatchSchema.parse(json);

      await logAiRun(prompt.id, tenderId, parentRunId, validated, resp);

      return { piece: piece.nom, ...validated };
    })
  );

  return results;
}
```

### 3.6. Phase C — CERFA pré-remplissage (P3 Sonnet)

Pour les 4 CERFA (DC1, DC2, DC4, ATTRI1), appel P3 séquentiel *(les données entreprise sont les mêmes mais les schémas CERFA diffèrent)*.

**Détail** : on génère un JSON `{field_id, field_label, value, source}` puis on rendra ça en PDF via un template CERFA *(à intégrer côté frontend ou via librairie PDF-fill plus tard)*.

### 3.7. Phase D — Mémoire technique (P12 + P2)

```typescript
async function runPhaseD_GenerateMemoire(tenderId, parentRunId, rcAnalysis) {
  // 1. Intro courte (P12 Haiku)
  const intro = await generateMemoireIntro(tenderId, rcAnalysis);

  // 2. Une section par critère de jugement (P2 Sonnet, parallèle si possible)
  const sections = await Promise.all(
    rcAnalysis.criteres_jugement.map(async (critere) => {
      const prompt = await getActiveAiPrompt('memo_technique_generation');
      // ...
      return await callSonnet(prompt, { critere, ... });
    })
  );

  // 3. Assemblage markdown
  const markdown = `# Mémoire technique\n\n${intro}\n\n${sections.map(s => s.contenu_markdown).join('\n\n---\n\n')}`;

  // 4. Génération PDF via pdf-lib ou similaire
  const pdfBuffer = await markdownToPdf(markdown, { theme: 'edifio' });

  // 5. Storage
  const path = `response_files/${orgId}/${tenderId}/memoire_technique_v1.pdf`;
  await supabase.storage.from('response_files').upload(path, pdfBuffer);

  // 6. Insert response_files
  await supabase.from('response_files').insert({
    tender_id: tenderId, organization_id: orgId, kind: 'memo',
    name: 'Mémoire technique', storage_path: path, size_bytes: pdfBuffer.byteLength,
    validated: false,  // doit être validé par user en revue
  });

  return { markdown, pdfPath: path };
}
```

### 3.8. UI side-by-side de revue (M5)

Maquette existante : M5 dans `maquettes_v1.html`. Comportement :

- Volet gauche : extrait du RC source *(page + citation)*
- Volet droit : extraction IA correspondante *(champ → valeur)*
- 3 boutons par pièce : ✓ Valider · ✎ Corriger · ✕ Rejeter
- Le user peut éditer manuellement la valeur avant validation
- Tant que toutes les pièces ne sont pas validées, statut reste `dossier_review_required`
- Compteur visible *(« Pièce 7/14 »)*

### 3.9. Server Action validate-piece + compile

```typescript
export async function validatePiece(tenderId: UUID, pieceId: UUID, action: 'validate' | 'edit' | 'reject', editedValue?: string) {
  // Update response_files ou la structure de pièce concernée
  // Si toutes les pièces validées → status dossier_ready possible
}

export async function compileDossier(tenderId: UUID): Promise<{ zipPath: string }> {
  // 1. Vérifier toutes les pièces validated=true
  // 2. Récupérer tous les fichiers du dossier (CERFA, memoire, attestations biblio, pièces RC)
  // 3. ZIP via lib type adm-zip
  // 4. Storage upload
  // 5. Update tender status → dossier_ready
  // 6. Si tender était en Tandem → envoi automatique template D.5/D.6 à l'architecte
  // 7. Audit log dossier_diffuse
}
```

---

## 4. Coûts estimés par dossier complet

| Phase | Modèle | Coût par dossier |
|-------|--------|------------------|
| A — Analyse RC | sonnet-4-6 | 0.30-0.80 € |
| B — Mapping bibliothèque (14 pièces × Haiku) | haiku-4-5 | 0.10-0.30 € |
| C — CERFA pré-remplissage (4 × Sonnet) | sonnet-4-6 | 0.40-1.20 € |
| D — Mémoire technique (5 sections Sonnet + 1 intro Haiku) | sonnet-4-6 + haiku-4-5 | 0.70-2.00 € |
| **Total par dossier Studio** | | **~ 1.50-4.30 €** |

→ Confirme le pricing Q2 Gate 1 *(quota 20 AO Studio inclus dans 790 €, overage 1.50 €/AO supplémentaire)*. Marge raisonnable même au coût haut.

---

## 5. Tests E2E (référence S4 plan_recette_gate7)

Tests bloquants à coder dans `e2e/dossier-ia.spec.ts` :

1. Upload RC PDF → `tender_documents` insert
2. Tap « Préparer auto » → ai_run racine créé, status `dossier_preparing`
3. Phase A complète en < 30 s, JSON structuré stocké
4. Provenance page/citation présente sur chaque champ extrait
5. Phase B : 14 pièces mappées, statuts vert/orange/rouge
6. Phase C : 4 CERFA pré-remplis, champs sources tracés
7. Phase D : mémoire 12-18 pages, sections pondérées selon critères
8. Status `dossier_review_required` → push notif user
9. Side-by-side ouvert, navigation pièce par pièce
10. Validation pièce par pièce, possibilité d'éditer
11. Tap « Compiler » → ZIP généré, status `dossier_ready`
12. Si Tandem, envoi auto template D.5/D.6 à l'architecte

---

## 6. Plan de mise en œuvre Alex

| Étape | Effort |
|-------|--------|
| Upload DCE + parse PDF (pdf2text) | 1 j |
| Phase A — Analyse RC + intégration Anthropic | 1.5 j |
| Phase B — Mapping bibliothèque parallèle | 1 j |
| Phase C — CERFA pré-remplissage | 1.5 j |
| Phase D — Mémoire technique (markdown → PDF) | 2 j |
| Phase E — Compilation ZIP + diffusion | 1 j |
| UI Side-by-side IA (M5 existant, adapter au code) | 2 j |
| Validation par pièce + édition manuelle | 1 j |
| Tests E2E + audit log + métriques coûts | 1.5 j |
| Quota management Studio + overage approval flow | 1 j |
| **Total module IA** | **~ 13.5 jours** *(~ 2.5 semaines)* |

---

## 7. Dépendances

- ✅ Tables BDD (`tender_documents`, `response_files`, `ai_runs`, `presentation_library`) dans `schema_v1.sql`
- ✅ Prompts IA P1, P2, P3, P10, P12 versionnés (`ai_prompts_v1.md`)
- ✅ Maquette M5 side-by-side
- ⚠️ Library item population : besoin que `presentation_library` ait du contenu réel pour mapper. Workflow d'upload bibliothèque à coder en parallèle.
- ⚠️ pdf2text library à choisir *(`pdf-parse`, `pdfjs-dist`, ou Edge Function dédiée)* — vérifier compatibilité Edge Functions Supabase Deno

---

## 8. Risques

| Risque | Mitigation |
|--------|------------|
| Hallucinations IA *(page ou référence inventée)* | Provenance obligatoire (P1 schema) + validation regex post-extraction + revue humaine obligatoire P1 |
| RC > 100 pages → timeout Edge Function | Phase A en streaming + chunking si > 60s |
| Mémoire technique générique = pas de différenciation vs concurrent qui utilise GPT | Tuning continu du system prompt P2 selon les retours user *(track « j'ai dû tout réécrire » → ajuster prompt)* |
| Coût Anthropic dépasse le quota inclus | Quota management + alerte 80 % + overage explicite *(jamais surprise sur facture)* |
| User attend la fin de la préparation IA bloqué *(2-3 min)* | Pas bloquant : Edge Function async, push notif quand prête. UI montre une progress bar « Préparation en cours… » et le user peut faire autre chose. |

---

*Spec figée pour démarrage Alex après module Tandem. La plus complexe mais la plus différenciante du produit.*
