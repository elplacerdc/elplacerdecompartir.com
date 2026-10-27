// notifications.ts - Multi-Channel Notification Orchestrator
import { sendTransactionalEmail } from "./email";
import { pool, normalizePhone } from "../db";
import { getEvolutionApiKey } from "./evolution";

const BRAND_NOTIFICATION_EMAIL = "web@elplacerdecompartir.com";
const EVOLUTION_INITIAL_NUMBER = process.env.ADMIN_WHATSAPP_NUMBER || "573194194785";
const EVOLUTION_API_URL = process.env.EVOLUTION_URL || process.env.EVOLUTION_API_URL || "http://evolution:8085";

// Verified public accessible transparent logo for The Corset Society
const CORSET_LOGO_URL = "https://elplacerdecompartir.com/media/logo_corsetsociety_transparent.png";
const PLACER_LOGO_URL = "https://elplacerdecompartir.com/media/logo_elplacerdc_x.jpg";

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

export function wrapSpanishEmail(content: string, title: string = "El Placer de Compartir"): string {
  return `<!DOCTYPE html>
<html lang="es" xml:lang="es" dir="ltr" class="notranslate" translate="no" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta http-equiv="Content-Language" content="es">
  <meta name="language" content="es">
  <meta name="google" content="notranslate">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body class="notranslate" translate="no" style="margin: 0; padding: 0; background-color: #120713; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div lang="es" xml:lang="es" dir="ltr" class="notranslate" translate="no">
    ${content}
  </div>
</body>
</html>`;
}

export function formatBogotaDateTime(date: Date = new Date()): string {
  return date.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }) + " (UTC-5 Bogotá)";
}

export function formatBogotaTime(date: Date = new Date()): string {
  return date.toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }) + " (UTC-5 Bogotá)";
}

/**
 * Detects if the current runtime is in an automated test environment.
 */
export function isTestExecution(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.BUN_ENV === "test" ||
    process.env.TEST_MODE === "true" ||
    process.env.CI === "true" ||
    typeof (globalThis as any).describe === "function" ||
    typeof (globalThis as any).test === "function" ||
    typeof (globalThis as any).it === "function"
  );
}

/**
 * Detects if a phone number belongs to test ranges, preventing dispatch to real cellphones.
 */
export function isTestOrMockPhone(phone?: string | null): boolean {
  if (!phone) return true;
  const digits = phone.replace(/\D/g, "");
  if (!digits || digits.length < 7) return true;

  return (
    digits.startsWith("57000") ||
    digits.startsWith("000") ||
    digits.startsWith("57999") ||
    digits === "573000000000" ||
    digits.endsWith("1112233") ||
    digits.endsWith("4445566") ||
    digits.endsWith("7778899") ||
    digits.endsWith("9887766") ||
    digits.endsWith("8887766") ||
    digits.endsWith("9990001") ||
    digits.endsWith("9990002") ||
    digits.endsWith("9998877") ||
    digits.endsWith("2223344") ||
    digits.endsWith("1111111") ||
    digits.endsWith("2222222") ||
    digits.endsWith("5556677") ||
    digits.endsWith("9991122")
  );
}

/**
 * Detects if an entity is a test lead / mock subject to prevent spamming admin or clients.
 */
export function isTestEntity(lead?: {
  alias_nombre?: string | null;
  alias?: string | null;
  email?: string | null;
  whatsapp?: string | null;
} | null): boolean {
  if (!lead) return true;
  if (isTestExecution()) return true;
  if (isTestOrMockPhone(lead.whatsapp)) return true;

  const email = (lead.email || "").toLowerCase();
  const alias = (lead.alias_nombre || lead.alias || "").toLowerCase();

  return (
    email.includes("@test.com") ||
    email.includes("@example.com") ||
    email.includes("test_") ||
    email.includes("test@") ||
    alias.includes("valquiria") ||
    alias.includes("baron") ||
    alias.includes("test") ||
    alias.includes("mock") ||
    alias.includes("dummy")
  );
}

