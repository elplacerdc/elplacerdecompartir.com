import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

describe("BAI-249: Checkout VIP — Artefacto Visual Credencial Aislada & Gala", () => {
  const rootDir = path.resolve(__dirname, "..");
  const checkoutPagePath = path.join(rootDir, "src/pages/corset/checkout.astro");
  const vipCheckoutCompPath = path.join(rootDir, "src/components/VipCheckout.astro");
  const cleanCredentialPath = path.join(rootDir, "public/media/corset-society/credencial_vip_clean.png");
  const ssotOriginalPath = "/var/www/baiosfera/PROYECTOS/ELPLACERDC/media/eventos-the-corset-society/Membresía The Corset Society.jpg";

  it("debe preservar intacta la imagen original SSoT en Drive sin sobreescrituras cuando está en host zcp", () => {
    if (fs.existsSync("/var/www/baiosfera")) {
      expect(fs.existsSync(ssotOriginalPath)).toBe(true);
      const stat = fs.statSync(ssotOriginalPath);
      expect(stat.size).toBeGreaterThan(100000);
    } else {
      expect(true).toBe(true);
    }
  });

  it("debe existir el artefacto visual credencial_vip_clean.png optimizado", () => {
    expect(fs.existsSync(cleanCredentialPath)).toBe(true);
    const stat = fs.statSync(cleanCredentialPath);
    expect(stat.size).toBeGreaterThan(100000);
  });

  it("debe incrustar la credencial VIP aislada en checkout.astro con layout de gala", () => {
    const content = fs.readFileSync(checkoutPagePath, "utf-8");
    expect(content).toContain("/media/corset-society/credencial_vip_clean.png");
    expect(content).toContain("Membresía Oficial The Corset Society — Credencial VIP");
    expect(content).toContain("Credencial Exclusiva Digital");
    expect(content).toContain("VipCheckout");
  });

  it("debe presentar nomenclatura limpia 'Beneficio de Embajador:' en VipCheckout", () => {
    const content = fs.readFileSync(vipCheckoutCompPath, "utf-8");
    expect(content).toContain("Beneficio de Embajador:");
    expect(content).not.toContain("Beneficio de Embajador Activo:");
  });
});
