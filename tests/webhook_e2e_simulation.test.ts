import { describe, expect, test } from "bun:test";
import { POST } from "../src/pages/api/webhooks/whatsapp";
import {
  isHumanTakeover,
  clearHumanTakeover,
  getSessionHistory,
} from "../src/services/session";

describe("Webhook End-to-End Simulation: Human Takeover & Quoted Context", () => {
  const customerPhone = "573104722959";
  const customerLid = "149817787465897";
  const operatorLid = "82747628478683";

  test("1. Operador envía 'Dime?' desde su celular (fromMe=true): bloquea al cliente por 2 horas", async () => {
    // Limpiar estado previo
    await clearHumanTakeover([customerPhone, customerLid]);
    expect(await isHumanTakeover(customerPhone)).toBe(false);

    // Payload de Evolution Go cuando el operador envía un mensaje desde su teléfono
    const operatorPayload = {
      event: "messages.upsert",
      data: {
        key: {
          remoteJid: `${customerPhone}@s.whatsapp.net`,
          fromMe: true,
          id: "3EB0OPTEST12345",
        },
        info: {
          Chat: `${customerPhone}@s.whatsapp.net`,
          Sender: `${operatorLid}@lid`,
          IsFromMe: true,
        },
        message: {
          conversation: "Dime?",
        },
      },
    };

    const req = new Request("http://localhost:3000/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(operatorPayload),
    });

    const res = await POST({ request: req } as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("human_takeover_updated");

    // Atestar que el CLIENTE quedó en takeover (NO el operador)
    expect(await isHumanTakeover(customerPhone)).toBe(true);
  });

  test("2. Cliente responde 'Que': el webhook lo silencia por takeover activo", async () => {
    // Cliente envía mensaje mientras el operador intervino
    const customerPayload = {
      event: "messages.upsert",
      data: {
        key: {
          remoteJid: `${customerPhone}@s.whatsapp.net`,
          fromMe: false,
          id: "3EB0CUST12345",
        },
        info: {
          Chat: `${customerPhone}@s.whatsapp.net`,
          Sender: `${customerPhone}@s.whatsapp.net`,
          IsFromMe: false,
        },
        message: {
          conversation: "Que",
        },
      },
    };

    const req = new Request("http://localhost:3000/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(customerPayload),
    });

    const res = await POST({ request: req } as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    // Atestación: Silencio total del bot
    expect(json.status).toBe("ignored_human_takeover_active");
  });

  test("3. Operador envía '#bot': reactiva inmediatamente el bot para el cliente", async () => {
    const unblockPayload = {
      event: "messages.upsert",
      data: {
        key: {
          remoteJid: `${customerPhone}@s.whatsapp.net`,
          fromMe: true,
          id: "3EB0UNBLOCK",
        },
        info: {
          Chat: `${customerPhone}@s.whatsapp.net`,
          Sender: `${operatorLid}@lid`,
          IsFromMe: true,
        },
        message: {
          conversation: "#bot",
        },
      },
    };

    const req = new Request("http://localhost:3000/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(unblockPayload),
    });

    const res = await POST({ request: req } as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("human_takeover_updated");

    // Atestar que el cliente ya NO está en takeover
    expect(await isHumanTakeover(customerPhone)).toBe(false);
  });

  test("4. Cliente cita mensaje ('Y sobre esto?'): el webhook extrae el quotedMessage", async () => {
    const quotedPayload = {
      event: "messages.upsert",
      data: {
        key: {
          remoteJid: `${customerPhone}@s.whatsapp.net`,
          fromMe: false,
          id: "3EB0QUOTE123",
        },
        info: {
          Chat: `${customerPhone}@s.whatsapp.net`,
          Sender: `${customerPhone}@s.whatsapp.net`,
          IsFromMe: false,
        },
        message: {
          extendedTextMessage: {
            text: "Y sobre esto?",
            contextInfo: {
              quotedMessage: {
                conversation: "Parece que tu mensaje se cortó. ¿En qué te puedo ayudar?",
              },
            },
          },
        },
      },
    };

    const req = new Request("http://localhost:3000/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quotedPayload),
    });

    const res = await POST({ request: req } as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("processed");
  });

  test("5. Contexto continuo: Valkey preserva lo hablado por operador y cliente durante el takeover", async () => {
    const history = await getSessionHistory(customerPhone, 10);
    const contents = history.map((m) => m.content);

    // Debe contener el mensaje del operador humano
    expect(contents.some((c) => c.includes("[Operador humano]: Dime?"))).toBe(true);

    // Debe contener la respuesta del cliente durante el takeover
    expect(contents.some((c) => c.includes("Que"))).toBe(true);
  });

  test("6. Nota de voz: webhook detecta audioMessage y ejecuta transcripción STT", async () => {
    const audioPayload = {
      event: "messages.upsert",
      data: {
        key: {
          remoteJid: `${customerPhone}@s.whatsapp.net`,
          fromMe: false,
          id: "3EB0AUDIO123",
        },
        info: {
          Chat: `${customerPhone}@s.whatsapp.net`,
          Sender: `${customerPhone}@s.whatsapp.net`,
          IsFromMe: false,
        },
        message: {
          audioMessage: {
            mimetype: "audio/ogg; codecs=opus",
            seconds: 3,
            base64: "T2dnUwACAAAAAAAAAAAAAAAARwAAAAAAAP8AAAA=",
          },
        },
      },
    };

    const req = new Request("http://localhost:3000/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(audioPayload),
    });

    const res = await POST({ request: req } as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(["processed", "audio_fallback_sent"]).toContain(json.status);
  });
});

