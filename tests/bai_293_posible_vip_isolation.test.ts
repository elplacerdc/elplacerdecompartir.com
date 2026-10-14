import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { upsertLead, pool } from "../src/db";

describe("BAI-293: Aislamiento Estricto de Posible VIP (Solo Formulario The Corset Society)", () => {
  const testPhoneDashboard = "573105556677";
  const testEmailDashboard = "dashboard_user_test@example.com";

  const cleanup = async () => {
    await pool.query(
      `DELETE FROM leads WHERE email = $1 OR whatsapp = $2`,
      [testEmailDashboard, testPhoneDashboard]
    );
  };

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  test("1. Registro desde /dashboard (origen: web_comunidad) NUNCA asigna posible vip ni corset_vip=true", async () => {
    const res = await upsertLead(
      {
        alias_nombre: "UsuarioComunidad",
        email: testEmailDashboard,
        whatsapp: testPhoneDashboard,
        rol: "pareja",
        ciudad: "Bogotá",
        origen: "web_comunidad",
        corset_vip: false,
      },
      "elplacerdc"
    );

    expect(res.status).toBe("created");
    expect(res.lead).toBeDefined();
    expect(res.lead?.corset_vip).toBe(false);

    const tags = res.lead?.metadata?.tags || [];
    expect(tags).not.toContain("posible vip");
    expect(tags).not.toContain("corset_vip");
    expect(tags).toContain("general");
  });

  test("2. Compra de entrada para evento Luna Llena (origen: evento_luna_llena) no asigna posible vip", async () => {
    const res = await upsertLead(
      {
        alias_nombre: "CompradorLuna",
        email: testEmailDashboard,
        whatsapp: testPhoneDashboard,
        rol: "pareja",
        ciudad: "Bogotá",
        origen: "evento_luna_llena",
        corset_vip: false,
      },
      "corset"
    );

    expect(res.lead?.corset_vip).toBe(false);
    const tags = res.lead?.metadata?.tags || [];
    expect(tags).not.toContain("posible vip");
    expect(tags).not.toContain("corset_vip");
    expect(tags).toContain("corset");
  });

  test("3. Solo la postulación explícita (origen: web_corset + corset_vip: true) asigna posible vip", async () => {
    const res = await upsertLead(
      {
        alias_nombre: "PostulanteVIP",
        email: testEmailDashboard,
        whatsapp: testPhoneDashboard,
        rol: "pareja",
        ciudad: "Bogotá",
        origen: "web_corset",
        corset_vip: true,
      },
      "corset"
    );

    expect(res.lead?.corset_vip).toBe(true);
    const tags = res.lead?.metadata?.tags || [];
    expect(tags).toContain("posible vip");
    expect(tags).toContain("corset_vip");
  });
});
