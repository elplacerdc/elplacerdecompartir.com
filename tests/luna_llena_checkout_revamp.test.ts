import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { pool } from "../src/db";
import { POST as createCheckout } from "../src/pages/api/checkout/create";
import { getGrammaticalProfile } from "../src/services/notifications";

describe("Luna Llena Checkout Revamp (BAI-362 to BAI-369)", () => {
  const testPhone = "570009991122";
  const testEmail = "luna_revamp_test@example.com";

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

  test("1. BAI-362: Layout reordering & pass switch scrollIntoView", () => {
    const filePath = join(__dirname, "../src/pages/the-corset-society/luna-llena.astro");
    const content = readFileSync(filePath, "utf-8");

    expect(content).toContain("document.getElementById('checkoutForm')?.scrollIntoView({ behavior: 'smooth' })");
    expect(content).toContain('id="prefilled-profile-notice"');
    // Notice must appear before price breakdown
    const noticeIdx = content.indexOf('id="prefilled-profile-notice"');
    const priceBoxIdx = content.indexOf('id="montoTotalDisplay"');
    expect(noticeIdx).toBeGreaterThan(0);
    expect(priceBoxIdx).toBeGreaterThan(noticeIdx);
  });

  test("2. BAI-363: Email not locked for unauthenticated users & WhatsApp OTP box exists", () => {
    const filePath = join(__dirname, "../src/pages/the-corset-society/luna-llena.astro");
    const content = readFileSync(filePath, "utf-8");

    expect(content).toContain('id="btnSendWaOtp"');
    expect(content).toContain('id="wa-otp-box"');
    expect(content).toContain('id="btnVerifyWaOtp"');
    expect(content).toContain('id="wa-verified-badge"');
    expect(content).toContain("triggerSendWaOtp");
    expect(content).toContain("triggerVerifyWaOtp");
  });

  test("3. BAI-364: Checkout con nequi_breb persiste lead y ticket pendiente en DB", async () => {
    const request = new Request("http://localhost:3000/api/checkout/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alias_nombre: "UsuarioLunaRevamp",
        email: testEmail,
        whatsapp: testPhone,
        rol: "pareja",
        ciudad: "Bogotá",
        tipo_entrada: "pareja",
        modalidad_pago: "reserva_40",
        metodo_pago: "nequi_breb",
      }),
    });

    const response = await createCheckout({ request } as any);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.redirect_url).toBeDefined();
    expect(data.redirect_url).toContain("https://wa.me/573194194785?text=");
    expect(decodeURIComponent(data.redirect_url)).toContain("¡Hola Segisw!");
    expect(decodeURIComponent(data.redirect_url)).not.toContain("/ El Placer DC!");

    // Verificar en BD que el ticket se registró en estado pendiente
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
    expect(ticketsRes.rows.length).toBe(1);
    expect(ticketsRes.rows[0].estado).toBe("pendiente");
    expect(ticketsRes.rows[0].tipo_pago).toBe("reserva_40");
  });

  test("4. BAI-366: Grammatical concordance helper across all roles", () => {
    const male = getGrammaticalProfile("hombre_solo");
    expect(male.subject).toBe("Él");
    expect(male.dontGoAlone).toBe("No vayas solo");

    const female = getGrammaticalProfile("mujer_sola");
    expect(female.subject).toBe("Ella");
    expect(female.dontGoAlone).toBe("No vayas sola");

    const couple = getGrammaticalProfile("pareja");
    expect(couple.subject).toBe("Ellos/Ustedes");
    expect(couple.dontGoAlone).toBe("No vayan solos");
  });

  test("5. BAI-366: Notifications include exact venue address and 'amigos mente abierta'", () => {
    const notifPath = join(__dirname, "../src/services/notifications.ts");
    const content = readFileSync(notifPath, "utf-8");

    expect(content).toContain("Calle 67 # 23-46 Piso 2, Barrio 7 de Agosto, Bogotá");
    expect(content).toContain("amigos mente abierta");
  });

  test("6. BAI-367: Existing booking reflection & upgrade buttons", () => {
    const filePath = join(__dirname, "../src/pages/the-corset-society/luna-llena.astro");
    const content = readFileSync(filePath, "utf-8");

    expect(content).toContain('id="existing-ticket-banner"');
    expect(content).toContain('id="btn-book-another-ticket"');
    expect(content).toContain('id="btn-upgrade-ticket"');
    expect(content).toContain("isUpgradeMode = true");
  });

  test("7. BAI-368: Admin continuous present date filter & Dashboard navigation return", () => {
    const adminPath = join(__dirname, "../src/pages/adminn/index.astro");
    const adminContent = readFileSync(adminPath, "utf-8");

    expect(adminContent).toContain("new Date(ev.date).getTime() >= nowTime");
    expect(adminContent).toContain("t.whatsapp");
    expect(adminContent).toContain("t.email");

    const dashPath = join(__dirname, "../src/pages/dashboard.astro");
    const dashContent = readFileSync(dashPath, "utf-8");
    expect(dashContent).toContain('id="section-continue-navigation"');
    expect(dashContent).toContain('id="btn-return-to-checkout"');
    expect(dashContent).toContain('href="/the-corset-society/luna-llena"');
  });

  test("8. BAI-369: Official VIP promo copy updates", () => {
    const filePath = join(__dirname, "../src/pages/the-corset-society/luna-llena.astro");
    const content = readFileSync(filePath, "utf-8");

    expect(content).toContain("¡Con tu entrada a Halloween Luna Llena se te activa");
    expect(content).toContain("y tu enlace exclusivo de embajador VIP.");
  });
});
