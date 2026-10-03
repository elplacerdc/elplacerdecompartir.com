import type { APIRoute } from "astro";
import { upsertLead } from "../../../db";
import { notifyNewLead } from "../../../services/notifications";

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

    // Multi-Channel Transactional Notifications (User, Brand & Evolution WhatsApp)
    notifyNewLead(lead).catch((e) => console.error("[Lead Notifications Err]:", e));

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
