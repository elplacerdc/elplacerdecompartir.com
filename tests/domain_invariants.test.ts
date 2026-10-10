import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { upsertLead, pool } from "../src/db";
import { POST as registerHandler } from "../src/pages/api/leads/register";

describe("Domain Invariants: Multi-Channel Lead Accumulation & Corset VIP", () => {
  const testPhoneNew = "573001112233";
  const testPhoneDual = "573004445566";
  const testPhoneEndpoint = "573007778899";

  const cleanup = async () => {
    await pool.query(
      `DELETE FROM leads WHERE email LIKE '%@test.com' 
       OR whatsapp LIKE '%3001112233%' 
       OR whatsapp LIKE '%3004445566%' 
       OR whatsapp LIKE '%3007778899%'`
    );
  };

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  test("1. Lead nuevo en The Corset Society: adquiere corset_vip=true y tag corset_vip", async () => {
    await cleanup();

    const res = await upsertLead(
      {
        alias_nombre: "LadyNoir",
        email: "ladynoir@test.com",
        whatsapp: testPhoneNew,
        rol: "mujer_sola",
        corset_vip: true,
      },
      "corset"
    );

    expect(res.status).toBe("created");
    expect(res.lead).toBeDefined();
    expect(res.lead?.corset_vip).toBe(true);

    const meta = res.lead?.metadata || {};
    expect(Array.isArray(meta.tags)).toBe(true);
    expect(meta.tags).toContain("corset_vip");
    expect(meta.tags).toContain("corset");
    expect(meta.registered_channels).toContain("corset");
  });

  test("2. Lead existente de ElPlacerDC que se postula a Corset: acumula corset_vip sin perder elplacerdc", async () => {
    // Paso A: Registro inicial como comunidad general
    const initial = await upsertLead(
      {
        alias_nombre: "SocioGeneral",
        email: "sociogeneral@test.com",
        whatsapp: testPhoneDual,
        rol: "pareja",
        corset_vip: false,
      },
      "elplacerdc"
    );

    expect(initial.status).toBe("created");
    expect(initial.lead?.corset_vip).toBe(false);

    // Paso B: Postulación posterior a The Corset Society
    const updated = await upsertLead(
      {
        alias_nombre: "SocioGeneral",
        whatsapp: testPhoneDual,
        corset_vip: true,
      },
      "corset"
    );

    expect(["updated", "new_channel"]).toContain(updated.status);
    expect(updated.lead?.corset_vip).toBe(true);

    const meta = updated.lead?.metadata || {};
    // Tags y canales deben ser un conjunto monótono aditivo
    expect(meta.registered_channels).toContain("elplacerdc");
    expect(meta.registered_channels).toContain("corset");
    expect(meta.tags).toContain("corset_vip");
  });

  test("3. Invariante Monótona: mutaciones posteriores nunca degradan ni borran corset_vip", async () => {
    // Seed lead con corset_vip activo
    await upsertLead(
      {
        alias_nombre: "SocioGeneral",
        whatsapp: testPhoneDual,
        corset_vip: true,
      },
      "corset"
    );

    // Actualización posterior de ciudad sin declarar corset_vip
    const updatedAgain = await upsertLead(
      {
        whatsapp: testPhoneDual,
        ciudad: "Medellín",
      },
      "elplacerdc"
    );

    expect(updatedAgain.lead?.corset_vip).toBe(true);
    expect(updatedAgain.lead?.metadata?.tags).toContain("corset_vip");
  });

  test("4. Endpoint /api/leads/register: procesa formulario con corset_vip boolean o string 'true'", async () => {
    const req = new Request("http://localhost:3000/api/leads/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alias_nombre: "BaronVip",
        email: "baron@test.com",
        whatsapp: testPhoneEndpoint,
        rol: "hombre_solo",
        corset_vip: true,
        verified: true,
      }),
    });

    const res = await registerHandler({ request: req, cookies: { get: () => undefined } } as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.lead?.corset_vip).toBe(true);
    expect(json.lead?.metadata?.tags).toContain("corset_vip");
  });
});
