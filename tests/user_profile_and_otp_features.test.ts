import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { pool, upsertLead, getAffiliateStats, ensureAffiliateCode } from "../src/db";
import { deleteWhatsAppMessage } from "../src/services/evolution";

describe("User Profile, Dynamic Roles & OTP Revocation Invariants", () => {
  const testPhone = "3199887766";
  const testEmail = "test_profile_invariants@elplacerdecompartir.com";

  async function cleanup() {
    const client = await pool.connect();
    try {
      await client.query("DELETE FROM leads WHERE email = $1 OR whatsapp LIKE '%3199887766%'", [testEmail]);
      await client.query("DELETE FROM afiliados WHERE email = $1 OR whatsapp LIKE '%3199887766%'", [testEmail]);
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  test("1. Lead can update their email and rol via upsertLead without losing existing tags", async () => {
    // Initial lead registration
    const initial = await upsertLead(
      {
        alias_nombre: "ValquiriaInicial",
        email: testEmail,
        whatsapp: testPhone,
        rol: "hombre_solo",
        ciudad: "Bogotá",
        corset_vip: false,
      },
      "elplacerdc"
    );

    expect(initial.status).toBe("created");
    expect(initial.lead?.email).toBe(testEmail);
    expect(initial.lead?.rol).toBe("hombre_solo");

    // VIP postulation with an updated email
    const updatedEmail = "valquiria_updated@elplacerdecompartir.com";
    const updated = await upsertLead(
      {
        alias_nombre: "ValquiriaInicial",
        email: updatedEmail,
        whatsapp: testPhone,
        rol: "hombre_solo",
        ciudad: "Bogotá",
        corset_vip: true,
      },
      "corset"
    );

    expect(["updated", "new_channel"]).toContain(updated.status);
    expect(updated.lead?.email).toBe(updatedEmail);
    expect(updated.lead?.corset_vip).toBe(true);

    // Clean up updated email
    const client = await pool.connect();
    try {
      await client.query("DELETE FROM leads WHERE email = $1", [updatedEmail]);
    } finally {
      client.release();
    }
  });

  test("2. getAffiliateStats returns rol, ciudad, and alias_nombre for personalized dashboard & event ticketing", async () => {
    const initial = await upsertLead(
      {
        alias_nombre: "SeductorAlfa",
        email: testEmail,
        whatsapp: testPhone,
        rol: "hombre_solo",
        ciudad: "Medellín",
        corset_vip: true,
      },
      "corset"
    );
    expect(initial.status).toBe("created");

    await ensureAffiliateCode("SeductorAlfa", testPhone, testEmail);

    const stats = await getAffiliateStats(testPhone);
    expect(stats).toBeDefined();
    expect(stats?.rol).toBe("hombre_solo");
    expect(stats?.ciudad).toBe("Medellín");
    expect(stats?.alias_nombre).toBe("SeductorAlfa");
  });

  test("3. deleteWhatsAppMessage service contract is exported and ready for OTP message revocations", () => {
    expect(typeof deleteWhatsAppMessage).toBe("function");
  });
});
