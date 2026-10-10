import { describe, expect, it } from "bun:test";
import {
  buildDynamicSystemPrompt,
  getBogotaDateInfo,
  getActiveEvents,
} from "../src/services/bot-knowledge";

describe("Bot Knowledge & Temporal Awareness", () => {
  it("computes current date in America/Bogota (UTC-5)", () => {
    const dateInfo = getBogotaDateInfo();
    expect(dateInfo.isoDate).toBeDefined();
    expect(dateInfo.readableText).toBeDefined();
    expect(dateInfo.isoDate.length).toBe(10); // YYYY-MM-DD
  });

  it("filters out past events and preserves active ones", () => {
    const activeEvents = getActiveEvents("2026-10-09");
    const eventIds = activeEvents.map((e) => e.id);
    expect(eventIds).toContain("sitio-9-oct");
    expect(eventIds).toContain("impacto-10-oct");
    expect(eventIds).toContain("luna-llena-31-oct");
  });

  it("builds a system prompt with tuteo, permanent venue and dynamic context", () => {
    const prompt = buildDynamicSystemPrompt({
      senderName: "Andrés",
      isAffiliateEligible: true,
    });

    // Invariante: Tuteo obligatorio
    expect(prompt).toContain('TUTEO OBLIGATORIO ("TÚ")');
    expect(prompt).toContain('Jamás uses "usted"');

    // Invariante: Centro Cultural ubicación permanente
    expect(prompt).toContain("Calle 67 # 23-46");
    expect(prompt).toContain("Centro Cultural El Placer DC");

    // Invariante: Eventos vigentes
    expect(prompt).toContain("sitio");
    expect(prompt).toContain("Impacto Producciones");
    expect(prompt).toContain("The Corset Society");

    // Invariante: Pasarelas activas
    expect(prompt).toContain("dLocal Go");

    // Invariante: Programa de embajadores
    expect(prompt).toContain("PROGRAMA DE EMBAJADORES");
    expect(prompt).toContain("Por cada 3 compras de eventos pagos");
  });
});
