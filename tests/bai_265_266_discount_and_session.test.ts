import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { pool } from "../src/db";
import { resolveDiscount, ElPlacerDcDiscountStrategy } from "../src/services/discountStrategy";
import * as fs from "fs";
import * as path from "path";

describe("BAI-265: Regla de 10% de Uso Único por Dominio Independiente & Estrategia Pluggable", () => {
  const testPhone = "+573009998877";
  const testEmail = "test_ambassador_discount@elplacerdecompartir.com";
  let testLeadId: string;

  beforeAll(async () => {
    // Limpiar estado previo
    await pool.query(
      `DELETE FROM event_tickets WHERE lead_id IN (SELECT id FROM leads WHERE email = $1 OR whatsapp = $2)`,
      [testEmail, testPhone]
    );
    await pool.query(
      `DELETE FROM leads WHERE email = $1 OR whatsapp = $2`,
      [testEmail, testPhone]
    );

    // Crear lead limpio sin compras previas
    const res = await pool.query(
      `INSERT INTO leads (alias_nombre, email, whatsapp, rol, corset_vip, primer_pago_acreditado)
       VALUES ('Test Guest', $1, $2, 'pareja', false, false)
       RETURNING id`,
      [testEmail, testPhone]
    );
    testLeadId = res.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM event_tickets WHERE lead_id = $1`,
      [testLeadId]
    );
    await pool.query(
      `DELETE FROM leads WHERE id = $1`,
      [testLeadId]
    );
  });

  it("1. Dominio event_ticket: Aplica 10% en la primera compra de entrada a evento con enlace de embajador", async () => {
    const result = await resolveDiscount({
      domain: "event_ticket",
      whatsapp: testPhone,
      email: testEmail,
      affiliateRef: "embajador_vip",
    });

    expect(result.hasDiscount).toBe(true);
    expect(result.discountRate).toBe(0.10);
    expect(result.reason).toBe("ambassador_first_event_ticket");
    expect(result.strategy).toBe("elplacerdc");
  });

  it("2. Dominio event_ticket: NO aplica 10% en la segunda compra si ya tiene ticket confirmado previo (Uso único consumido)", async () => {
    // Registrar un ticket confirmado previo
    await pool.query(
      `INSERT INTO event_tickets (lead_id, evento, tipo_entrada, tipo_pago, monto_pagado, estado, ticket_hash)
       VALUES ($1, 'luna_llena', 'pareja', 'total', 90000, 'confirmado', 'test_ticket_hash_001')`,
      [testLeadId]
    );

    const result = await resolveDiscount({
      domain: "event_ticket",
      whatsapp: testPhone,
      email: testEmail,
      affiliateRef: "embajador_vip",
    });

    expect(result.hasDiscount).toBe(false);
    expect(result.discountRate).toBe(0);
    expect(result.reason).toBe("ambassador_single_use_consumed_event_ticket");
  });

  it("3. Desacople de dominios: Haber comprado entrada a evento NO inhabilita el 10% en la 1ª compra de membresía VIP", async () => {
    const result = await resolveDiscount({
      domain: "vip_membership",
      whatsapp: testPhone,
      email: testEmail,
      affiliateRef: "embajador_vip",
    });

    expect(result.hasDiscount).toBe(true);
    expect(result.discountRate).toBe(0.10);
    expect(result.reason).toBe("ambassador_first_vip_membership");
  });

  it("4. Dominio vip_membership: NO aplica 10% si el usuario ya acreditó su primer pago VIP (Uso único consumido)", async () => {
    // Acreditar primer pago VIP
    await pool.query(
      `UPDATE leads SET primer_pago_acreditado = true, corset_vip = true WHERE id = $1`,
      [testLeadId]
    );

    const result = await resolveDiscount({
      domain: "vip_membership",
      whatsapp: testPhone,
      email: testEmail,
      affiliateRef: "embajador_vip",
    });

    expect(result.hasDiscount).toBe(false);
    expect(result.discountRate).toBe(0);
    expect(result.reason).toBe("ambassador_single_use_consumed_vip_membership");
  });

  it("5. CoHaLo Positivo: Cero prohibiciones negativas (NO AFILIADOS, NO BOT, NO PAGOS, NO MEMBRESIAS)", () => {
    const strategyFile = fs.readFileSync(path.resolve(__dirname, "../src/services/discountStrategy.ts"), "utf-8");
    expect(strategyFile).not.toContain("NO AFILIADOS");
    expect(strategyFile).not.toContain("NO BOT");
    expect(strategyFile).not.toContain("NO PAGOS");
    expect(strategyFile).not.toContain("NO MEMBRESIAS");
  });
});

describe("BAI-266: Sincronización de Sesión Global y Autocompletado en Formularios", () => {
  const rootDir = path.resolve(__dirname, "..");

  it("1. AmbassadorLogin.astro: Persiste user_profile completo (alias, whatsapp, email, rol, ciudad)", () => {
    const file = fs.readFileSync(path.join(rootDir, "src/components/AmbassadorLogin.astro"), "utf-8");
    expect(file).toContain("localStorage.setItem(\"user_profile\"");
    expect(file).toContain("localStorage.setItem(\"user_phone\"");
    expect(file).toContain("localStorage.setItem(\"user_alias\"");
    expect(file).toContain("localStorage.setItem(\"user_email\"");
  });

  it("2. dashboard.astro: Sincroniza user_profile al cargar métricas y perfil", () => {
    const file = fs.readFileSync(path.join(rootDir, "src/pages/dashboard.astro"), "utf-8");
    expect(file).toContain("localStorage.setItem(\"user_profile\"");
    expect(file).toContain("localStorage.setItem(\"user_phone\"");
    expect(file).toContain("localStorage.setItem(\"user_alias\"");
  });

  it("3. luna-llena.astro: Implementa hydrateSessionFormFields para autocompletar formularios de eventos", () => {
    const file = fs.readFileSync(path.join(rootDir, "src/pages/the-corset-society/luna-llena.astro"), "utf-8");
    expect(file).toContain("hydrateSessionFormFields");
    expect(file).toContain("inputAlias.value = aliasVal");
    expect(file).toContain("inputPhone.value = phoneVal");
    expect(file).toContain("inputEmail.value = emailVal");
  });

  it("4. VipCheckout.astro: Implementa hidratación de sesión con input userPhone para validación de descuento", () => {
    const file = fs.readFileSync(path.join(rootDir, "src/components/VipCheckout.astro"), "utf-8");
    expect(file).toContain("vip-input-phone");
    expect(file).toContain("userPhone");
    expect(file).toContain("phoneInput.value = phone");
    expect(file).toContain("emailInput.value = email");
  });
});
