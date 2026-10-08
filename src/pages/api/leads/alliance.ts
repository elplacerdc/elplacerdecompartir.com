import type { APIRoute } from "astro";
import { upsertLead } from "../../../db";
import { notifyNewAlliance } from "../../../services/notifications";
import { verifyOTP } from "../../../services/evolution";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { alias_nombre, email, whatsapp, tipo_alianza, propuesta_detalle, ciudad, origen, otp } = body;

    if (!whatsapp || !email || !propuesta_detalle) {
      return new Response(
        JSON.stringify({ success: false, error: "WhatsApp, correo electrónico y detalle de la propuesta son obligatorios." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!otp || !(await verifyOTP(whatsapp, otp))) {
      return new Response(JSON.stringify({ success: false, error: "OTP inválido o expirado" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const affiliateRef = cookies.get("affiliate_ref")?.value;

    const result = await upsertLead(
      {
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
      },
      "centro_cultural"
    );

    // 1. Manejo de conflicto cruzado de datos
    if (result.status === "conflict") {
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Manejo de registro duplicado en Alianzas (supresión de multi-mensajería)
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

    // 3. Multi-channel notifications for Cultural Center Alliance
    if (result.lead) {
      notifyNewAlliance(result.lead, {
        tipo_alianza: tipo_alianza || "otra_alianza",
        propuesta_detalle: propuesta_detalle || "",
      }).catch((e) => console.error("[Alliance Notifications Err]:", e));
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
    console.error("[API Alliance Route Err]:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Error al registrar la propuesta" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
