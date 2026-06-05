-- Migration 0048 — Annuaire des acheteurs publics (Steve 2026-06-04)
--
-- Master data des acheteurs (mairies, conseils départementaux, hôpitaux, etc.)
-- qui apparaissent dans les AOs. Permet de réutiliser les adresses saisies
-- d'un AO à l'autre pour un même acheteur, sans ressaisie.
--
-- Source de vérité du nom acheteur : `tenders.buyer` (texte BOAMP brut).
-- On normalise pour le matching :
--   - lowercase
--   - trim
--   - suppression des accents (NFD)
--   - compactage des espaces multiples
--
-- Workflow :
--   1. Steve saisit `buyer_address` sur un AO via /sourcing/ao/[id]
--   2. updateBuyerAddressAction UPSERT dans `buyers` (name_normalized UNIQUE
--      par org)
--   3. Pour les AOs suivants du même acheteur (même nom normalisé), on
--      auto-populate `tenders.buyer_address` depuis l'annuaire au load
--
-- Pas de FK depuis tenders.buyer vers buyers.id : le buyer BOAMP est un
-- texte libre qui peut varier orthographiquement entre 2 AOs (« Mairie
-- de Lyon » vs « Ville de Lyon »). La déduplication est faite via le nom
-- normalisé en applicatif, pas via FK.

CREATE TABLE IF NOT EXISTS "buyers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  /** Nom affiché (preserve case + accents pour les courriers). */
  "name" text NOT NULL,
  /** Nom normalisé pour le matching (lowercase + sans accents + trim).
      UNIQUE par organisation pour éviter les doublons. */
  "name_normalized" text NOT NULL,
  /** Adresse postale (rue + code postal + ville). NULL = pas encore renseignée. */
  "address" text,
  /** SIRET 14 chars si connu — utile pour certains courriers institutionnels. */
  "siret" text,
  /** SIREN 9 chars si connu. */
  "siren" text,
  /** Email de contact si Steve veut documenter (optionnel). */
  "contact_email" text,
  /** Téléphone de contact si Steve veut documenter (optionnel). */
  "contact_phone" text,
  /** Notes libres (numéro de référent interne, accord-cadre en cours…). */
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL
);

-- Unique nom normalisé par organisation — empêche les doublons au save.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_buyers_org_name_norm"
  ON "buyers" ("organization_id", "name_normalized");

-- Index sur le nom pour les recherches LIKE / fulltext de la page admin.
CREATE INDEX IF NOT EXISTS "idx_buyers_org_name"
  ON "buyers" ("organization_id", "name");

-- RLS FORCE par tenant.
ALTER TABLE "buyers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "buyers" FORCE ROW LEVEL SECURITY;

-- Policy authenticated : lecture + écriture pour les membres de l'org.
CREATE POLICY "buyers_member_all" ON "buyers"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "memberships"
      WHERE "memberships"."organization_id" = "buyers"."organization_id"
        AND "memberships"."user_id" = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "memberships"
      WHERE "memberships"."organization_id" = "buyers"."organization_id"
        AND "memberships"."user_id" = auth.uid()
    )
  );
