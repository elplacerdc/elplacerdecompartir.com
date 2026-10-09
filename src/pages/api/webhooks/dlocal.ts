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

          // Disparar multi-mensajería transaccional confirmada
          try {
            await notifyNewTicket(
              {
                id: ticket.id,
                tipo_entrada: ticket.tipo_entrada,
                tipo_pago: ticket.tipo_pago,
                monto_pagado: ticket.monto,
                metodo_pago: "dlocal_go_live",
                ticket_hash: ticket.ticket_hash,
              },
              {
                alias_nombre: ticket.alias_nombre,
                whatsapp: ticket.whatsapp,
                email: ticket.email,
              }
            );
          } catch (notifErr) {
            console.error("[dLocal Go Webhook] Error enviando notificaciones:", notifErr);
          }
        } else if (orderId && (orderId.startsWith("CORSET_VIP_") || orderId.startsWith("VIP_"))) {
          // Caso 2: Membresía VIP Corset
          console.log(`[dLocal Go Webhook] Activando membresía VIP para orden ${orderId}`);
          if (payment.payer?.email) {
            await client.query(
              `UPDATE leads SET corset_vip = true, updated_at = NOW() WHERE email = $1`,
              [payment.payer.email]
            );
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