export async function sendEvolutionWhatsApp(
  number: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanNumber = formatEvolutionNumber(number);
    if (!cleanNumber) {
      return { success: false, error: "Número vacío o inválido" };
    }

    // Safety Shield: Never dispatch real WhatsApp messages to test/mock numbers or during tests
    if (isTestExecution() || isTestOrMockPhone(cleanNumber)) {
      console.log(`[Test Shield] 🛡️ Suppressed WhatsApp dispatch to test/mock recipient: ${cleanNumber}`);
      return { success: true };
    }

    const apiKey = await getEvolutionApiKey();
    const response = await fetch(`${EVOLUTION_API_URL.replace(/\/$/, "")}/send/text`, {
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

    if (response.ok) {
      return { success: true };
    }
    const errText = await response.text();
    console.warn(`[Evolution WhatsApp] Response ${response.status}:`, errText);
    return { success: false, error: errText };
  } catch (err: any) {
    console.warn("[Evolution WhatsApp] Dispatch error:", err.message);
    return { success: false, error: err.message };
  }
}

export async function notifyNewLead(
  lead: {
    id?: string;
    alias_nombre?: string;
    whatsapp: string;
    email?: string;
    rol?: string;
    ciudad?: string;
    origen?: string;
    corset_vip?: boolean;
    afiliado_id?: string;
  },
  channel?: "elplacerdc" | "corset" | "centro_cultural" | string
): Promise<void> {
  // Safety Shield: Never dispatch notifications for test entities or during automated test runs
  if (isTestEntity(lead)) {
    console.log(`[Test Shield] 🛡️ Suppressed lead & admin notifications for test entity: ${lead.alias_nombre || lead.email}`);
    return;
  }

  const effectiveChannel = channel || (lead.corset_vip ? "corset" : "elplacerdc");
  const isCorset = effectiveChannel === "corset";
  const channelName = isCorset ? "La Sociedad del Corset (Membresía Anual VIP)" : "El Placer de Compartir";
  const phoneNorm = normalizePhone(lead.whatsapp);
  const formattedPhone = phoneNorm ? phoneNorm.display : lead.whatsapp;
  const waDirectDigits = phoneNorm ? phoneNorm.waNumber : lead.whatsapp.replace(/\D/g, "");

  const gram = getGrammaticalProfile(lead.rol);

  // 1. Código propio del usuario para su enlace de embajador
  let ownCode = "embajador";
  try {
    const { ensureAffiliateCode } = await import("../db");
    ownCode = await ensureAffiliateCode(lead.alias_nombre || "Embajador", lead.whatsapp, lead.email);
  } catch (err: any) {
    console.warn("[notifyNewLead] Error resolving own affiliate code:", err.message);
  }

  // Enlaces de embajador propios y botones directos para compartir (WhatsApp & X)
  const ownAffLink = isCorset
    ? `https://elplacerdecompartir.com/the-corset-society/?ref=${encodeURIComponent(ownCode)}`
    : `https://elplacerdecompartir.com/?ref=${encodeURIComponent(ownCode)}`;

  const waShareMsg = isCorset
    ? `«El acceso se concede, no se anuncia.» Conoce La Sociedad del Corset en Bogotá: ${ownAffLink}`
    : `¡Hola! Te invito a conocer El Placer de Compartir, comunidad y centro cultural de erotismo consciente en Bogotá: ${ownAffLink}`;

  const xShareMsg = isCorset
    ? `«El acceso se concede, no se anuncia.» Conoce La Sociedad del Corset en Bogotá:`
    : `Te invito a descubrir @elplacerdc, espacio de libertad y erotismo consciente en Bogotá:`;

  const waShareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(waShareMsg)}`;
  const xShareUrl = `https://x.com/intent/post?text=${encodeURIComponent(xShareMsg)}&url=${encodeURIComponent(ownAffLink)}`;

  // 1. Notificación WhatsApp directa al Lead con la voz y calidez del Brandbook (sin 'leer más')
  if (isCorset) {
    const leadCorsetWa =
      `🖤 *LA SOCIEDAD DEL CORSET*\n\n` +
      `${gram.greeting} *${lead.alias_nombre || "Invitado"}*, hemos recibido tu solicitud de admisión. Cuidamos celosamente el misterio, la estética noir y el confort de quienes cruzan nuestro umbral.\n\n` +
      `👑 *Membresía VIP:* https://elplacerdecompartir.com/the-corset-society/\n` +
      `🎁 *Tu Enlace Reservado:* ${ownAffLink}\n` +
      `_(Recomienda este círculo a personas afines y desbloquea pases de honor)_\n\n` +
      `_«El acceso se concede, no se anuncia.»_\n` +
      `🏛️ *Comité de Admisión & Segi*`;

    sendEvolutionWhatsApp(lead.whatsapp, leadCorsetWa).catch((e) =>
      console.error("[NotifyLead Corset WhatsApp Err]:", e)
    );
  } else {
    const leadPlacerWa =
      `🍷 *EL PLACER DE COMPARTIR*\n\n` +
      `${gram.greeting} *${lead.alias_nombre || "Invitado"}*, qué placer darte la bienvenida. Creamos un espacio seguro de libertad, erotismo lúcido y complicidad entre adultos de mente abierta en Bogotá.\n\n` +
      `🏛️ *Casa & Agenda:* https://elplacerdecompartir.com/galeria-centro-cultural/\n` +
      `🎁 *Tu Enlace de Embajador:* ${ownAffLink}\n` +
      `_(Compártelo: por cada 3 compras acreditadas ganas 1 pase gratis)_\n\n` +
      `Guarda este número para coordinar tus accesos.\n` +
      `🍷 *Segi* • Curadora de Experiencias`;

    sendEvolutionWhatsApp(lead.whatsapp, leadPlacerWa).catch((e) =>
      console.error("[NotifyLead Placer WhatsApp Err]:", e)
    );
  }

  // 2. Correo transaccional al Usuario
  if (lead.email) {
    if (isCorset) {
      // La Sociedad del Corset: Identidad formal, estética noir, cero 'The Corset Society' en headers
      const corsetHtml = `
        <div lang="es" xml:lang="es" dir="ltr" class="notranslate" translate="no" style="background-color: #050505; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', Georgia, serif; max-width: 600px; margin: 0 auto; border: 2px solid #c5a059; text-align: center;">
          <div style="margin-bottom: 25px;">
            <img src="${CORSET_LOGO_URL}" alt="La Sociedad del Corset" width="96" height="auto" style="height: 96px; width: auto; max-width: 96px; margin: 0 auto; display: block; border: 0;" />
          </div>
          <h1 style="color: #c5a059; text-transform: uppercase; letter-spacing: 3px; font-size: 18px; margin: 0 0 10px 0;">La Sociedad del Corset</h1>
          <div style="width: 40px; height: 1px; background-color: #c5a059; margin: 0 auto 25px auto;"></div>
          <div style="text-align: left; font-family: 'Plus Jakarta Sans', Arial, sans-serif; font-size: 14px; line-height: 1.7; color: rgba(247, 244, 238, 0.85);">
            <p>Estimado(a) <strong style="color: #ead397;">${lead.alias_nombre || "Invitado(a)"}</strong>,</p>
            <p>Te hemos enviado previamente un saludo directo a tu WhatsApp (<strong style="color: #ead397;">${formattedPhone}</strong>), nuestro canal prioritario para coordinaciones ágiles. Mediante esta comunicación formal dejamos constancia institucional de tu solicitud de admisión a <strong>La Sociedad del Corset</strong>, la línea de alta exclusividad de ElPlacerDC.</p>
            
            <div style="background-color: #0f0a0d; border-left: 3px solid #c5a059; padding: 16px; margin: 20px 0; border-radius: 4px;">
              <p style="margin: 0; font-size: 13px; color: #f7f4ee;">
                👑 <strong>Credencial VIP por Suscripción Anual ($199.000 COP):</strong> Da acceso preferencial a veladas privadas de gala noir, convocatorias prioritarias a fantasías y encuentros íntimos, descuentos permanentes en todos los eventos y pertenencia a nuestro círculo prémium.
              </p>
            </div>

            <p><strong>Criterios de Admisión:</strong></p>
            <ul style="padding-left: 20px; color: rgba(247, 244, 238, 0.75); font-size: 13px;">
              <li>Evaluación confidencial de perfil por parte del comité de admisión.</li>
              <li>Códigos de etiqueta y anonimato voluntario de estricto cumplimiento.</li>
              <li>Ubicación permanente: Centro Cultural El Placer de Compartir, Bogotá.</li>
            </ul>

            <p style="color: #ead397; font-style: italic; font-family: 'Cinzel', Georgia, serif; text-align: center; margin: 25px 0; font-size: 15px;">
              «El acceso se concede, no se anuncia.»
            </p>

            <!-- Invitación de Embajador con botones de compartir directo -->
            <div style="background-color: #140816; border: 1px solid rgba(197, 160, 89, 0.4); padding: 22px 18px; border-radius: 10px; margin: 25px 0; text-align: center;">
              <p style="font-size: 13px; color: #ead397; margin: 0 0 6px 0; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">🎁 Tu Enlace Exclusivo de Embajador</p>
              <p style="font-size: 12px; color: rgba(247, 244, 238, 0.75); margin: 0 0 12px 0; line-height: 1.5;">Comparte este círculo con personas de confianza. Por cada 3 compras acreditadas con tu enlace, recibes 1 pase de honor gratuito:</p>
              <div style="background-color: #0a040b; border: 1px dashed #c5a059; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; color: #ead397; margin-bottom: 16px; word-break: break-all;">
                ${ownAffLink}
              </div>

              <!-- Botones de Compartir Directo (WhatsApp & X) -->
              <div style="margin-bottom: 16px;">
                <a href="${waShareUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #25D366; color: #ffffff; padding: 10px 18px; border-radius: 24px; text-decoration: none; font-size: 12px; font-weight: bold; display: inline-block; margin: 4px; font-family: sans-serif;">
                  📲 Compartir por WhatsApp
                </a>
                <a href="${xShareUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #000000; border: 1px solid #c5a059; color: #ead397; padding: 10px 18px; border-radius: 24px; text-decoration: none; font-size: 12px; font-weight: bold; display: inline-block; margin: 4px; font-family: sans-serif;">
                  𝕏 Compartir en X
                </a>
              </div>

              <a href="https://elplacerdecompartir.com/dashboard" style="display: inline-block; font-size: 11px; color: #c5a059; border: 1px solid #c5a059; padding: 6px 14px; border-radius: 20px; text-decoration: none; text-transform: uppercase; font-weight: bold;">Acceder a mi Panel de Embajador →</a>
            </div>

            <!-- Botón de llamado a la acción correspondiente SIEMPRE AL FINAL -->
            <div style="text-align: center; margin: 30px 0 10px 0;">
              <a href="https://elplacerdecompartir.com/the-corset-society/" style="background: linear-gradient(135deg, #c5a059, #ead397); color: #050505; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 50px; display: inline-block; text-transform: uppercase; font-size: 13px; letter-spacing: 1px;">Activar Credencial VIP →</a>
            </div>

          </div>
          <hr style="border: 0; border-top: 1px solid rgba(197, 160, 89, 0.25); margin: 30px 0;" />
          <p style="font-size: 11px; color: #888; font-family: sans-serif; margin: 0;">La Sociedad del Corset • Círculo Privado de Gala<br/>Línea Oficial: +57 319 419 4785 • Bogotá, Colombia</p>
        </div>
      `;

      sendTransactionalEmail({
        to: lead.email,
        name: lead.alias_nombre || undefined,
        fromName: "La Sociedad del Corset",
        subject: "La Sociedad del Corset — Solicitud de Membresía Anual VIP",
        html: wrapSpanishEmail(corsetHtml, "La Sociedad del Corset"),
      }).catch((e) => console.error("[NotifyLead Corset Email Err]:", e));
    } else {
      // El Placer de Compartir: Identidad Centro Cultural (no bar swinger, no zonas húmedas, eventos)
      const placerHtml = `
        <div lang="es" xml:lang="es" dir="ltr" class="notranslate" translate="no" style="background-color: #1a0a18; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', Georgia, serif; max-width: 600px; margin: 0 auto; border: 2px solid #591f26; text-align: center;">
          <div style="margin-bottom: 20px;">
            <img src="${PLACER_LOGO_URL}" alt="El Placer de Compartir" style="height: 96px; width: 96px; border-radius: 50%; border: 2px solid #c5a059; margin: 0 auto; display: block; object-fit: cover;" />
          </div>
          <h1 style="color: #ead397; text-transform: uppercase; letter-spacing: 2px; font-size: 18px; margin: 0 0 5px 0;">El Placer de Compartir</h1>
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #c5a059; margin-bottom: 20px;">Comunidad de Erotismo Consciente, Eventos & Centro Cultural</div>
          <div style="text-align: left; font-family: 'Inter', Arial, sans-serif; font-size: 14px; line-height: 1.7; color: rgba(247, 244, 238, 0.85);">
            <p>Hola <strong style="color: #ead397;">${lead.alias_nombre || "Bienvenido(a)"}</strong>,</p>
            <p>Te enviamos previamente un saludo directo a tu WhatsApp (<strong style="color: #ead397;">${formattedPhone}</strong>), nuestro canal ágil para coordinaciones en tiempo real. Por este medio formal te compartimos la visión de nuestra comunidad y agenda cultural.</p>
            
            <div style="background-color: #260d1d; border-left: 3px solid #c5a059; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <p style="margin: 0; font-size: 13px; color: #f7d6cb;">
                🏛️ <strong>Nuevo Centro Cultural en Bogotá (No es un Bar Swinger):</strong> Concebido sin zonas húmedas comerciales, es un espacio multidisciplinario para una agenda semanal completa con talleres de parejas, masajes tántricos, Shibari, eventos oficiales y veladas de aliados los fines de semana.
              </p>
            </div>

            <p><strong>Nuestros Acuerdos Fundamentales:</strong></p>
            <ul style="padding-left: 20px; color: rgba(247, 244, 238, 0.75); font-size: 13px;">
              <li>Consentimiento lúcido: El respeto a la autonomía y al ritmo personal es innegociable.</li>
              <li>Cero personal comercial contratado: Todo asistente participa por decisión y deseo genuino propio.</li>
              <li>Privacidad recíproca: Lo que se comparte en nuestras veladas permanece en la intimidad del grupo.</li>
            </ul>

            <!-- Invitación de Embajador con botones de compartir directo -->
            <div style="background-color: #250f22; border: 1px solid rgba(197, 160, 89, 0.4); padding: 22px 18px; border-radius: 10px; margin: 25px 0; text-align: center;">
              <p style="font-size: 13px; color: #ead397; margin: 0 0 6px 0; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">🎁 Tu Enlace Exclusivo de Embajador</p>
              <p style="font-size: 12px; color: rgba(247, 244, 238, 0.75); margin: 0 0 12px 0; line-height: 1.5;">Invita a personas de mente abierta y gana entradas de honor gratuitas a nuestros eventos:</p>
              <div style="background-color: #140816; border: 1px dashed #c5a059; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; color: #ead397; margin-bottom: 16px; word-break: break-all;">
                ${ownAffLink}
              </div>

              <!-- Botones de Compartir Directo (WhatsApp & X) -->
              <div style="margin-bottom: 16px;">
                <a href="${waShareUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #25D366; color: #ffffff; padding: 10px 18px; border-radius: 24px; text-decoration: none; font-size: 12px; font-weight: bold; display: inline-block; margin: 4px; font-family: sans-serif;">
                  📲 Compartir por WhatsApp
                </a>
                <a href="${xShareUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #000000; border: 1px solid #c5a059; color: #ead397; padding: 10px 18px; border-radius: 24px; text-decoration: none; font-size: 12px; font-weight: bold; display: inline-block; margin: 4px; font-family: sans-serif;">
                  𝕏 Compartir en X
                </a>
              </div>

              <a href="https://elplacerdecompartir.com/dashboard" style="display: inline-block; font-size: 11px; color: #ead397; border: 1px solid #c5a059; padding: 6px 14px; border-radius: 20px; text-decoration: none; text-transform: uppercase;">Ir al Panel de Embajadores →</a>
            </div>

            <!-- Botón de llamado a la acción correspondiente SIEMPRE AL FINAL -->
            <div style="text-align: center; margin: 30px 0 10px 0;">
              <a href="https://elplacerdecompartir.com/galeria-centro-cultural/" style="background-color: #c5a059; color: #180a1a; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 50px; display: inline-block; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Explorar Centro Cultural & Galería 🏛️ →</a>
            </div>

          </div>
          <hr style="border: 0; border-top: 1px solid rgba(197, 160, 89, 0.25); margin: 30px 0;" />
          <p style="font-size: 11px; color: #888; font-family: sans-serif; margin: 0;">El Placer de Compartir • Bogotá & Medellín<br/>Línea Oficial: +57 319 419 4785</p>
        </div>
      `;

      sendTransactionalEmail({
        to: lead.email,
        name: lead.alias_nombre || undefined,
        fromName: "El Placer de Compartir",
        subject: "Bienvenido a El Placer de Compartir — Ecosistema y Centro Cultural",
        html: wrapSpanishEmail(placerHtml, "Bienvenido a El Placer de Compartir"),
      }).catch((e) => console.error("[NotifyLead Placer Email Err]:", e));
    }
  }

  // 3. Correo transaccional a la Marca (Admin)
  const brandSubject = isCorset
    ? `[Nuevo Lead VIP] ${lead.alias_nombre || "Anónimo"} (${lead.rol || "General"}) - La Sociedad del Corset`
    : `[Nuevo Registro Comunidad] ${lead.alias_nombre || "Anónimo"} (${lead.rol || "General"}) - El Placer de Compartir`;

  const brandHtml = `
    <div style="font-family: sans-serif; padding: 20px; background-color: #f7f4ee; color: #1a1a1a;">
      <h2 style="color: ${isCorset ? '#721c24' : '#b84a39'};">Nuevo Registro en Plataforma (${channelName})</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Canal:</td><td style="padding: 8px; border: 1px solid #ddd;">${channelName}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Alias / Nombre:</td><td style="padding: 8px; border: 1px solid #ddd;">${lead.alias_nombre || "No especificado"}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">WhatsApp:</td><td style="padding: 8px; border: 1px solid #ddd;"><a href="https://wa.me/${waDirectDigits}">${formattedPhone}</a></td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Email:</td><td style="padding: 8px; border: 1px solid #ddd;">${lead.email || "No suministrado"}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Modalidad / Rol:</td><td style="padding: 8px; border: 1px solid #ddd;">${lead.rol || "No especificado"}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Ciudad:</td><td style="padding: 8px; border: 1px solid #ddd;">${lead.ciudad || "Bogotá"}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Origen:</td><td style="padding: 8px; border: 1px solid #ddd;">${lead.origen || "web"}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Fecha:</td><td style="padding: 8px; border: 1px solid #ddd;">${formatBogotaDateTime()}</td></tr>
      </table>
    </div>
  `;

  sendTransactionalEmail({
    to: BRAND_NOTIFICATION_EMAIL,
    name: isCorset ? "La Sociedad del Corset Admin" : "El Placer de Compartir Admin",
    fromName: isCorset ? "La Sociedad del Corset" : "El Placer de Compartir",
    subject: brandSubject,
    html: wrapSpanishEmail(brandHtml, "Notificación Nuevo Registro"),
  }).catch((e) => console.error("[NotifyLead BrandEmail Err]:", e));

  // 4. WhatsApp al Evolution Inicial (Admin Telemetría)
  const adminWaText = 
    `🔥 *NUEVO REGISTRO EN WEB*\n\n` +
    `🏷️ *Canal:* ${channelName}\n` +
    `👤 *Alias:* ${lead.alias_nombre || "No especificado"}\n` +
    `📱 *WhatsApp:* ${formattedPhone}\n` +
    `✉️ *Email:* ${lead.email || "No suministrado"}\n` +
    `🎭 *Modalidad:* ${lead.rol || "General"}\n` +
    `📍 *Ciudad:* ${lead.ciudad || "Bogotá"}\n` +
    `⏱️ *Hora:* ${formatBogotaTime()}`;

  sendEvolutionWhatsApp(EVOLUTION_INITIAL_NUMBER, adminWaText).catch((e) =>
    console.error("[NotifyLead Admin WhatsApp Err]:", e)
  );
}

