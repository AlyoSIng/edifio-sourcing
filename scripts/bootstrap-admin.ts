/**
 * scripts/bootstrap-admin.ts
 *
 * Crée un compte AlyoS durable dans Supabase Auth, avec rôle paramétrable.
 * Utilisé pour amorcer le premier admin lors de la mise en service Gate 6,
 * puis pour bootstrapper les collaborateurs Cowork (Marc, Sophie, Léa,
 * Théo) sans passer par le panel Supabase.
 *
 * Usage :
 *   corepack pnpm exec tsx scripts/bootstrap-admin.ts <email> [options]
 *
 * Options :
 *   --first-name <name>   Prénom (défaut : segment avant '@')
 *   --last-name <name>    Nom (défaut : « Admin »)
 *   --role <role>         admin | user | viewer (défaut : admin)
 *   --password <pwd>      Password (défaut : généré, 16+ chars)
 *
 * Garde-fous :
 *   - Email doit finir par @alyosingenierie.fr (cf. lib/auth/domain.ts)
 *   - Password validé par lib/auth/password (MIN_LENGTH=16 + classes + common)
 *   - Refus si l'email existe déjà — idempotence sûre, pas de reset implicite
 *   - Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Le compte créé est DURABLE : `must_change_password = false`. L'admin
 * pourra changer son password via `/reset-password` à tout moment s'il le
 * souhaite, mais aucune contrainte n'est imposée au premier login.
 *
 * Invariante sécurité (Board Q1/B 2026-05-12) : le password en clair est
 * affiché UNE SEULE FOIS sur stdout, jamais persisté côté serveur ni loggué
 * dans un audit log. Canal de transmission : terminal de l'admin → 1Password
 * (ou équivalent) → canal chiffré vers le user final (Signal, Whatsapp).
 * L'admin doit effacer son historique terminal après usage.
 *
 * Refs : DECISIONS.md (Phase pivot password 2026-05-11/12).
 */

import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

import { isAuthorizedEmail } from "@/lib/auth/domain";
import { passwordErrorLabel, validatePasswordStrength } from "@/lib/auth/password";
import { generateProvisionalPassword } from "@/lib/auth/password-server";
import type { Role, UserMetadata } from "@/lib/auth/types";

loadEnvConfig(process.cwd());

interface CliArgs {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  password: string;
  /** true si le password a été généré (vs fourni explicitement via --password). */
  passwordGenerated: boolean;
}

