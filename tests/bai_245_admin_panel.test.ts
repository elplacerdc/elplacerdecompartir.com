import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { pool } from "../src/db";

describe("BAI-245: Admin Panel Nomenclature, Counters & Unified Directory", () => {
  it("should return tickets with lead_rol and categoria_pago from metrics query", async () => {
    const client = await pool.connect();
    try {
      const ticketsRes = await client.query(`
        SELECT t.id, t.evento, t.tipo_entrada, t.tipo_pago, t.monto_pagado, t.metodo_pago, t.referencia_transaccion, t.estado, t.ticket_hash, t.created_at,
               l.alias_nombre, l.whatsapp, l.email, COALESCE(l.rol, 'general') AS lead_rol,
               (CASE 
                 WHEN COALESCE(t.monto_pagado, 0) > 0 AND t.tipo_pago != 'cortesia_100' AND t.tipo_entrada NOT ILIKE '%cortesia%' 
                 THEN 'pago' 
                 ELSE 'gratuito' 
               END) AS categoria_pago,
               (CASE WHEN t.metodo_pago ILIKE '%bre%' OR t.referencia_transaccion ILIKE '%bre%' THEN true ELSE false END) AS is_bre_b
        FROM event_tickets t
        LEFT JOIN leads l ON t.lead_id = l.id
        ORDER BY t.created_at DESC
        LIMIT 10
      `);

      expect(Array.isArray(ticketsRes.rows)).toBe(true);
      if (ticketsRes.rows.length > 0) {
        const first = ticketsRes.rows[0];
        expect(first).toHaveProperty("lead_rol");
        expect(first).toHaveProperty("categoria_pago");
        expect(["pago", "gratuito"]).toContain(first.categoria_pago);
      }
    } finally {
      client.release();
    }
  });

  it("should have correct nomenclature in adminn/index.astro", () => {
    const adminnContent = readFileSync("src/pages/adminn/index.astro", "utf-8");

    // 1. Contador VIP: 'Solicitudes VIP' y 'Credenciales'
    expect(adminnContent).toContain("Solicitudes VIP");
    expect(adminnContent).not.toContain("Credenciales VIP Activas");
    expect(adminnContent).toContain("👑 ${paid} Credenciales");
    expect(adminnContent).not.toContain("👑 ${paid} Anualidad Pagada");

    // 2. Contador de pases: 'Asistidos'
    expect(adminnContent).toContain("✓ ${checkins} Asistidos");

    // 3. Subsección de pases: tabs de pagos vs gratuitos con fecha y rol
    expect(adminnContent).toContain("💰 Eventos Pagos");
    expect(adminnContent).toContain("🎁 Gratuitos / Cortesías");
    expect(adminnContent).toContain("Rol:");
    expect(adminnContent).toContain("Fecha:");

    // 4. Directorio unificado: 🤴 Posible VIP vs 👑 VIP Activo
    expect(adminnContent).toContain("🤴 Posible VIP");
    expect(adminnContent).toContain("👑 VIP Activo");

    // 5. Filtro de ciudad estricto: Bogotá, Medellín, Otra
    expect(adminnContent).toContain('<option value="bogota">Bogotá</option>');
    expect(adminnContent).toContain('<option value="medellin">Medellín</option>');
    expect(adminnContent).toContain('<option value="otra">Otra</option>');
    expect(adminnContent).not.toContain('<option value="cali">Cali</option>');
  });

  it("should have correct nomenclature in admin/index.astro", () => {
    const adminContent = readFileSync("src/pages/admin/index.astro", "utf-8");

    expect(adminContent).toContain("✓ ${checkins} Asistidos");
    expect(adminContent).toContain("💰 Eventos Pagos");
    expect(adminContent).toContain("🎁 Gratuitos / Cortesías");
    expect(adminContent).toContain("🤴 Posible VIP");
  });
});
