import type { APIRoute } from "astro";
import { upsertLead } from "../../../db";
import { notifyNewAlliance } from "../../../services/notifications";
import { verifyOTP } from "../../../services/evolution";
import { addSubscriber } from "../../../services/listmonk";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { alias_nombre, email, whatsapp, tipo_alianza, propuesta_detalle, ciudad, origen, otp } = body;

    const detalle = propuesta_detalle || (body as any).propuesta;

    if (!whatsapp || !email || !detalle) {
      return new Response(
        JSON.stringify({ success: false, error: "WhatsApp, correo electrónico y detalle de la propuesta son obligatorios." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const isVerified = (body as any).verified === true;
    if (!isVerified) {
      if (!otp || !(await verifyOTP(whatsapp, otp))) {
        return new Response(JSON.stringify({ success: false, error: "Código de verificación WhatsApp inválido o expirado" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
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
          propuesta_detalle: detalle || "",
          canal: "centro_cultural",
          tags: ["alianza", "centro_cultural"],
        },
      },
      "centro_cultural"
    );

    // Generate or fetch affiliate code for this ally
    let affiliateCode: string | null = null;
    try {
      affiliateCode = await ensureAffiliateCode(alias_nombre || "Aliado", whatsapp, email);
    } catch (e: any) {
      console.warn("[Alliance ensureAffiliateCode Warn]:", e.message);
    }

    // Multi-channel notifications for Cultural Center Alliance
    if (result.lead) {
      notifyNewAlliance(result.lead, {
        tipo_alianza: tipo_alianza || "otra_alianza",
        propuesta_detalle: detalle || "",
      }).catch((e) => console.error("[Alliance Notifications Err]:", e));

      if (email) {
        addSubscriber(email, alias_nombre || "Alliance Lead", [1]).catch((e) =>
          console.error("[Listmonk Alliance Sync Err]:", e)
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: result.message,
        lead: result.lead,
        affiliate_code: affiliateCode,
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
