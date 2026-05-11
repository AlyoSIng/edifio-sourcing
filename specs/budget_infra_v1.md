# Budget infrastructure prévisionnel — edifio Sourcing v1.0

**Auteur** : [CEO Marc]
**Date** : 2026-05-10
**Statut** : Prévisionnel MVP — à actualiser mensuellement
**Contexte** : budget Phase 1 = infra + API uniquement (validé Phase 0)

---

## 1. Synthèse mensuelle

| Poste | Service | Plan / volume | Coût mensuel HT |
|-------|---------|---------------|------------------|
| Hébergement front + API | **Vercel** | Pro (équipe AlyoS) | **20 € / utilisateur** = 20 € (1 user) |
| Base de données + Auth + Storage | **Supabase** preview | Free tier | 0 € |
| Base de données + Auth + Storage | **Supabase** prod | Pro (à partir Gate 9) | **24 €** |
| Container scraping | **Fly.io EU** (Frankfurt) | 256 Mo, partagé | **5 €** |
| Email transactionnel architectes | **Brevo** | Free tier (300 envois/j) au MVP | 0 € (puis Lite ~7 € si dépassement) |
| Email notifications utilisateurs | **Resend** | Free (3 000 envois/mois) | 0 € (puis Pro ~20 € si dépassement) |
| API IA | **Anthropic** | usage-based, voir détail §2 | **20-60 €** |
| DNS | **OVH** | déjà payé par AlyoS | 0 € |
| **TOTAL MVP (preview only, Gates 6-8)** | | | **~ 45-85 € / mois** |
| **TOTAL après Gate 9 (Supabase Pro)** | | | **~ 70-110 € / mois** |

---

## 2. Détail des coûts Anthropic API (variable)

| Prompt | Modèle | Coût/appel estimé | Fréquence estimée | Coût mensuel estimé |
|--------|--------|-------------------|-------------------|---------------------|
| P1 `rc_analysis_full` | sonnet-4-6 | 0,30-0,80 € | 5-15 AO Studio/mois | 1,5-12 € |
| P2 `memo_technique_generation` | sonnet-4-6 | 0,50-1,50 € | 5-15 mémoires/mois | 2,5-22 € |
| P3 `cerfa_field_inference` | sonnet-4-6 | 0,20-0,50 € | 5-15 mois | 1-7,5 € |
| P4 `tender_scoring_complementary` | haiku-4-5 | 0,005-0,02 € | 1000 AO/mois | 5-20 € |
| P5 `architect_matching_rationale` | haiku-4-5 | 0,005-0,02 € | 30-60 sollicitations/mois | 0,15-1,2 € |
| P6/P7 sujets emails | haiku-4-5 | 0,003-0,01 € | 60-120 mois | 0,2-1,2 € |
| P8 `tender_summary_short` | haiku-4-5 | 0,003-0,01 € | 200 mois | 0,6-2 € |
| P9 `decline_motif_categorize` | haiku-4-5 | 0,003-0,01 € | 100 mois | 0,3-1 € |
| P10 `library_piece_match` | haiku-4-5 | 0,005-0,02 € | 200 mois | 1-4 € |
| P11 `attestation_expiry_alert_text` | haiku-4-5 | 0,003-0,01 € | 20 mois | 0,06-0,2 € |
| P12 `accroche_memo_intro` | haiku-4-5 | 0,005-0,02 € | 5-15 mois | 0,03-0,3 € |
| **Total Anthropic estimé** | | | | **~ 12-72 €** |

Hypothèses : usage interne AlyoS, ~5-15 AO Studio IA traités par mois, ~30-60 sollicitations architectes par mois, ~1000 AO scannés (sourcing) par mois.

---

## 3. Alertes et garde-fous

| Alerte | Service | Seuil | Action |
|--------|---------|-------|--------|
| Quota Anthropic dépassé | Anthropic Console | 80 % du budget mensuel | Email admin AlyoS |
| Quota Anthropic dur | Anthropic Console | 100 € / mois | Pause des appels Sonnet (Haiku conservé) |
| Bande passante Vercel | Vercel | 90 % du Pro | Alerte CEO |
| Volume Brevo (300/j Free) | Brevo | 250 envois/jour | Migration Lite (~7 €/mois) |
| Volume Resend (3 000/mois) | Resend | 2 700/mois | Migration Pro (~20 €/mois) |
| Stockage Supabase Free (1 Go) | Supabase | 800 Mo | Upgrade Pro avant migration prod |
| Container Fly.io | Fly.io | RAM > 200 Mo prolongé | Investigation logs scraping |

---

## 4. Hypothèses d'évolution

| Horizon | Trigger | Impact budget |
|---------|---------|---------------|
| Gate 9 (mise en prod) | Migration Supabase Free → Pro | +24 €/mois |
| Phase 2 (ouverture multi-clients) | Croissance utilisateurs Vercel (3-5 users) | +40 à 80 €/mois |
| Phase 2 (volume) | Brevo Free → Lite obligatoire | +7 €/mois |
| Phase 2 (volume) | Resend Free → Pro obligatoire | +20 €/mois |
| Phase 2 (volume IA × 10 clients) | Anthropic × 10 | +120-720 €/mois |
| Phase 2 (custom domain Vercel) | DNS custom + certificat | gratuit (déjà OVH) |

---

## 5. Plafond Phase 1 (à acter Board si dépassement)

**Plafond mensuel Phase 1 : 150 € HT.**
Au-delà, escalade Board obligatoire.

Hypothèse de respect : tant qu'on reste à un seul utilisateur AlyoS en MVP et que les quotas IA Studio sont respectés (cf. arbitrage Gate 1 quota 20 AO Studio inclus + 1,50 € sup), on est confortablement sous le plafond.

---

## 6. Suivi mensuel (template à compléter)

| Mois | Vercel | Supabase | Fly.io | Brevo | Resend | Anthropic | OVH | TOTAL HT |
|------|--------|----------|--------|-------|--------|-----------|-----|----------|
| 2026-05 | | | | | | | | |
| 2026-06 | | | | | | | | |
| 2026-07 | | | | | | | | |
| 2026-08 | | | | | | | | |
| 2026-09 | | | | | | | | |

À compléter manuellement chaque début de mois par [PS_OPERATOR Yann] sur la base des factures réelles.

---

*Document à actualiser mensuellement. Toute évolution > 20 % du prévisionnel : escalade Board.*
