import { describe, expect, test } from "bun:test";
import {
  buildDynamicSystemPrompt,
  getBogotaDateInfo,
  getActiveEvents,
} from "../src/services/bot-knowledge";
import {
  isHumanTakeover,
  setHumanTakeover,
  clearHumanTakeover,
} from "../src/services/session";

describe("1. Grounding de Rutas Web y Eliminación de 404s", () => {
  test("los eventos vigentes usan exclusivamente rutas reales de Astro", () => {
    const { isoDate } = getBogotaDateInfo();
    const events = getActiveEvents(isoDate);

    for (const ev of events) {
      expect(ev.url).not.toBe("https://elplacerdecompartir.com/sitio");
      expect(ev.url).not.toBe("https://elplacerdecompartir.com/the-corset-society/impacto-10-oct");
      if (ev.id === "sitio-9-oct") {
        expect(ev.url).toBe("https://elplacerdecompartir.com/eventos/sitio-9-oct");
      }
      if (ev.id === "impacto-10-oct") {
        expect(ev.url).toBe("https://elplacerdecompartir.com/eventos/impacto-10-oct");
      }
      if (ev.id === "luna-llena-31-oct") {
        expect(ev.url).toBe("https://elplacerdecompartir.com/the-corset-society/luna-llena#reservas");
      }
    }
  });

  test("el programa de embajadores apunta a /dashboard y no al inexistente /embajadores", () => {
    const prompt = buildDynamicSystemPrompt();
    expect(prompt).toContain("https://elplacerdecompartir.com/dashboard");
    expect(prompt).not.toContain("https://elplacerdecompartir.com/embajadores");
  });
});

describe("2. Blindaje Cultural y Erradicación del Término 'Anfitriona'", () => {
  test("el System Prompt no se autodefine como Anfitrión y define claramente el rol del equipo", () => {
    const prompt = buildDynamicSystemPrompt();
    expect(prompt).not.toContain("Eres el Anfitrión");
    expect(prompt).toContain("facilitadores/as éticos, curadores de experiencia y artistas");
    expect(prompt).toContain("NO existen \"anfitrionas\"");
  });

  test("el System Prompt prohíbe explícitamente inventar rutas o links fuera de la lista", () => {
    const prompt = buildDynamicSystemPrompt();
    expect(prompt).toContain("VERDAD WEB IRREFUTABLE (ZERO 404)");
    expect(prompt).toContain("TUTEO OBLIGATORIO");
  });
});

describe("3. Resolución de Identificadores Múltiples (Phone + LID) en Intervención Humana", () => {
  const testPhone = "573109998877";
  const testLid = "82747628478683";

  test("setHumanTakeover con array bloquea tanto el teléfono como el LID", async () => {
    await clearHumanTakeover([testPhone, testLid]);
    expect(await isHumanTakeover(testPhone)).toBe(false);
    expect(await isHumanTakeover(testLid)).toBe(false);

    // Activar takeover para ambos identificadores de la conversación
    await setHumanTakeover([testPhone, testLid], 7200);

    // Ambas representaciones deben estar en takeover
    expect(await isHumanTakeover(testPhone)).toBe(true);
    expect(await isHumanTakeover(testLid)).toBe(true);

    // isHumanTakeover con array debe retornar true
    expect(await isHumanTakeover([testPhone, testLid])).toBe(true);

    // Limpiar ambos
    await clearHumanTakeover([testPhone, testLid]);
    expect(await isHumanTakeover(testPhone)).toBe(false);
    expect(await isHumanTakeover(testLid)).toBe(false);
  });
});
