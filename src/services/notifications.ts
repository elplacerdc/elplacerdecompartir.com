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

export async function sendEvolutionWhatsApp(
  number: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const phoneNorm = normalizePhone(number);
    const cleanNumber = phoneNorm ? phoneNorm.waNumber : number.replace(/\D/g, "");

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
  const channelName = isCorset ? "The Corset Society (VIP - Ticket Alto)" : "El Placer de Compartir";
  const phoneNorm = normalizePhone(lead.whatsapp);
  const formattedPhone = phoneNorm ? phoneNorm.display : lead.whatsapp;
  const waDirectDigits = phoneNorm ? phoneNorm.waNumber : lead.whatsapp.replace(/\D/g, "");

  // 1. Notificación WhatsApp directa al Lead (Canal Primario de Comunicación Ágil)
  if (isCorset) {
    const leadCorsetWa =
      `🖤 *THE CORSET SOCIETY — CÍRCULO HERMÉTICO*\n\n` +
      `Estimado(a) *${lead.alias_nombre || "Invitado(a)"}*,\n\n` +
      `Te contactamos directo por WhatsApp al ser nuestro canal preferencial y confidencial de atención oficial.\n\n` +
      `Hemos recibido tu postulación de ingreso. The Corset Society celebra encuentros privados de etiqueta rigurosa, concebidos como experiencias de ticket alto con aforo estrictamente limitado y covers de mayor valor, diseñados como filtro natural para salvaguardar la intimidad, la elegancia y la distinción de nuestras veladas.\n\n` +
      `Tu perfil se encuentra en evaluación confidencial. Te hemos enviado en paralelo a tu correo un dossier formal con el manifiesto institucional y los códigos de etiqueta.\n\n` +
      `_«El acceso se concede, no se anuncia.»_\n\n` +
      `🎩 *Concierge Oficial • The Corset Society*`;

    sendEvolutionWhatsApp(lead.whatsapp, leadCorsetWa).catch((e) =>
      console.error("[NotifyLead Corset WhatsApp Err]:", e)
    );
  } else {
    const leadPlacerWa =
      `🌹 *EL PLACER DE COMPARTIR — COMUNIDAD*\n\n` +
      `Hola *${lead.alias_nombre || "Bienvenido(a)"}* ✨\n\n` +
      `Te escribimos directo a tu WhatsApp porque es nuestra línea ágil para convocatorias comunitarias y coordinación en tiempo real.\n\n` +
      `¡Qué alegría darte la bienvenida! Somos pioneros en Colombia en explorar la libertad relacional, el consentimiento lúcido y el erotismo libre de presiones.\n\n` +
      `Te acabamos de remitir a tu correo electrónico una guía con nuestros principios comunitarios y la presentación de nuestro nuevo Centro Cultural en Bogotá.\n\n` +
      `Guarda este contacto en tu agenda para no perderte nuestras próximas fechas.\n\n` +
      `🌹 *El Placer de Compartir*`;

    sendEvolutionWhatsApp(lead.whatsapp, leadPlacerWa).catch((e) =>
      console.error("[NotifyLead Placer WhatsApp Err]:", e)
    );
  }

  // 2. Correo transaccional al Usuario (Dossier Formal Complementario - No Redundante)
  if (lead.email) {
    if (isCorset) {
      // The Corset Society: Noir & Gold con logo transparente garantizado
      const corsetHtml = `
        <div style="background-color: #050505; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', Georgia, serif; max-width: 600px; margin: 0 auto; border: 2px solid #c5a059; text-align: center;">
          <div style="margin-bottom: 25px;">
            <img src="${CORSET_LOGO_URL}" alt="The Corset Society" style="height: 96px; width: auto; margin: 0 auto; display: block;" />
          </div>
          <h1 style="color: #c5a059; text-transform: uppercase; letter-spacing: 3px; font-size: 18px; margin: 0 0 10px 0;">The Corset Society</h1>
          <div style="width: 40px; height: 1px; background-color: #c5a059; margin: 0 auto 25px auto;"></div>
          <div style="text-align: left; font-family: 'Plus Jakarta Sans', Arial, sans-serif; font-size: 14px; line-height: 1.7; color: rgba(247, 244, 238, 0.85);">
            <p>Estimado(a) <strong style="color: #ead397;">${lead.alias_nombre || "Invitado(a)"}</strong>,</p>
            <p>Te hemos enviado previamente un saludo directo a tu WhatsApp (<strong style="color: #ead397;">${formattedPhone}</strong>), nuestro canal prioritario de concierge para coordinaciones ágiles. Mediante esta comunicación formal dejamos constancia institucional de tu solicitud de admisión.</p>
            <div style="background-color: #0f0a0d; border-left: 3px solid #c5a059; padding: 16px; margin: 20px 0; border-radius: 4px;">
              <p style="margin: 0; font-size: 13px; color: #f7f4ee;">
                👑 <strong>Círculo Privado de Ticket Alto:</strong> Nuestras galas cuentan con covers e inversión de nivel prémium, diseñados como filtro natural para salvaguardar la intimidad, la elegancia patrimonial y el aforo sumamente reservado de cada velada.
              </p>
            </div>
            <p><strong>Criterios de Admisión:</strong></p>
            <ul style="padding-left: 20px; color: rgba(247, 244, 238, 0.75); font-size: 13px;">
              <li>Evaluación confidencial de perfil por parte del comité de admisión.</li>
              <li>Códigos de etiqueta y anonimato voluntario de estricto cumplimiento.</li>
              <li>Liberación de coordenadas de sede exclusivamente 24 horas antes de cada ceremonia.</li>
            </ul>
            <p style="color: #ead397; font-style: italic; font-family: 'Cinzel', Georgia, serif; text-align: center; margin: 25px 0; font-size: 15px;">
              «El acceso se concede, no se anuncia.»
            </p>
          </div>
          <hr style="border: 0; border-top: 1px solid rgba(197, 160, 89, 0.25); margin: 30px 0;" />
          <p style="font-size: 11px; color: #888; font-family: sans-serif; margin: 0;">The Corset Society • Círculo Privado de Gala<br/>Línea Oficial de Concierge: +57 319 419 4785 • Bogotá, Colombia</p>
        </div>
      `;

      sendTransactionalEmail({
        to: lead.email,
        name: lead.alias_nombre || undefined,
        fromName: "La Sociedad del Corset",
        subject: "The Corset Society — Constancia Formal de Postulación",
        html: corsetHtml,
      }).catch((e) => console.error("[NotifyLead Corset Email Err]:", e));
    } else {
      // El Placer de Compartir: Carta Comunitaria Formal
      const placerHtml = `
        <div style="background-color: #1a0a18; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', Georgia, serif; max-width: 600px; margin: 0 auto; border: 2px solid #591f26; text-align: center;">
          <div style="margin-bottom: 20px;">
            <img src="${PLACER_LOGO_URL}" alt="El Placer de Compartir" style="height: 96px; width: 96px; border-radius: 50%; border: 2px solid #c5a059; margin: 0 auto; display: block; object-fit: cover;" />
          </div>
          <h1 style="color: #ead397; text-transform: uppercase; letter-spacing: 2px; font-size: 18px; margin: 0 0 5px 0;">El Placer de Compartir</h1>
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #c5a059; margin-bottom: 20px;">Comunidad de Erotismo Consciente & Centro Cultural</div>
          <div style="text-align: left; font-family: 'Inter', Arial, sans-serif; font-size: 14px; line-height: 1.7; color: rgba(247, 244, 238, 0.85);">
            <p>Hola <strong style="color: #ead397;">${lead.alias_nombre || "Bienvenido(a)"}</strong>,</p>
            <p>Te enviamos previamente un saludo directo a tu WhatsApp (<strong style="color: #ead397;">${formattedPhone}</strong>), nuestro canal ágil para coordinaciones en tiempo real. Por este medio formal te compartimos el marco de convivencia de nuestra comunidad.</p>
            <div style="background-color: #260d1d; border-left: 3px solid #c5a059; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <p style="margin: 0; font-size: 13px; color: #f7d6cb;">
                🏛️ <strong>Nuevo Centro Cultural en Bogotá:</strong> Un espacio físico multidisciplinario para talleres de parejas, masajes tántricos, BDSM ético y experiencias sensoriales con criterios de consentimiento innegociable.
              </p>
            </div>
            <p><strong>Nuestros Acuerdos Fundamentales:</strong></p>
            <ul style="padding-left: 20px; color: rgba(247, 244, 238, 0.75); font-size: 13px;">
              <li>Consentimiento lúcido: El respeto a la autonomía y al ritmo personal es innegociable.</li>
              <li>Cero personal contratado: Todo asistente participa por decisión e interés genuino propio.</li>
              <li>Privacidad recíproca: Lo que se comparte en nuestras veladas permanece en la intimidad del grupo.</li>
            </ul>
          </div>
          <hr style="border: 0; border-top: 1px solid rgba(197, 160, 89, 0.25); margin: 30px 0;" />
          <p style="font-size: 11px; color: #888; font-family: sans-serif; margin: 0;">El Placer de Compartir • Bogotá & Medellín<br/>Línea Oficial: +57 319 419 4785</p>
        </div>
      `;

      sendTransactionalEmail({
        to: lead.email,
        name: lead.alias_nombre || undefined,
        fromName: "El Placer de Compartir",
        subject: "Bienvenido a El Placer de Compartir — Carta Comunitaria",
        html: placerHtml,
      }).catch((e) => console.error("[NotifyLead Placer Email Err]:", e));
    }
  }

  // 3. Correo transaccional a la Marca (Admin)
  const brandSubject = isCorset
    ? `[Nuevo Lead VIP] ${lead.alias_nombre || "Anónimo"} (${lead.rol || "General"}) - The Corset Society`
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
    name: isCorset ? "The Corset Society Concierge" : "El Placer de Compartir Admin",
    fromName: isCorset ? "The Corset Society" : "El Placer de Compartir",
    subject: brandSubject,
    html: brandHtml,
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

  // 1. WhatsApp Directo al Comprador (Canal Inmediato de Entrada y Credencial)
  const buyerWaText = 
    `🌕 *CREDENCIAL OFICIAL CONFIRMADA — THE CORSET SOCIETY*\n\n` +
    `Estimado(a) *${lead.alias_nombre || "Invitado(a)"}*,\n\n` +
    `Tu acceso para la velada privada *Noche de Luna Llena* (Sábado 31 de Octubre) ha sido confirmado con éxito.\n\n` +
    `🎟️ *Pase:* ${ticket.tipo_entrada.toUpperCase()}\n` +
    `💵 *Monto:* $${Number(ticket.monto_pagado).toLocaleString("es-CO")} COP (${ticket.tipo_pago === "reserva_40" ? "Separación 40%" : "Pago Total 100%"})\n\n` +
    `🔐 *Accede a tu credencial digital con código QR scannable:*\n${ticketUrl}\n\n` +
    `📍 Presenta tu credencial digital en puerta. Las coordenadas exactas de la reserva privada se compartirán 24h antes por este medio.\n\n` +
    `_«El acceso se concede, no se anuncia.»_\n\n` +
    `🎩 *Concierge Oficial • The Corset Society*`;

  sendEvolutionWhatsApp(lead.whatsapp, buyerWaText).catch((e) =>
    console.error("[NotifyTicket Buyer WhatsApp Err]:", e)
  );

  // 2. Correo al Usuario con Credencial Oficial y Resguardo Institucional
  if (lead.email) {
    const userSubject = "The Corset Society — Tu Credencial Digital Sellada (Noche de Luna Llena)";
    const userHtml = `
      <div style="background-color: #050505; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', serif, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #c5a059; text-align: center;">
        <div style="margin-bottom: 25px;">
          <img src="${CORSET_LOGO_URL}" alt="The Corset Society" style="height: 96px; width: auto; margin: 0 auto; display: block;" />
        </div>
        <h1 style="color: #c5a059; text-transform: uppercase; letter-spacing: 2px; font-size: 20px; margin: 0 0 10px 0;">The Corset Society</h1>
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
          <p style="font-size: 12px; color: #aaa;">Recuerda presentar el código QR scannable de tu credencial al ingresar. Las coordenadas de la locación secreta se informarán 24 horas antes por WhatsApp confidencial.</p>
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
      html: userHtml,
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
    name: "The Corset Society Concierge",
    fromName: "The Corset Society",
    subject: brandSubject,
    html: brandHtml,
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

const ALLIANCE_LABELS: Record<string, string> = {
  organizador_eventos_adultos: "Organizador de Eventos Adultos / Mente Abierta",
  tallerista_terapeuta: "Tallerista / Terapeuta (Tantra, Masajes, BDSM Ético)",
  alquiler_espacio_privado: "Alquiler Privado del Espacio (Celebraciones o Veladas)",
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

  // 1. WhatsApp Directo al Proponente (Canal Prioritario y Ágil)
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

  // 2. Correo al Postulante (Dossier Técnico Formal)
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
      html: allianceHtml,
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
    html: brandHtml,
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
