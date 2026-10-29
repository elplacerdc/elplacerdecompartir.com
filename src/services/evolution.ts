// evolution.ts - EvolutionGo API & Multi-Channel OTP Service
import Redis from "ioredis";
import { normalizePhone } from "../db";
import { sendTransactionalEmail } from "./email";
import { isTestExecution, isTestOrMockPhone } from "./notifications";

const rawUrl = process.env.EVOLUTION_URL || process.env.EVOLUTION_API_URL || "";
const EVOLUTION_API_URL = (rawUrl && !rawUrl.startsWith("${")) ? rawUrl : "http://evolution:8085";

let cachedActiveToken: string | null = null;
let tokenExpiresAt = 0;

export async function getEvolutionApiKey(): Promise<string> {
  const now = Date.now();
  if (cachedActiveToken && now < tokenExpiresAt) {
    return cachedActiveToken;
  }

  // 1. Dynamic discovery from Evolution Go engine
  try {
    const globalKey = process.env.GLOBAL_API_KEY || "429683C4C977415CAAFCCE10F7D57E11";
    const resp = await fetch(`${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/all`, {
      headers: { apikey: globalKey },
    });
    if (resp.ok) {
      const json: any = await resp.json();
      const instances: any[] = json?.data || [];
      const targetInstance = process.env.EVOLUTION_INSTANCE || "segisw";
      const active =
        (targetInstance ? instances.find((i) => i.name === targetInstance && i.connected) : null) ||
        instances.find((i) => i.connected) ||
        (targetInstance ? instances.find((i) => i.name === targetInstance) : null) ||
        instances[0];

      if (active?.token) {
        cachedActiveToken = active.token;
        tokenExpiresAt = now + 60_000;
        return cachedActiveToken;
      }
    }
  } catch (err: any) {
    console.warn("[Evolution] Dynamic token discovery failed:", err.message);
  }

  // 2. Fallback to env or default
  const rawKey = process.env.EVOLUTION_API_KEY || "";
  if (rawKey && !rawKey.startsWith("${") && rawKey !== "481c8c43-0023-4028-bad5-9d1355a3674c") {
    return rawKey;
  }
  return "50f0cd48-4f34-452e-99b7-db1fd927e844";
}

// Redis / Valkey Client with In-Memory Map Fallback
let redisClient: Redis | null = null;
const memoryOtpStore = new Map<string, { code: string; expiresAt: number; messageId?: string; chat?: string }>();

try {
  if (process.env.VALKEY_URL) {
    redisClient = new Redis(process.env.VALKEY_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });
    redisClient.connect().catch((err) => {
      console.warn("[Evolution OTP] Valkey connection failed, using memory fallback:", err.message);
      redisClient = null;
    });
  }
} catch (e: any) {
  console.warn("[Evolution OTP] Redis init error, using memory fallback:", e.message);
}

function normalizeDestinationKey(dest: string, channel: "whatsapp" | "email"): string {
  if (channel === "whatsapp") {
    const norm = normalizePhone(dest);
    return `otp:wa:${norm ? norm.waNumber : dest.replace(/\D/g, "")}`;
  }
  return `otp:email:${dest.trim().toLowerCase()}`;
}

export function formatEvolutionNumber(phone: string): string {
  const norm = normalizePhone(phone);
  if (norm && norm.waNumber) {
    return norm.waNumber.replace(/\D/g, "");
  }
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) {
    return `57${digits}`;
  }
  return digits;
}

export async function deleteWhatsAppMessage(chat: string, messageId: string): Promise<boolean> {
  try {
    const apiKey = await getEvolutionApiKey();
    const endpoint = `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/delete`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        chat,
        messageId,
      }),
    });
    return response.ok;
  } catch (error: any) {
    console.warn("[Evolution WhatsApp] Message delete error:", error.message);
    return false;
  }
}