export interface GrammaticalProfile {
  subject: "Él" | "Ella" | "Ellos/Ustedes";
  greeting: string;
  welcome: string;
  pronounTu: string;
  possessive: string;
  pluralPossessive: string;
  dontGoAlone: string;
  openMindedFriends: string;
  shareWithFriends: string;
}

export function getGrammaticalProfile(rol?: string | null, tipoEntradaOrEvento?: string | null): GrammaticalProfile {
  const normRol = (rol || "").toLowerCase().trim();
  const normExtra = (tipoEntradaOrEvento || "").toLowerCase().trim();

  const isPareja = normRol === "pareja" || normExtra.includes("pareja") || normExtra.includes("velada");
  const isMujer = normRol === "mujer_sola" || normRol === "unicornio" || normExtra.includes("unicornio");
  const isHombre = normRol === "hombre_solo" || normRol === "single" || normExtra.includes("single");

  if (isPareja) {
    return {
      subject: "Ellos/Ustedes",
      greeting: "Estimados",
      welcome: "Bienvenidos",
      pronounTu: "ustedes",
      possessive: "su",
      pluralPossessive: "sus",
      dontGoAlone: "No vayan solos",
      openMindedFriends: "amigos mente abierta",
      shareWithFriends: "Compartan su enlace exclusivo con sus amigos mente abierta para que asistan con ustedes",
    };
  }

  if (isMujer) {
    return {
      subject: "Ella",
      greeting: "Estimada",
      welcome: "Bienvenida",
      pronounTu: "tú",
      possessive: "tu",
      pluralPossessive: "tus",
      dontGoAlone: "No vayas sola",
      openMindedFriends: "amigos mente abierta",
      shareWithFriends: "Comparte tu enlace exclusivo con tus amigos mente abierta para que asistan contigo",
    };
  }

  if (isHombre) {
    return {
      subject: "Él",
      greeting: "Estimado",
      welcome: "Bienvenido",
      pronounTu: "tú",
      possessive: "tu",
      pluralPossessive: "tus",
      dontGoAlone: "No vayas solo",
      openMindedFriends: "amigos mente abierta",
      shareWithFriends: "Comparte tu enlace exclusivo con tus amigos mente abierta para que asistan contigo",
    };
  }

  return {
    subject: "Él",
    greeting: "Hola",
    welcome: "Bienvenido(a)",
    pronounTu: "tú",
    possessive: "tu",
    pluralPossessive: "tus",
    dontGoAlone: "No vayan solos",
    openMindedFriends: "amigos mente abierta",
    shareWithFriends: "Comparte tu enlace con tus amigos mente abierta para que asistan contigo",
  };
}

