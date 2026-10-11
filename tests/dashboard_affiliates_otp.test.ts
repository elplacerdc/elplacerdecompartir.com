import { describe, it, expect, beforeAll } from "bun:test";
import { getAffiliateStats, upsertLead, ensureAffiliateCode } from "../src/db";

describe("Dashboard Affiliate OTP & Community Invariants", () => {
  const testPhone = "+573159990001";
  const testAlias = "juanito_test";

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
    const uniqueAlias = `valquiria${Math.floor(100 + Math.random() * 900)}`;
    const uniquePhone = `+5731${Math.floor(10000000 + Math.random() * 90000000)}`;

    const res = await upsertLead({
      alias_nombre: uniqueAlias,
      whatsapp: uniquePhone,
      rol: "mujer_sola",
      ciudad: "Bogotá",
      origen: "web_comunidad",
    });

    expect(res.lead).toBeDefined();

    const code = await ensureAffiliateCode(uniqueAlias, uniquePhone, null);
    expect(code.toLowerCase()).toContain(uniqueAlias.toLowerCase());

    const stats = await getAffiliateStats(uniquePhone);
    expect(stats).not.toBeNull();
    if (stats) {
      expect(stats.alias.toLowerCase()).toContain(uniqueAlias.toLowerCase());
      expect(stats.nombre).toBe(uniqueAlias);
    }
  });
});
