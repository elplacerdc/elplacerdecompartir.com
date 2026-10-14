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

  it("debe unificar checkout en corset-vip.astro y redirigir 301 limpiamente desde checkout.astro", () => {
    const checkoutContent = fs.readFileSync(checkoutPagePath, "utf-8");
    expect(checkoutContent).toContain('Astro.redirect("/corset-vip#vip-checkout-box", 301)');

    const corsetVipPath = path.join(rootDir, "src/pages/corset-vip.astro");
    const vipContent = fs.readFileSync(corsetVipPath, "utf-8");
    expect(vipContent).toContain("VipCheckout");
    expect(vipContent).toContain("credencial-vip-checkout.jpg");
    expect(vipContent).toContain("vip-checkout-box");
  });

  it("debe presentar nomenclatura limpia 'Beneficio de Embajador:' en VipCheckout", () => {
    const content = fs.readFileSync(vipCheckoutCompPath, "utf-8");
    expect(content).toContain("Beneficio de Embajador:");
    expect(content).not.toContain("Beneficio de Embajador Activo:");
  });
});