export async function sendWhatsAppMessage(
  phone: string,
  text: string
): Promise<{ success: boolean; error?: string; messageId?: string; chat?: string }> {
  try {
    const cleanNumber = formatEvolutionNumber(phone);
    if (!cleanNumber) {
      return { success: false, error: "Número de teléfono inválido o vacío" };
    }

    // Safety Shield: Never dispatch real WhatsApp OTP/messages to test numbers or during test execution
    if (isTestExecution() || isTestOrMockPhone(phone)) {
      console.log(`[Test Shield] 🛡️ Suppressed WhatsApp OTP/message dispatch to test number: ${phone}`);
      return { success: true, messageId: `mock-msg-${Date.now()}`, chat: `${cleanNumber}@s.whatsapp.net` };
    }

    const apiKey = await getEvolutionApiKey();
    const endpoint = `${EVOLUTION_API_URL.replace(/\/$/, "")}/send/text`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: cleanNumber,
        text,
      }),
    });

    if (response.status === 401) {
      cachedActiveToken = null;
    }

    if (response.ok) {
      const data = await response.json();
      const messageId = data?.data?.Info?.ID || data?.data?.key?.id;
      const chat = data?.data?.Info?.Chat || data?.data?.key?.remoteJid || `${cleanNumber}@s.whatsapp.net`;
      return { success: true, messageId, chat };
    }

    const errText = await response.text();
    console.warn(`[Evolution WhatsApp] API Error ${response.status}:`, errText);
    return { success: false, error: errText };
  } catch (error: any) {
    console.error("[Evolution WhatsApp] Dispatch failed:", error.message);
    return { success: false, error: error.message };
  }
}

export async function sendChannelOTP(
  destination: string,
  channel: "whatsapp" | "email" = "whatsapp",
  emailFallback?: string,
  phoneFallback?: string
): Promise<{ success: boolean; code?: string; error?: string; channelUsed?: "whatsapp" | "email"; fallback?: boolean }> {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const ttlSeconds = 600; // 10 minutes

  let messageId: string | undefined;
  let chat: string | undefined;
  let channelUsed: "whatsapp" | "email" = channel;
  let fallback = false;

  const emailHtml = `
    <div style="background-color: #180A1A; color: #F7F4EE; padding: 35px; font-family: 'Cinzel', Georgia, serif; max-width: 500px; margin: 0 auto; border: 2px solid #C5A059; text-align: center; border-radius: 12px;">
      <h2 style="color: #EAD397; letter-spacing: 2px; text-transform: uppercase; font-size: 20px; margin-bottom: 10px;">El Placer de Compartir</h2>
      <p style="font-family: sans-serif; font-size: 14px; color: rgba(247, 244, 238, 0.8); line-height: 1.6;">
        Has solicitado un código de verificación para completar tu reserva o registro en nuestra plataforma.
      </p>
      <div style="background-color: #250F22; border: 1px solid #C5A059; border-radius: 8px; padding: 18px; margin: 25px 0;">
        <span style="font-family: monospace; font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #C5A059;">${code}</span>
      </div>
      <p style="font-family: sans-serif; font-size: 11px; color: rgba(247, 244, 238, 0.5);">
        Válido por 10 minutos. Si no solicitaste este código, por favor ignora este mensaje.
      </p>
    </div>
  `;

  if (channel === "whatsapp") {
    const waText = `✨ *El Placer de Compartir*\n\nTu código de verificación es: *${code}*\n\nEste código expira en 10 minutos. Úsalo para confirmar tu solicitud.`;
    const res = await sendWhatsAppMessage(destination, waText);
    if (res.success) {
      messageId = res.messageId;
      chat = res.chat;
    } else {
      // WhatsApp dispatch failed (e.g. gateway unlinked, reachout timelock, network error)
      if (emailFallback && emailFallback.includes("@")) {
        console.warn(`[Evolution OTP] WhatsApp dispatch failed (${res.error}), executing automatic fallback to email: ${emailFallback}`);
        const emailRes = await sendTransactionalEmail({
          to: emailFallback.trim().toLowerCase(),
          subject: `Tu código de verificación: ${code} — El Placer de Compartir`,
          fromName: "El Placer de Compartir",
          html: emailHtml,
        });
        if (!emailRes.success) {
          return { success: false, error: `WhatsApp no disponible (${res.error}) y fallo en correo (${emailRes.error})` };
        }
        channelUsed = "email";
        fallback = true;
      } else {
        return { success: false, error: res.error };
      }
    }
  } else {
    const targetEmail = destination.includes("@") ? destination : (emailFallback || "");
    if (!targetEmail.includes("@")) {
      return { success: false, error: "Correo electrónico no válido para el envío de código" };
    }
    const res = await sendTransactionalEmail({
      to: targetEmail.trim().toLowerCase(),
      subject: `Tu código de verificación: ${code} — El Placer de Compartir`,
      fromName: "El Placer de Compartir",
      html: emailHtml,
    });
    if (!res.success) {
      return { success: false, error: res.error };
    }
    channelUsed = "email";
  }

  // Store OTP with metadata in Redis/Memory across all relevant target keys
  const payload = JSON.stringify({ code, messageId, chat });
  const keysToStore = new Set<string>();
  keysToStore.add(normalizeDestinationKey(destination, channel));
  if (emailFallback && emailFallback.includes("@")) {
    keysToStore.add(normalizeDestinationKey(emailFallback, "email"));
  }
  if (phoneFallback) {
    keysToStore.add(normalizeDestinationKey(phoneFallback, "whatsapp"));
  }

  for (const k of keysToStore) {
    if (redisClient) {
      try {
        await redisClient.set(k, payload, "EX", ttlSeconds);
      } catch (e) {
        memoryOtpStore.set(k, { code, expiresAt: Date.now() + ttlSeconds * 1000, messageId, chat });
      }
    } else {
      memoryOtpStore.set(k, { code, expiresAt: Date.now() + ttlSeconds * 1000, messageId, chat });
    }
  }

  return { success: true, code, channelUsed, fallback };
}

