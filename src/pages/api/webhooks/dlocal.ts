import type { APIRoute } from "astro";
import { verifySignature, retrievePayment } from "../../../services/dlocal";
import { pool } from "../../../db";
import { notifyNewTicket, sendEvolutionWhatsApp } from "../../../services/notifications";

export const POST: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("Authorization") || "";
  const rawBody = await request.text();

  if (!verifySignature(rawBody, authHeader)) {
    console.warn("[dLocal Go Webhook] Firma HMAC inválida recibida");
    return new Response(JSON.stringify({ error: "Invalid signature" }), { 
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const payload = JSON.parse(rawBody);
    const paymentId = payload.payment_id;

    if (!paymentId) {
      return new Response(JSON.stringify({ received: true, note: "No payment_id in notification" }), { 
        status: 200, 
        headers: { "Content-Type": "application/json" } 
      });
    }

    // Consultar el estado real del pago en la API de dLocal Go
    const payment = await retrievePayment(paymentId);
    console.log(`[dLocal Go Webhook] Pago ${paymentId} consultado - Estado: ${payment.status}, Order: ${payment.order_id}`);

    if (payment.status === "PAID") {
      const orderId = payment.order_id;
      const client = await pool.connect();
      try {
        // Caso 1: Ticket de evento (Luna Llena u otro evento)
        const ticketRes = await client.query(
          `SELECT t.*, l.alias_nombre, l.email, l.whatsapp 
           FROM event_tickets t 
           JOIN leads l ON t.lead_id = l.id 
           WHERE t.id::text = $1 OR t.ticket_hash = $1`,
          [orderId]
        );

        if (ticketRes.rows.length > 0) {
          const ticket = ticketRes.rows[0];
          await client.query(
            `UPDATE event_tickets 
             SET estado = 'confirmado', transaccion_id = $1, updated_at = NOW() 
             WHERE id = $2`,
            [paymentId, ticket.id]
          );

          const isTotalPayment = ticket.tipo_pago === "total" || ticket.tipo_pago === "total_100";

          // Acreditar venta al embajador SOLO con pago total (no solo con reserva)
          if (ticket.afiliado_ref) {
            if (isTotalPayment) {
              try {
                const { recordAffiliatePayment } = await import("../../../db");
                await recordAffiliatePayment(ticket.afiliado_ref, ticket.lead_id);
              } catch (affErr) {
                console.error("[Affiliate Credit Err]:", affErr);
              }
            } else {
              // Notificar reserva aclarando que se acredita tras pago total o asistencia
              import("../../../services/notifications").then(({ notifyAmbassadorNewReferral }) => {
                client.query("SELECT * FROM afiliados WHERE LOWER(alias) = LOWER($1) LIMIT 1", [ticket.afiliado_ref])
                  .then((ambRes) => {
                    if (ambRes.rows.length > 0) {
                      notifyAmbassadorNewReferral(ambRes.rows[0], {
                        alias_nombre: ticket.alias_nombre,
                        email: ticket.email,
                      }).catch(() => {});
                    }
                  })
                  .catch(() => {});
              });
            }
          }

          // Promoción exclusiva Luna Llena: SOLO se activa si hay pago completo (100%).
          // Si es reserva, se activará en puerta cuando se liquide el saldo y se marque como asistido.
          if (ticket.evento === "luna_llena" && ticket.lead_id && isTotalPayment) {
            try {
              await client.query(
                `UPDATE leads 
                 SET corset_vip = true, 
                     vip_until = NOW() + INTERVAL '1 year', 
                     metadata = jsonb_set(
                       jsonb_set(
                         COALESCE(metadata, '{}'::jsonb),
                         '{vip_until}',
                         to_jsonb((NOW() + INTERVAL '1 year')::text)
                       ),
                       '{tags}',
                       COALESCE(metadata->'tags', '[]'::jsonb) || '["vip_activo", "corset_vip"]'::jsonb
                     ),
                     updated_at = NOW() 
                 WHERE id = $1`,
                [ticket.lead_id]
              );
              console.log(`[Gateway Webhook] 1 año de Membresía VIP Corset activada gratis para lead ${ticket.lead_id} por pago total Luna Llena`);
            } catch (vipAutoErr) {
              console.error("[Auto VIP Luna Llena Err]:", vipAutoErr);
            }
          }

          // Resolver código de embajador PROPIO del comprador para su credencial
          let userOwnAffCode: string | undefined = undefined;
          try {
            const { ensureAffiliateCode } = await import("../../../db");
            userOwnAffCode = await ensureAffiliateCode(ticket.alias_nombre || "Embajador", ticket.whatsapp, ticket.email);
          } catch (_) {}

          // Disparar multi-mensajería transaccional confirmada
          try {
            await notifyNewTicket(
              {
                id: ticket.id,
                tipo_entrada: ticket.tipo_entrada,
                tipo_pago: ticket.tipo_pago,
                monto_pagado: ticket.monto_pagado || ticket.monto,
                metodo_pago: "pasarela_digital_live",
                ticket_hash: ticket.ticket_hash,
              },
              {
                alias_nombre: ticket.alias_nombre,
                whatsapp: ticket.whatsapp,
                email: ticket.email,
              },
              {
                affiliateCode: userOwnAffCode,
              }
            );
          } catch (notifErr) {
            console.error("[Gateway Webhook] Error enviando notificaciones:", notifErr);
          }
        } else if (orderId && (orderId.startsWith("CORSET_VIP_") || orderId.startsWith("VIP_"))) {
          // Caso 2: Membresía VIP Corset
          console.log(`[Gateway Webhook] Activando membresía VIP para orden ${orderId}`);
          if (payment.payer?.email) {
            const leadRes = await client.query(
              `UPDATE leads SET corset_vip = true, vip_until = NOW() + INTERVAL '1 year', updated_at = NOW() WHERE email = $1 RETURNING id, afiliado_id`,
              [payment.payer.email]
            );
            if (leadRes.rows.length > 0 && leadRes.rows[0].afiliado_id) {
              try {
                const { recordAffiliatePayment } = await import("../../../db");
                await recordAffiliatePayment(leadRes.rows[0].afiliado_id, leadRes.rows[0].id);
              } catch (affErr) {
                console.error("[VIP Affiliate Credit Err]:", affErr);
              }
            }
          }
          if (payment.payer?.phone) {
            await sendEvolutionWhatsApp(
              payment.payer.phone,
              `✨ *¡Bienvenido(a) a The Corset Society — Membresía VIP Activada!*\n\nTu suscripción anual ha sido confirmada exitosamente. Tu código de acceso prioritario ha sido habilitado.\n\n🏛️ *Centro Cultural El Placer de Compartir, Bogotá*`
            );
          }
        }
      } finally {
        client.release();
      }
    }

    return new Response(JSON.stringify({ received: true, status: payment.status }), { 
      status: 200, 
      headers: { "Content-Type": "application/json" } 
    });
  } catch (err: any) {
    console.error("[dLocal Go Webhook Error]:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: { "Content-Type": "application/json" } 
    });
  }
};
