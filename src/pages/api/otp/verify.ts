import type { APIRoute } from "astro";
import { verifyChannelOTP } from "../../../services/evolution";
import { pool, normalizePhone } from "../../../db";
import { dispatchDomainEvent } from "../../../services/automation";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const destination = body.destination || body.whatsapp || body.email;
    const code = body.code || body.otp;
    const channel = body.channel; // "whatsapp" | "email"
    const linkedPhone = body.linkedPhone || body.whatsapp;
    const linkedEmail = body.linkedEmail || body.email;

    if (!destination || !code) {
      return new Response(JSON.stringify({ success: false, error: "Destino y código son obligatorios" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const isValid = await verifyChannelOTP(destination, code, channel, linkedEmail);

    if (isValid) {
      const isEmail = destination.includes("@") || channel === "email";
      const isPhone = !isEmail || channel === "whatsapp";

      // Persistir de forma duradera la verificación en la base de datos PostgreSQL
      const client = await pool.connect();
      try {
        if (isPhone && !destination.includes("@")) {
          const norm = normalizePhone(destination);
          const variants = norm ? norm.variants : [destination];
          await client.query(
            `UPDATE leads 
             SET whatsapp_verified = true, updated_at = NOW() 
             WHERE whatsapp = ANY($1)`,
            [variants]
          );
        }

        if (isEmail || destination.includes("@")) {
          const cleanEmail = destination.trim().toLowerCase();
          const updateRes = await client.query(
            `UPDATE leads 
             SET email_verified = true, updated_at = NOW() 
             WHERE LOWER(email) = $1 
             RETURNING id, email, whatsapp, alias_nombre, rol, ciudad, metadata`,
            [cleanEmail]
          );

          if (updateRes.rows.length > 0) {
            const lead = updateRes.rows[0];
            dispatchDomainEvent("lead.email_verified", {
              leadId: lead.id,
              email: lead.email,
              whatsapp: lead.whatsapp,
              name: lead.alias_nombre,
              rol: lead.rol,
              ciudad: lead.ciudad,
              metadata: lead.metadata,
            }).catch((err) => console.error("[OTP Verify Event Dispatch Err]:", err));
          }
        }
      } catch (dbErr: any) {
        console.warn("[OTP Verify DB Update Warn]:", dbErr.message);
      } finally {
        client.release();
      }

      return new Response(JSON.stringify({ 
        success: true, 
        verified: true,
        channel: isEmail ? "email" : "whatsapp",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      return new Response(JSON.stringify({ success: false, error: "Código inválido o expirado" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    console.error("[API OTP Verify Err]:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
