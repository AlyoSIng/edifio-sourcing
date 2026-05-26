-- Migration 0012 — ajout valeur 'conception_realisation' à l'enum selection_mode
-- PR : feat/modal-mandataire-cr (Nadia, 2026-05-26)
--
-- Note : ALTER TYPE ... ADD VALUE ne peut pas tourner dans une transaction
-- en Postgres < 12. Drizzle-kit gère ça avec breakpoints: true.
-- La valeur est utilisée pour le mode Conception/Réalisation (groupement
-- conception-réalisation, AlyoS MOE + partenaire réalisateur). En V1 MVP,
-- ce mode mappe sur le statut `selected_tandem` côté tenders (pas de
-- statut DB dédié — cf. actions.ts selectTenderAction).

ALTER TYPE "selection_mode" ADD VALUE 'conception_realisation';
