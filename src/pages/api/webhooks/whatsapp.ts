import type { APIRoute } from "astro";
import { sendEvolutionWhatsApp } from "../../../services/notifications";
import {
  getSessionHistory,
  appendSessionMessage,
  isHumanTakeover,
  setHumanTakeover,
  clearHumanTakeover,
  isAffiliatePitched,
  setAffiliatePitched,
} from "../../../services/session";
import { buildDynamicSystemPrompt } from "../../../services/bot-knowledge";

const BIFROST_URL = process.env.BIFROST_URL || "http://bifrost:8080/v1";
const BIFROST_VIRTUAL_KEY =
  process.env.BIFROST_VIRTUAL_KEY || "vk-production-main";
const BOT_PHONE = "573021004070";

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

    // 1. Extraer metadata de evento soportando Evolution Go (whatsmeow) y Baileys
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

    const chatJid = String(
      info.Chat ||
        key.remoteJid ||
        eventData.Chat ||
        payload.remoteJid ||
        eventData.remoteJid ||
        ""
    );
    const senderJid = String(
      info.Sender ||
        eventData.Sender ||
        payload.sender ||
        ""
    );
    const senderAlt = String(
      info.SenderAlt ||
        eventData.SenderAlt ||
        eventData.senderAlt ||
        ""
    );

    // Ignorar grupos y difusiones de estado
    if (
      chatJid.includes("@g.us") ||
      chatJid.includes("status@broadcast") ||
      senderJid.includes("@g.us")
    ) {
      return new Response(JSON.stringify({ status: "ignored_group_or_status" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Identificar todos los posibles IDs del cliente interlocutor
    // Si fromMe es true, el cliente es la contraparte del chat (chatJid/key.remoteJid), NUNCA senderJid (que es el operador).
    const rawTargetIds = fromMe
      ? [chatJid, key.remoteJid, eventData.remoteJid]
      : [chatJid, senderJid, senderAlt, key.remoteJid];

    const targetDigitsList = Array.from(
      new Set(
        rawTargetIds
          .map((id) => (id ? String(id).replace(/@.*$/, "").replace(/\D/g, "") : ""))
          .filter((digits) => digits && digits !== BOT_PHONE)
      )
    );

    if (targetDigitsList.length === 0) {
      return new Response(
        JSON.stringify({ status: "ignored_bot_or_empty_recipient" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const primaryCustomerPhone = targetDigitsList[0];

    // Extraer contenido del mensaje
    const msgObj = eventData.Message || eventData.message || payload.message || {};
    let messageText = String(
      msgObj.conversation ||
        msgObj.extendedTextMessage?.text ||
        msgObj.imageMessage?.caption ||
        msgObj.videoMessage?.caption ||
        eventData.text ||
        payload.text ||
        ""
    ).trim();

    // 2. Extracción de Mensaje Citado (quotedMessage)
    const contextInfo =
      msgObj.extendedTextMessage?.contextInfo ||
      msgObj.contextInfo ||
      eventData.contextInfo;

    const quotedMessage = contextInfo?.quotedMessage;
    let quotedText = "";
    if (quotedMessage) {
      quotedText = String(
        quotedMessage.conversation ||
          quotedMessage.extendedTextMessage?.text ||
          quotedMessage.imageMessage?.caption ||
          quotedMessage.videoMessage?.caption ||
          ""
      ).trim();
    }

    // 3. Control de Intervención Humana del Operador (fromMe == true)
    if (fromMe) {
      if (messageText.includes("#bot")) {
        await clearHumanTakeover(targetDigitsList);
        console.log(
          `[WhatsApp Bot] Takeover cancelado manualmente vía #bot para:`,
          targetDigitsList
        );
      } else if (messageText.includes("#mute")) {
        await setHumanTakeover(targetDigitsList, 86400); // Silencio de 24 horas
        console.log(
          `[WhatsApp Bot] Bot silenciado 24h vía #mute para:`,
          targetDigitsList
        );
      } else {
        // Cualquier mensaje del operador desde su teléfono pausa el bot por 2 horas (7200s)
        await setHumanTakeover(targetDigitsList, 7200);
        console.log(
          `[WhatsApp Bot] Intervención humana detectada del operador. Bot pausado 2h para:`,
          targetDigitsList
        );
        // Guardar el mensaje del operador humano en la memoria de la conversación
        if (messageText && !messageText.startsWith("#")) {
          await appendSessionMessage(
            primaryCustomerPhone,
            "assistant",
            `[Operador humano]: ${messageText}`
          );
        }
      }

      return new Response(JSON.stringify({ status: "human_takeover_updated" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 4. Comprobar si la conversación está en ventana de intervención humana activa
    const inTakeover = await isHumanTakeover(targetDigitsList);
    if (inTakeover) {
      // Guardar el mensaje del cliente en el historial mientras el operador está atendiendo
      if (messageText) {
        let customerMsg = messageText;
        if (quotedText) {
          customerMsg = `[Mensaje citado al que responde el usuario: "${quotedText}"]\n${messageText}`;
        }
        await appendSessionMessage(primaryCustomerPhone, "user", customerMsg);
      }
      console.log(
        `[WhatsApp Bot] Mensaje de ${primaryCustomerPhone} guardado en memoria y silenciado por intervención humana activa.`
      );
      return new Response(
        JSON.stringify({ status: "ignored_human_takeover_active" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 5. Soporte y Transcripción de Notas de Voz (audioMessage)
    const isAudio = Boolean(
      msgObj.audioMessage || eventData.messageType === "audioMessage"
    );

    if (isAudio) {
      console.log(
        `[WhatsApp Bot] Nota de voz detectada de ${primaryCustomerPhone}. Iniciando procesamiento...`
      );
      try {
        let audioBase64 =
          msgObj.audioMessage?.base64 ||
          eventData.base64 ||
          payload.base64 ||
          eventData.data?.base64;

        if (!audioBase64) {
          const downloadRes = await fetch(
            "http://evolution:8085/message/downloadmedia",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: msgObj }),
            }
          );
          if (downloadRes.ok) {
            const downloadJson = await downloadRes.json();
            audioBase64 =
              downloadJson.data?.base64 ||
              downloadJson.base64 ||
              downloadJson.data;
          }
        }

        if (audioBase64) {
          const cleanBase64 = String(audioBase64).replace(
            /^data:.*?;base64,/,
            ""
          );
          const audioBuffer = Buffer.from(cleanBase64, "base64");

          const groqKey = process.env.GROQ_API_KEY;

          const formData = new FormData();
          const audioBlob = new Blob([audioBuffer], { type: "audio/ogg" });
          formData.append("file", audioBlob, "audio.ogg");
          formData.append("model", "whisper-large-v3-turbo");
          formData.append("language", "es");
          formData.append("response_format", "json");

          const transcriptionRes = await fetch(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${groqKey}`,
              },
              body: formData,
            }
          );

          if (transcriptionRes.ok) {
            const transcriptionJson = await transcriptionRes.json();
            const transcribed = String(transcriptionJson.text || "").trim();
            if (transcribed) {
              messageText = transcribed;
              console.log(
                `[WhatsApp Bot] Audio de ${primaryCustomerPhone} transcrito con éxito por Groq Whisper: "${messageText}"`
              );
            }
          } else {
            const errText = await transcriptionRes.text();
            console.warn(
              `[WhatsApp Bot] Groq Whisper HTTP ${transcriptionRes.status} al transcribir audio:`,
              errText
            );
          }
        }
      } catch (audioErr: any) {
        console.error(
          "[WhatsApp Bot Audio Transcribe Err]:",
          audioErr.message
        );
      }

      // Si no se pudo transcribir, responder con calidez de marca
      if (!messageText) {
        const audioFallbackMsg =
          "Recibí tu nota de voz, pero en este momento no logré escucharla con total claridad. ¿Podrías escribirme tu consulta o contarme en qué te colaboro?";
        (async () => {
          await new Promise((r) => setTimeout(r, 2000));
          await sendEvolutionWhatsApp(primaryCustomerPhone, audioFallbackMsg);
        })();
        return new Response(
          JSON.stringify({ status: "audio_fallback_sent" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (!messageText) {
      return new Response(JSON.stringify({ status: "ignored_no_text" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 6. Formatear mensaje del usuario con contexto de cita
    let finalPromptUserMessage = messageText;
    if (quotedText) {
      finalPromptUserMessage = `[Mensaje citado al que responde el usuario: "${quotedText}"]\n${messageText}`;
    }

    const senderName =
      info.PushName || eventData.pushName || payload.pushName || "Invitado(a)";

    // 7. Procesamiento Asíncrono con Bifrost LLM Gateway
    (async () => {
      try {
        const sessionHistory = await getSessionHistory(primaryCustomerPhone, 10);
        const alreadyPitched = await isAffiliatePitched(primaryCustomerPhone);

        const dynamicSystemPrompt = buildDynamicSystemPrompt({
          senderPhone: primaryCustomerPhone,
          senderName,
          isAffiliateEligible: !alreadyPitched,
        });

        const llmMessages: Array<{ role: string; content: string }> = [
          { role: "system", content: dynamicSystemPrompt },
        ];

        for (const item of sessionHistory) {
          llmMessages.push({
            role: item.role,
            content: item.content,
          });
        }

        llmMessages.push({
          role: "user",
          content: finalPromptUserMessage,
        });

        const bifrostResponse = await fetch(`${BIFROST_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${BIFROST_VIRTUAL_KEY}`,
          },
          body: JSON.stringify({
            model: "auto",
            messages: llmMessages,
            temperature: 0.7,
            max_tokens: 800,
          }),
        });

        if (!bifrostResponse.ok) {
          const errBody = await bifrostResponse.text();
          console.error(
            `[WhatsApp Bot] Bifrost returned HTTP ${bifrostResponse.status}:`,
            errBody
          );
          return;
        }

        const completion = await bifrostResponse.json();
        const replyText =
          completion.choices?.[0]?.message?.content ||
          completion.choices?.[0]?.message?.reasoning_content;

        if (replyText && replyText.trim()) {
          const finalReply = replyText.trim();

          // Simulación de presencia y ritmo de conversación humano
          const typingDelayMs = Math.min(
            7000,
            Math.max(2500, finalReply.length * 30)
          );
          await new Promise((resolve) => setTimeout(resolve, typingDelayMs));

          // Guardar ambos turnos en Valkey (preservando el contexto de cita)
          await appendSessionMessage(
            primaryCustomerPhone,
            "user",
            finalPromptUserMessage
          );
          await appendSessionMessage(
            primaryCustomerPhone,
            "assistant",
            finalReply
          );

          // Control de frecuencia para el programa de embajadores
          if (
            finalReply.toLowerCase().includes("embajador") ||
            finalReply.toLowerCase().includes("embajadores")
          ) {
            await setAffiliatePitched(primaryCustomerPhone, 604800); // 7 días
          }

          // Despachar respuesta por WhatsApp vía Evolution Go
          await sendEvolutionWhatsApp(primaryCustomerPhone, finalReply);
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
