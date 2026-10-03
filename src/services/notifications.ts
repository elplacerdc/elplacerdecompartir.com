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
  const isCorset = Boolean(lead.corset_vip);
  const channelName = isCorset ? "The Corset Society (VIP)" : "El Placer de Compartir";

  // 1. Correo transaccional al Usuario (si suministró email)
  if (lead.email) {
    if (isCorset) {
      // The Corset Society: Noir & Gold con logo transparente
      const corsetHtml = `
        <div style="background-color: #050505; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', Georgia, serif; max-width: 600px; margin: 0 auto; border: 2px solid #c5a059; text-align: center;">
          <div style="margin-bottom: 20px;">
            <img src="https://elplacerdecompartir.com/media/logo_corsetsociety_transparent.png" alt="The Corset Society" style="height: 60px; width: auto; margin: 0 auto; display: block;" />
          </div>
          <h1 style="color: #c5a059; text-transform: uppercase; letter-spacing: 3px; font-size: 18px; margin: 0 0 10px 0;">The Corset Society</h1>
          <div style="width: 40px; height: 1px; background-color: #c5a059; margin: 0 auto 25px auto;"></div>
          <div style="text-align: left; font-family: 'Plus Jakarta Sans', Arial, sans-serif; font-size: 14px; line-height: 1.7; color: rgba(247, 244, 238, 0.85);">
            <p>Estimado(a) <strong style="color: #ead397;">${lead.alias_nombre || "Invitado(a)"}</strong>,</p>
            <p>Tu solicitud para acceder a nuestro círculo privado ha sido recibida con estricto sigilo. Evaluamos cada perfil con detenimiento para salvaguardar la intimidad, la elegancia y el confort de nuestras veladas.</p>
            <p style="color: #ead397; font-style: italic; font-family: 'Cinzel', Georgia, serif; text-align: center; margin: 25px 0; font-size: 15px;">
              «El acceso se concede, no se anuncia.»
            </p>
            <p>Si tu postulación es concedida, nuestra mayordomía se comunicará contigo vía WhatsApp a tu número registrado (<strong>${lead.whatsapp}</strong>) con las instrucciones y el protocolo de admisión.</p>
          </div>
          <hr style="border: 0; border-top: 1px solid rgba(197, 160, 89, 0.25); margin: 30px 0;" />
          <p style="font-size: 11px; color: #888; font-family: sans-serif; margin: 0;">The Corset Society • Círculo Privado de Gala<br/>Línea Oficial de Mayordomía: +57 319 419 4785</p>
        </div>
      `;

      sendTransactionalEmail({
        to: lead.email,
        name: lead.alias_nombre || undefined,
        fromName: "La Sociedad del Corset",
        subject: "The Corset Society — Solicitud Registrada",
        html: corsetHtml,
      }).catch((e) => console.error("[NotifyLead Corset Email Err]:", e));
    } else {
      // El Placer de Compartir: Salón cálido y luminoso de comunidad
      const placerHtml = `
        <div style="background-color: #1a0a18; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', Georgia, serif; max-width: 600px; margin: 0 auto; border: 2px solid #591f26; text-align: center;">
          <div style="margin-bottom: 20px;">
            <img src="https://elplacerdecompartir.com/media/logo_elplacerdc_x.jpg" alt="El Placer de Compartir" style="height: 64px; width: 64px; border-radius: 50%; border: 2px solid #c5a059; margin: 0 auto; display: block; object-fit: cover;" />
          </div>
          <h1 style="color: #ead397; text-transform: uppercase; letter-spacing: 2px; font-size: 18px; margin: 0 0 5px 0;">El Placer de Compartir</h1>
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #c5a059; margin-bottom: 20px;">Comunidad de Erotismo Consciente & Centro Cultural</div>
          <div style="text-align: left; font-family: 'Inter', Arial, sans-serif; font-size: 14px; line-height: 1.7; color: rgba(247, 244, 238, 0.85);">
            <p>Hola <strong style="color: #ead397;">${lead.alias_nombre || "Bienvenido(a)"}</strong>,</p>
            <p>Te damos una cálida bienvenida a nuestra comunidad. Somos pioneros en Colombia en explorar la libertad relacional, el consentimiento lúcido y el erotismo libre de presiones.</p>
            <div style="background-color: #260d1d; border-left: 3px solid #c5a059; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <p style="margin: 0; font-size: 13px; color: #f7d6cb;">
                🏛️ <strong>Nuevo Centro Cultural en Bogotá:</strong> Un espacio físico multidisciplinario para talleres de parejas, masajes tántricos, BDSM ético, nudismo consciente y encuentros sensoriales.
              </p>
            </div>
            <p>Pronto recibirás nuestras convocatorias a veladas y actividades. Aquí tu ritmo es soberano y tu consentimiento, innegociable.</p>
          </div>
          <hr style="border: 0; border-top: 1px solid rgba(197, 160, 89, 0.25); margin: 30px 0;" />
          <p style="font-size: 11px; color: #888; font-family: sans-serif; margin: 0;">El Placer de Compartir • Bogotá & Medellín<br/>Línea Oficial: +57 319 419 4785</p>
        </div>
      `;

      sendTransactionalEmail({
        to: lead.email,
        name: lead.alias_nombre || undefined,
        fromName: "El Placer de Compartir",
        subject: "Bienvenido a El Placer de Compartir",
        html: placerHtml,
      }).catch((e) => console.error("[NotifyLead Placer Email Err]:", e));
    }
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

  // 3. Notificación WhatsApp directa al Lead (Mensaje de Bienvenida con Voz de Marca)
  if (isCorset) {
    const leadCorsetWa =
      `🖤 *THE CORSET SOCIETY — CÍRCULO HERMÉTICO*\n\n` +
      `Estimado(a) *${lead.alias_nombre || "Invitado(a)"}*,\n\n` +
      `Hemos recibido tu solicitud de admisión a nuestro círculo privado con estricto sigilo.\n\n` +
      `Evaluamos cada perfil con detenimiento para proteger la intimidad, el confort y la elegancia de nuestras veladas.\n\n` +
      `Si tu acceso es concedido, nuestra mayordomía se comunicará contigo por esta línea para coordinar tu protocolo de admisión.\n\n` +
      `_El acceso se concede, no se anuncia._\n\n` +
      `🎩 *The Corset Society*`;

    sendEvolutionWhatsApp(lead.whatsapp, leadCorsetWa).catch((e) =>
      console.error("[NotifyLead Corset WhatsApp Err]:", e)
    );
  } else {
    const leadPlacerWa =
      `🌹 *BIENVENIDO(A) A EL PLACER DE COMPARTIR*\n\n` +
      `Hola *${lead.alias_nombre || "Bienvenido(a)"}* ✨\n\n` +
      `Qué alegría darte la bienvenida a nuestra comunidad de libertad relacional, erotismo consciente y respeto mutuo.\n\n` +
      `🏛️ *Centro Cultural en Bogotá*: Un espacio físico seguro para talleres de parejas, masajes tántricos, BDSM ético y experiencias sensoriales.\n\n` +
      `Aquí la prioridad es tu confort, tu ritmo soberano y la cultura de consentimiento lúcido.\n\n` +
      `Pronto recibirás detalles de nuestras próximas veladas y encuentros comunitarios.\n\n` +
      `Si tienes cualquier duda, esta es nuestra línea de atención directa.\n\n` +
      `🌹 *El Placer de Compartir*`;

    sendEvolutionWhatsApp(lead.whatsapp, leadPlacerWa).catch((e) =>
      console.error("[NotifyLead Placer WhatsApp Err]:", e)
    );
  }

  // 4. Notificación WhatsApp al Evolution Inicial (3021004070 - Telemetría Interna)
  const adminWaText = 
    `🔥 *NUEVO REGISTRO EN WEB*\n\n` +
    `🏷️ *Canal:* ${channelName}\n` +
    `👤 *Alias:* ${lead.alias_nombre || "No especificado"}\n` +
    `📱 *WhatsApp:* ${lead.whatsapp}\n` +
    `✉️ *Email:* ${lead.email || "No suministrado"}\n` +
    `🎭 *Modalidad:* ${lead.rol || "General"}\n` +
    `📍 *Ciudad:* ${lead.ciudad || "Bogotá"}\n` +
    `⏱️ *Hora:* ${new Date().toLocaleTimeString("es-CO")}`;

  sendEvolutionWhatsApp(EVOLUTION_INITIAL_NUMBER, adminWaText).catch((e) =>
    console.error("[NotifyLead Admin WhatsApp Err]:", e)
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
  const ticketUrl = `https://elplacerdecompartir.com/the-corset-society/ticket?hash=${ticket.ticket_hash}`;

  // 1. Correo al Usuario con Credencial Oficial
  if (lead.email) {
    const userSubject = "The Corset Society — Tu Credencial Digital (Noche de Luna Llena)";
    const userHtml = `
      <div style="background-color: #050505; color: #f7f4ee; padding: 40px; font-family: 'Cinzel', serif, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #c5a059; text-align: center;">
        <div style="margin-bottom: 20px;">
          <img src="https://elplacerdecompartir.com/media/logo_corsetsociety_transparent.png" alt="The Corset Society" style="height: 60px; width: auto; margin: 0 auto; display: block;" />
        </div>
        <h1 style="color: #c5a059; text-transform: uppercase; letter-spacing: 2px; font-size: 20px; margin: 0 0 10px 0;">The Corset Society</h1>
        <h2 style="color: #ead397; font-size: 16px; margin: 0 0 20px 0;">Noche de Luna Llena 🌕</h2>
        <div style="text-align: left; font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #eee;">
          <p>Estimado(a) <strong>${lead.alias_nombre || "Invitado(a)"}</strong>,</p>
          <p>Tu reserva para la velada privada del <strong>Sábado 31 de Octubre</strong> ha sido confirmada con éxito.</p>
          <div style="background-color: #140a18; border: 1px solid #c5a059; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Pase:</strong> ${ticket.tipo_entrada.toUpperCase()}</p>
            <p style="margin: 5px 0;"><strong>Modalidad:</strong> ${ticket.tipo_pago === "reserva_40" ? "Separación 40%" : "Pago Total 100%"}</p>
            <p style="margin: 5px 0;"><strong>Monto:</strong> $${Number(ticket.monto_pagado).toLocaleString("es-CO")} COP</p>
            <p style="margin: 5px 0;"><strong>ID Lacrado:</strong> ${ticket.ticket_hash.substring(0, 16)}</p>
          </div>
          <div style="text-align: center; margin: 25px 0;">
            <a href="${ticketUrl}" style="background-color: #c5a059; color: #050505; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 50px; display: inline-block; text-transform: uppercase; font-size: 13px; letter-spacing: 1px;">Ver Credencial Digital con QR</a>
          </div>
          <p style="font-size: 12px; color: #aaa;">Recuerda presentar el código QR de tu credencial al ingresar. Las coordenadas de la locación secreta se informarán 24 horas antes por WhatsApp confidencial.</p>
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

  // 2. Correo a la Marca
  const brandSubject = `[Nueva Reserva Confirmada] ${ticket.tipo_entrada.toUpperCase()} ($${Number(ticket.monto_pagado).toLocaleString("es-CO")}) - ${lead.alias_nombre}`;
  const brandHtml = `
    <div style="font-family: sans-serif; padding: 20px; background-color: #f7f4ee; color: #1a1a1a;">
      <h2 style="color: #721c24;">Nueva Reserva Confirmada Noche de Luna Llena</h2>
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
    fromName: "La Sociedad del Corset",
    subject: brandSubject,
    html: brandHtml,
  }).catch((e) => console.error("[NotifyTicket BrandEmail Err]:", e));

  // 3. WhatsApp Directo al Comprador (lead.whatsapp) con Enlace a su Credencial y QR
  const buyerWaText = 
    `🌕 *CREDENCIAL OFICIAL CONFIRMADA — THE CORSET SOCIETY*\n\n` +
    `Estimado(a) *${lead.alias_nombre || "Invitado(a)"}*,\n\n` +
    `Tu acceso para la velada privada *Noche de Luna Llena* (Sábado 31 de Octubre) ha sido confirmado.\n\n` +
    `🎟️ *Pase:* ${ticket.tipo_entrada.toUpperCase()}\n` +
    `💵 *Monto:* $${Number(ticket.monto_pagado).toLocaleString("es-CO")} COP (${ticket.tipo_pago === "reserva_40" ? "Separación 40%" : "Pago Total 100%"})\n\n` +
    `🔐 *Accede a tu credencial sellada con código QR:* \n${ticketUrl}\n\n` +
    `📍 Presenta tu credencial digital al ingresar. Las coordenadas exactas de la reserva privada se compartirán 24h antes por este medio.\n\n` +
    `_El acceso se concede, no se anuncia._\n` +
    `🎩 *The Corset Society*`;

  sendEvolutionWhatsApp(lead.whatsapp, buyerWaText).catch((e) =>
    console.error("[NotifyTicket Buyer WhatsApp Err]:", e)
  );

  // 4. WhatsApp al Evolution Inicial (Admin Telemetría)
  const adminWaText = 
    `🌕 *RESERVA CONFIRMADA — CORSET SOCIETY*\n\n` +
    `🎟️ *Entrada:* ${ticket.tipo_entrada.toUpperCase()} (${ticket.tipo_pago})\n` +
    `💵 *Monto:* $${Number(ticket.monto_pagado).toLocaleString("es-CO")} COP\n` +
    `👤 *Invitado:* ${lead.alias_nombre}\n` +
    `📱 *WhatsApp:* ${lead.whatsapp}\n` +
    `💳 *Método:* ${ticket.metodo_pago}\n` +
    `🔐 *Hash:* ${ticket.ticket_hash.substring(0, 16)}\n` +
    `⏱️ *Hora:* ${new Date().toLocaleTimeString("es-CO")}`;

  sendEvolutionWhatsApp(EVOLUTION_INITIAL_NUMBER, adminWaText).catch((e) =>
    console.error("[NotifyTicket Admin WhatsApp Err]:", e)
  );
}
