import { describe, it, expect, afterAll } from "bun:test";
import { upsertLead, pool } from "../src/db";
import { syncSubscriberToListmonk, LISTMONK_LISTS } from "../src/services/listmonk";
import { dispatchDomainEvent } from "../src/services/automation";

describe("BAI-244: Identidad Unificada & Event-Driven Listmonk Invariants", () => {
  const testPhoneA = "+573119990001";
  const testEmailA = "test_lead_a@elplacerdecompartir.com";
  const testPhoneB = "+573119990002";
  const testEmailB = "test_lead_b@elplacerdecompartir.com";

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query("DELETE FROM leads WHERE email IN ($1, $2) OR whatsapp IN ($3, $4)", [
        testEmailA, testEmailB, testPhoneA, testPhoneB
      ]);
      await client.query("DELETE FROM listmonk.subscribers WHERE email IN ($1, $2)", [
        testEmailA, testEmailB
      ]);
    } finally {
      client.release();
    }
  });

  it("1. Persiste de forma duradera whatsapp_verified y email_verified en PostgreSQL", async () => {
    const res = await upsertLead({
      alias_nombre: "Lead Test A",
      email: testEmailA,
      whatsapp: testPhoneA,
      rol: "pareja",
      ciudad: "Bogotá",
      whatsapp_verified: true,
      email_verified: true,
    });

    expect(res.status).toBe("created");
    expect(res.lead).toBeDefined();
    expect(res.lead?.whatsapp_verified).toBe(true);
    expect(res.lead?.email_verified).toBe(true);
  });

  it("2. Invariante Anticolisión: Bloquea cruces de datos entre distintos usuarios registrados (409 Conflict)", async () => {
    // Crear Lead B independiente
    await upsertLead({
      alias_nombre: "Lead Test B",
      email: testEmailB,
      whatsapp: testPhoneB,
      rol: "hombre_solo",
      ciudad: "Medellín",
      whatsapp_verified: true,
      email_verified: true,
    });

    // Intentar registrar con teléfono de A y correo de B
    const conflictRes = await upsertLead({
      alias_nombre: "Hacker Cross",
      email: testEmailB,
      whatsapp: testPhoneA,
    });

    expect(conflictRes.status).toBe("conflict");
    expect(conflictRes.error).toContain("pertenecen a registros distintos");
  });

  it("3. Automation Engine & Listmonk: Sincroniza atómicamente a Listmonk con listas y etiquetas canónicas", async () => {
    const syncRes = await syncSubscriberToListmonk({
      email: testEmailA,
      name: "Lead Test A",
      whatsapp: testPhoneA,
      listIds: [LISTMONK_LISTS.GENERAL, LISTMONK_LISTS.CORSET],
      tags: ["lead", "posible_vip", "rol_pareja"],
      attribs: { test: true },
    });

    expect(syncRes.success).toBe(true);
    expect(syncRes.subscriberId).toBeDefined();

    // Verificar físicamente en PostgreSQL
    const client = await pool.connect();
    try {
      const subCheck = await client.query("SELECT * FROM listmonk.subscribers WHERE lower(email) = $1", [testEmailA.toLowerCase()]);
      expect(subCheck.rows.length).toBe(1);
      const sub = subCheck.rows[0];
      expect(sub.attribs.tags).toContain("posible_vip");

      const listsCheck = await client.query("SELECT list_id FROM listmonk.subscriber_lists WHERE subscriber_id = $1", [sub.id]);
      const listIds = listsCheck.rows.map(r => r.list_id);
      expect(listIds).toContain(LISTMONK_LISTS.GENERAL);
      expect(listIds).toContain(LISTMONK_LISTS.CORSET);
    } finally {
      client.release();
    }
  });

  it("4. Despacho de Eventos Asíncronos: dispatchDomainEvent se ejecuta sin lanzar errores no capturados", async () => {
    await expect(
      dispatchDomainEvent("lead.registered", {
        email: testEmailA,
        whatsapp: testPhoneA,
        name: "Lead Test A",
        rol: "pareja",
        ciudad: "Bogotá",
        channel: "corset",
      })
    ).resolves.toBeUndefined();
  });
});
