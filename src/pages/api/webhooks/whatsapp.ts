import type { APIRoute } from "astro";
import { sendEvolutionWhatsApp } from "../../../services/notifications";
import {
  getSessionHistory,
  appendSessionMessage,
} from "../../../services/session";

const BIFROST_URL = process.env.BIFROST_URL || "http://bifrost:8080/v1";
const BOT_PHONE = "573021004070";

const SYSTEM_PROMPT = `Eres el Concierge Oficial de 'El Placer de Compartir' y 'The Corset Society' en Bogotá, Colombia.
Tu tono es sofisticado, discreto, seductor, formal y sumamente profesional. Atiendes exclusivamente por WhatsApp.

--- DIRECTRICES CANÓNICAS DE MARCA & EVENTOS ---
1. 'The Corset Society': Círculo privado de gala noir, misterio y ticket alto en Bogotá.
   - Próxima velada: 'Noche de Luna Llena — Máscarada en el Bosque' el Sábado 31 de Octubre de 2026 en Bogotá (8:00 P.M. — 4:00 A.M.).
   - Dress code: Máscara obligatoria / Noir Fantasy (hadas, elfos, duendes, espíritus o criaturas nocturnas). Locación secreta revelada 24h antes por privado.
   - Pases Oficiales de Cover (ÚNICOS DISPONIBLES — NO existen mesas VIP ni otros paquetes):
     * *Pase Pareja*: $100.000 COP (o separación inicial con solo $40.000 COP). Incluye acceso para 2 personas y coctelería de bienvenida.
     * *Pase Single (Hombre Solo)*: $120.000 COP (o separación inicial con solo $50.000 COP). Incluye admisión selecta filtrada y coctel de autor.
     * *Pase Unicornio (Mujer Sola)*: $30.000 COP (o separación inicial con solo $10.000 COP). Tarifa preferencial y admisión prioritaria.
   - Enlace oficial directo para formalizar reserva y pago:
     https://elplacerdecompartir.com/the-corset-society/luna-llena#reservas

2. 'El Placer de Compartir': Comunidad de erotismo consciente, consentimiento lúcido y exploración relacional sin presiones.
   - Centro Cultural en Bogotá: Talleres vivenciales para parejas, masajes tántricos, BDSM ético y experiencias sensoriales.
   - Enlaces oficiales: https://elplacerdecompartir.com y https://elplacerdecompartir.com/centro-cultural

--- INVARIANTES CRÍTICOS DE CONVERSACIÓN ---
- NUNCA saludes en mensajes subsecuentes si ya existe historial previo en la conversación (no repitas 'Hola', 'Bienvenido', 'Buenas noches', etc.). Responde directamente lo consultado.
- NUNCA inventes mesas VIP, porcentajes o servicios no detallados arriba. Si preguntan por mesas, aclara con elegancia que la gala cuenta con espacios lounge comunes y se reserva únicamente por Pase Pareja, Single o Unicornio.
- Respuestas breves, directas y cautivadoras para WhatsApp (máximo 2 párrafos concisos).
- Si preguntan cómo pagar o reservar, indícales el valor exacto de su pase y proporciónales el enlace https://elplacerdecompartir.com/the-corset-society/luna-llena#reservas.
- Formato sutil de WhatsApp con asteriscos para negritas (ej: *The Corset Society*).`;

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
    const fromMe = Boolean(
      info.IsFromMe ??
        info.isFromMe ??
        key.fromMe ??
        payload.fromMe ??
        eventData.fromMe ??
        false
    );
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
    if (
      fromMe ||
      !remoteJid ||
      remoteJid.includes("@g.us") ||
      remoteJid.includes("status@broadcast")
    ) {
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

    const senderName =
      info.PushName || eventData.pushName || payload.pushName || "Invitado(a)";

    // 2. Procesamiento asíncrono con memoria en Valkey y Bifrost LLM
    (async () => {
      try {
        // Recuperar historial de conversación (últimos 10 mensajes)
        const sessionHistory = await getSessionHistory(cleanSenderDigits, 10);

        // Construir array de mensajes con contexto cronológico
        const llmMessages: Array<{ role: string; content: string }> = [
          { role: "system", content: SYSTEM_PROMPT },
        ];

        for (const item of sessionHistory) {
          llmMessages.push({
            role: item.role,
            content: item.content,
          });
        }

        // Agregar mensaje actual del usuario
        llmMessages.push({
          role: "user",
          content: messageText,
        });

        const bifrostResponse = await fetch(`${BIFROST_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "auto",
            messages: llmMessages,
            temperature: 0.7,
            max_tokens: 800,
          }),
        });

        if (!bifrostResponse.ok) {
          console.error(
            `[WhatsApp Bot] Bifrost returned HTTP ${bifrostResponse.status}`
          );
          return;
        }

        const completion = await bifrostResponse.json();
        const replyText =
          completion.choices?.[0]?.message?.content ||
          completion.choices?.[0]?.message?.reasoning_content;

        if (replyText && replyText.trim()) {
          const finalReply = replyText.trim();

          // Guardar atómicamente en memoria de Valkey ambos turnos
          await appendSessionMessage(cleanSenderDigits, "user", messageText);
          await appendSessionMessage(cleanSenderDigits, "assistant", finalReply);

          // Despachar a WhatsApp vía Evolution Go
          await sendEvolutionWhatsApp(cleanSenderDigits, finalReply);
        }
      } catch (err: any) {
        console.error(
          "[WhatsApp Bot] Error generating or sending reply:",
          err.message
        );
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
