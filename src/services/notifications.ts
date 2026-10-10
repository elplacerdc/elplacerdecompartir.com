// notifications.ts - Multi-Channel Notification Orchestrator
import { sendTransactionalEmail } from "./email";
import { normalizePhone } from "../db";

const BRAND_NOTIFICATION_EMAIL = "web@elplacerdecompartir.com";
const EVOLUTION_INITIAL_NUMBER = "573021004070";
const EVOLUTION_API_URL = process.env.EVOLUTION_URL || process.env.EVOLUTION_API_URL || "http://evolution:8085";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || "481c8c43-0023-4028-bad5-9d1355a3674c";

// Verified public accessible transparent logo for The Corset Society
const CORSET_LOGO_URL = "https://webdev-278-3000.ny1.zerops.app/media/logo_corsetsociety_transparent.png";
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
<html lang="es" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta http-equiv="Content-Language" content="es">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #120713; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  ${content}
</body>
</html>`;
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

    const response = await fetch(`${EVOLUTION_API_URL.replace(/\/$/, "")}/send/text`, {
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
  },
  channel?: "elplacerdc" | "corset" | "centro_cultural" | string
): Promise<void> {
  const effectiveChannel = channel || (lead.corset_vip ? "corset" : "elplacerdc");
  const isCorset = effectiveChannel === "corset";
  const channelName = isCorset ? "The Corset Society (VIP - Membresía Anual)" : "El Placer de Compartir";
  const phoneNorm = normalizePhone(lead.whatsapp);
  const formattedPhone = phoneNorm ? phoneNorm.display : lead.whatsapp;
  const waDirectDigits = phoneNorm ? phoneNorm.waNumber : lead.whatsapp.replace(/\D/g, "");

  // 1. Notificación WhatsApp directa al Lead
  if (isCorset) {
    const leadCorsetWa =
      `🖤 *THE CORSET SOCIETY — CÍRCULO HERMÉTICO*\n\n` +
      `Estimado(a) *${lead.alias_nombre || "Invitado(a)"}*,\n\n` +
      `Te contactamos directo por WhatsApp al ser nuestro canal preferencial y confidencial de atención oficial.\n\n` +
      `Hemos recibido tu postulación de admisión. The Corset Society es la línea de alta exclusividad de ElPlacerDC: un círculo privado de gala con credencial VIP por suscripción anual ($199.000 COP) que otorga acceso a convocatorias privadas, encuentros de ticket alto, descuentos permanentes y beneficios exclusivos.\n\n` +
      `Conoce los detalles de la membresía y activa tu credencial en nuestra página oficial:\n` +
      `👉 https://elplacerdecompartir.com/corset/checkout\n\n` +
      `Tu perfil se encuentra en evaluación confidencial por el comité de admisión.\n\n` +
      `_«El acceso se concede, no se anuncia.»_\n\n` +
      `🏛️ *Dirección & Comité de Admisión • The Corset Society*`;

    sendEvolutionWhatsApp(lead.whatsapp, leadCorsetWa).catch((e) =>
      console.error("[NotifyLead Corset WhatsApp Err]:", e)
    );
  } else {
    const leadPlacerWa =
      `🍷 *EL PLACER DE COMPARTIR — COMUNIDAD & EVENTOS*\n\n` +
      `Hola *${lead.alias_nombre || "Bienvenido(a)"}* ✨\n\n` +
      `Te escribimos directo a tu WhatsApp porque es nuestra línea ágil para eventos, convocatorias comunitarias y coordinación en tiempo real.\n\n` +
      `¡Qué alegría darte la bienvenida! Somos pioneros en Colombia en explorar la libertad relacional, el consentimiento lúcido y el erotismo libre de presiones, con nuestro nuevo Centro Cultural en Bogotá.\n\n` +
      `Te acabamos de remitir a tu correo electrónico una guía con nuestros principios comunitarios, eventos programados y la galería de espacios.\n\n` +
      `Además, puedes unirte a nuestro Programa Oficial de Embajadores y ganar entradas gratuitas:\n` +
      `👉 https://elplacerdecompartir.com/dashboard\n\n` +
      `Guarda este contacto en tu agenda para no perderte nuestras próximas fechas.\n\n` +
      `🍷 *El Placer de Compartir*`;

    sendEvolutionWhatsApp(lead.whatsapp, leadPlacerWa).catch((e) =>
      console.error("[NotifyLead Placer WhatsApp Err]:", e)
    );
  }

  // 2. Correo transaccional al Usuario
  if (lead.email) {
    if (isCorset) {
      // The Corset Society: Remitente en inglés, cuerpo en español, suscripción anual VIP
      const corsetHtml = `
        <div style="background-color: #050505; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', Georgia, serif; max-width: 600px; margin: 0 auto; border: 2px solid #c5a059; text-align: center;">
          <div style="margin-bottom: 25px;">
            <img src="${CORSET_LOGO_URL}" alt="The Corset Society" style="height: 96px; width: auto; margin: 0 auto; display: block;" />
          </div>
          <h1 style="color: #c5a059; text-transform: uppercase; letter-spacing: 3px; font-size: 18px; margin: 0 0 10px 0;">La Sociedad del Corset (The Corset Society)</h1>
          <div style="width: 40px; height: 1px; background-color: #c5a059; margin: 0 auto 25px auto;"></div>
          <div style="text-align: left; font-family: 'Plus Jakarta Sans', Arial, sans-serif; font-size: 14px; line-height: 1.7; color: rgba(247, 244, 238, 0.85);">
            <p>Estimado(a) <strong style="color: #ead397;">${lead.alias_nombre || "Invitado(a)"}</strong>,</p>
            <p>Te hemos enviado previamente un saludo directo a tu WhatsApp (<strong style="color: #ead397;">${formattedPhone}</strong>), nuestro canal prioritario para coordinaciones ágiles. Mediante esta comunicación formal dejamos constancia institucional de tu solicitud de admisión a <strong>La Sociedad del Corset (The Corset Society)</strong>, la línea de alta exclusividad de ElPlacerDC.</p>
            
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

            <div style="text-align: center; margin: 30px 0;">
              <a href="https://elplacerdecompartir.com/corset/checkout" style="background: linear-gradient(135deg, #c5a059, #ead397); color: #050505; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 50px; display: inline-block; text-transform: uppercase; font-size: 13px; letter-spacing: 1px;">Activar Credencial VIP Online</a>
            </div>

            <p style="color: #ead397; font-style: italic; font-family: 'Cinzel', Georgia, serif; text-align: center; margin: 25px 0; font-size: 15px;">
              «El acceso se concede, no se anuncia.»
            </p>

            <!-- Invitación de Embajador -->
            <div style="background-color: #140816; border: 1px solid rgba(197, 160, 89, 0.3); padding: 16px; border-radius: 8px; margin-top: 25px; text-align: center;">
              <p style="font-size: 12px; color: #ead397; margin: 0 0 10px 0; font-weight: bold;">¿Deseas compartir este círculo con personas de tu confianza?</p>
              <p style="font-size: 11px; color: rgba(247, 244, 238, 0.7); margin: 0 0 12px 0;">Únete como Embajador: por cada 3 compras generadas con tu enlace, obtienes una entrada 100% gratuita.</p>
              <a href="https://elplacerdecompartir.com/dashboard" style="display: inline-block; font-size: 11px; color: #c5a059; border: 1px solid #c5a059; padding: 8px 16px; border-radius: 20px; text-decoration: none; text-transform: uppercase; font-weight: bold;">Acceder a mi Panel de Embajador →</a>
            </div>

          </div>
          <hr style="border: 0; border-top: 1px solid rgba(197, 160, 89, 0.25); margin: 30px 0;" />
          <p style="font-size: 11px; color: #888; font-family: sans-serif; margin: 0;">La Sociedad del Corset (The Corset Society) • Círculo Privado de Gala<br/>Línea Oficial: +57 319 419 4785 • Bogotá, Colombia</p>
        </div>
      `;

      sendTransactionalEmail({
        to: lead.email,
        name: lead.alias_nombre || undefined,
        fromName: "La Sociedad del Corset (The Corset Society)",
        subject: "La Sociedad del Corset (The Corset Society) — Solicitud de Membresía Anual VIP",
        html: wrapSpanishEmail(corsetHtml, "La Sociedad del Corset (The Corset Society)"),
      }).catch((e) => console.error("[NotifyLead Corset Email Err]:", e));
    } else {
      // El Placer de Compartir: Identidad Centro Cultural (no bar swinger, no zonas húmedas, eventos)
      const placerHtml = `
        <div style="background-color: #1a0a18; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', Georgia, serif; max-width: 600px; margin: 0 auto; border: 2px solid #591f26; text-align: center;">
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

            <div style="text-align: center; margin: 25px 0;">
              <a href="https://elplacerdecompartir.com/galeria-centro-cultural" style="background-color: #c5a059; color: #180a1a; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 30px; display: inline-block; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Ver Galería del Centro Cultural 🏛️</a>
            </div>

            <!-- Invitación de Embajador -->
            <div style="background-color: #250f22; border: 1px solid rgba(197, 160, 89, 0.3); padding: 16px; border-radius: 8px; margin-top: 25px; text-align: center;">
              <p style="font-size: 12px; color: #ead397; margin: 0 0 8px 0; font-weight: bold;">Gana Entradas como Embajador</p>
              <p style="font-size: 11px; color: rgba(247, 244, 238, 0.7); margin: 0 0 10px 0;">Invita a personas de mente abierta y obtén entradas gratuitas a todos nuestros eventos.</p>
              <a href="https://elplacerdecompartir.com/dashboard" style="display: inline-block; font-size: 11px; color: #ead397; border: 1px solid #c5a059; padding: 6px 14px; border-radius: 20px; text-decoration: none; text-transform: uppercase;">Ir al Panel de Embajadores →</a>
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
    ? `[Nuevo Lead VIP] ${lead.alias_nombre || "Anónimo"} (${lead.rol || "General"}) - La Sociedad del Corset (The Corset Society)`
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
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Fecha:</td><td style="padding: 8px; border: 1px solid #ddd;">${new Date().toISOString()}</td></tr>
      </table>
    </div>
  `;

  sendTransactionalEmail({
    to: BRAND_NOTIFICATION_EMAIL,
    name: isCorset ? "La Sociedad del Corset (The Corset Society) Admin" : "El Placer de Compartir Admin",
    fromName: isCorset ? "La Sociedad del Corset (The Corset Society)" : "El Placer de Compartir",
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
    `⏱️ *Hora:* ${new Date().toLocaleTimeString("es-CO")}`;

  sendEvolutionWhatsApp(EVOLUTION_INITIAL_NUMBER, adminWaText).catch((e) =>
    console.error("[NotifyLead Admin WhatsApp Err]:", e)
  );
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
  }
): Promise<void> {
  const ticketUrl = `https://elplacerdecompartir.com/the-corset-society/ticket?hash=${ticket.ticket_hash}`;
  const phoneNorm = normalizePhone(lead.whatsapp);
  const formattedPhone = phoneNorm ? phoneNorm.display : lead.whatsapp;

  // 1. WhatsApp Directo al Comprador
  const buyerWaText = 
    `🌕 *CREDENCIAL OFICIAL CONFIRMADA — THE CORSET SOCIETY*\n\n` +
    `Estimado(a) *${lead.alias_nombre || "Invitado(a)"}*,\n\n` +
    `Tu acceso para la velada privada *Noche de Luna Llena* (Sábado 31 de Octubre) ha sido confirmado con éxito.\n\n` +
    `🎟️ *Pase:* ${ticket.tipo_entrada.toUpperCase()}\n` +
    `💵 *Monto:* $${Number(ticket.monto_pagado).toLocaleString("es-CO")} COP (${ticket.tipo_pago === "reserva_40" ? "Separación 40%" : "Pago Total 100%"})\n\n` +
    `🔐 *Accede a tu credencial digital con código QR scannable:*\n${ticketUrl}\n\n` +
    `🛡️ *Seguridad y Confianza:* Tu transacción ha sido procesada de manera segura a nombre de *Baiosfera* (nuestro operador tecnológico y fiduciario oficial).\n\n` +
    `📍 *Lugar:* Centro Cultural El Placer de Compartir, Bogotá. Presenta tu credencial digital en puerta.\n\n` +
    `_«El acceso se concede, no se anuncia.»_\n\n` +
    `🏛️ *Dirección & Producción • La Sociedad del Corset (The Corset Society)*`;

  sendEvolutionWhatsApp(lead.whatsapp, buyerWaText).catch((e) =>
    console.error("[NotifyTicket Buyer WhatsApp Err]:", e)
  );

  // 2. Correo al Usuario con Credencial Oficial
  if (lead.email) {
    const userSubject = "La Sociedad del Corset (The Corset Society) — Tu Credencial Digital Sellada (Noche de Luna Llena)";
    const userHtml = `
      <div style="background-color: #050505; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', serif, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #c5a059; text-align: center;">
        <div style="margin-bottom: 25px;">
          <img src="${CORSET_LOGO_URL}" alt="The Corset Society" style="height: 96px; width: auto; margin: 0 auto; display: block;" />
        </div>
        <h1 style="color: #c5a059; text-transform: uppercase; letter-spacing: 2px; font-size: 20px; margin: 0 0 10px 0;">La Sociedad del Corset (The Corset Society)</h1>
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
          <div style="text-align: center; margin: 25px 0;">
            <a href="${ticketUrl}" style="background-color: #c5a059; color: #050505; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 50px; display: inline-block; text-transform: uppercase; font-size: 13px; letter-spacing: 1px;">Ver Credencial Digital con QR</a>
          </div>
          <p style="font-size: 12px; color: #aaa;">Recuerda presentar el código QR scannable de tu credencial al ingresar. Ubicación: Centro Cultural El Placer de Compartir, Bogotá.</p>
          <div style="margin-top: 20px; padding: 10px; background-color: #1a0b1c; border: 1px solid rgba(197, 160, 89, 0.4); border-radius: 6px; text-align: center;">
            <p style="margin: 0; font-size: 11px; color: #ead397;">🛡️ <strong>Seguridad Transaccional:</strong> Pagos y transacciones procesadas con seguridad a nombre de <strong>Baiosfera</strong>.</p>
          </div>
        </div>
        <hr style="border: 0; border-top: 1px solid rgba(197, 160, 89, 0.3); margin: 30px 0;" />
        <p style="font-size: 11px; color: #888;">El acceso se concede, no se anuncia. Bogotá, Colombia.</p>
      </div>
    `;

    sendTransactionalEmail({
      to: lead.email,
      name: lead.alias_nombre || undefined,
      fromName: "La Sociedad del Corset (The Corset Society)",
      subject: userSubject,
      html: wrapSpanishEmail(userHtml, userSubject),
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
    name: "La Sociedad del Corset (The Corset Society) Admin",
    fromName: "La Sociedad del Corset (The Corset Society)",
    subject: brandSubject,
    html: wrapSpanishEmail(brandHtml, brandSubject),
  }).catch((e) => console.error("[NotifyTicket BrandEmail Err]:", e));

  // 4. WhatsApp al Evolution Inicial (Admin Telemetría)
  const adminWaText = 
    `🌕 *RESERVA CONFIRMADA — CORSET SOCIETY*\n\n` +
    `🎟️ *Entrada:* ${ticket.tipo_entrada.toUpperCase()} (${ticket.tipo_pago})\n` +
    `💵 *Monto:* $${Number(ticket.monto_pagado).toLocaleString("es-CO")} COP\n` +
    `👤 *Invitado:* ${lead.alias_nombre}\n` +
    `📱 *WhatsApp:* ${formattedPhone}\n` +
    `💳 *Método:* ${ticket.metodo_pago}\n` +
    `🔐 *Hash:* ${ticket.ticket_hash.substring(0, 16)}\n` +
    `⏱️ *Hora:* ${new Date().toLocaleTimeString("es-CO")}`;

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
  },
  options?: {
    isNewLead?: boolean;
    affiliateCode?: string;
  }
): Promise<void> {
  const isSitio = ticket.evento.includes("sitio") || ticket.evento.includes("9-oct");
  const eventTitle = isSitio ? "Evento Oficial ElPlacerDC (Viernes 9 de Octubre)" : "Evento Aliado: Impacto Producciones (Sábado 10 de Octubre)";
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=ELPLACERDC-EVENT-${ticket.ticket_hash}`;
  const phoneNorm = normalizePhone(lead.whatsapp);
  const formattedPhone = phoneNorm ? phoneNorm.display : lead.whatsapp;
  const isNew = Boolean(options?.isNewLead);
  const affCode = options?.affiliateCode || "embajador";
  const affLink = `https://elplacerdecompartir.com/?ref=${affCode}`;

  // 1. WhatsApp al asistente
  let waText = "";
  if (isNew) {
    waText =
      `✨ *¡BIENVENIDO(A) A EL PLACER DE COMPARTIR!* ✨\n\n` +
      `Hola *${lead.alias_nombre || "Bienvenido(a)"}*, tu registro a nuestra comunidad y tu pase para *${eventTitle}* han sido confirmados exitosamente.\n\n` +
      `🎫 *Pase ID:* \`${ticket.ticket_hash}\`\n` +
      `📍 *Ubicación:* Centro Cultural El Placer de Compartir, Bogotá.\n\n` +
      `📲 *Ingreso Requerido con QR:* Es requerido para el ingreso presentar tu código QR en tu pantalla al llegar. Lo hemos enviado a tu correo *${lead.email || "registrado"}*.\n\n` +
      `💎 *TU ENLACE DE EMBAJADOR EXCLUSIVO:*\n` +
      `Al registrarte, ya cuentas con tu enlace oficial de embajador. Por cada 3 compras generadas con tu link, ¡recibes 1 entrada 100% gratuita!\n` +
      `🔗 *Enlace:* ${affLink}\n` +
      `⚙️ *Personaliza tu código y sigue tus pases en:* https://elplacerdecompartir.com/dashboard\n\n` +
      `🍷 *El Placer de Compartir*`;
  } else {
    waText =
      `🎟️ *RESERVA CONFIRMADA — ${eventTitle.toUpperCase()}*\n\n` +
      `Hola *${lead.alias_nombre || "Bienvenido(a)"}* ✨\n\n` +
      `Tu reserva para *${eventTitle}* en el Centro Cultural El Placer de Compartir ha sido registrada exitosamente.\n\n` +
      `🎫 *Ticket ID:* \`${ticket.ticket_hash}\`\n\n` +
      `📲 *Ingreso Requerido con QR:* Es requerido para el ingreso presentar tu código QR de asistencia al momento de entrar. Lo hemos enviado a tu correo *${lead.email || "registrado"}*.\n\n` +
      `📍 *Dirección:* Centro Cultural El Placer de Compartir, Bogotá.\n\n` +
      `🎉 *¡Nos vemos en el evento!* Comparte tu enlace exclusivo con tus amigos para que reserven contigo y gana entradas gratuitas:\n` +
      `🔗 ${affLink}\n\n` +
      `🍷 *El Placer de Compartir*`;
  }

  sendEvolutionWhatsApp(lead.whatsapp, waText).catch((e) =>
    console.error("[NotifyEventReservation WA Err]:", e)
  );

  // 2. Correo con QR de asistencia adjunto al asistente
  if (lead.email) {
    const ambassadorEmailSnippet = `
      <div style="background-color: #250F22; border: 1px solid #c5a059; border-radius: 8px; padding: 20px; margin: 25px 0; text-align: center;">
        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #c5a059; font-weight: bold; display: block; margin-bottom: 6px;">Programa de Embajadores</span>
        <h3 style="color: #ead397; font-size: 15px; margin: 0 0 8px 0;">Gana Entradas Gratuitas por Recomendar</h3>
        <p style="font-size: 12px; color: rgba(247, 244, 238, 0.8); line-height: 1.5; margin: 0 0 12px 0;">
          ¡Nos vemos en el evento! Comparte tu enlace exclusivo con tus amigos para que reserven contigo: por cada 3 compras de entradas generadas, el sistema te otorga automáticamente 1 pase gratuito.
        </p>
        <div style="padding: 10px; background-color: #0a0608; border-radius: 6px; font-family: monospace; font-size: 13px; color: #ead397; margin-bottom: 14px; word-break: break-all;">
          ${affLink}
        </div>
        <a href="https://elplacerdecompartir.com/dashboard" style="background-color: #c5a059; color: #0a0608; padding: 10px 20px; text-decoration: none; font-weight: bold; border-radius: 20px; display: inline-block; text-transform: uppercase; font-size: 11px; letter-spacing: 1px;">
          Entrar a mi Panel y Personalizar Código →
        </a>
      </div>
    `;

    const emailHtml = `
      <div style="background-color: #1a0a18; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', Georgia, serif; max-width: 600px; margin: 0 auto; border: 2px solid #c5a059; text-align: center; border-radius: 12px;">
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

        ${ambassadorEmailSnippet}
        
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
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Fecha:</td><td style="padding: 8px; border: 1px solid #ddd;">${new Date().toLocaleString("es-CO")}</td></tr>
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
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Fecha:</td><td style="padding: 8px; border: 1px solid #ddd;">${new Date().toISOString()}</td></tr>
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
      `Sigue sumando registros y ventas para obtener tus entradas 100% gratuitas.\n\n` +
      `📊 *Revisa tu progreso en tu panel:*\n👉 ${dashUrl}\n\n` +
      `🍷 *El Placer de Compartir*`;
    sendEvolutionWhatsApp(ambassador.whatsapp, waText).catch((e) =>
      console.error("[NotifyAmbassador Referral WA Err]:", e)
    );
  }

  if (ambassador.email) {
    const emailHtml = `
      <div style="background-color: #1a0a18; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', Georgia, serif; max-width: 600px; margin: 0 auto; border: 2px solid #c5a059; text-align: center; border-radius: 12px;">
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
          <p style="margin: 8px 0; font-size: 13px; color: rgba(247, 244, 238, 0.7);">
            Cuando tus referidos adquieran entradas para nuestros eventos oficiales o veladas privadas, acumularás ventas. ¡Por cada 3 compras generadas, ganas 1 entrada 100% gratuita!
          </p>
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
      <div style="background-color: #1a0a18; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', Georgia, serif; max-width: 600px; margin: 0 auto; border: 2px solid #c5a059; text-align: center; border-radius: 12px;">
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
          <a href="${dashUrl}" style="background: linear-gradient(135deg, #c5a059, #ead397); color: #0a050c; padding: 12px 28px; text-decoration: none; font-weight: bold; border-radius: 30px; display: inline-block; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Ver Mi Progreso en el Dashboard →</a>
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
      `📌 *Nota:* Para redimir en veladas de The Corset Society, recuerda contar con tu credencial VIP activa.\n\n` +
      `👉 Ingresa a tu panel para ver tus entradas disponibles: ${dashUrl}\n\n` +
      `🍷 *El Placer de Compartir*`;
    sendEvolutionWhatsApp(ambassador.whatsapp, waText).catch((e) =>
      console.error("[NotifyAmbassador FreeTicket WA Err]:", e)
    );
  }

  if (ambassador.email) {
    const emailHtml = `
      <div style="background-color: #1a0a18; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', Georgia, serif; max-width: 600px; margin: 0 auto; border: 2px solid #c5a059; text-align: center; border-radius: 12px;">
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
              Válido para eventos oficiales del Centro Cultural El Placer de Compartir. Para veladas privadas de gala de <strong>The Corset Society</strong>, es indispensable contar con credencial VIP activa.
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
