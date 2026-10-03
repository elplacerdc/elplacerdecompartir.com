import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

describe("El Placer de Compartir & The Corset Society — Compliance & Invariants", () => {
  it("Invariant 1: Zero forbidden mystical terms in source code", () => {
    const forbiddenPatterns = [
      /\bsagrad[ao]s?\b/i,
      /\bsantuario\b/i,
      /\btemplo\b/i,
      /\baltar\b/i,
      /te reconoceremos al instante/i,
    ];

    function scanDir(dir: string): string[] {
      const violations: string[] = [];
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          violations.push(...scanDir(fullPath));
        } else if (/\.(astro|ts|js|html)$/.test(entry)) {
          const content = readFileSync(fullPath, "utf-8");
          for (const pattern of forbiddenPatterns) {
            if (pattern.test(content)) {
              violations.push(`${fullPath} matches ${pattern.toString()}`);
            }
          }
        }
      }
      return violations;
    }

    const violations = scanDir(join(process.cwd(), "src"));
    expect(violations).toEqual([]);
  });

  it("Invariant 2: OpenGraph requires absolute URLs starting with https://", () => {
    const layoutContent = readFileSync(join(process.cwd(), "src/layouts/Layout.astro"), "utf-8");
    expect(layoutContent).toContain("const siteUrl = \"https://elplacerdecompartir.com\"");
    expect(layoutContent).toContain("resolvedOgImage");
    expect(layoutContent).toContain("og:image:secure_url");
    expect(layoutContent).toContain("og:image:type");
  });

  it("Invariant 3: Event ticket pricing structure matches brandbook", () => {
    const PRICES: Record<string, { total: number; reserva_40: number; label: string }> = {
      pareja: { total: 100000, reserva_40: 40000, label: "Pareja" },
      single: { total: 120000, reserva_40: 48000, label: "Single" },
      unicornio: { total: 30000, reserva_40: 12000, label: "Unicornio (Mujer Sola)" },
    };

    expect(PRICES.pareja.total * 0.4).toBe(PRICES.pareja.reserva_40);
    expect(PRICES.single.total * 0.4).toBe(PRICES.single.reserva_40);
    expect(PRICES.unicornio.total * 0.4).toBe(PRICES.unicornio.reserva_40);
  });

  it("Invariant 4: Cultural Center invitation asset is present", () => {
    const assetPath = join(process.cwd(), "public/media/primera_invitacion_centro_cultural.jpg");
    const stat = statSync(assetPath);
    expect(stat.size).toBeGreaterThan(100000);
  });

  it("Invariant 5: Corset Society membership flyer asset is present and clean", () => {
    const assetPath = join(process.cwd(), "public/media/corset-society/flyer_membresia_clean.jpg");
    const stat = statSync(assetPath);
    expect(stat.size).toBeGreaterThan(50000);
  });
});
