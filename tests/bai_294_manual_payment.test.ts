import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { POST as createCheckout } from "../src/pages/api/checkout/create";
import { pool } from "../src/db";
import { readFileSync } from "fs";
import { join } from "path";

describe("BAI-294 & BAI-295: Coordinación Manual por WhatsApp & Enlace de Perfil", () => {
  const testPhone = "573198887766";
  const testEmail = "manual_payment_test@example.com";

  const cleanup = async () => {
    const leadRes = await pool.query(
      `SELECT id FROM leads WHERE email = $1 OR whatsapp = $2`,
      [testEmail, testPhone]
    );
    if (leadRes.rows.length > 0) {
      const leadId = leadRes.rows[0].id;
      await pool.query(`DELETE FROM event_tickets WHERE lead_id = $1`, [leadId]);
      await pool.query(`DELETE FROM leads WHERE id = $1`, [leadId]);
    }
  };

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  test("1. Checkout con nequi_breb NO crea tickets en BD y retorna enlace directo de WhatsApp", async () => {
    const request = new Request("http://localhost:3000/api/checkout/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alias_nombre: "UsuarioPruebaManual",
        email: testEmail,
        whatsapp: testPhone,
        rol: "pareja",
        ciudad: "Bogotá",
        tipo_entrada: "pareja",
        modalidad_pago: "total",
        metodo_pago: "nequi_breb",
      }),
    });

    const response = await createCheckout({ request } as any);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.redirect_url).toBeDefined();
    expect(data.redirect_url).toContain("https://wa.me/573194194785?text=");
    expect(decodeURIComponent(data.redirect_url)).toContain("UsuarioPruebaManual");
    expect(decodeURIComponent(data.redirect_url)).toContain("Bre-B, Nequi");

    // Verificar en base de datos que NO existe ningún ticket en event_tickets
    const leadRes = await pool.query(
      `SELECT id FROM leads WHERE email = $1 OR whatsapp = $2`,
      [testEmail, testPhone]
    );
    expect(leadRes.rows.length).toBe(1);
    const leadId = leadRes.rows[0].id;

    const ticketsRes = await pool.query(
      `SELECT * FROM event_tickets WHERE lead_id = $1`,
      [leadId]
    );
    expect(ticketsRes.rows.length).toBe(0);
  });

  test("2. El botón en luna-llena.astro tiene el texto '(BreB, nequí, trasnferencia)' y elimina '(transferencia directa)'", () => {
    const filePath = join(__dirname, "../src/pages/the-corset-society/luna-llena.astro");
    const content = readFileSync(filePath, "utf-8");

    expect(content).toContain("Coordinar por WhatsApp (BreB, nequí, trasnferencia)");
    expect(content).not.toContain("(transferencia directa)");
  });

  test("3. BAI-295: Enlace ancla apunta a #section-profile-settings y dashboard tiene scrollToHashIfPresent", () => {
    const lunaPath = join(__dirname, "../src/pages/the-corset-society/luna-llena.astro");
    const lunaContent = readFileSync(lunaPath, "utf-8");
    expect(lunaContent).toContain('href="/dashboard#section-profile-settings"');

    const dashPath = join(__dirname, "../src/pages/dashboard.astro");
    const dashContent = readFileSync(dashPath, "utf-8");
    expect(dashContent).toContain('id="section-profile-settings"');
    expect(dashContent).toContain('scroll-mt-24');
    expect(dashContent).toContain("scrollToHashIfPresent");
  });
});
