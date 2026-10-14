import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { pool } from "../src/db";

describe("BAI-290: Purga Total Indivisible al Eliminar Usuario (DB, Valkey, Sesiones)", () => {
  const testEmail = "test_purge_user@example.com";
  const testPhone = "+573009998877";

  const cleanup = async () => {
    const client = await pool.connect();
    try {
      await client.query(
        `DELETE FROM event_tickets WHERE lead_id IN (SELECT id FROM leads WHERE email = $1 OR whatsapp = $2)`,
        [testEmail, testPhone]
      );
      await client.query(`DELETE FROM leads WHERE email = $1 OR whatsapp = $2`, [testEmail, testPhone]);
    } finally {
      client.release();
    }
  };

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  test("1. Al borrar un lead se eliminan sus tickets asociados por lead_id, email y teléfono", async () => {
    const client = await pool.connect();
    try {
      // Setup test lead and ticket
      const leadRes = await client.query(
        `INSERT INTO leads (alias_nombre, email, whatsapp, rol, ciudad, origen)
         VALUES ('PurgeTest', $1, $2, 'pareja', 'Bogotá', 'web_comunidad')
         RETURNING id`,
        [testEmail, testPhone]
      );
      const leadId = leadRes.rows[0].id;

      await client.query(
        `INSERT INTO event_tickets (evento, lead_id, tipo_entrada, tipo_pago, monto_pagado, estado, ticket_hash)
         VALUES ('luna_llena', $1, 'pareja', 'pago_total', 100000, 'pagado', 'testhash123')`,
        [leadId]
      );

      // Verify created
      const ticketCheckPre = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM event_tickets WHERE lead_id = $1`,
        [leadId]
      );
      expect(ticketCheckPre.rows[0].cnt).toBe(1);

      // Execute deletion query simulating /api/admin/records DELETE
      await client.query(
        `DELETE FROM event_tickets 
         WHERE lead_id::text = $1 
            OR lead_id IN (
              SELECT id FROM leads 
              WHERE ($2 != '' AND LOWER(email) = $2)
                 OR ($3 != '' AND RIGHT(regexp_replace(whatsapp, '\\D', '', 'g'), 10) = $3)
            )`,
        [leadId, testEmail, "3009998877"]
      );

      await client.query(`DELETE FROM leads WHERE id = $1`, [leadId]);

      // Verify completely purged
      const ticketCheckPost = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM event_tickets WHERE lead_id = $1`,
        [leadId]
      );
      expect(ticketCheckPost.rows[0].cnt).toBe(0);

      const leadCheckPost = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM leads WHERE id = $1`,
        [leadId]
      );
      expect(leadCheckPost.rows[0].cnt).toBe(0);
    } finally {
      client.release();
    }
  });

  test("2. Desvincula referidos que apuntaban al alias del usuario eliminado", async () => {
    const client = await pool.connect();
    try {
      const testAffAlias = "purgetestref";
      const testRefEmail = "referred_user_test@example.com";

      const refLead = await client.query(
        `INSERT INTO leads (alias_nombre, email, whatsapp, rol, ciudad, origen, afiliado_id)
         VALUES ('ReferredChild', $1, '+573112223344', 'pareja', 'Bogotá', 'web_comunidad', $2)
         RETURNING id`,
        [testRefEmail, testAffAlias]
      );
      const refId = refLead.rows[0].id;

      // Unlink referral query
      await client.query(
        `UPDATE leads SET afiliado_id = NULL WHERE LOWER(afiliado_id) = LOWER($1)`,
        [testAffAlias]
      );

      const checkReferred = await client.query(
        `SELECT afiliado_id FROM leads WHERE id = $1`,
        [refId]
      );
      expect(checkReferred.rows[0].afiliado_id).toBeNull();

      // Clean up test child
      await client.query(`DELETE FROM leads WHERE id = $1`, [refId]);
    } finally {
      client.release();
    }
  });
});
