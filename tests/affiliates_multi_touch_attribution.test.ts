import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { pool, recordAffiliatePayment } from "../src/db";

describe("Sovereign Affiliate Multi-Touch Attribution (Debut vs Recompra vs Fallback)", () => {
  const padreAlias = `padre_${Date.now()}`;
  const closerAlias = `closer_${Date.now()}`;
  let leadId: string;

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      // 1. Crear embajadores de prueba
      await client.query(
        `INSERT INTO afiliados (alias, nombre, email, whatsapp, clicks, referidos_pagados, entradas_ganadas)
         VALUES ($1, 'Embajador Padre', $2, '+570001111111', 10, 0, 0),
                ($3, 'Embajador Closer', $4, '+570002222222', 20, 0, 0)`,
        [padreAlias, `${padreAlias}@test.com`, closerAlias, `${closerAlias}@test.com`]
      );

      // 2. Crear lead captado originalmente por Embajador Padre
      const leadRes = await client.query(
        `INSERT INTO leads (alias_nombre, email, whatsapp, rol, ciudad, origen, afiliado_id, primer_pago_acreditado)
         VALUES ('Usuario Test', $1, $2, 'pareja', 'Bogotá', 'web_comunidad', $3, false)
         RETURNING id`,
        [`lead_${Date.now()}@test.com`, `+57000${Math.floor(1000000 + Math.random() * 9000000)}`, padreAlias]
      );
      leadId = leadRes.rows[0].id;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query("DELETE FROM event_tickets WHERE lead_id = $1", [leadId]);
      await client.query("DELETE FROM leads WHERE id = $1", [leadId]);
      await client.query("DELETE FROM afiliados WHERE alias IN ($1, $2)", [padreAlias, closerAlias]);
    } finally {
      client.release();
    }
  });

  it("1. Debut (Primera compra histórica): Acredita SIEMPRE al Embajador Padre aunque compre con link del Closer", async () => {
    const client = await pool.connect();
    try {
      // Ticket 1 emitido con el link del closer
      const ticketRes = await client.query(
        `INSERT INTO event_tickets (lead_id, evento, tipo_entrada, tipo_pago, monto_pagado, estado, afiliado_ref)
         VALUES ($1, 'luna_llena', 'pareja', 'total', 100000, 'confirmado', $2)
         RETURNING id`,
        [leadId, closerAlias]
      );
      const ticketId = ticketRes.rows[0].id;

      // Ejecutar acreditación
      const result = await recordAffiliatePayment(closerAlias, leadId, ticketId);

      expect(result.success).toBe(true);
      expect(result.credited).toBe(true);
      expect(result.isDebut).toBe(true);
      expect(result.creditedAlias).toBe(padreAlias);

      // Verificar en BD que el Padre sumó 1 y el Closer sigue en 0
      const padreAff = await client.query("SELECT referidos_pagados FROM afiliados WHERE alias = $1", [padreAlias]);
      const closerAff = await client.query("SELECT referidos_pagados FROM afiliados WHERE alias = $1", [closerAlias]);
      expect(padreAff.rows[0].referidos_pagados).toBe(1);
      expect(closerAff.rows[0].referidos_pagados).toBe(0);

      // Verificar que el lead quedó con primer_pago_acreditado = true
      const leadCheck = await client.query("SELECT primer_pago_acreditado FROM leads WHERE id = $1", [leadId]);
      expect(leadCheck.rows[0].primer_pago_acreditado).toBe(true);
    } finally {
      client.release();
    }
  });

  it("2. Recompra con Último Clic: Acredita al Embajador Closer que compartió el nuevo evento", async () => {
    const client = await pool.connect();
    try {
      // Ticket 2 emitido para un segundo evento con link del closer
      const ticketRes = await client.query(
        `INSERT INTO event_tickets (lead_id, evento, tipo_entrada, tipo_pago, monto_pagado, estado, afiliado_ref)
         VALUES ($1, 'taller_baile_erotico', 'pareja', 'total', 120000, 'confirmado', $2)
         RETURNING id`,
        [leadId, closerAlias]
      );
      const ticketId = ticketRes.rows[0].id;

      // Ejecutar acreditación en recompra
      const result = await recordAffiliatePayment(closerAlias, leadId, ticketId);

      expect(result.success).toBe(true);
      expect(result.credited).toBe(true);
      expect(result.isDebut).toBe(false);
      expect(result.creditedAlias).toBe(closerAlias);

      // Verificar en BD que ahora el Closer sumó 1 y el Padre se mantiene en 1
      const padreAff = await client.query("SELECT referidos_pagados FROM afiliados WHERE alias = $1", [padreAlias]);
      const closerAff = await client.query("SELECT referidos_pagados FROM afiliados WHERE alias = $1", [closerAlias]);
      expect(padreAff.rows[0].referidos_pagados).toBe(1);
      expect(closerAff.rows[0].referidos_pagados).toBe(1);
    } finally {
      client.release();
    }
  });

  it("3. Recompra Orgánica (sin enlace): Fallback automático al Embajador Padre (LTV)", async () => {
    const client = await pool.connect();
    try {
      // Ticket 3 comprado directo sin enlace
      const ticketRes = await client.query(
        `INSERT INTO event_tickets (lead_id, evento, tipo_entrada, tipo_pago, monto_pagado, estado, afiliado_ref)
         VALUES ($1, 'luna_llena', 'pareja', 'total', 100000, 'confirmado', NULL)
         RETURNING id`,
        [leadId]
      );
      const ticketId = ticketRes.rows[0].id;

      // Ejecutar acreditación sin alias de último clic
      const result = await recordAffiliatePayment(null, leadId, ticketId);

      expect(result.success).toBe(true);
      expect(result.credited).toBe(true);
      expect(result.isDebut).toBe(false);
      expect(result.creditedAlias).toBe(padreAlias);

      // Verificar en BD que el Padre sumó a 2 y el Closer se mantiene en 1
      const padreAff = await client.query("SELECT referidos_pagados FROM afiliados WHERE alias = $1", [padreAlias]);
      expect(padreAff.rows[0].referidos_pagados).toBe(2);
    } finally {
      client.release();
    }
  });

  it("4. Gamificación: Tope de 3 entradas ganadas por 9 compras", async () => {
    const client = await pool.connect();
    try {
      // Simular 9 ventas directas en BD
      await client.query("UPDATE afiliados SET referidos_pagados = 8 WHERE alias = $1", [padreAlias]);
      
      // La 9na venta desbloquea la 3ra entrada
      await recordAffiliatePayment(padreAlias, null);
      let aff = await client.query("SELECT referidos_pagados, entradas_ganadas FROM afiliados WHERE alias = $1", [padreAlias]);
      expect(aff.rows[0].referidos_pagados).toBe(9);
      expect(aff.rows[0].entradas_ganadas).toBe(3);

      // La 10ma venta NO debe subir de 3 entradas ganadas (tope alcanzado)
      await recordAffiliatePayment(padreAlias, null);
      aff = await client.query("SELECT referidos_pagados, entradas_ganadas FROM afiliados WHERE alias = $1", [padreAlias]);
      expect(aff.rows[0].referidos_pagados).toBe(10);
      expect(aff.rows[0].entradas_ganadas).toBe(3);
    } finally {
      client.release();
    }
  });
});
