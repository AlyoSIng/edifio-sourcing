/**
 * Configuration commitlint — Conventional Commits.
 * Référence : https://www.conventionalcommits.org/fr/v1.0.0/
 *
 * Types autorisés (config-conventional standard) :
 *   feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
 *
 * Format attendu : type(scope?): description en minuscules
 * Exemples valides :
 *   feat(auth): ajouter le middleware @alyosingenierie.fr
 *   chore(deps): bumper next à 14.2.36
 *   fix(rls): corriger la policy tenant_isolation sur tenders
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
};