export async function verifyChannelOTP(
  destination: string,
  code: string,
  channel?: "whatsapp" | "email",
  emailFallback?: string
): Promise<boolean> {
  const cleanCode = code.trim();
  if (!cleanCode) return false;

  // 1. If channel is specified, check that specific key
  if (channel) {
    const key = normalizeDestinationKey(destination, channel);
    if (await verifyKey(key, cleanCode)) return true;
  }

  // 2. Auto-deduce or check both (whatsapp and email)
  const isEmail = destination.includes("@");
  const primaryKey = normalizeDestinationKey(destination, isEmail ? "email" : "whatsapp");
  if (await verifyKey(primaryKey, cleanCode)) return true;

  // 3. Fallback check the other format
  const secondaryKey = normalizeDestinationKey(destination, isEmail ? "whatsapp" : "email");
  if (await verifyKey(secondaryKey, cleanCode)) return true;

  // 4. Fallback check emailFallback if provided
  if (emailFallback && emailFallback.includes("@")) {
    const emailKey = normalizeDestinationKey(emailFallback, "email");
    if (await verifyKey(emailKey, cleanCode)) return true;
  }

  return false;
}

async function verifyKey(key: string, code: string): Promise<boolean> {
  let storedCode: string | null = null;
  let messageId: string | undefined;
  let chat: string | undefined;

  if (redisClient) {
    try {
      const stored = await redisClient.get(key);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === "object" && parsed.code) {
            storedCode = parsed.code;
            messageId = parsed.messageId;
            chat = parsed.chat;
          } else {
            storedCode = stored;
          }
        } catch {
          storedCode = stored;
        }

        if (storedCode && storedCode === code) {
          await redisClient.del(key);
          // Revoke/Delete validated OTP message on WhatsApp for everyone
          if (chat && messageId) {
            deleteWhatsAppMessage(chat, messageId).catch((err) =>
              console.warn("[Evolution Revoke OTP Warn]:", err)
            );
          }
          return true;
        }
      }
    } catch (e) {
      // Fall through to memory check
    }
  }

  const memoryStored = memoryOtpStore.get(key);
  if (memoryStored) {
    if (Date.now() > memoryStored.expiresAt) {
      memoryOtpStore.delete(key);
      return false;
    }
    if (memoryStored.code === code) {
      messageId = memoryStored.messageId;
      chat = memoryStored.chat;
      memoryOtpStore.delete(key);
      // Revoke/Delete validated OTP message on WhatsApp for everyone
      if (chat && messageId) {
        deleteWhatsAppMessage(chat, messageId).catch((err) =>
          console.warn("[Evolution Revoke OTP Warn]:", err)
        );
      }
      return true;
    }
  }

  return false;
}

// Backward-compatible exports
export async function sendOTP(phone: string): Promise<void> {
  await sendChannelOTP(phone, "whatsapp");
}

export async function verifyOTP(phone: string, code: string): Promise<boolean> {
  return await verifyChannelOTP(phone, code);
}