export async function notifyNewTicket(
  ticket: {
    id?: string;
    tipo_entrada: string;
    tipo_pago: string;
    monto_pagado: number | string;
    metodo_pago: string;
    ticket_hash: string;
  },
  lead: {
    alias_nombre?: string;
    whatsapp: string;
    email?: string;
  },
  options?: {
    affiliateCode?: string;
  }
): Promise<void> {
  const ticketUrl = `https://elplacerdecompartir.com/the-corset-society/ticket?hash=${ticket.ticket_hash}`;
  const phoneNorm = normalizePhone(lead.whatsapp);
  const formattedPhone = phoneNorm ? phoneNorm.display : lead.whatsapp;
  const affCode = options?.affiliateCode || "segisw";
  const isTaller = ticket.evento.includes("taller") || ticket.evento.includes("baile");
  const eventShareUrl = isTaller
    ? `https://elplacerdecompartir.com/taller-baile-erotico/?ref=${encodeURIComponent(affCode)}`
    : `https://elplacerdecompartir.com/the-corset-society/luna-llena/?ref=${encodeURIComponent(affCode)}`;

  const gram = getGrammaticalProfile((lead as any).rol, ticket.tipo_entrada);

  // 1. WhatsApp Directo al Comprador (Dirección real y conciso sin 'leer más')
  const buyerWaText = isTaller
    ? `💃 *CREDENCIAL CONFIRMADA — TALLER DE BAILE ERÓTICO*\n\n` +
      `${gram.greeting} *${lead.alias_nombre || "Invitado"}*, ${gram.possessive} acceso para el *Taller de Baile Erótico* (Viernes 16 Oct) está confirmado.\n\n` +
      `🎟️ *Pase:* ${ticket.tipo_entrada.toUpperCase()} (${ticket.tipo_pago === "reserva_50" ? "Separación 50%" : "Pago Total 100%"})\n` +
      `💵 *Monto:* $${Number(ticket.monto_pagado).toLocaleString("es-CO")} COP\n` +
      `📍 *Lugar:* Calle 67 # 23-46 Piso 2, Barrio 7 de Agosto, Bogotá\n` +
      `⏰ *Horario:* Llegada 7:30 P.M. • Inicio Taller 8:00 P.M.\n\n` +
      `🔐 *Tu credencial con QR:*\n${ticketUrl}\n\n` +
      `💎 *${gram.dontGoAlone}. ${gram.shareWithFriends} (3 compras = 1 pase gratis):*\n🔗 ${eventShareUrl}\n\n` +
      `_«Sensualidad & Heels en total libertad y consentimiento lúcido.»_`
    : `🌕 *CREDENCIAL CONFIRMADA — LA SOCIEDAD DEL CORSET*\n\n` +
      `${gram.greeting} *${lead.alias_nombre || "Invitado"}*, ${gram.possessive} acceso para la *Noche de Luna Llena* (31 Oct) está confirmado.\n\n` +
      `🎟️ *Pase:* ${ticket.tipo_entrada.toUpperCase()} (${ticket.tipo_pago === "reserva_40" ? "Separación 40%" : "Pago Total 100%"})\n` +
      `💵 *Monto:* $${Number(ticket.monto_pagado).toLocaleString("es-CO")} COP\n` +
      `📍 *Lugar:* Calle 67 # 23-46 Piso 2, Barrio 7 de Agosto, Bogotá\n\n` +
      `🔐 *Tu credencial con QR:*\n${ticketUrl}\n\n` +
      `💎 *${gram.dontGoAlone}. ${gram.shareWithFriends} (3 compras = 1 pase gratis):*\n🔗 ${eventShareUrl}\n\n` +
      `_«El acceso se concede, no se anuncia.»_`;

  sendEvolutionWhatsApp(lead.whatsapp, buyerWaText).catch((e) =>
    console.error("[NotifyTicket Buyer WhatsApp Err]:", e)
  );

  // 2. Correo al Usuario con Credencial Oficial
  if (lead.email) {
    const waShareTicketMsg = isTaller
      ? `¡Acompáñame al Taller de Baile Erótico en Bogotá! Puedes reservar aquí: ${eventShareUrl}`
      : `«El acceso se concede, no se anuncia.» Acompáñame a la Noche de Luna Llena de La Sociedad del Corset: ${eventShareUrl}`;
    const xShareTicketMsg = isTaller
      ? `Acompáñame al Taller de Baile Erótico en Bogotá con @elplacerdc:`
      : `«El acceso se concede, no se anuncia.» Noche de Luna Llena en La Sociedad del Corset:`;

    const waShareTicketUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(waShareTicketMsg)}`;
    const xShareTicketUrl = `https://x.com/intent/post?text=${encodeURIComponent(xShareTicketMsg)}&url=${encodeURIComponent(eventShareUrl)}`;

    const userSubject = "La Sociedad del Corset — Tu Credencial Digital Sellada (Noche de Luna Llena)";
    const userHtml = `
      <div lang="es" xml:lang="es" dir="ltr" class="notranslate" translate="no" style="background-color: #050505; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', serif, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #c5a059; text-align: center;">
        <div style="margin-bottom: 25px;">
          <img src="${CORSET_LOGO_URL}" alt="La Sociedad del Corset" width="96" height="auto" style="height: 96px; width: auto; max-width: 96px; margin: 0 auto; display: block; border: 0;" />
        </div>
        <h1 style="color: #c5a059; text-transform: uppercase; letter-spacing: 2px; font-size: 20px; margin: 0 0 10px 0;">La Sociedad del Corset</h1>
        <h2 style="color: #ead397; font-size: 15px; margin: 0 0 20px 0; letter-spacing: 1px;">Noche de Luna Llena 🌕</h2>
        <div style="text-align: left; font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #eee;">
          <p>Estimado(a) <strong>${lead.alias_nombre || "Invitado(a)"}</strong>,</p>
          <p>Te hemos notificado previamente vía WhatsApp a tu línea registrada (<strong>${formattedPhone}</strong>). Por medio de este correo te enviamos el respaldo formal y enlace a tu credencial sellada.</p>
          <div style="background-color: #140a18; border: 1px solid #c5a059; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Pase:</strong> ${ticket.tipo_entrada.toUpperCase()}</p>
            <p style="margin: 5px 0;"><strong>Modalidad:</strong> ${ticket.tipo_pago === "reserva_40" ? "Separación 40%" : "Pago Total 100%"}</p>
            <p style="margin: 5px 0;"><strong>Monto:</strong> $${Number(ticket.monto_pagado).toLocaleString("es-CO")} COP</p>
            <p style="margin: 5px 0;"><strong>ID Lacrado:</strong> ${ticket.ticket_hash.substring(0, 16)}</p>
          </div>
          <p style="font-size: 12px; color: #aaa;">Recuerda presentar el código QR scannable de tu credencial al ingresar. Ubicación: Centro Cultural ElPlacerDC: Calle 67 # 23-46 Piso 2, Barrio 7 de Agosto, Bogotá.</p>
          <div style="margin-top: 20px; padding: 10px; background-color: #1a0b1c; border: 1px solid rgba(197, 160, 89, 0.4); border-radius: 6px; text-align: center;">
            <p style="margin: 0; font-size: 11px; color: #ead397;">🛡️ <strong>Seguridad Transaccional:</strong> Pagos y transacciones procesadas con seguridad a nombre de <strong>Baiosfera</strong>.</p>
          </div>

          <!-- Invitación de Embajador con enlace del evento y botones directos -->
          <div style="background-color: #250F22; border: 1px solid #c5a059; border-radius: 8px; padding: 20px; margin: 25px 0; text-align: center;">
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #c5a059; font-weight: bold; display: block; margin-bottom: 6px;">Programa de Embajadores</span>
            <h3 style="color: #ead397; font-size: 15px; margin: 0 0 8px 0;">Gana Entradas Gratuitas por Recomendar</h3>
            <p style="font-size: 12px; color: rgba(247, 244, 238, 0.8); line-height: 1.5; margin: 0 0 12px 0;">
              ¡Nos vemos en la Luna Llena! Comparte esta velada con tus contactos para que asistan contigo: por cada 3 compras generadas con tu enlace, recibes 1 entrada 100% gratuita.
            </p>
            <div style="padding: 10px; background-color: #0a0608; border-radius: 6px; font-family: monospace; font-size: 13px; color: #ead397; margin-bottom: 14px; word-break: break-all;">
              ${eventShareUrl}
            </div>

            <!-- Botones de Compartir Directo -->
            <div style="margin-bottom: 16px;">
              <a href="${waShareTicketUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #25D366; color: #ffffff; padding: 10px 18px; border-radius: 24px; text-decoration: none; font-size: 12px; font-weight: bold; display: inline-block; margin: 4px; font-family: sans-serif;">
                📲 Compartir por WhatsApp
              </a>
              <a href="${xShareTicketUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #000000; border: 1px solid #c5a059; color: #ead397; padding: 10px 18px; border-radius: 24px; text-decoration: none; font-size: 12px; font-weight: bold; display: inline-block; margin: 4px; font-family: sans-serif;">
                𝕏 Compartir en X
              </a>
            </div>

            <a href="https://elplacerdecompartir.com/dashboard" style="background-color: transparent; color: #c5a059; border: 1px solid #c5a059; padding: 8px 18px; text-decoration: none; font-weight: bold; border-radius: 20px; display: inline-block; text-transform: uppercase; font-size: 10px; letter-spacing: 1px;">
              Entrar a mi Panel de Embajador →
            </a>
          </div>

          <!-- Botón de llamado a la acción correspondiente SIEMPRE AL FINAL -->
          <div style="text-align: center; margin: 30px 0 10px 0;">
            <a href="${ticketUrl}" style="background-color: #c5a059; color: #050505; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 50px; display: inline-block; text-transform: uppercase; font-size: 13px; letter-spacing: 1px;">Ver Credencial Digital con QR →</a>
          </div>
        </div>
        <hr style="border: 0; border-top: 1px solid rgba(197, 160, 89, 0.3); margin: 30px 0;" />
        <p style="font-size: 11px; color: #888;">El acceso se concede, no se anuncia. Bogotá, Colombia.</p>
      </div>
    `;

    sendTransactionalEmail({
      to: lead.email,
      name: lead.alias_nombre || undefined,
      fromName: "La Sociedad del Corset",
      subject: userSubject,
      html: wrapSpanishEmail(userHtml, "La Sociedad del Corset — Credencial Digital"),
    }).catch((e) => console.error("[NotifyTicket UserEmail Err]:", e));
  }

  // 3. Correo a la Marca (Admin)
  const brandSubject = `[Nueva Reserva Confirmada] ${ticket.tipo_entrada.toUpperCase()} ($${Number(ticket.monto_pagado).toLocaleString("es-CO")}) - ${lead.alias_nombre}`;
  const brandHtml = `
    <div style="font-family: sans-serif; padding: 20px; background-color: #f7f4ee; color: #1a1a1a;">
      <h2 style="color: #721c24;">Nueva Reserva Confirmada Noche de Luna Llena</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Invitado:</td><td style="padding: 8px; border: 1px solid #ddd;">${lead.alias_nombre}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">WhatsApp:</td><td style="padding: 8px; border: 1px solid #ddd;">${formattedPhone}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Email:</td><td style="padding: 8px; border: 1px solid #ddd;">${lead.email || "N/A"}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Entrada:</td><td style="padding: 8px; border: 1px solid #ddd;">${ticket.tipo_entrada} (${ticket.tipo_pago})</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Monto:</td><td style="padding: 8px; border: 1px solid #ddd;">$${Number(ticket.monto_pagado).toLocaleString("es-CO")} COP</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Método:</td><td style="padding: 8px; border: 1px solid #ddd;">${ticket.metodo_pago}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Ticket Hash:</td><td style="padding: 8px; border: 1px solid #ddd;">${ticket.ticket_hash}</td></tr>
      </table>
    </div>
  `;

  sendTransactionalEmail({
    to: BRAND_NOTIFICATION_EMAIL,
    name: "La Sociedad del Corset Admin",
    fromName: "La Sociedad del Corset",
    subject: brandSubject,
    html: wrapSpanishEmail(brandHtml, brandSubject),
  }).catch((e) => console.error("[NotifyTicket BrandEmail Err]:", e));

  // 4. WhatsApp al Evolution Inicial (Admin Telemetría)
  const adminWaText = 
    `🌕 *RESERVA CONFIRMADA — LA SOCIEDAD DEL CORSET*\n\n` +
    `🎟️ *Entrada:* ${ticket.tipo_entrada.toUpperCase()} (${ticket.tipo_pago})\n` +
    `💵 *Monto:* $${Number(ticket.monto_pagado).toLocaleString("es-CO")} COP\n` +
    `👤 *Invitado:* ${lead.alias_nombre}\n` +
    `📱 *WhatsApp:* ${formattedPhone}\n` +
    `💳 *Método:* ${ticket.metodo_pago}\n` +
    `🔐 *Hash:* ${ticket.ticket_hash.substring(0, 16)}\n` +
    `⏱️ *Hora:* ${formatBogotaTime()}`;

  sendEvolutionWhatsApp(EVOLUTION_INITIAL_NUMBER, adminWaText).catch((e) =>
    console.error("[NotifyTicket Admin WhatsApp Err]:", e)
  );
}

