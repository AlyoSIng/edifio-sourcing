-- ============================================================================
-- 0000_init.sql — Migration Prisma initiale (Spike Phase 2b)
-- ----------------------------------------------------------------------------
-- ARTEFACT À RÉGÉNÉRER : ce fichier est une transcription anticipée du DDL
-- attendu de `prisma migrate diff --from-empty --to-schema-datamodel
-- prisma/schema.prisma --script` (Prisma 6.4.1). Il sert de référence
-- comparable au `spike/drizzle/migrations/0000_init.sql` pour le rapport
-- mi-parcours Phase 2b.
--
-- Une fois `pnpm install --ignore-workspace` exécuté et `prisma generate`
-- lancé, REGÉNÉRER ce fichier via :
--   pnpm prisma:diff > prisma/migrations/0000_init.sql
-- Pour s'assurer du strict alignement.
--
-- Différences DDL attendues Prisma vs Drizzle (à confirmer Phase 3 après exec) :
--   - Prisma ne génère PAS `DEFAULT '{}'::text[]` sur les arrays — il pose
--     `DEFAULT ARRAY[]::text[]` (équivalent fonctionnel, syntaxe différente).
--   - Prisma émet `CONSTRAINT "<table>_pkey" PRIMARY KEY (...)` séparé du
--     CREATE TABLE (Drizzle inline `PRIMARY KEY` dans la colonne).
--   - Prisma émet l'enum `subscription_tier` avec la valeur `'Studio IA'`
--     littérale grâce à @map (le nom Prisma `StudioIA` n'apparaît qu'en TS).
--   - Indexes nommés via le param `map:` Prisma — alignés sur Drizzle.
-- ============================================================================

-- CreateEnum
CREATE TYPE "subscription_tier" AS ENUM ('Sourcing', 'Cotraitance', 'Studio IA');

-- CreateEnum
CREATE TYPE "tender_status" AS ENUM ('sourced', 'selected_solo', 'selected_tandem', 'awaiting_architect', 'architect_accepted', 'architect_declined', 'dropped');

-- CreateEnum
CREATE TYPE "architect_response_status" AS ENUM ('pending', 'accepted', 'declined', 'info_requested');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "siren" TEXT,
    "tier" "subscription_tier" NOT NULL DEFAULT 'Sourcing',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "architects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "firstname" TEXT NOT NULL,
    "lastname" TEXT NOT NULL,
    "contact_info" JSONB NOT NULL,
    "specialty_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "geo_zones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tutoiement" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "architects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "external_ref" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "buyer" TEXT NOT NULL,
    "cpv" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "geo_zone" TEXT,
    "amount" DECIMAL(14,2),
    "deadline" TIMESTAMPTZ(6),
    "raw_data" JSONB,
    "score" DECIMAL(5,2),
    "status" "tender_status" NOT NULL DEFAULT 'sourced',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "architect_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "architect_id" UUID NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "rationale" TEXT,
    "response_data" JSONB,
    "status" "architect_response_status" NOT NULL DEFAULT 'pending',
    "responded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "architect_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_siren_key" ON "organizations"("siren");

-- CreateIndex
CREATE INDEX "idx_architects_org_spike" ON "architects"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_tenders_ext_ref_spike" ON "tenders"("organization_id", "external_ref");

-- CreateIndex
CREATE INDEX "idx_tenders_org_status_spike" ON "tenders"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_architect_responses_tender_arch_spike" ON "architect_responses"("tender_id", "architect_id");

-- CreateIndex
CREATE INDEX "idx_architect_responses_status_spike" ON "architect_responses"("status", "tender_id");

-- AddForeignKey
ALTER TABLE "architects" ADD CONSTRAINT "architects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "architect_responses" ADD CONSTRAINT "architect_responses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "architect_responses" ADD CONSTRAINT "architect_responses_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "architect_responses" ADD CONSTRAINT "architect_responses_architect_id_fkey" FOREIGN KEY ("architect_id") REFERENCES "architects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
