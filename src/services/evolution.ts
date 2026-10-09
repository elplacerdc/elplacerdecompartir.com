// evolution.ts - EvolutionGo API & Multi-Channel OTP Service
import Redis from "ioredis";
import { normalizePhone } from "../db";
import { sendTransactionalEmail } from "./email";

const EVOLUTION_API_URL = process.env.EVOLUTION_URL || process.env.EVOLUTION_API_URL || "http://evolution:8085";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || "481c8c43-0023-4028-bad5-9d1355a3674c";

// Redis / Valkey Client with In-Memory Map Fallback
let redisClient: Redis | null = null;
const memoryOtpStore = new Map<string, { code: string; expiresAt: number }>();

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

export async function sendWhatsAppMessage(phone: string, text: string): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanNumber = formatEvolutionNumber(phone);
    if (!cleanNumber) {
      return { success: false, error: "Número de teléfono inválido o vacío" };
    }

    const endpoint = `${EVOLUTION_API_URL.replace(/\/$/, "")}/send/text`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: cleanNumber,
        text,
      }),
    });

    if (response.ok) {
      return { success: true };
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
  channel: "whatsapp" | "email" = "whatsapp"
): Promise<{ success: boolean; code?: string; error?: string }> {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const key = normalizeDestinationKey(destination, channel);
  const ttlSeconds = 600; // 10 minutes

  if (redisClient) {
    try {
      await redisClient.set(key, code, "EX", ttlSeconds);
    } catch (e) {
      memoryOtpStore.set(key, { code, expiresAt: Date.now() + ttlSeconds * 1000 });
    }
  } else {
    memoryOtpStore.set(key, { code, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  if (channel === "whatsapp") {
    const waText = `✨ *El Placer de Compartir*\n\nTu código de verificación es: *${code}*\n\nEste código expira en 10 minutos. Úsalo para confirmar tu solicitud.`;
    const res = await sendWhatsAppMessage(destination, waText);
    return { success: res.success, code, error: res.error };
  } else {
    const emailHtml = `
      <div style="background-color: #180A1A; color: #F7F4EE; padding: 35px; font-family: 'Cinzel', Georgia, serif; max-width: 500px; margin: 0 auto; border: 2px solid #C5A059; text-align: center; border-radius: 12px;">
        <h2 style="color: #EAD397; letter-spacing: 2px; text-transform: uppercase; font-size: 20px; margin-bottom: 10px;">El Placer de Compartir</h2>
        <p style="font-family: sans-serif; font-size: 14px; color: rgba(247, 244, 238, 0.8); line-height: 1.6;">
          Has solicitado un código de verificación para completar tu registro en nuestra plataforma.
        </p>
        <div style="background-color: #250F22; border: 1px solid #C5A059; border-radius: 8px; padding: 18px; margin: 25px 0;">
          <span style="font-family: monospace; font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #C5A059;">${code}</span>
        </div>
        <p style="font-family: sans-serif; font-size: 11px; color: rgba(247, 244, 238, 0.5);">
          Válido por 10 minutos. Si no solicitaste este código, por favor ignora este mensaje.
        </p>
      </div>
    `;

    const res = await sendTransactionalEmail({
      to: destination.trim().toLowerCase(),
      subject: `Tu código de verificación: ${code} — El Placer de Compartir`,
      fromName: "El Placer de Compartir",
      html: emailHtml,
    });
    return { success: res.success, code, error: res.error };
  }
}

export async function verifyChannelOTP(
  destination: string,
  code: string,
  channel?: "whatsapp" | "email"
): Promise<boolean> {
  const cleanCode = code.trim();
  if (!cleanCode) return false;

  // If channel is specified, check that specific key
  if (channel) {
    const key = normalizeDestinationKey(destination, channel);
    return await verifyKey(key, cleanCode);
  }

  // Otherwise, auto-deduce or check both (whatsapp and email)
  const isEmail = destination.includes("@");
  const primaryKey = normalizeDestinationKey(destination, isEmail ? "email" : "whatsapp");
  const verifiedPrimary = await verifyKey(primaryKey, cleanCode);
  if (verifiedPrimary) return true;

  // Fallback check the other format just in case
  const secondaryKey = normalizeDestinationKey(destination, isEmail ? "whatsapp" : "email");
  return await verifyKey(secondaryKey, cleanCode);
}

async function verifyKey(key: string, code: string): Promise<boolean> {
  if (redisClient) {
    try {
      const stored = await redisClient.get(key);
      if (stored && stored === code) {
        await redisClient.del(key);
        return true;
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
      memoryOtpStore.delete(key);
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
