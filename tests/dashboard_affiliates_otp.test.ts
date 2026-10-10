import { describe, it, expect } from "bun:test";
import { getAffiliateStats, upsertLead, ensureAffiliateCode } from "../src/db";

describe("Dashboard Affiliate OTP & Community Invariants", () => {
  it("retrieves stats for an existing affiliate by phone without column vip_until crash", async () => {
    // Test with existing affiliate phone '3158443002'
    const stats = await getAffiliateStats("3158443002");
    expect(stats).not.toBeNull();
    if (stats) {
      expect(stats.alias).toBe("juan");
      expect(stats.whatsapp).toBe("+573158443002");
      expect(typeof stats.leadsCount).toBe("number");
      expect(typeof stats.purchasesCount).toBe("number");
      expect(typeof stats.freeTicketsEarned).toBe("number");
      expect(["no_vip", "posible_vip", "vip_activo"]).toContain(stats.vipStatus);
    }
  });

  it("retrieves stats for an existing affiliate by alias", async () => {
    const stats = await getAffiliateStats("juan");
    expect(stats).not.toBeNull();
    if (stats) {
      expect(stats.alias).toBe("juan");
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
