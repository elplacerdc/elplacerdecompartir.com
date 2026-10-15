import { describe, test, expect } from "bun:test";
import { resolveDiscount } from "../src/services/discountStrategy";
import { pool } from "../src/db";
import fs from "fs";

describe("Taller de Baile Erótico & Membresía VIP - Physical Behavior Verification", () => {
  test("1. Active VIP member receives permanent 20% honor tariff on event tickets regardless of prior purchases", async () => {
    const res = await resolveDiscount({
      domain: "event_ticket",
      whatsapp: "3158443002",
      email: "jhonsankana@gmail.com",
      isVipActive: true,
      affiliateRef: "segisw"
    });

    expect(res.hasDiscount).toBe(true);
    expect(res.discountRate).toBe(0.20);
    expect(res.isVipAmbassador).toBe(true);
    expect(res.reason).toBe("active_vip_privilege");
  });

  test("2. Referring Ambassador VIP grants 20% discount on first event ticket", async () => {
    const res = await resolveDiscount({
      domain: "event_ticket",
      whatsapp: "3009998877", // new user
      email: "newuser_test_vip_ref@elplacerdc.com",
      isVipActive: false,
      affiliateRef: "segisw" // Segisw is always VIP
    });

    expect(res.hasDiscount).toBe(true);
    expect(res.discountRate).toBe(0.20);
    expect(res.isVipAmbassador).toBe(true);
  });

  test("3. Standard Ambassador grants 10% discount on first event ticket", async () => {
    // create temporary non-vip affiliate if needed or test standard logic
    const res = await resolveDiscount({
      domain: "event_ticket",
      whatsapp: "3001112233",
      email: "newuser_std@elplacerdc.com",
      isVipActive: false,
      affiliateRef: "non_vip_ref_test"
    });

    expect(res.hasDiscount).toBe(true);
    expect(res.discountRate).toBe(0.10);
  });

  test("4. Taller de Baile Erotico Astro page has pure JS script without TypeScript assertions in inline script", () => {
    const filePath = `${import.meta.dir}/../src/pages/taller-baile-erotico.astro`;
    const content = fs.readFileSync(filePath, "utf8");
    const inlineScriptMatch = content.match(/<script is:inline>([\s\S]*?)<\/script>/);
    expect(inlineScriptMatch).not.toBeNull();
    const scriptCode = inlineScriptMatch![1];

    expect(scriptCode).not.toContain("as HTMLInputElement");
    expect(scriptCode).not.toContain("as any");
    expect(scriptCode).not.toContain("window as any");
    expect(scriptCode).toContain("resolveDiscountsAndVip");
    expect(scriptCode).toContain("hydrateSessionFormFields");
    expect(scriptCode).toContain("applyDiscountToCards");
  });

  test("5. AllianceForm.astro declares inputAlias and inputEmail to prevent ReferenceError", () => {
    const filePath = `${import.meta.dir}/../src/components/AllianceForm.astro`;
    const content = fs.readFileSync(filePath, "utf8");
    expect(content).toContain('const inputAlias = document.getElementById("input-alliance-alias")');
    expect(content).toContain('const inputEmail = document.getElementById("input-alliance-email")');
  });

  test("6. VipCheckout.astro supports multi-instance classes and AJAX redirection", () => {
    const filePath = `${import.meta.dir}/../src/components/VipCheckout.astro`;
    const content = fs.readFileSync(filePath, "utf8");
    expect(content).toContain('class="vipCheckoutForm');
    expect(content).toContain('class="vip-submit-btn');
    expect(content).toContain('fetch("/api/checkout/dlocal"');
    expect(content).toContain('window.location.href = data.redirect_url');
  });
});
