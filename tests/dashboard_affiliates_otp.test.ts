import { describe, it, expect } from "bun:test";
import { getAffiliateStats } from "../src/db";

describe("Dashboard Affiliate OTP & Stats Invariants", () => {
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

  it("auto-provisions a brand new phone number upon dashboard OTP login", async () => {
    const testPhone = `310${Math.floor(1000000 + Math.random() * 9000000)}`;
    const stats = await getAffiliateStats(testPhone);
    expect(stats).not.toBeNull();
    if (stats) {
      expect(stats.alias).toBeDefined();
      expect(stats.whatsapp).toBe(`+57${testPhone}`);
      expect(stats.leadsCount).toBe(0);
      expect(stats.purchasesCount).toBe(0);
    }
  });
});