// Notificación para reservas de eventos (Sitio 9 Oct e Impacto 10 Oct)
// Soporta combinación multimensajería si el usuario se registra por primera vez desde un evento
export async function notifyEventReservation(
  ticket: {
    evento: string;
    ticket_hash: string;
  },
  lead: {
    alias_nombre?: string;
    whatsapp: string;
    email?: string;
    rol?: string;
  },
  options?: {
    isNewLead?: boolean;
    affiliateCode?: string;
  }
): Promise<void> {
  const isViernes23 = ticket.evento.includes("viernes-23") || ticket.evento.includes("viernes_23") || ticket.evento.includes("23-oct");
  const isSabado24 = ticket.evento.includes("sabado-24") || ticket.evento.includes("sabado_24") || ticket.evento.includes("24-oct");
  const isTaller = ticket.evento.includes("taller") || ticket.evento.includes("baile");
  const isLuna = ticket.evento.includes("luna_llena") || ticket.evento.includes("luna-llena");
  const isSitio = ticket.evento.includes("sitio") || ticket.evento.includes("9-oct");
  const isImpacto = ticket.evento.includes("impacto") || ticket.evento.includes("10-oct");
  const isCorsetVip = ticket.evento.includes("corset_vip") || ticket.evento.includes("vip");

  let eventTitle = "Evento Oficial El Placer de Compartir";
  if (isViernes23) {
    eventTitle = "Viernes 23 de Octubre — Show de Sexo en Vivo (ElPlacerDC)";
  } else if (isSabado24) {
    eventTitle = "Sábado 24 de Octubre — Camas Francas & Lencería Sexy (ElPlacerDC)";
  } else if (isTaller) {
    eventTitle = "Taller de Baile Erótico — Sensualidad & Heels (Viernes 16 de Octubre)";
  } else if (isLuna) {
    eventTitle = "La Sociedad del Corset — Noche de Luna Llena (Gala Mascarada Noir de Halloween)";
  } else if (isSitio) {
    eventTitle = "Evento Oficial ElPlacerDC (Viernes 9 de Octubre)";
  } else if (isImpacto) {
    eventTitle = "Evento Aliado: Impacto Producciones (Sábado 10 de Octubre)";
  } else if (isCorsetVip) {
    eventTitle = "La Sociedad del Corset — Credencial VIP Anual";
  }

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=ELPLACERDC-EVENT-${ticket.ticket_hash}`;
  const phoneNorm = normalizePhone(lead.whatsapp);
  const formattedPhone = phoneNorm ? phoneNorm.display : lead.whatsapp;
  const isNew = Boolean(options?.isNewLead);
  const affCode = options?.affiliateCode || "segisw";

  // URL del evento específico para el enlace de embajador
  const eventPageUrl = isViernes23
    ? `https://elplacerdecompartir.com/eventos/viernes-23-oct/`
    : isSabado24
    ? `https://elplacerdecompartir.com/eventos/sabado-24-oct/`
    : isTaller
    ? `https://elplacerdecompartir.com/taller-baile-erotico/`
    : isLuna
    ? `https://elplacerdecompartir.com/the-corset-society/luna-llena/`
    : isSitio
    ? `https://elplacerdecompartir.com/eventos/sitio-9-oct/`
    : isImpacto
    ? `https://elplacerdecompartir.com/eventos/impacto-10-oct/`
    : `https://elplacerdecompartir.com/centro-cultural/`;

  const affLink = `${eventPageUrl.replace(/\/+$/, "")}/?ref=${encodeURIComponent(affCode)}`;

  // Programar recordatorios persistentes en PostgreSQL SSoT (BAI-284)
  if (isLuna) {
    pool.query(`
      INSERT INTO scheduled_dispatches (evento, trigger_type, scheduled_for, channel, destination_phone, destination_email, payload, status)
      VALUES 
        ($1, '3_days_before', $2, 'both', $3, $4, $5, 'pending'),
        ($1, 'doors_opening', $6, 'both', $3, $4, $5, 'pending')
    `, [
      ticket.evento,
      new Date("2026-10-28T15:00:00Z"), // 3 días antes (10:00 AM Bogotá)
      lead.whatsapp,
      lead.email || null,
      JSON.stringify({
        alias_nombre: lead.alias_nombre,
        ticket_hash: ticket.ticket_hash,
        eventTitle,
        eventPageUrl,
        affLink
      }),
      new Date("2026-10-31T23:00:00Z")  // Apertura de puertas (6:00 PM Bogotá)
    ]).catch((e) => console.warn("[Schedule Dispatch Insert Err]:", e.message));
  }

  // 1. WhatsApp al asistente
  const gram = getGrammaticalProfile(lead.rol, ticket.evento);
  let waText = "";
  if (isNew) {
    waText =
      `✨ *¡${gram.welcome.toUpperCase()} A EL PLACER DE COMPARTIR!* ✨\n\n` +
      `${gram.greeting} *${lead.alias_nombre || "Invitado"}*, ${gram.possessive} registro y pase para *${eventTitle}* están confirmados.\n\n` +
      `🎫 *Pase ID:* \`${ticket.ticket_hash}\`\n` +
      `📍 *Lugar:* Calle 67 # 23-46 Piso 2, Barrio 7 de Agosto, Bogotá\n\n` +
      `📲 *Ingreso Requerido con QR:* Presenta tu QR al llegar. Lo enviamos a tu correo *${lead.email || "registrado"}*.\n\n` +
      `💎 *${gram.dontGoAlone}. ${gram.shareWithFriends} (3 compras = 1 pase gratis):*\n` +
      `🔗 ${affLink}\n` +
      `⚙️ *Panel de embajador:* https://elplacerdecompartir.com/dashboard\n\n` +
      `🍷 *El Placer de Compartir*`;
  } else {
    waText =
      `🎟️ *RESERVA CONFIRMADA — ${eventTitle.toUpperCase()}*\n\n` +
      `${gram.greeting} *${lead.alias_nombre || "Invitado"}* ✨\n\n` +
      `${gram.possessive.charAt(0).toUpperCase() + gram.possessive.slice(1)} reserva para *${eventTitle}* está registrada exitosamente.\n\n` +
      `🎫 *Ticket ID:* \`${ticket.ticket_hash}\`\n\n` +
      `📍 *Lugar:* Calle 67 # 23-46 Piso 2, Barrio 7 de Agosto, Bogotá\n\n` +
      `📲 *QR de Ingreso:* Presenta tu código al ingresar (enviado a tu correo *${lead.email || "registrado"}*).\n\n` +
      `🎉 *${gram.dontGoAlone}.* ${gram.shareWithFriends} y gana entradas gratuitas:\n` +
      `🔗 ${affLink}\n\n` +
      `🍷 *El Placer de Compartir*`;
  }

  sendEvolutionWhatsApp(lead.whatsapp, waText).catch((e) =>
    console.error("[NotifyEventReservation WA Err]:", e)
  );

  // 2. Correo con QR de asistencia adjunto al asistente
  if (lead.email) {
    const waShareEventMsg = `¡Nos vemos en este evento exclusivo! Puedes reservar aquí: ${affLink}`;
    const xShareEventMsg = `Acompáñame a este evento exclusivo en @elplacerdc:`;
    const waShareEventUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(waShareEventMsg)}`;
    const xShareEventUrl = `https://x.com/intent/post?text=${encodeURIComponent(xShareEventMsg)}&url=${encodeURIComponent(affLink)}`;

    const ambassadorEmailSnippet = `
      <div style="background-color: #250F22; border: 1px solid #c5a059; border-radius: 8px; padding: 20px; margin: 25px 0; text-align: center;">
        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #c5a059; font-weight: bold; display: block; margin-bottom: 6px;">Programa de Embajadores</span>
        <h3 style="color: #ead397; font-size: 15px; margin: 0 0 8px 0;">Gana Entradas Gratuitas por Recomendar</h3>
        <p style="font-size: 12px; color: rgba(247, 244, 238, 0.8); line-height: 1.5; margin: 0 0 12px 0;">
          ¡Nos vemos en el evento! Comparte este evento exclusivo con tus amigos para que reserven contigo: por cada 3 compras de entradas generadas, el sistema te otorga automáticamente 1 pase gratuito.
        </p>
        <div style="padding: 10px; background-color: #0a0608; border-radius: 6px; font-family: monospace; font-size: 13px; color: #ead397; margin-bottom: 14px; word-break: break-all;">
          ${affLink}
        </div>

        <!-- Botones de Compartir Directo -->
        <div style="margin-bottom: 14px;">
          <a href="${waShareEventUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #25D366; color: #ffffff; padding: 10px 18px; border-radius: 24px; text-decoration: none; font-size: 12px; font-weight: bold; display: inline-block; margin: 4px; font-family: sans-serif;">
            📲 Compartir por WhatsApp
          </a>
          <a href="${xShareEventUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #000000; border: 1px solid #c5a059; color: #ead397; padding: 10px 18px; border-radius: 24px; text-decoration: none; font-size: 12px; font-weight: bold; display: inline-block; margin: 4px; font-family: sans-serif;">
            𝕏 Compartir en X
          </a>
        </div>

        <a href="https://elplacerdecompartir.com/dashboard" style="background-color: transparent; color: #c5a059; border: 1px solid #c5a059; padding: 8px 18px; text-decoration: none; font-weight: bold; border-radius: 20px; display: inline-block; text-transform: uppercase; font-size: 10px; letter-spacing: 1px;">
          Entrar a mi Panel y Personalizar Código →
        </a>
      </div>
    `;

    const emailHtml = `
      <div lang="es" xml:lang="es" dir="ltr" class="notranslate" translate="no" style="background-color: #1a0a18; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', Georgia, serif; max-width: 600px; margin: 0 auto; border: 2px solid #c5a059; text-align: center; border-radius: 12px;">
        <div style="margin-bottom: 20px;">
          <img src="${PLACER_LOGO_URL}" alt="El Placer de Compartir" style="height: 80px; width: 80px; border-radius: 50%; border: 2px solid #c5a059; margin: 0 auto; display: block; object-fit: cover;" />
        </div>
        <h1 style="color: #ead397; text-transform: uppercase; letter-spacing: 2px; font-size: 18px; margin: 0 0 5px 0;">El Placer de Compartir</h1>
        <h2 style="color: #f7f4ee; font-size: 15px; margin: 0 0 20px 0; letter-spacing: 1px;">${isNew ? "Bienvenido(a) • Pase Oficial de Ingreso" : "Pase Oficial de Ingreso"}</h2>
        
        <div style="background-color: #250F22; border: 1px solid #c5a059; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: left; font-family: sans-serif;">
          <p style="margin: 4px 0; font-size: 13px;"><strong>Evento:</strong> ${eventTitle}</p>
          <p style="margin: 4px 0; font-size: 13px;"><strong>Titular:</strong> ${lead.alias_nombre || "Invitado(a)"}</p>
          <p style="margin: 4px 0; font-size: 13px;"><strong>Ticket ID:</strong> <span style="font-family: monospace; color: #ead397;">${ticket.ticket_hash}</span></p>
          <p style="margin: 4px 0; font-size: 13px;"><strong>Estado:</strong> Confirmada (Entrada Gratuita)</p>
        </div>

        <div style="margin: 25px 0; padding: 15px; background-color: #ffffff; display: inline-block; border-radius: 8px;">
          <img src="${qrUrl}" alt="QR de Acceso" style="width: 200px; height: 200px; display: block;" />
        </div>
        
        <p style="font-family: sans-serif; font-size: 12px; color: rgba(247, 244, 238, 0.85); line-height: 1.5;">
          <strong>Requerido para el ingreso:</strong> Presenta este código QR desde tu pantalla en la recepción del Centro Cultural para validar tu acceso.
        </p>

        <!-- Sección de Embajador con Enlace del Evento (ANTES del botón final) -->
        ${ambassadorEmailSnippet}

        <!-- Botón de llamado a la acción correspondiente SIEMPRE AL FINAL -->
        <div style="text-align: center; margin: 30px 0 10px 0;">
          <a href="${eventPageUrl}" style="background-color: #c5a059; color: #180a1a; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 50px; display: inline-block; text-transform: uppercase; font-size: 13px; letter-spacing: 1px;">Ver Detalles y Cómo Llegar al Evento 📍 →</a>
        </div>
        
        <hr style="border: 0; border-top: 1px solid rgba(197, 160, 89, 0.25); margin: 25px 0;" />
        <p style="font-size: 11px; color: #888; font-family: sans-serif; margin: 0;">Centro Cultural El Placer de Compartir • Bogotá<br/>Línea Oficial: +57 319 419 4785</p>
      </div>
    `;

    sendTransactionalEmail({
      to: lead.email,
      name: lead.alias_nombre || undefined,
      fromName: "El Placer de Compartir",
      subject: `Tu Pase de Entrada QR — ${eventTitle}`,
      html: wrapSpanishEmail(emailHtml, `Tu Pase de Entrada QR — ${eventTitle}`),
    }).catch((e) => console.error("[NotifyEventReservation Email Err]:", e));
  }

  // 3. Notificación oficial por correo a la Marca (Admin web@elplacerdecompartir.com)
  const brandSubject = `[Nueva Reserva Evento] ${eventTitle} — ${lead.alias_nombre || "Invitado(a)"}`;
  const brandHtml = `
    <div style="font-family: sans-serif; padding: 20px; background-color: #f7f4ee; color: #1a1a1a;">
      <h2 style="color: #721c24;">Nueva Reserva Registrada — Centro Cultural</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Evento:</td><td style="padding: 8px; border: 1px solid #ddd;">${eventTitle}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Titular:</td><td style="padding: 8px; border: 1px solid #ddd;">${lead.alias_nombre || "Invitado(a)"}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">WhatsApp:</td><td style="padding: 8px; border: 1px solid #ddd;">${formattedPhone}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Email:</td><td style="padding: 8px; border: 1px solid #ddd;">${lead.email || "No suministrado"}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Pase ID:</td><td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">${ticket.ticket_hash}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Es Usuario Nuevo:</td><td style="padding: 8px; border: 1px solid #ddd;">${isNew ? "Sí (Nuevo registro)" : "No (Usuario recurrente)"}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Fecha:</td><td style="padding: 8px; border: 1px solid #ddd;">${formatBogotaDateTime()}</td></tr>
      </table>
    </div>
  `;

  sendTransactionalEmail({
    to: BRAND_NOTIFICATION_EMAIL,
    name: "El Placer de Compartir Admin",
    fromName: "El Placer de Compartir",
    subject: brandSubject,
    html: wrapSpanishEmail(brandHtml, brandSubject),
  }).catch((e) => console.error("[NotifyEventReservation BrandEmail Err]:", e));
}