function printUsage(): void {
  console.error(
    [
      "Usage : corepack pnpm exec tsx scripts/bootstrap-admin.ts <email> [options]",
      "",
      "Options :",
      "  --first-name <name>   Prénom (défaut : segment avant '@')",
      "  --last-name <name>    Nom (défaut : « Admin »)",
      "  --role <role>         admin | user | viewer (défaut : admin)",
      "  --password <pwd>      Password (défaut : généré, 16+ chars)",
      "",
      "Exemple :",
      "  corepack pnpm exec tsx scripts/bootstrap-admin.ts \\",
      "    steissier@alyosingenierie.fr --first-name Steve --last-name Teissier",
    ].join("\n"),
  );
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function isRole(value: unknown): value is Role {
  return value === "admin" || value === "user" || value === "viewer";
}

function parseArgs(argv: readonly string[]): CliArgs {
  const first = argv[0];
  if (typeof first !== "string" || first.startsWith("--")) {
    printUsage();
    process.exit(1);
  }
  const email = first.trim().toLowerCase();
  const localPart = email.split("@")[0];

  let firstName = localPart && localPart.length > 0 ? localPart : "user";
  let lastName = "Admin";
  let role: Role = "admin";
  let password: string | null = null;

  for (let i = 1; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    switch (key) {
      case "--first-name":
        if (typeof value !== "string") fail("--first-name nécessite une valeur");
        firstName = value;
        i += 1;
        break;
      case "--last-name":
        if (typeof value !== "string") fail("--last-name nécessite une valeur");
        lastName = value;
        i += 1;
        break;
      case "--role":
        if (!isRole(value)) {
          fail(`--role invalide : « ${value ?? "(vide)"} ». Valeurs : admin | user | viewer.`);
        }
        role = value;
        i += 1;
        break;
      case "--password":
        if (typeof value !== "string" || value.length === 0) {
          fail("--password nécessite une valeur");
        }
        password = value;
        i += 1;
        break;
      default:
        console.error(`Argument inconnu : ${key}`);
        printUsage();
        process.exit(1);
    }
  }

  const passwordGenerated = password === null;
  return {
    email,
    firstName,
    lastName,
    role,
    password: password ?? generateProvisionalPassword(),
    passwordGenerated,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Garde domaine — défense en profondeur en plus du middleware Next.
  if (!isAuthorizedEmail(args.email)) {
    fail(
      `Email refusé : ${args.email}. Doit finir par @alyosingenierie.fr ` +
        `(cf. ALLOWED_EMAIL_DOMAIN).`,
    );
  }

  // Validation force password — même politique que le flow /reset-password.
  const strength = validatePasswordStrength(args.password);
  if (!strength.valid) {
    console.error("✗ Password rejeté par la politique :");
    for (const err of strength.errors) {
      console.error(`  - ${passwordErrorLabel(err)}`);
    }
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    fail("NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env.local.");
  }

  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Idempotence sûre — refuse si l'email existe déjà. L'admin opérationnel
  // doit explicitement supprimer le user via Supabase Dashboard avant de
  // re-bootstrap (évite un reset password silencieux qui éjecterait un user
  // en cours d'usage de son provisoire / durable existant).
  const { data: existing, error: listError } = await admin.auth.admin.listUsers({
    perPage: 200,
    page: 1,
  });
  if (listError) fail(`Échec listUsers : ${listError.message}`);
  const found = (existing.users ?? []).find((u) => (u.email ?? "").toLowerCase() === args.email);
  if (found) {
    fail(
      `User déjà existant : ${args.email} (id=${found.id}). ` +
        `Refus de re-créer. Pour reset, supprime d'abord via Supabase Dashboard.`,
    );
  }

  const metadata: UserMetadata = {
    role: args.role,
    must_change_password: false,
    provisional_password_expires_at: null,
    first_name: args.firstName,
    last_name: args.lastName,
  };

  const { data, error } = await admin.auth.admin.createUser({
    email: args.email,
    password: args.password,
    email_confirm: true,
    user_metadata: metadata as Record<string, unknown>,
  });

  if (error || !data.user) {
    fail(`Échec createUser : ${error?.message ?? "user manquant"}`);
  }

  console.log("");
  console.log("✓ Compte AlyoS créé avec succès");
  console.log(`  email      : ${data.user.email}`);
  console.log(`  user_id    : ${data.user.id}`);
  console.log(`  role       : ${args.role}`);
  console.log(`  full name  : ${args.firstName} ${args.lastName}`);
  console.log("");
  if (args.passwordGenerated) {
    console.log("⚠ MOT DE PASSE (généré automatiquement — affiché une seule fois) :");
  } else {
    console.log("⚠ MOT DE PASSE (fourni en CLI — n'apparaîtra plus jamais) :");
  }
  console.log(`  ${args.password}`);
  console.log("");
  console.log("Sécurité — à faire MAINTENANT :");
  console.log("  1. Copier le password dans un gestionnaire (1Password, Bitwarden, etc.).");
  console.log("  2. Transmettre au user via canal chiffré (Signal, Whatsapp). JAMAIS par email.");
  console.log("  3. Effacer l'historique terminal :");
  console.log("       PowerShell → Clear-History ; bash → history -c");
  console.log("");
  console.log("Le user peut se connecter sur /login. Pas de force-reset au premier login.");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`✗ Erreur non gérée : ${message}`);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
