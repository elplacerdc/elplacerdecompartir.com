import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("BAI-247: The Corset Society — Sequential OTP & Admission Form", () => {
  const corsetIndexPath = resolve(process.cwd(), "src/pages/the-corset-society/index.astro");
  const leadFormPath = resolve(process.cwd(), "src/components/LeadForm.astro");

  it("should not contain 'Paso Obligatorio' and have an anchor link on 'Solicitud de Admisión VIP'", () => {
    const content = readFileSync(corsetIndexPath, "utf-8");
    expect(content.includes("Paso Obligatorio")).toBe(false);
    expect(content).toMatch(/<a\s+id="hero-vip-action-btn"\s+href="#solicitud-admision-vip"[^>]*>[\s\S]*?Solicitud de Admisión VIP/);
  });

  it("should have sequential OTP step 2 for email in LeadForm.astro for VIP flow", () => {
    const content = readFileSync(leadFormPath, "utf-8");
    expect(content).toContain("btn-corset-step2-send-otp");
    expect(content).toContain("btn-corset-step2-verify-otp");
    expect(content).toContain("corset-step2-otp-container");
  });

  it("should immediately render 'Postulación Radicada con Éxito' when both WhatsApp and email are verified", () => {
    const content = readFileSync(leadFormPath, "utf-8");
    expect(content).toContain("isWaVerified && isMailVerified");
    expect(content).toContain("Postulación Radicada con Éxito");
  });

  it("should pass whatsapp_verified and email_verified to /api/leads/register", () => {
    const content = readFileSync(leadFormPath, "utf-8");
    expect(content).toContain("whatsapp_verified: waVerified");
    expect(content).toContain("email_verified: emailVerified");
  });
});
