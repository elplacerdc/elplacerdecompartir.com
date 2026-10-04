import type { APIRoute } from "astro";
import { sendEvolutionWhatsApp } from "../../../services/notifications";

const BIFROST_URL = process.env.BIFROST_URL || "http://bifrost:8080/v1";
const BOT_PHONE = "573021004070";

const SYSTEM_PROMPT = `Eres el Concierge Oficial de 'El Placer de Compartir' y 'The Corset Society' en Bogotá, Colombia.
Tu tono es sofisticado, cálido, discreto, elegante y profesional. Estás atendiendo por WhatsApp oficial.

Directrices de Marca:
1. 'The Corset Society': Círculo privado de gala noir, misterio y ticket alto.
   - Próxima velada privada: 'Noche de Luna Llena — Máscarada en el Bosque' el Sábado 31 de Octubre de 2026 en Bogotá (8:00 P.M. — 4:00 A.M.).
   - Dress code: Máscara obligatoria / Noir Fantasy. Locación secreta revelada 24h antes.
   - Opciones de acceso: Pases individuales, parejas y mesas VIP exclusivas. Se permite reservar con el 40% de separación.
   - Enlace oficial de reservas: https://elplacerdecompartir.com/the-corset-society/luna-llena

2. 'El Placer de Compartir': Comunidad de erotismo consciente, consentimiento lúcido y exploración relacional sin presiones.
   - Nuevo Centro Cultural en Bogotá: Espacio físico para talleres vivenciales de parejas, masajes tántricos, BDSM ético y experiencias sensoriales.
   - Enlace oficial: https://elplacerdecompartir.com y https://elplacerdecompartir.com/centro-cultural

Invariantes de Respuesta:
- Respuestas breves, naturales y directas para WhatsApp (máximo 2 párrafos concisos).
- NUNCA uses la palabra 'mayordomía'; refiérete siempre a 'Concierge Oficial', 'Protocolo' o 'Dirección'.
- Si preguntan por precios, entradas o fechas, proporciona la información con elegancia y comparte el enlace de reserva.
- Utiliza formato sutil de WhatsApp con asteriscos para negritas (ej: *The Corset Society*).`;

export const POST: APIRoute = async ({ request }) => {
  try {
    const rawBody = await request.text();
    if (!rawBody || rawBody.trim() === "") {
      return new Response(JSON.stringify({ status: "ignored_empty" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. Extraer emisor y mensaje soportando firmas de Evolution Go (whatsmeow) y Baileys
    const eventData = payload.data || payload;
    const info = eventData.Info || eventData.info || {};
    const key = eventData.key || {};
    const fromMe = Boolean(info.IsFromMe ?? info.isFromMe ?? key.fromMe ?? payload.fromMe ?? eventData.fromMe ?? false);
    const remoteJid = String(
      info.Chat ||
      info.Sender ||
      eventData.Chat ||
      eventData.Sender ||
      key.remoteJid ||
      payload.remoteJid ||
      eventData.remoteJid ||
      payload.sender ||
      ""
    );

    // Ignorar mensajes enviados por nosotros mismos o de grupos
    if (fromMe || !remoteJid || remoteJid.includes("@g.us") || remoteJid.includes("status@broadcast")) {
      return new Response(JSON.stringify({ status: "ignored_self_or_group" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const cleanSenderDigits = remoteJid.replace(/@.*$/, "").replace(/\D/g, "");
    if (!cleanSenderDigits || cleanSenderDigits === BOT_PHONE) {
      return new Response(JSON.stringify({ status: "ignored_bot_sender" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Extraer texto del mensaje (soporta mayúsculas de Go structs: Message.conversation)
    const msgObj = eventData.Message || eventData.message || payload.message || {};
    const messageText =
      msgObj.conversation ||
      msgObj.extendedTextMessage?.text ||
      eventData.text ||
      payload.text ||
      "";

    if (!messageText || messageText.trim() === "") {
      return new Response(JSON.stringify({ status: "ignored_no_text" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const senderName = info.PushName || eventData.pushName || payload.pushName || "Invitado(a)";

    // 2. Procesamiento asíncrono con Bifrost LLM para responder sin bloquear el webhook
    (async () => {
      try {
        const bifrostResponse = await fetch(`${BIFROST_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "deepseek/deepseek-chat",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: `Mensaje de WhatsApp recibido de ${senderName} (+${cleanSenderDigits}): "${messageText}"`,
              },
            ],
            temperature: 0.7,
            max_tokens: 450,
          }),
        });

        if (!bifrostResponse.ok) {
          console.error(`[WhatsApp Bot] Bifrost returned HTTP ${bifrostResponse.status}`);
          return;
        }

        const completion = await bifrostResponse.json();
        const replyText = completion.choices?.[0]?.message?.content;

        if (replyText && replyText.trim()) {
          await sendEvolutionWhatsApp(cleanSenderDigits, replyText.trim());
        }
      } catch (err: any) {
        console.error("[WhatsApp Bot] Error generating or sending reply:", err.message);
      }
    })();

    return new Response(JSON.stringify({ status: "processed" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[WhatsApp Webhook Err]:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
