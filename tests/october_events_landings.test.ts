import { describe, it, expect } from "bun:test";
import fs from "fs";
import path from "path";
import { CULTURAL_EVENTS } from "../src/data/events";

describe("October 23 & 24 Landings & OpenGraph Invariants", () => {
  it("CULTURAL_EVENTS includes Friday 23 and Saturday 24 with valid links", () => {
    const v23 = CULTURAL_EVENTS.find((e) => e.slug === "viernes-23-oct");
    const s24 = CULTURAL_EVENTS.find((e) => e.slug === "sabado-24-oct");

    expect(v23).toBeDefined();
    expect(v23?.link).toBe("/eventos/viernes-23-oct");
    expect(v23?.image).toBe("/media/eventos-elplacerdc/elplacerdc-viernes-23.jpg");

    expect(s24).toBeDefined();
    expect(s24?.link).toBe("/eventos/sabado-24-oct");
    expect(s24?.image).toBe("/media/eventos-elplacerdc/elplacerdc-sabado-24.jpg");
  });

  it("Landing files exist and contain proper OpenGraph metadata and payment tiers", () => {
    const v23Path = path.resolve(process.cwd(), "src/pages/eventos/viernes-23-oct.astro");
    const s24Path = path.resolve(process.cwd(), "src/pages/eventos/sabado-24-oct.astro");

    expect(fs.existsSync(v23Path)).toBe(true);
    expect(fs.existsSync(s24Path)).toBe(true);

    const v23Content = fs.readFileSync(v23Path, "utf-8");
    const s24Content = fs.readFileSync(s24Path, "utf-8");

    // Friday 23 checks
    expect(v23Content).toContain("og-viernes-23-oct.jpg");
    expect(v23Content).toContain("15.000");
    expect(v23Content).toContain("60.000");
    expect(v23Content).toContain("Solo Cover");
    expect(v23Content).toContain("Todo en Consumo");
    expect(v23Content).toContain("Pagar en Puerta");
    expect(v23Content).toContain('value="viernes_23"');

    // Saturday 24 checks
    expect(s24Content).toContain("og-sabado-24-oct.jpg");
    expect(s24Content).toContain("15.000");
    expect(s24Content).toContain("55.000");
    expect(s24Content).toContain("Solo Cover");
    expect(s24Content).toContain("Todo en Consumo");
    expect(s24Content).toContain("Pagar en Puerta");
    expect(s24Content).toContain("Camas Francas");
    expect(s24Content).toContain("Lencería");
    expect(s24Content).toContain('value="sabado_24"');
  });

  it("OpenGraph images strictly meet WhatsApp <300KB budget invariant", () => {
    const publicMediaDir = path.resolve(process.cwd(), "public/media/eventos-elplacerdc");
    const ogFriday = path.join(publicMediaDir, "og-viernes-23-oct.jpg");
    const ogSaturday = path.join(publicMediaDir, "og-sabado-24-oct.jpg");
    const flyerFriday = path.join(publicMediaDir, "elplacerdc-viernes-23.jpg");
    const flyerSaturday = path.join(publicMediaDir, "elplacerdc-sabado-24.jpg");

    expect(fs.existsSync(ogFriday)).toBe(true);
    expect(fs.existsSync(ogSaturday)).toBe(true);
    expect(fs.existsSync(flyerFriday)).toBe(true);
    expect(fs.existsSync(flyerSaturday)).toBe(true);

    const ogFridayStats = fs.statSync(ogFriday);
    const ogSaturdayStats = fs.statSync(ogSaturday);

    // WhatsApp drops rich link previews if OG image is >= 300KB (307,200 bytes)
    expect(ogFridayStats.size).toBeLessThan(300 * 1024);
    expect(ogSaturdayStats.size).toBeLessThan(300 * 1024);
  });
});
