import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { getAffiliateStats, upsertLead, ensureAffiliateCode, pool } from "../src/db";

describe("Dashboard Affiliate OTP & Community Invariants", () => {
  const testPhone = "+570009990001";
  const testAlias = "juanito_test";
  let createdUniqueAlias = "";
  let createdUniquePhone = "";

  beforeAll(async () => {
    await upsertLead({
      alias_nombre: testAlias,
      whatsapp: testPhone,
      rol: "hombre_solo",
      ciudad: "Bogotá",
      origen: "web_test",
    });
    await ensureAffiliateCode(testAlias, testPhone, null);
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM afiliados WHERE alias IN ($1, $2) OR whatsapp IN ($3, $4) OR alias LIKE 'valquiria%'`,
      [testAlias, createdUniqueAlias, testPhone, createdUniquePhone]
    );
    await pool.query(
      `DELETE FROM leads WHERE alias_nombre IN ($1, $2) OR whatsapp IN ($3, $4) OR alias_nombre LIKE 'valquiria%'`,
      [testAlias, createdUniqueAlias, testPhone, createdUniquePhone]
    );
  });

  it("retrieves stats for an existing affiliate by phone without column vip_until crash", async () => {
    const stats = await getAffiliateStats(testPhone);
    expect(stats).not.toBeNull();
    if (stats) {
      expect(stats.alias).toBe(testAlias);
      expect(stats.whatsapp).toBe(testPhone);
      expect(typeof stats.leadsCount).toBe("number");
      expect(typeof stats.purchasesCount).toBe("number");
      expect(typeof stats.freeTicketsEarned).toBe("number");
      expect(["no_vip", "posible_vip", "vip_activo"]).toContain(stats.vipStatus);
    }
  });

  it("retrieves stats for an existing affiliate by alias", async () => {
    const stats = await getAffiliateStats(testAlias);
    expect(stats).not.toBeNull();
    if (stats) {
      expect(stats.alias).toBe(testAlias);
    }
  });

  it("unregistered phone returns null to prevent phantom @embajador#### records", async () => {
    const testPhone = "3190001122";
    const stats = await getAffiliateStats(testPhone);
    // Must be null so the client activates the community general registration form!
    expect(stats).toBeNull();
  });

  it("new user registered via community form gets personalized code matching their alias", async () => {
    createdUniqueAlias = `valquiria${Math.floor(100 + Math.random() * 900)}`;
    createdUniquePhone = `+57000${Math.floor(1000000 + Math.random() * 9000000)}`;

    const res = await upsertLead({
      alias_nombre: createdUniqueAlias,
      whatsapp: createdUniquePhone,
      rol: "mujer_sola",
      ciudad: "Bogotá",
      origen: "web_comunidad",
    });

    expect(res.lead).toBeDefined();

    const code = await ensureAffiliateCode(createdUniqueAlias, createdUniquePhone, null);
    expect(code.toLowerCase()).toContain(createdUniqueAlias.toLowerCase());

    const stats = await getAffiliateStats(createdUniquePhone);
    expect(stats).not.toBeNull();
    if (stats) {
      expect(stats.alias.toLowerCase()).toContain(createdUniqueAlias.toLowerCase());
      expect(stats.nombre).toBe(createdUniqueAlias);
    }
  });
});