const ALLIANCE_LABELS: Record<string, string> = {
  organizador_eventos_adultos: "Organizador de Eventos Adultos / Mente Abierta",
  tallerista_terapeuta: "Tallerista / Terapeuta (Tantra, Masajes, BDSM Ético)",
  alquiler_espacio_privado: "Alquiler Privado del Espacio (Veladas y Fantasías)",
  produccion_artistica: "Producción Artística / Fotografía / Performance",
  otra_alianza: "Otra Modalidad de Alianza Comercial o Cultural",
};

export async function notifyNewAlliance(
  lead: {
    id?: string;
    alias_nombre?: string | null;
    whatsapp: string | null;
    email?: string | null;
    ciudad?: string | null;
    afiliado_id?: string | null;
  },
  details: {
    tipo_alianza: string;
    propuesta_detalle: string;
  }
): Promise<void> {
  const allianceLabel = ALLIANCE_LABELS[details.tipo_alianza] || details.tipo_alianza;
  const phoneNorm = normalizePhone(lead.whatsapp);
  const formattedPhone = phoneNorm ? phoneNorm.display : (lead.whatsapp || "No suministrado");
  const waDirectDigits = phoneNorm ? phoneNorm.waNumber : (lead.whatsapp || "").replace(/\D/g, "");

  // 1. WhatsApp Directo al Proponente
  if (lead.whatsapp) {
    const allianceWa =
      `🏛️ *CENTRO CULTURAL EL PLACER DE COMPARTIR*\n\n` +
      `Hola *${lead.alias_nombre || "Estimado(a) Aliado(a)"}* ✨\n\n` +
      `Te saludamos directamente por WhatsApp como canal preferencial para la gestión ágil de coproducciones y visitas técnicas.\n\n` +
      `Hemos recibido tu propuesta en la línea de: *${allianceLabel}*.\n\n` +
      `Nuestro equipo de dirección y producción cultural analiza cada iniciativa para garantizar un espacio de máximo consentimiento, confort y resonancia cultural.\n\n` +
      `Nos comunicaremos contigo por esta línea para coordinar detalles técnicos, disponibilidad de fechas y condiciones del espacio.\n\n` +
      `🏛️ *Dirección & Producción — Centro Cultural El Placer de Compartir*`;

    sendEvolutionWhatsApp(lead.whatsapp, allianceWa).catch((e) =>
      console.error("[NotifyAlliance User WhatsApp Err]:", e)
    );
  }

  // 2. Correo al Postulante
  if (lead.email) {
    const allianceHtml = `
      <div style="background-color: #1a0a18; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', Georgia, serif; max-width: 600px; margin: 0 auto; border: 2px solid #c5a059; text-align: center;">
        <div style="margin-bottom: 20px;">
          <img src="${PLACER_LOGO_URL}" alt="Centro Cultural El Placer de Compartir" style="height: 96px; width: 96px; border-radius: 50%; border: 2px solid #c5a059; margin: 0 auto; display: block; object-fit: cover;" />
        </div>
        <h1 style="color: #ead397; text-transform: uppercase; letter-spacing: 2px; font-size: 18px; margin: 0 0 5px 0;">Centro Cultural El Placer de Compartir</h1>
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #c5a059; margin-bottom: 20px;">Dirección & Producción Cultural</div>
        <div style="text-align: left; font-family: 'Inter', Arial, sans-serif; font-size: 14px; line-height: 1.7; color: rgba(247, 244, 238, 0.85);">
          <p>Hola <strong style="color: #ead397;">${lead.alias_nombre || "Estimado(a) Aliado(a)"}</strong>,</p>
          <p>Te hemos confirmado la radicación previa a través de tu WhatsApp (<strong style="color: #ead397;">${formattedPhone}</strong>). Por este medio formal te compartimos el comprobante de recepción para nuestro Centro Cultural en Bogotá.</p>
          <div style="background-color: #260d1d; border-left: 3px solid #c5a059; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0 0 8px 0; font-size: 13px; color: #ead397;">
              📌 <strong>Modalidad:</strong> ${allianceLabel}
            </p>
            <p style="margin: 0; font-size: 12px; color: #f7d6cb; font-style: italic;">
              "${details.propuesta_detalle}"
            </p>
          </div>
          <p>Nuestro equipo de dirección y producción analiza la viabilidad logística, técnica y conceptual de cada iniciativa para preservar un entorno seguro, ético y de máxima comodidad.</p>
          <p>Nos comunicaremos directamente contigo vía WhatsApp para acordar disponibilidad de fechas, tarifas de coproducción o visita técnica a la sede.</p>

          <!-- Botón de llamado a la acción correspondiente SIEMPRE AL FINAL -->
          <div style="text-align: center; margin: 30px 0 10px 0;">
            <a href="https://elplacerdecompartir.com/galeria-centro-cultural/" style="background-color: #c5a059; color: #180a1a; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 50px; display: inline-block; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Ver Galería de Espacios del Centro Cultural 🏛️ →</a>
          </div>
        </div>
        <hr style="border: 0; border-top: 1px solid rgba(197, 160, 89, 0.25); margin: 30px 0;" />
        <p style="font-size: 11px; color: #888; font-family: sans-serif; margin: 0;">Centro Cultural El Placer de Compartir • Bogotá<br/>Línea de Dirección Cultural: +57 319 419 4785</p>
      </div>
    `;

    sendTransactionalEmail({
      to: lead.email,
      name: lead.alias_nombre || undefined,
      fromName: "Centro Cultural El Placer de Compartir",
      subject: "Propuesta de Alianza Recibida — Centro Cultural El Placer de Compartir",
      html: wrapSpanishEmail(allianceHtml, "Propuesta de Alianza Recibida — Centro Cultural"),
    }).catch((e) => console.error("[NotifyAlliance User Email Err]:", e));
  }

  // 3. Correo a la Marca (Admin)
  const brandSubject = `[Nueva Alianza Centro Cultural] ${allianceLabel} - ${lead.alias_nombre}`;
  const brandHtml = `
    <div style="font-family: sans-serif; padding: 20px; background-color: #f7f4ee; color: #1a1a1a;">
      <h2 style="color: #721c24;">Nueva Propuesta de Alianza / Contratación Centro Cultural</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Proponente / Colectivo:</td><td style="padding: 8px; border: 1px solid #ddd;">${lead.alias_nombre || "No especificado"}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">WhatsApp:</td><td style="padding: 8px; border: 1px solid #ddd;"><a href="https://wa.me/${waDirectDigits}">${formattedPhone}</a></td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Email:</td><td style="padding: 8px; border: 1px solid #ddd;">${lead.email || "No suministrado"}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Tipo de Alianza:</td><td style="padding: 8px; border: 1px solid #ddd;">${allianceLabel}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Ciudad / Sede:</td><td style="padding: 8px; border: 1px solid #ddd;">${lead.ciudad || "Bogotá"}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Detalle de la Propuesta:</td><td style="padding: 8px; border: 1px solid #ddd; white-space: pre-wrap;">${details.propuesta_detalle}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Fecha:</td><td style="padding: 8px; border: 1px solid #ddd;">${formatBogotaDateTime()}</td></tr>
      </table>
    </div>
  `;

  sendTransactionalEmail({
    to: BRAND_NOTIFICATION_EMAIL,
    name: "Centro Cultural Admin",
    fromName: "Centro Cultural El Placer de Compartir",
    subject: brandSubject,
    html: wrapSpanishEmail(brandHtml, brandSubject),
  }).catch((e) => console.error("[NotifyAlliance Brand Email Err]:", e));

  // 4. WhatsApp al Evolution Inicial (Admin Telemetría)
  const adminWa =
    `🏛️ *NUEVA PROPUESTA DE ALIANZA*\n\n` +
    `👤 *Proponente:* ${lead.alias_nombre}\n` +
    `🏷️ *Línea:* ${allianceLabel}\n` +
    `📱 *WhatsApp:* ${formattedPhone}\n` +
    `✉️ *Email:* ${lead.email}\n` +
    `📍 *Sede:* ${lead.ciudad || "Bogotá"}\n` +
    `📝 *Propuesta:* ${details.propuesta_detalle.substring(0, 100)}...`;

  sendEvolutionWhatsApp(EVOLUTION_INITIAL_NUMBER, adminWa).catch((e) =>
    console.error("[NotifyAlliance Admin WhatsApp Err]:", e)
  );
}

