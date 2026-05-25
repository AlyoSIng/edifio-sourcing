/**
 * Tests unitaires — client XML-RPC Odoo.
 *
 * Couvre :
 *  - encodeXmlRpcValue : int, bool, string, array, struct, nil
 *  - parseMethodResponse : succès simple (int retour de create)
 *  - parseMethodResponse : succès array de struct (search_read)
 *  - parseMethodResponse : fault → throw OdooError('fault')
 *  - loadOdooConfigFromEnv : throw si vars manquent, throw si URL invalide
 *  - createOdooClient : authentifie puis execute_kw (mock fetch)
 *  - createDisabledOdooClient : throw OdooError('disabled')
 *  - isOdooSyncEnabled : false par défaut, true si ODOO_SYNC_ENABLED='true'
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __resetOdooClientCache,
  buildMethodCall,
  createDisabledOdooClient,
  createOdooClient,
  encodeXmlRpcValue,
  isOdooSyncEnabled,
  loadOdooConfigFromEnv,
  OdooError,
  parseMethodResponse,
} from "./client";

describe("encodeXmlRpcValue", () => {
  it("encode un entier", () => {
    expect(encodeXmlRpcValue(42)).toBe("<value><int>42</int></value>");
  });
  it("encode un booléen", () => {
    expect(encodeXmlRpcValue(true)).toBe("<value><boolean>1</boolean></value>");
    expect(encodeXmlRpcValue(false)).toBe("<value><boolean>0</boolean></value>");
  });
  it("encode une string et échappe les chars XML", () => {
    expect(encodeXmlRpcValue("hello <world>")).toBe(
      "<value><string>hello &lt;world&gt;</string></value>",
    );
  });
  it("encode null", () => {
    expect(encodeXmlRpcValue(null)).toBe("<value><nil/></value>");
  });
  it("encode un array de strings", () => {
    expect(encodeXmlRpcValue(["a", "b"])).toBe(
      "<value><array><data><value><string>a</string></value><value><string>b</string></value></data></array></value>",
    );
  });
  it("encode un struct", () => {
    expect(encodeXmlRpcValue({ name: "Marie", age: 30 })).toBe(
      "<value><struct><member><name>name</name><value><string>Marie</string></value></member><member><name>age</name><value><int>30</int></value></member></struct></value>",
    );
  });
});

describe("buildMethodCall", () => {
  it("construit un methodCall avec params", () => {
    const xml = buildMethodCall("execute_kw", [1, "test"]);
    expect(xml).toContain("<methodName>execute_kw</methodName>");
    expect(xml).toContain("<int>1</int>");
    expect(xml).toContain("<string>test</string>");
  });
});

describe("parseMethodResponse", () => {
  it("parse un entier (réponse de crm.lead.create)", () => {
    const xml = `<?xml version="1.0"?><methodResponse><params><param><value><int>42</int></value></param></params></methodResponse>`;
    expect(parseMethodResponse(xml)).toBe(42);
  });

  it("parse un array de struct (réponse search_read)", () => {
    const xml = `<?xml version="1.0"?><methodResponse><params><param><value><array><data>
      <value><struct>
        <member><name>id</name><value><int>1</int></value></member>
        <member><name>name</name><value><string>Cabinet A</string></value></member>
      </struct></value>
      <value><struct>
        <member><name>id</name><value><int>2</int></value></member>
        <member><name>name</name><value><string>Cabinet B</string></value></member>
      </struct></value>
    </data></array></value></param></params></methodResponse>`;
    const result = parseMethodResponse(xml);
    expect(Array.isArray(result)).toBe(true);
    const arr = result as Array<Record<string, unknown>>;
    expect(arr.length).toBe(2);
    expect(arr[0]?.name).toBe("Cabinet A");
    expect(arr[1]?.id).toBe(2);
  });

  it("throw OdooError('fault') si réponse fault", () => {
    const xml = `<?xml version="1.0"?><methodResponse><fault><value><struct>
      <member><name>faultCode</name><value><int>3</int></value></member>
      <member><name>faultString</name><value><string>Access denied</string></value></member>
    </struct></value></fault></methodResponse>`;
    expect(() => parseMethodResponse(xml)).toThrow(OdooError);
    try {
      parseMethodResponse(xml);
    } catch (e) {
      expect(e).toBeInstanceOf(OdooError);
      expect((e as OdooError).code).toBe("fault");
      expect((e as OdooError).detail).toContain("Access denied");
    }
  });

  it("throw OdooError('parse') si pas de methodResponse", () => {
    expect(() => parseMethodResponse("<not-xml/>")).toThrow(OdooError);
  });
});

describe("loadOdooConfigFromEnv", () => {
  let originalEnv: NodeJS.ProcessEnv;
  beforeEach(() => {
    originalEnv = { ...process.env };
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it("throw config si var manquante", () => {
    delete process.env.ODOO_URL;
    delete process.env.ODOO_DB;
    delete process.env.ODOO_USER;
    delete process.env.ODOO_API_KEY;
    expect(() => loadOdooConfigFromEnv()).toThrow(OdooError);
  });

  it("throw config si URL invalide", () => {
    process.env.ODOO_URL = "http://evil.com/path";
    process.env.ODOO_DB = "db";
    process.env.ODOO_USER = "u";
    process.env.ODOO_API_KEY = "k";
    expect(() => loadOdooConfigFromEnv()).toThrow(/ODOO_URL invalide/);
  });

  it("retourne config valide", () => {
    process.env.ODOO_URL = "https://alyos.odoo.com/";
    process.env.ODOO_DB = "alyos-prod";
    process.env.ODOO_USER = "api@alyos.fr";
    process.env.ODOO_API_KEY = "secret";
    const cfg = loadOdooConfigFromEnv();
    expect(cfg.url).toBe("https://alyos.odoo.com");
    expect(cfg.db).toBe("alyos-prod");
  });
});

describe("isOdooSyncEnabled", () => {
  it("false par défaut", () => {
    delete process.env.ODOO_SYNC_ENABLED;
    expect(isOdooSyncEnabled()).toBe(false);
  });
  it("true si ODOO_SYNC_ENABLED='true'", () => {
    process.env.ODOO_SYNC_ENABLED = "true";
    expect(isOdooSyncEnabled()).toBe(true);
    delete process.env.ODOO_SYNC_ENABLED;
  });
  it("false pour autres valeurs", () => {
    process.env.ODOO_SYNC_ENABLED = "1";
    expect(isOdooSyncEnabled()).toBe(false);
    delete process.env.ODOO_SYNC_ENABLED;
  });
});

describe("createDisabledOdooClient", () => {
  it("throw disabled à chaque appel", async () => {
    const client = createDisabledOdooClient();
    await expect(client.executeKw("res.partner", "search_read", [])).rejects.toThrow(OdooError);
    try {
      await client.executeKw("res.partner", "search_read", []);
    } catch (e) {
      expect((e as OdooError).code).toBe("disabled");
    }
  });
});

describe("createOdooClient (avec mock fetch)", () => {
  let originalEnv: NodeJS.ProcessEnv;
  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.ODOO_URL = "https://alyos.odoo.com/";
    process.env.ODOO_DB = "alyos-prod";
    process.env.ODOO_USER = "api@alyos.fr";
    process.env.ODOO_API_KEY = "secret-key";
    __resetOdooClientCache();
  });
  afterEach(() => {
    process.env = originalEnv;
    __resetOdooClientCache();
  });

  it("authentifie puis execute_kw — happy path", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const body = (init?.body as string) ?? "";
      calls.push({ url, body });
      if (url.endsWith("/xmlrpc/2/common")) {
        // authenticate → uid 7
        return new Response(
          `<?xml version="1.0"?><methodResponse><params><param><value><int>7</int></value></param></params></methodResponse>`,
          { status: 200 },
        );
      }
      // execute_kw → return list of 1 partner
      return new Response(
        `<?xml version="1.0"?><methodResponse><params><param><value><array><data>
          <value><struct>
            <member><name>id</name><value><int>42</int></value></member>
            <member><name>name</name><value><string>Cabinet Test</string></value></member>
          </struct></value>
        </data></array></value></param></params></methodResponse>`,
        { status: 200 },
      );
    };
    const client = createOdooClient({ fetchFn: fakeFetch });
    const result = await client.executeKw("res.partner", "search_read", [[]], {
      fields: ["id", "name"],
    });
    expect(Array.isArray(result)).toBe(true);
    expect(calls.length).toBe(2);
    expect(calls[0]?.url).toContain("/xmlrpc/2/common");
    expect(calls[1]?.url).toContain("/xmlrpc/2/object");
    expect(calls[1]?.body).toContain("res.partner");
    expect(calls[1]?.body).toContain("search_read");
  });

  it("propage OdooError sur fault Odoo", async () => {
    const fakeFetch: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/xmlrpc/2/common")) {
        return new Response(
          `<?xml version="1.0"?><methodResponse><params><param><value><int>7</int></value></param></params></methodResponse>`,
          { status: 200 },
        );
      }
      return new Response(
        `<?xml version="1.0"?><methodResponse><fault><value><struct>
          <member><name>faultCode</name><value><int>3</int></value></member>
          <member><name>faultString</name><value><string>Access denied</string></value></member>
        </struct></value></fault></methodResponse>`,
        { status: 200 },
      );
    };
    const client = createOdooClient({ fetchFn: fakeFetch });
    await expect(client.executeKw("res.partner", "search_read", [])).rejects.toThrow(OdooError);
  });

  it("retourne network error si fetch throw", async () => {
    const fakeFetch: typeof fetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    const client = createOdooClient({ fetchFn: fakeFetch });
    await expect(client.executeKw("res.partner", "search_read", [])).rejects.toThrow(/réseau/i);
  });
});
