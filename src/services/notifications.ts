// notifications.ts - Multi-Channel Notification Orchestrator
import { sendTransactionalEmail } from "./email";

const BRAND_NOTIFICATION_EMAIL = "web@elplacerdecompartir.com";
const EVOLUTION_INITIAL_NUMBER = "573021004070";
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || "http://evolution:8085";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || "481c8c43-0023-4028-bad5-9d1355a3674c";

export async function sendEvolutionWhatsApp(
  number: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Normalizar número internacional (Colombia)
    let cleanNumber = number.replace(/\D/g, "");
    if (cleanNumber.length === 10 && cleanNumber.startsWith("3")) {
      cleanNumber = `57${cleanNumber}`;
    }

    const response = await fetch(`${EVOLUTION_API_URL}/send/text`, {
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

export async function notifyNewLead(lead: {
  id?: string;
  alias_nombre?: string;
  whatsapp: string;
  email?: string;
  rol?: string;
  ciudad?: string;
  origen?: string;
  corset_vip?: boolean;
}): Promise<void> {
  const channelName = lead.corset_vip ? "The Corset Society (VIP)" : "El Placer de Compartir";

  // 1. Correo transaccional al Usuario (si suministró email)
  if (lead.email) {
    const userSubject = lead.corset_vip
      ? "The Corset Society — Solicitud Registrada"
      : "Bienvenido a El Placer de Compartir";

    const userHtml = `
      <div style="background-color: #050505; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', serif, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #c5a059;">
        <h1 style="color: #c5a059; text-transform: uppercase; letter-spacing: 2px; font-size: 20px;">${channelName}</h1>
        <p>Hola <strong>${lead.alias_nombre || "Invitado"}</strong>,</p>
        <p>${
          lead.corset_vip
            ? "Tu solicitud para acceder a nuestro círculo privado ha sido recibida con estricto sigilo. Evaluamos cada perfil con detenimiento para salvaguardar la intimidad de nuestras veladas. El acceso se concede, no se anuncia."
            : "Te damos la bienvenida a nuestra comunidad de libertad, erotismo consciente y respeto mutuo. Pronto recibirás nuestras convocatorias a encuentros y talleres."
        }</p>
        <hr style="border: 0; border-top: 1px solid rgba(197, 160, 89, 0.3); margin: 30px 0;" />
        <p style="font-size: 11px; color: #888;">El Placer de Compartir • Bogotá & Medellín<br/>Línea Oficial: +57 319 419 4785</p>
      </div>
    `;

    sendTransactionalEmail({
      to: lead.email,
      name: lead.alias_nombre || undefined,
      subject: userSubject,
      html: userHtml,
    }).catch((e) => console.error("[NotifyLead UserEmail Err]:", e));
  }

  // 2. Correo transaccional a la Marca (web@elplacerdecompartir.com)
  const brandSubject = `[Nuevo Lead] ${lead.alias_nombre || "Anónimo"} (${lead.rol || "General"}) - ${channelName}`;
  const brandHtml = `
    <div style="font-family: sans-serif; padding: 20px; background-color: #f7f4ee; color: #1a1a1a;">
      <h2 style="color: #b84a39;">Nuevo Registro en Plataforma</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Canal:</td><td style="padding: 8px; border: 1px solid #ddd;">${channelName}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Alias / Nombre:</td><td style="padding: 8px; border: 1px solid #ddd;">${lead.alias_nombre || "No especificado"}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">WhatsApp:</td><td style="padding: 8px; border: 1px solid #ddd;"><a href="https://wa.me/${lead.whatsapp.replace(/\D/g, "")}">${lead.whatsapp}</a></td></tr>
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
    name: "El Placer de Compartir Admin",
    subject: brandSubject,
    html: brandHtml,
  }).catch((e) => console.error("[NotifyLead BrandEmail Err]:", e));

  // 3. Notificación WhatsApp al Evolution Inicial (3021004070)
  const waText = 
    `🔥 *NUEVO REGISTRO EN WEB*\n\n` +
    `🏷️ *Canal:* ${channelName}\n` +
    `👤 *Alias:* ${lead.alias_nombre || "No especificado"}\n` +
    `📱 *WhatsApp:* ${lead.whatsapp}\n` +
    `✉️ *Email:* ${lead.email || "No suministrado"}\n` +
    `🎭 *Modalidad:* ${lead.rol || "General"}\n` +
    `📍 *Ciudad:* ${lead.ciudad || "Bogotá"}\n` +
    `⏱️ *Hora:* ${new Date().toLocaleTimeString("es-CO")}`;

  sendEvolutionWhatsApp(EVOLUTION_INITIAL_NUMBER, waText).catch((e) =>
    console.error("[NotifyLead Evolution WhatsApp Err]:", e)
  );
}

export async function notifyNewTicket(ticket: {
  id?: string;
  tipo_entrada: string;
  tipo_pago: string;
  monto_pagado: number | string;
  metodo_pago: string;
  ticket_hash: string;
}, lead: {
  alias_nombre?: string;
  whatsapp: string;
  email?: string;
}): Promise<void> {
  // 1. Correo al Usuario
  if (lead.email) {
    const userSubject = "The Corset Society — Tu Credencial Digital (Noche de Luna Llena)";
    const ticketUrl = `https://elplacerdecompartir.com/the-corset-society/ticket?hash=${ticket.ticket_hash}`;
    const userHtml = `
      <div style="background-color: #050505; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', serif, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #c5a059;">
        <h1 style="color: #c5a059; text-transform: uppercase; letter-spacing: 2px; font-size: 20px;">The Corset Society</h1>
        <h2 style="color: #ead397; font-size: 16px;">Noche de Luna Llena 🌕</h2>
        <p>Estimado(a) <strong>${lead.alias_nombre || "Invitado"}</strong>,</p>
        <p>Tu reserva para la velada privada del <strong>Sábado 31 de Octubre</strong> ha sido registrada con éxito.</p>
        <div style="background-color: #140a18; border: 1px solid #c5a059; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Pase:</strong> ${ticket.tipo_entrada.toUpperCase()}</p>
          <p style="margin: 5px 0;"><strong>Modalidad:</strong> ${ticket.tipo_pago === "reserva_40" ? "Separación 40%" : "Pago Total 100%"}</p>
          <p style="margin: 5px 0;"><strong>Monto:</strong> $${Number(ticket.monto_pagado).toLocaleString("es-CO")} COP</p>
          <p style="margin: 5px 0;"><strong>ID Lacrado:</strong> ${ticket.ticket_hash.substring(0, 16)}</p>
        </div>
        <p><a href="${ticketUrl}" style="background-color: #c5a059; color: #050505; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 4px; display: inline-block;">Ver Credencial Oficial</a></p>
        <hr style="border: 0; border-top: 1px solid rgba(197, 160, 89, 0.3); margin: 30px 0;" />
        <p style="font-size: 11px; color: #888;">El acceso se concede, no se anuncia. Bogotá, Colombia.</p>
      </div>
    `;

    sendTransactionalEmail({
      to: lead.email,
      name: lead.alias_nombre || undefined,
      subject: userSubject,
      html: userHtml,
    }).catch((e) => console.error("[NotifyTicket UserEmail Err]:", e));
  }

  // 2. Correo a la Marca
  const brandSubject = `[Nueva Reserva] ${ticket.tipo_entrada.toUpperCase()} ($${Number(ticket.monto_pagado).toLocaleString("es-CO")}) - ${lead.alias_nombre}`;
  const brandHtml = `
    <div style="font-family: sans-serif; padding: 20px; background-color: #f7f4ee; color: #1a1a1a;">
      <h2 style="color: #721c24;">Nueva Reserva Noche de Luna Llena</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Invitado:</td><td style="padding: 8px; border: 1px solid #ddd;">${lead.alias_nombre}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">WhatsApp:</td><td style="padding: 8px; border: 1px solid #ddd;">${lead.whatsapp}</td></tr>
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
    name: "The Corset Society Concierge",
    subject: brandSubject,
    html: brandHtml,
  }).catch((e) => console.error("[NotifyTicket BrandEmail Err]:", e));

  // 3. WhatsApp a Evolution Inicial
  const waText = 
    `🌕 *NUEVA RESERVA DE ENTRADA — CORSET SOCIETY*\n\n` +
    `🎟️ *Entrada:* ${ticket.tipo_entrada.toUpperCase()} (${ticket.tipo_pago})\n` +
    `💵 *Monto:* $${Number(ticket.monto_pagado).toLocaleString("es-CO")} COP\n` +
    `👤 *Invitado:* ${lead.alias_nombre}\n` +
    `📱 *WhatsApp:* ${lead.whatsapp}\n` +
    `💳 *Método:* ${ticket.metodo_pago}\n` +
    `🔐 *Hash:* ${ticket.ticket_hash.substring(0, 16)}\n` +
    `⏱️ *Hora:* ${new Date().toLocaleTimeString("es-CO")}`;

  sendEvolutionWhatsApp(EVOLUTION_INITIAL_NUMBER, waText).catch((e) =>
    console.error("[NotifyTicket Evolution WhatsApp Err]:", e)
  );
}
