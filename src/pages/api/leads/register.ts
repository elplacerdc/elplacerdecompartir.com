import type { APIRoute } from "astro";
import { upsertLead } from "../../../db";
import { notifyNewLead } from "../../../services/notifications";
import { verifyOTP } from "../../../services/evolution";
import { addSubscriber } from "../../../services/listmonk";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { alias_nombre, email, whatsapp, rol, ciudad, origen, corset_vip, otp } = body;

    if (!otp || !(await verifyOTP(whatsapp, otp))) {
      return new Response(JSON.stringify({ success: false, error: "OTP inválido o expirado" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const affiliateRef = cookies.get("affiliate_ref")?.value;
    const targetChannel = corset_vip ? "corset" : "elplacerdc";

    const result = await upsertLead(
      {
        alias_nombre,
        email,
        whatsapp,
        rol,
        ciudad: ciudad || "Bogotá",
        origen: origen || (corset_vip ? "web_corset" : "web_comunidad"),
        afiliado_id: affiliateRef || undefined,
        corset_vip: Boolean(corset_vip),
      },
      targetChannel
    );

    // 1. Manejo de conflicto cruzado de datos (409 Conflict)
    if (result.status === "conflict") {
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Manejo de registro duplicado en el mismo canal (200 OK con supresión de multi-mensajes)
    if (result.status === "already_registered") {
      return new Response(
        JSON.stringify({
          success: true,
          already_registered: true,
          message: result.message,
          lead: result.lead,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 3. Nuevo registro o nuevo canal habilitado: Disparo controlado de notificaciones
    if (result.lead) {
      notifyNewLead(result.lead as any, targetChannel).catch((e) =>
        console.error("[Lead Notifications Err]:", e)
      );

      if (email) {
        addSubscriber(email, alias_nombre || "Lead", [1]).catch((e) =>
          console.error("[Listmonk Register Sync Err]:", e)
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: result.message,
        lead: result.lead,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[API Lead Register Err]:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
