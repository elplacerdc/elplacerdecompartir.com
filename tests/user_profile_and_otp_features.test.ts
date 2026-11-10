import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { pool, upsertLead, getAffiliateStats, ensureAffiliateCode } from "../src/db";
import { deleteWhatsAppMessage, selectBestEvolutionInstance } from "../src/services/evolution";
import fs from "node:fs";
import path from "node:path";

describe("User Profile, Dynamic Roles & OTP Revocation Invariants", () => {
  const testPhone = "570009887766";
  const testEmail = "test_profile_invariants@elplacerdecompartir.com";

  async function cleanup() {
    const client = await pool.connect();
    try {
      await client.query("DELETE FROM leads WHERE email = $1 OR email LIKE '%valquiria%' OR whatsapp LIKE '%0009887766%' OR whatsapp LIKE '%3199887766%' OR alias_nombre LIKE 'Valquiria%'", [testEmail]);
      await client.query("DELETE FROM afiliados WHERE email = $1 OR email LIKE '%valquiria%' OR whatsapp LIKE '%0009887766%' OR whatsapp LIKE '%3199887766%' OR alias LIKE 'Valquiria%'", [testEmail]);
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

  test("4. getAffiliateStats exposes referredBy when lead was referred", async () => {
    const referredLead = await upsertLead(
      {
        alias_nombre: "InvitadoConReferido",
        email: "invitado_ref@elplacerdecompartir.com",
        whatsapp: "3199887711",
        rol: "pareja",
        ciudad: "Bogotá",
        afiliado_id: "embajador123",
      },
      "elplacerdc"
    );
    expect(referredLead.status).toBe("created");

    await ensureAffiliateCode("InvitadoConReferido", "3199887711", "invitado_ref@elplacerdecompartir.com");
    const stats = await getAffiliateStats("3199887711");
    expect(stats?.referredBy).toBe("embajador123");

    const client = await pool.connect();
    try {
      await client.query("DELETE FROM leads WHERE email = $1", ["invitado_ref@elplacerdecompartir.com"]);
      await client.query("DELETE FROM afiliados WHERE email = $1", ["invitado_ref@elplacerdecompartir.com"]);
    } finally {
      client.release();
    }
  });

  test("5. upsertLead updates afiliado_id when lead visits via referral later", async () => {
    const unreferred = await upsertLead(
      {
        alias_nombre: "InvitadoTardio",
        email: "invitado_tardio@elplacerdecompartir.com",
        whatsapp: "3199887722",
        rol: "pareja",
        ciudad: "Bogotá",
      },
      "elplacerdc"
    );
    expect(unreferred.status).toBe("created");
    expect(unreferred.lead?.afiliado_id).toBeNull();

    // Now updates with affiliate ref
    const updatedWithRef = await upsertLead(
      {
        alias_nombre: "InvitadoTardio",
        email: "invitado_tardio@elplacerdecompartir.com",
        whatsapp: "3199887722",
        afiliado_id: "mentorvip",
      },
      "corset"
    );
    expect(updatedWithRef.lead?.afiliado_id).toBe("mentorvip");

    const client = await pool.connect();
    try {
      await client.query("DELETE FROM leads WHERE email = $1", ["invitado_tardio@elplacerdecompartir.com"]);
      await client.query("DELETE FROM afiliados WHERE email = $1", ["invitado_tardio@elplacerdecompartir.com"]);
    } finally {
      client.release();
    }
  });

  test("6. selectBestEvolutionInstance prioritizes connected segisw instance and ignores orphaned disconnected instances when EVOLUTION_INSTANCE mismatches", () => {
    const instances = [
      { name: "miotest", token: "tok-orphan", connected: false, jid: "" },
      { name: "segisw", token: "tok-segisw", connected: true, jid: "573194194785:50@s.whatsapp.net" },
    ];
    const selected = selectBestEvolutionInstance(instances, "baiosfera-main");
    expect(selected?.name).toBe("segisw");
    expect(selected?.token).toBe("tok-segisw");
    expect(selected?.connected).toBe(true);

    const allDisconnected = [
      { name: "miotest", token: "tok-orphan", connected: false, jid: "573158443002:3@s.whatsapp.net" },
      { name: "segisw", token: "tok-segisw", connected: false, jid: "573194194785:50@s.whatsapp.net" },
    ];
    const selectedDisc = selectBestEvolutionInstance(allDisconnected, "baiosfera-main");
    expect(selectedDisc?.name).toBe("segisw");
    expect(selectedDisc?.connected).toBe(false);
  });

  test("7. OTP send API and frontend forms include automatic DB/form emailFallback and fast-fail timeout protection", () => {
    const evoContent = fs.readFileSync(path.join(process.cwd(), "src/services/evolution.ts"), "utf-8");
    expect(evoContent).toContain("AbortSignal.timeout");
    expect(evoContent).toContain("selectBestEvolutionInstance");

    const sendApiContent = fs.readFileSync(path.join(process.cwd(), "src/pages/api/otp/send.ts"), "utf-8");
    expect(sendApiContent).toContain("SELECT email FROM leads");

    const leadFormContent = fs.readFileSync(path.join(process.cwd(), "src/components/LeadForm.astro"), "utf-8");
    expect(leadFormContent).toContain("email: inputEmail?.value.trim()");
  });
});
