import type { APIRoute } from "astro";
import { upsertLead } from "../../../db";
import { notifyNewAlliance } from "../../../services/notifications";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { alias_nombre, email, whatsapp, tipo_alianza, propuesta_detalle, ciudad, origen } = body;

    if (!whatsapp || !email || !propuesta_detalle) {
      return new Response(
        JSON.stringify({ error: "WhatsApp, correo y detalle de la propuesta son obligatorios." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const affiliateRef = cookies.get("affiliate_ref")?.value;

    const lead = await upsertLead({
      alias_nombre,
      email,
      whatsapp,
      rol: "otro",
      ciudad: ciudad || "Bogotá",
      origen: origen || "alianza_centro_cultural",
      afiliado_id: affiliateRef || undefined,
      corset_vip: false,
      metadata: {
        tipo_alianza: tipo_alianza || "otra_alianza",
        propuesta_detalle: propuesta_detalle || "",
        canal: "centro_cultural",
      },
    });

    // Multi-channel notifications for Cultural Center Alliance
    notifyNewAlliance(lead, {
      tipo_alianza: tipo_alianza || "otra_alianza",
      propuesta_detalle: propuesta_detalle || "",
    }).catch((e) => console.error("[Alliance Notifications Err]:", e));

    return new Response(JSON.stringify({ success: true, lead }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[API Alliance Route Err]:", error);
    return new Response(JSON.stringify({ error: error.message || "Error al registrar la propuesta" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
