import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("BAI-248: Luna Llena — Link Segmentation, Payment Anchor & Mobile Responsive", () => {
  const lunaLlenaPath = resolve(process.cwd(), "src/pages/the-corset-society/luna-llena.astro");
  const botKnowledgePath = resolve(process.cwd(), "src/services/bot-knowledge.ts");
  const corsetIndexPath = resolve(process.cwd(), "src/pages/the-corset-society/index.astro");
  const dashboardPath = resolve(process.cwd(), "src/pages/dashboard.astro");

  it("should remove 'Activo' from ambassador discount banner in luna-llena.astro", () => {
    const content = readFileSync(lunaLlenaPath, "utf-8");
    expect(content.includes("Beneficio de Embajador Activo")).toBe(false);
    expect(content.includes("Beneficio de Embajador")).toBe(true);
  });

  it("should have removed role-filter-banner and have role-switch-container directly below tier cards", () => {
    const content = readFileSync(lunaLlenaPath, "utf-8");
    expect(content.includes('id="role-filter-banner"')).toBe(false);
    expect(content.includes('id="role-switch-container"')).toBe(true);
    expect(content.includes('¿Deseas asistir en otra modalidad?')).toBe(true);
  });

  it("should link to dashboard profile settings anchor in '¿Tu configuración de perfil cambió?'", () => {
    const content = readFileSync(lunaLlenaPath, "utf-8");
    expect(content).toContain('href="/dashboard#section-profile-settings"');
    expect(content).toContain('Cambiar rol en mi Perfil →');
  });

  it("should provide clean luna-llena URL without anchor in bot knowledge", () => {
    const content = readFileSync(botKnowledgePath, "utf-8");
    expect(content).toContain('reserve_url: "https://elplacerdecompartir.com/the-corset-society/luna-llena"');
  });

  it("should provide clean links to luna-llena in landing and dashboard without forcing anchor jump", () => {
    const corsetContent = readFileSync(corsetIndexPath, "utf-8");
    expect(corsetContent).toContain('href="/the-corset-society/luna-llena"');
    expect(corsetContent).not.toContain('href="/the-corset-society/luna-llena#reservas"');

    const dashboardContent = readFileSync(dashboardPath, "utf-8");
    expect(dashboardContent).toContain('href="/the-corset-society/luna-llena"');
    expect(dashboardContent).not.toContain('href="/the-corset-society/luna-llena#reservas"');
  });

  it("should include dashboard button in corset headers and profile settings link in luna-llena", () => {
    const headerContent = readFileSync(resolve(process.cwd(), "src/components/CorsetHeader.astro"), "utf-8");
    expect(headerContent).toContain('href="/dashboard"');
    const lunaContent = readFileSync(lunaLlenaPath, "utf-8");
    expect(lunaContent).toContain('href="/dashboard#section-profile-settings"');
  });
});