export async function notifyAmbassadorNewReferral(
  ambassador: { alias: string; nombre?: string | null; whatsapp?: string | null; email?: string | null },
  referral?: { alias_nombre?: string | null; email?: string | null }
): Promise<void> {
  const dashUrl = "https://elplacerdecompartir.com/dashboard";
  if (ambassador.whatsapp) {
    const waText =
      `✨ *¡NUEVO REGISTRO CON TU ENLACE!* ✨\n\n` +
      `Hola *${ambassador.nombre || ambassador.alias}*,\n\n` +
      `Un nuevo usuario se ha registrado en El Placer de Compartir a través de tu enlace de embajador.\n\n` +
      `📌 *Regla de Acreditación (Último Clic):* La venta se acreditará a tu favor una vez que tu referido complete el pago del 100% o asista al evento. Recuerda que el sistema premia la actividad constante acreditando al último enlace visitado antes de comprar o asistir.\n\n` +
      `¡Sigue compartiendo activamente tu enlace en tus grupos de WhatsApp y redes sociales!\n\n` +
      `📊 *Revisa tu progreso en tu panel:*\n👉 ${dashUrl}\n\n` +
      `🍷 *El Placer de Compartir*`;
    sendEvolutionWhatsApp(ambassador.whatsapp, waText).catch((e) =>
      console.error("[NotifyAmbassador Referral WA Err]:", e)
    );
  }

  if (ambassador.email) {
    const emailHtml = `
      <div lang="es" xml:lang="es" dir="ltr" class="notranslate" translate="no" style="background-color: #1a0a18; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', Georgia, serif; max-width: 600px; margin: 0 auto; border: 2px solid #c5a059; text-align: center; border-radius: 12px;">
        <div style="margin-bottom: 20px;">
          <img src="${PLACER_LOGO_URL}" alt="El Placer de Compartir" style="height: 80px; width: 80px; border-radius: 50%; border: 2px solid #c5a059; margin: 0 auto; display: block; object-fit: cover;" />
        </div>
        <h1 style="color: #ead397; text-transform: uppercase; letter-spacing: 2px; font-size: 18px; margin: 0 0 5px 0;">El Placer de Compartir</h1>
        <h2 style="color: #f7f4ee; font-size: 15px; margin: 0 0 20px 0; letter-spacing: 1px;">¡Nuevo Registro Acreditado a tu Enlace!</h2>
        
        <div style="background-color: #250F22; border: 1px solid #c5a059; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: left; font-family: sans-serif;">
          <p style="margin: 4px 0; font-size: 13px;">Hola <strong style="color: #ead397;">${ambassador.nombre || ambassador.alias}</strong>,</p>
          <p style="margin: 8px 0; font-size: 13px; line-height: 1.6;">
            ¡Excelente noticia! Una nueva persona se ha registrado en nuestra comunidad utilizando tu enlace exclusivo de embajador (<span style="color: #ead397; font-family: monospace;">${ambassador.alias}</span>).
          </p>
          <div style="background-color: #140816; border-left: 3px solid #c5a059; padding: 12px; margin: 12px 0; border-radius: 4px;">
            <p style="margin: 0 0 6px 0; font-size: 12px; color: #ead397; font-weight: bold;">
              📌 Regla de Acreditación (Último Clic):
            </p>
            <p style="margin: 0; font-size: 12px; color: rgba(247, 244, 238, 0.85); line-height: 1.5;">
              Las compras se acreditan a tu favor una vez que tu referido complete el pago total (100%) o asista al evento. Nuestro sistema premia la actividad constante: la comisión se adjudica al último enlace que el usuario visitó antes de confirmar su asistencia. ¡Mantén tu enlace en constante movimiento compartiéndolo activamente en tus grupos de WhatsApp y redes sociales! Por cada 3 compras generadas, ganas 1 entrada 100% gratuita.
            </p>
          </div>
        </div>

        <div style="text-align: center; margin: 25px 0;">
          <a href="${dashUrl}" style="background: linear-gradient(135deg, #c5a059, #ead397); color: #0a050c; padding: 12px 28px; text-decoration: none; font-weight: bold; border-radius: 30px; display: inline-block; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Ir a mi Panel de Embajador →</a>
        </div>

        <hr style="border: 0; border-top: 1px solid rgba(197, 160, 89, 0.25); margin: 25px 0;" />
        <p style="font-size: 11px; color: #888; font-family: sans-serif; margin: 0;">Programa Oficial de Embajadores • El Placer de Compartir<br/>Línea Oficial: +57 319 419 4785</p>
      </div>
    `;
    sendTransactionalEmail({
      to: ambassador.email,
      name: ambassador.nombre || ambassador.alias,
      fromName: "El Placer de Compartir",
      subject: "¡Nuevo registro con tu enlace de embajador! — El Placer de Compartir",
      html: wrapSpanishEmail(emailHtml, "Nuevo Registro con tu Enlace"),
    }).catch((e) => console.error("[NotifyAmbassador Referral Email Err]:", e));
  }
}

