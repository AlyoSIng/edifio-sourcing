"use server";

/**
 * Server Actions de gestion billing — Stripe minimal MVP (Steve 2026-06-05).
 *
 * Manipulent la table `organizations` :
 *   - subscription_status : 'none' | 'trial' | 'active' | 'expired' | 'cancelled'
 *   - trial_started_at, trial_ends_at
 *   - stripe_customer_id (référence manuelle au customer créé dans Stripe Dashboard)
 *
 * Auth : superadmin uniquement. La garde rôle est vérifiée explicitement
 * dans chaque action en plus du middleware racine.
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { organizations } from "@/db/schema/organizations";
import { isSuperAdmin, toUserProfile } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export interface BillingActionResult {
  ok: boolean;
  error?: string;
}

async function assertSuperadmin(): Promise<BillingActionResult | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };
  const profile = toUserProfile(user);
  if (!isSuperAdmin(profile)) return { ok: false, error: "forbidden_role" };
  return null;
}

/**
 * Démarre un trial de N jours (par défaut 30) à partir de maintenant.
 * Force `subscription_status = 'trial'` même si l'org était en 'expired'.
 */
export async function startTrialAction(
  orgId: string,
  durationDays = 30,
): Promise<BillingActionResult> {
  const guard = await assertSuperadmin();
  if (guard) return guard;

  if (!UUID_RE.test(orgId)) return { ok: false, error: "invalid_org_id" };
  if (durationDays < 1 || durationDays > 365) return { ok: false, error: "invalid_duration" };

  const now = new Date();
  const endsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

  try {
    await db
      .update(organizations)
      .set({
        subscriptionStatus: "trial",
        trialStartedAt: now,
        trialEndsAt: endsAt,
        updatedAt: now,
      })
      .where(eq(organizations.id, orgId));
  } catch (err) {
    console.error("[billing:startTrial:fail]", err);
    return { ok: false, error: "db_error" };
  }

  revalidatePath(`/sourcing/superadmin/organizations/${orgId}/billing`);
  return { ok: true };
}

/**
 * Prolonge le trial existant de N jours supplémentaires.
 * Si pas de trial_ends_at, démarre un trial depuis maintenant.
 */
export async function extendTrialAction(
  orgId: string,
  extraDays = 30,
): Promise<BillingActionResult> {
  const guard = await assertSuperadmin();
  if (guard) return guard;

  if (!UUID_RE.test(orgId)) return { ok: false, error: "invalid_org_id" };
  if (extraDays < 1 || extraDays > 365) return { ok: false, error: "invalid_duration" };

  try {
    const [row] = await db
      .select({ trialEndsAt: organizations.trialEndsAt })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!row) return { ok: false, error: "org_not_found" };

    const base = row.trialEndsAt ?? new Date();
    const newEndsAt = new Date(
      (base instanceof Date ? base.getTime() : new Date(base).getTime()) +
        extraDays * 24 * 60 * 60 * 1000,
    );

    await db
      .update(organizations)
      .set({
        subscriptionStatus: "trial",
        trialEndsAt: newEndsAt,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, orgId));
  } catch (err) {
    console.error("[billing:extendTrial:fail]", err);
    return { ok: false, error: "db_error" };
  }

  revalidatePath(`/sourcing/superadmin/organizations/${orgId}/billing`);
  return { ok: true };
}

/**
 * Marque l'org comme client payant. À appeler après création de la
 * subscription dans le Stripe Dashboard.
 */
export async function markActiveAction(
  orgId: string,
  stripeCustomerId: string,
): Promise<BillingActionResult> {
  const guard = await assertSuperadmin();
  if (guard) return guard;

  if (!UUID_RE.test(orgId)) return { ok: false, error: "invalid_org_id" };
  const cleaned = stripeCustomerId.trim();
  if (!cleaned.startsWith("cus_") || cleaned.length < 8)
    return { ok: false, error: "invalid_stripe_customer_id" };

  try {
    await db
      .update(organizations)
      .set({
        subscriptionStatus: "active",
        stripeCustomerId: cleaned,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, orgId));
  } catch (err) {
    console.error("[billing:markActive:fail]", err);
    return { ok: false, error: "db_error" };
  }

  revalidatePath(`/sourcing/superadmin/organizations/${orgId}/billing`);
  return { ok: true };
}

/**
 * Marque l'org comme expirée. App verrouillée pour les non-superadmins.
 */
export async function markExpiredAction(orgId: string): Promise<BillingActionResult> {
  const guard = await assertSuperadmin();
  if (guard) return guard;

  if (!UUID_RE.test(orgId)) return { ok: false, error: "invalid_org_id" };

  try {
    await db
      .update(organizations)
      .set({ subscriptionStatus: "expired", updatedAt: new Date() })
      .where(eq(organizations.id, orgId));
  } catch (err) {
    console.error("[billing:markExpired:fail]", err);
    return { ok: false, error: "db_error" };
  }

  revalidatePath(`/sourcing/superadmin/organizations/${orgId}/billing`);
  return { ok: true };
}

/**
 * Marque l'org comme annulée (sortie volontaire client).
 */
export async function markCancelledAction(orgId: string): Promise<BillingActionResult> {
  const guard = await assertSuperadmin();
  if (guard) return guard;

  if (!UUID_RE.test(orgId)) return { ok: false, error: "invalid_org_id" };

  try {
    await db
      .update(organizations)
      .set({ subscriptionStatus: "cancelled", updatedAt: new Date() })
      .where(eq(organizations.id, orgId));
  } catch (err) {
    console.error("[billing:markCancelled:fail]", err);
    return { ok: false, error: "db_error" };
  }

  revalidatePath(`/sourcing/superadmin/organizations/${orgId}/billing`);
  return { ok: true };
}
