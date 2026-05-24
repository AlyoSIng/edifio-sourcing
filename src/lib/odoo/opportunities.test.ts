/**
 * Tests unitaires — createOdooOpportunity (invariants pré-BDD).
 *
 * Couvre :
 *  - origin='tandem' sans architectId → missing_architect_id
 *  - origin invalide → invalid_origin
 *  - smoke OdooError contract
 *
 * Les tests d'intégration BDD (idempotence concurrente, lastError set, course
 * perdue qui re-relit, transaction rollback) sont déléguées à l'E2E
 * Playwright + pgTAP en étape 5, sur vrai Postgres avec les vrais index
 * partiels `uniq_opp_solo` / `uniq_opp_tandem`. Un mock Drizzle in-memory
 * fragilerait le test sans valeur ajoutée — les invariants Postgres sont
 * validés en pgTAP étape 1 (migration 0005 testée).
 */

import { describe, expect, it } from "vitest";

import { OdooError, type OdooClient } from "./client";
import { createOdooOpportunity } from "./opportunities";

const TENDER_A = "11111111-1111-1111-1111-111111111111";
const ARCHI_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("createOdooOpportunity — validation inputs", () => {
  // db non utilisé sur ces tests : on échoue avant l'INSERT BDD via la
  // validation des invariants. Le mock est juste un objet vide cast.
  const fakeDbAny = {} as never;
  const noopClient: OdooClient = { executeKw: async () => 0 };

  it("missing_architect_id si origin=tandem sans architectId", async () => {
    const result = await createOdooOpportunity(
      TENDER_A,
      { stage: "Sourcing", origin: "tandem" },
      { db: fakeDbAny, odooClient: noopClient },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("missing_architect_id");
  });

  it("invalid_origin si origin n'est ni solo ni tandem (avec architectId pour ne pas trip missing_architect_id)", async () => {
    const result = await createOdooOpportunity(
      TENDER_A,
      { stage: "Sourcing", origin: "weird" as never, architectId: ARCHI_1 },
      { db: fakeDbAny, odooClient: noopClient },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_origin");
  });

  it("exporte le contrat OdooError (smoke)", () => {
    const err = new OdooError("test", "disabled");
    expect(err.code).toBe("disabled");
    expect(err.message).toBe("test");
  });
});
