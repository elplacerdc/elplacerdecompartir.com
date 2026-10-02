import type { APIRoute } from "astro";
import { upsertLead } from "../../../db";
import { sendTransactionalEmail } from "../../../services/email";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { alias_nombre, email, whatsapp, rol, ciudad, origen, corset_vip } = body;

    const affiliateRef = cookies.get("affiliate_ref")?.value;

    const lead = await upsertLead({
      alias_nombre,
      email,
      whatsapp,
      rol,
      ciudad: ciudad || "Bogotá",
      origen: origen || "web_comunidad",
      afiliado_id: affiliateRef || undefined,
      corset_vip: corset_vip || false,
    });

    // Enviar confirmación por correo si tiene email
    if (lead.email) {
      const subject = lead.corset_vip
        ? "The Corset Society — Invitación Confidencial"
        : "Bienvenido a El Placer de Compartir";

      const html = `
        <div style="background-color: #050505; color: #f7f4ee; padding: 40px; font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #c5a059;">
          <h1 style="color: #c5a059; text-transform: uppercase; letter-spacing: 2px;">${lead.corset_vip ? "The Corset Society" : "El Placer de Compartir"}</h1>
          <p>Hola <strong>${lead.alias_nombre || "Invitado"}</strong>,</p>
          <p>${lead.corset_vip 
            ? "Tu solicitud para acceder al círculo privado ha sido registrada bajo estricto sigilo. El acceso se concede, no se anuncia."
            : "Te damos la bienvenida a nuestro santuario de libertad, erotismo desgenitalizado y consentimiento consciente."}</p>
          <hr style="border: 0; border-top: 1px solid rgba(197, 160, 89, 0.3); margin: 30px 0;" />
          <p style="font-size: 12px; color: #888;">El Placer de Compartir | Bogotá — Medellín<br/>Línea Oficial: +57 319 419 4785</p>
        </div>
      `;

      // Non-blocking send
      sendTransactionalEmail({
        to: lead.email,
        name: lead.alias_nombre || undefined,
        subject,
        html,
      }).catch((e) => console.error("Email send err:", e));
    }

    return new Response(JSON.stringify({ success: true, lead }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
