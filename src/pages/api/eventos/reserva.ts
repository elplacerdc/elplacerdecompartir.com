import type { APIRoute } from "astro";
import crypto from "crypto";
import { upsertLead, pool, ensureAffiliateCode } from "../../../db";
import { verifyChannelOTP } from "../../../services/evolution";
import { notifyEventReservation } from "../../../services/notifications";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const {
      evento = "sitio-9-oct",
      alias_nombre,
      whatsapp,
      email,
      rol,
      ciudad = "Bogotá",
      otp,
      verified,
    } = body;

    if (!whatsapp) {
      return new Response(
        JSON.stringify({ success: false, error: "WhatsApp es requerido" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!email) {
      return new Response(
        JSON.stringify({ success: false, error: "Correo electrónico es requerido para enviar el código QR" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify OTP if not verified inline
    if (!verified) {
      const otpDestination = whatsapp || email;
      const isValidOtp = otp && (await verifyChannelOTP(otpDestination, otp));
      if (!isValidOtp) {
        return new Response(
          JSON.stringify({ success: false, error: "Código de verificación inválido o expirado" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const affiliateRef = cookies.get("affiliate_ref")?.value || null;

    // 1. Upsert lead into PostgreSQL leads table
    const leadResult = await upsertLead(
      {
        alias_nombre,
        whatsapp,
        email,
        rol,
        ciudad,
        origen: `evento_${evento}`,
        afiliado_id: affiliateRef || undefined,
        corset_vip: false,
      },
      "elplacerdc"
    );

    const isNewLead = leadResult.status === "created";
    const leadId = leadResult.lead?.id || null;
    const ticketHash = `EPDC-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

    // Ensure automatic ambassador code provisioning
    let userAffiliateCode = "";
    try {
      userAffiliateCode = await ensureAffiliateCode(alias_nombre || "embajador", whatsapp, email);
    } catch (e) {
      console.warn("[Affiliate Provisioning Err]:", e);
    }

    // If new lead referred by an ambassador, notify referring ambassador!
    if (isNewLead && affiliateRef) {
      import("../../../services/notifications").then(({ notifyAmbassadorNewReferral }) => {
        notifyAmbassadorNewReferral(affiliateRef, {
          alias_nombre,
          email,
          rol,
          ciudad,
        }).catch((err) => console.error("[NotifyAmbassador Referral Err]:", err));
      });
    }

    // 2. Insert into event_tickets
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO event_tickets (
          lead_id,
          evento,
          tipo_entrada,
          tipo_pago,
          monto_pagado,
          metodo_pago,
          referencia_transaccion,
          estado,
          afiliado_ref,
          ticket_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          leadId,
          evento,
          "reserva_gratuita",
          "gratis",
          0,
          "registro_web",
          `RES-${Date.now()}`,
          "confirmada",
          affiliateRef,
          ticketHash,
        ]
      );
    } finally {
      client.release();
    }

    // 3. Dispatch multi-channel notification (WA + Email with QR, combined with Welcome/Ambassador if new)
    notifyEventReservation(
      {
        evento,
        ticket_hash: ticketHash,
      },
      {
        alias_nombre,
        whatsapp,
        email,
      },
      {
        isNewLead,
        affiliateCode: userAffiliateCode,
      }
    ).catch((err) => console.error("[Event Reservation Notification Err]:", err));

    return new Response(
      JSON.stringify({
        success: true,
        ticket_hash: ticketHash,
        message: "¡Reserva confirmada con éxito! Te hemos enviado tu credencial con código QR a tu correo y confirmación a WhatsApp.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[API Event Reservation Err]:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
