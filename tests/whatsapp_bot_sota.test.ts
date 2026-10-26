import { describe, expect, test } from "bun:test";
import {
  buildDynamicSystemPrompt,
  getBogotaDateInfo,
  getActiveEvents,
  sanitizeAndValidateUrls,
  sanitizeTone,
  isBriefAcknowledgement,
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
      if (ev.id === "sitio-9-oct") {
        expect(ev.url).toBe("https://elplacerdecompartir.com/eventos/sitio-9-oct");
      }
      if (ev.id === "impacto-10-oct") {
        expect(ev.url).toBe("https://elplacerdecompartir.com/eventos/impacto-10-oct");
      }
      if (ev.id === "luna-llena-31-oct") {
        expect(ev.url.startsWith("https://elplacerdecompartir.com/the-corset-society/luna-llena")).toBe(true);
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
  const testPhone = "570009998877";
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

describe("4. Validador de URLs Pre-Envío (Cero 404s)", () => {
  test("reescribe rutas inventadas o alias a rutas canónicas existentes", () => {
    const rawText = "Puedes revisar el evento en https://elplacerdecompartir.com/sitio y https://elplacerdecompartir.com/the-corset-society/impacto-10-oct";
    const validated = sanitizeAndValidateUrls(rawText);
    expect(validated).toContain("https://elplacerdecompartir.com/eventos/sitio-9-oct");
    expect(validated).toContain("https://elplacerdecompartir.com/eventos/impacto-10-oct");
  });

  test("mapea enlaces de embajador o afiliados a /dashboard", () => {
    const rawText = "Gana entradas en https://elplacerdecompartir.com/embajadores o https://elplacerdecompartir.com/afiliados";
    const validated = sanitizeAndValidateUrls(rawText);
    expect(validated).toBe("Gana entradas en https://elplacerdecompartir.com/dashboard o https://elplacerdecompartir.com/dashboard");
  });

  test("rutas completamente inexistentes hacen fallback seguro a la home sin 404", () => {
    const rawText = "Mira los detalles en https://elplacerdecompartir.com/ruta-ficticia-alucinada-123";
    const validated = sanitizeAndValidateUrls(rawText);
    expect(validated).toBe("Mira los detalles en https://elplacerdecompartir.com");
  });
});

describe("5. Sanitizador de Tono y Blindaje Cultural", () => {
  test("reemplaza anfitrionas por facilitadoras y anfitriones éticos", () => {
    const rawText = "En el evento habrá anfitrionas que te recibirán.";
    const cleaned = sanitizeTone(rawText);
    expect(cleaned).toBe("En el evento habrá facilitadoras y anfitriones éticos que te recibirán.");
  });

  test("erradica términos de excesiva familiaridad", () => {
    const rawText = "Hola mi amor, te cuento que el evento es increíble.";
    const cleaned = sanitizeTone(rawText);
    expect(cleaned).toBe("Hola , te cuento que el evento es increíble.");
  });
});

describe("6. Regla de Silencio Transaccional ante Acuses de Recibo", () => {
  test("reconoce acuses de recibo breves para silenciar el bot", () => {
    expect(isBriefAcknowledgement("Ok")).toBe(true);
    expect(isBriefAcknowledgement("gracias")).toBe(true);
    expect(isBriefAcknowledgement("muchas gracias")).toBe(true);
    expect(isBriefAcknowledgement("Listo")).toBe(true);
    expect(isBriefAcknowledgement("dale")).toBe(true);
    expect(isBriefAcknowledgement("perfecto!")).toBe(true);
    expect(isBriefAcknowledgement("ok gracias")).toBe(true);
    expect(isBriefAcknowledgement("entendido")).toBe(true);
  });

  test("mensajes con preguntas o solicitudes reales no activan silencio", () => {
    expect(isBriefAcknowledgement("¿A qué hora empieza el evento?")).toBe(false);
    expect(isBriefAcknowledgement("gracias, pero cómo compro la boleta?")).toBe(false);
    expect(isBriefAcknowledgement("quiero ser embajador")).toBe(false);
  });
});
