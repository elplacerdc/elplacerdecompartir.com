import type { APIRoute } from "astro";
import { upsertLead, ensureAffiliateCode } from "../../../db";
import { notifyNewLead } from "../../../services/notifications";
import { verifyChannelOTP } from "../../../services/evolution";
import { addSubscriber } from "../../../services/listmonk";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { alias_nombre, email, whatsapp, rol, ciudad, origen, corset_vip, otp, verified } = body;

    // Strict validation: alias / pseudónimo is strictly mandatory (BAI-219)
    const cleanAlias = (alias_nombre || "").toString().trim();
    if (!cleanAlias) {
      return new Response(JSON.stringify({ success: false, error: "El pseudónimo / alias es estrictamente obligatorio." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify OTP if provided (or if already verified inline via /api/otp/verify)
    if (!verified) {
      const otpDestination = whatsapp || email;
      const isValidOtp = otp && (await verifyChannelOTP(otpDestination, otp));
      if (!isValidOtp) {
        return new Response(JSON.stringify({ success: false, error: "Código de verificación inválido o expirado" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const affiliateRef = (body.ref || body.afiliado_id || cookies.get("affiliate_ref")?.value || "")
      .toString()
      .trim()
      .toLowerCase() || undefined;
    const isCorsetVip = corset_vip === true || corset_vip === "true";
    const targetChannel = isCorsetVip ? "corset" : (origen === "alianza_centro_cultural" ? "centro_cultural" : "elplacerdc");

    const result = await upsertLead(
      {
        alias_nombre,
        email,
        whatsapp,
        rol,
        ciudad: ciudad || "Bogotá",
        origen: origen || (isCorsetVip ? "web_corset" : "web_comunidad"),
        afiliado_id: affiliateRef || undefined,
        corset_vip: isCorsetVip,
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

    // Ensure bidirectional affiliate code generation for every registered lead
    let affiliateCode: string | null = null;
    try {
      affiliateCode = await ensureAffiliateCode(alias_nombre || "Embajador", whatsapp, email);
    } catch (e: any) {
      console.warn("[Register ensureAffiliateCode Warn]:", e.message);
    }

    // 2. Manejo de registro duplicado en el mismo canal (200 OK con supresión de multi-mensajes)
    if (result.status === "already_registered") {
      return new Response(
        JSON.stringify({
          success: true,
          already_registered: true,
          message: result.message,
          lead: result.lead,
          affiliate_code: affiliateCode,
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

      // Notificar al embajador si viene referido
      if (affiliateRef) {
        import("../../../db").then(({ pool }) => {
          pool.query("SELECT * FROM afiliados WHERE LOWER(alias) = LOWER($1) LIMIT 1", [affiliateRef])
            .then((affRes) => {
              if (affRes.rows.length > 0) {
                import("../../../services/notifications").then(({ notifyAmbassadorNewReferral }) => {
                  notifyAmbassadorNewReferral(affRes.rows[0], result.lead).catch((err) =>
                    console.error("[Notify Ambassador Err]:", err)
                  );
                });
              }
            })
            .catch((err) => console.error("[Query Ambassador Err]:", err));
        });
      }

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
        affiliate_code: affiliateCode,
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
