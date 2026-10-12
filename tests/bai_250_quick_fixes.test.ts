import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

describe("BAI-250: Quick UX & Narrative Fixes", () => {
  const rootDir = path.resolve(__dirname, "..");

  it("no debe contener referencias a '365 días' o '365D' en la narrativa de membresía VIP", () => {
    const filesToCheck = [
      "src/components/VipCheckout.astro",
      "src/pages/corset/checkout.astro",
      "src/pages/the-corset-society/index.astro",
      "src/pages/corset-vip.astro",
    ];

    for (const f of filesToCheck) {
      const content = fs.readFileSync(path.join(rootDir, f), "utf-8");
      expect(content).not.toContain("365 días");
      expect(content).not.toContain("365 Días");
      expect(content).not.toContain("365D");
    }
  });

  it("debe contener el enlace hacia edición de alias (#section-custom-code) y ajustes de perfil en el dashboard", () => {
    const content = fs.readFileSync(path.join(rootDir, "src/pages/dashboard.astro"), "utf-8");
    expect(content).toContain('href="#section-custom-code"');
    expect(content).toContain('Editar alias de enlace / referido →');
    expect(content).toContain('href="#section-profile-settings"');
  });

  it("debe contener 'Descuento Embajador' con fondo oscuro de alto contraste en el tag de precio VIP", () => {
    const content = fs.readFileSync(path.join(rootDir, "src/pages/dashboard.astro"), "utf-8");
    expect(content).toContain("Descuento Embajador");
    expect(content).toContain("bg-[#0a0608]");
    expect(content).toContain("text-[#81c784]");
  });

  it("debe tener botón visible de Dashboard / Panel en los headers de the-corset-society", () => {
    const headerContent = fs.readFileSync(path.join(rootDir, "src/components/CorsetHeader.astro"), "utf-8");
    expect(headerContent).toContain('href="/dashboard"');
    expect(headerContent).toContain("Panel");
  });

  it("debe mostrar emoji de Posible VIP (🤴) en el Directorio Unificado de adminn", () => {
    const content = fs.readFileSync(path.join(rootDir, "src/pages/adminn/index.astro"), "utf-8");
    expect(content).toContain("🤴");
  });

  it("no debe contener la opción alucinada de taller de parejas en el modal de tickets de adminn", () => {
    const content = fs.readFileSync(path.join(rootDir, "src/pages/adminn/index.astro"), "utf-8");
    expect(content).not.toContain("centro_cultural_taller");
    expect(content).not.toContain("Taller de Parejas");
  });

  it("debe soportar comandos permanentes #stop/#off/#silencio/#desactivar en el bot de WhatsApp", () => {
    const workerPath = "/var/www/whatsappbot/src/index.ts";
    const targetFile = fs.existsSync(workerPath) ? workerPath : path.join(rootDir, "src/pages/api/webhooks/whatsapp.ts");
    const content = fs.readFileSync(targetFile, "utf-8");
    expect(content).toContain("#stop");
    expect(content).toContain("#off");
  });
});