export async function notifyAmbassadorSaleAcredited(
  ambassador: { alias: string; nombre?: string | null; whatsapp?: string | null; email?: string | null },
  purchasesCount: number,
  freeTicketsEarned: number
): Promise<void> {
  const dashUrl = "https://elplacerdecompartir.com/dashboard";
  const progressInCycle = purchasesCount % 3;
  const remaining = 3 - (progressInCycle === 0 ? 3 : progressInCycle);

  if (ambassador.whatsapp) {
    const waText =
      `🎉 *¡ENTRADA PAGADA ACREDITADA A TU FAVOR!* 🎉\n\n` +
      `Hola *${ambassador.nombre || ambassador.alias}*,\n\n` +
      `Uno de tus referidos ha adquirido una entrada para un evento. ¡Esta venta ha sido acreditada exitosamente a tu cuenta de embajador!\n\n` +
      `📈 *Estado:* Llevas *${purchasesCount}* compra(s) acreditada(s).\n` +
      (remaining === 0 || remaining === 3
        ? `🎁 ¡Has desbloqueado una nueva entrada 100% gratuita!`
        : `🎯 Te falta(n) solo *${remaining}* compra(s) para tu próxima entrada gratis.`) +
      `\n\n👉 Revisa tu panel: ${dashUrl}\n\n` +
      `🍷 *El Placer de Compartir*`;
    sendEvolutionWhatsApp(ambassador.whatsapp, waText).catch((e) =>
      console.error("[NotifyAmbassador Sale WA Err]:", e)
    );
  }

  if (ambassador.email) {
    const emailHtml = `
      <div lang="es" xml:lang="es" dir="ltr" class="notranslate" translate="no" style="background-color: #1a0a18; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', Georgia, serif; max-width: 600px; margin: 0 auto; border: 2px solid #c5a059; text-align: center; border-radius: 12px;">
        <div style="margin-bottom: 20px;">
          <img src="${PLACER_LOGO_URL}" alt="El Placer de Compartir" style="height: 80px; width: 80px; border-radius: 50%; border: 2px solid #c5a059; margin: 0 auto; display: block; object-fit: cover;" />
        </div>
        <h1 style="color: #ead397; text-transform: uppercase; letter-spacing: 2px; font-size: 18px; margin: 0 0 5px 0;">El Placer de Compartir</h1>
        <h2 style="color: #81c784; font-size: 15px; margin: 0 0 20px 0; letter-spacing: 1px;">¡Venta Acreditada a tu Favor! 🎉</h2>
        
        <div style="background-color: #250F22; border: 1px solid #c5a059; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: left; font-family: sans-serif;">
          <p style="margin: 4px 0; font-size: 13px;">Hola <strong style="color: #ead397;">${ambassador.nombre || ambassador.alias}</strong>,</p>
          <p style="margin: 8px 0; font-size: 13px; line-height: 1.6;">
            ¡Excelente desempeño! Uno de tus invitados referidos ha comprado una entrada para un evento y la venta ha sido acreditada oficialmente a tu balance de embajador.
          </p>
          <div style="background-color: #140816; border-left: 3px solid #81c784; padding: 12px; margin: 15px 0; border-radius: 4px;">
            <p style="margin: 2px 0; font-size: 13px; color: #f7f4ee;">
              <strong>Compras Totales Acreditadas:</strong> ${purchasesCount}
            </p>
            <p style="margin: 2px 0; font-size: 13px; color: #ead397;">
              <strong>Entradas Gratuitas Acumuladas:</strong> ${freeTicketsEarned}
            </p>
          </div>
        </div>

        <div style="text-align: center; margin: 25px 0;">
          <a href="${dashUrl}" style="background: linear-gradient(135deg, #c5a059, #ead397); color: #0a050c; padding: 12px 28px; text-decoration: none; font-weight: bold; border-radius: 30px; display: inline-block; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Ver Mi Progreso en el Panel →</a>
        </div>

        <hr style="border: 0; border-top: 1px solid rgba(197, 160, 89, 0.25); margin: 25px 0;" />
        <p style="font-size: 11px; color: #888; font-family: sans-serif; margin: 0;">Programa Oficial de Embajadores • El Placer de Compartir</p>
      </div>
    `;
    sendTransactionalEmail({
      to: ambassador.email,
      name: ambassador.nombre || ambassador.alias,
      fromName: "El Placer de Compartir",
      subject: `¡Nueva compra acreditada a tu favor! (${purchasesCount} ventas) — El Placer de Compartir`,
      html: wrapSpanishEmail(emailHtml, "Compra Acreditada a tu Favor"),
    }).catch((e) => console.error("[NotifyAmbassador Sale Email Err]:", e));
  }
}

export async function notifyAmbassadorFreeTicketWon(
  ambassador: { alias: string; nombre?: string | null; whatsapp?: string | null; email?: string | null },
  totalTicketsWon: number
): Promise<void> {
  const dashUrl = "https://elplacerdecompartir.com/dashboard";
  if (ambassador.whatsapp) {
    const waText =
      `🎟️ *¡FELICIDADES! HAS GANADO 1 ENTRADA GRATUITA* 🎟️\n\n` +
      `Hola *${ambassador.nombre || ambassador.alias}*,\n\n` +
      `¡Has completado 3 compras acreditadas con tu enlace! El sistema te ha asignado *1 ENTRADA 100% GRATUITA* para redimir en nuestros eventos.\n\n` +
      `📌 *Nota:* Para redimir en veladas de La Sociedad del Corset, recuerda contar con tu credencial VIP activa.\n\n` +
      `👉 Ingresa a tu panel para ver tus entradas disponibles: ${dashUrl}\n\n` +
      `🍷 *El Placer de Compartir*`;
    sendEvolutionWhatsApp(ambassador.whatsapp, waText).catch((e) =>
      console.error("[NotifyAmbassador FreeTicket WA Err]:", e)
    );
  }

  if (ambassador.email) {
    const emailHtml = `
      <div lang="es" xml:lang="es" dir="ltr" class="notranslate" translate="no" style="background-color: #1a0a18; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', Georgia, serif; max-width: 600px; margin: 0 auto; border: 2px solid #c5a059; text-align: center; border-radius: 12px;">
        <div style="margin-bottom: 20px;">
          <img src="${PLACER_LOGO_URL}" alt="El Placer de Compartir" style="height: 80px; width: 80px; border-radius: 50%; border: 2px solid #c5a059; margin: 0 auto; display: block; object-fit: cover;" />
        </div>
        <h1 style="color: #ead397; text-transform: uppercase; letter-spacing: 2px; font-size: 18px; margin: 0 0 5px 0;">El Placer de Compartir</h1>
        <h2 style="color: #e57373; font-size: 16px; margin: 0 0 20px 0; letter-spacing: 1px;">¡Recompensa Desbloqueada: 1 Entrada Gratuita! 🎟️</h2>
        
        <div style="background-color: #250F22; border: 1px solid #c5a059; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: left; font-family: sans-serif;">
          <p style="margin: 4px 0; font-size: 13px;">Estimado(a) <strong style="color: #ead397;">${ambassador.nombre || ambassador.alias}</strong>,</p>
          <p style="margin: 8px 0; font-size: 13px; line-height: 1.6;">
            ¡Meta cumplida! Gracias a la difusión de tu enlace, has alcanzado 3 compras acreditadas y se ha generado automáticamente tu recompensa de <strong>1 Entrada 100% Gratuita</strong> (Total acumuladas: ${totalTicketsWon}).
          </p>
          <div style="background-color: #140816; border: 1px solid rgba(197, 160, 89, 0.4); padding: 14px; margin: 15px 0; border-radius: 6px;">
            <p style="margin: 0 0 6px 0; font-size: 12px; color: #ead397; font-weight: bold;">Condiciones de Redención:</p>
            <p style="margin: 0; font-size: 11px; color: rgba(247, 244, 238, 0.8);">
              Válido para eventos oficiales del Centro Cultural El Placer de Compartir. Para veladas privadas de gala de <strong>La Sociedad del Corset</strong>, es indispensable contar con credencial VIP activa.
            </p>
          </div>
        </div>

        <div style="text-align: center; margin: 25px 0;">
          <a href="${dashUrl}" style="background: linear-gradient(135deg, #c5a059, #ead397); color: #0a050c; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 30px; display: inline-block; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Canjear mi Entrada en el Panel →</a>
        </div>

        <hr style="border: 0; border-top: 1px solid rgba(197, 160, 89, 0.25); margin: 25px 0;" />
        <p style="font-size: 11px; color: #888; font-family: sans-serif; margin: 0;">Programa Oficial de Embajadores • El Placer de Compartir</p>
      </div>
    `;
    sendTransactionalEmail({
      to: ambassador.email,
      name: ambassador.nombre || ambassador.alias,
      fromName: "El Placer de Compartir",
      subject: "¡Felicidades! Has ganado 1 Entrada Gratuita — Programa de Embajadores",
      html: wrapSpanishEmail(emailHtml, "Entrada Gratuita Ganada"),
    }).catch((e) => console.error("[NotifyAmbassador FreeTicket Email Err]:", e));
  }
}
