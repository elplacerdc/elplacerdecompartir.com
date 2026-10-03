import type { APIRoute } from "astro";
import { pool, recordAffiliatePayment } from "../../../db";
import { notifyNewTicket } from "../../../services/notifications";

export const POST: APIRoute = async ({ request }) => {
  try {
    const rawBody = await request.text();
    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const orderId = event.order_id || event.id;
    const status = event.status; // 'PAID' or 'COMPLETED'

    if (status === "PAID" || status === "COMPLETED" || status === "SUCCESS") {
      const client = await pool.connect();
      try {
        const res = await client.query(
          `UPDATE event_tickets
           SET estado = 'confirmado', referencia_transaccion = $1
           WHERE id = $2 OR ticket_hash = $2
           RETURNING *`,
          [event.payment_id || event.id, orderId]
        );

        if (res.rowCount && res.rowCount > 0) {
          const ticket = res.rows[0];

          // 1. Credit Affiliate if present
          if (ticket.afiliado_ref) {
            await recordAffiliatePayment(ticket.afiliado_ref);
          }

          // 2. Fetch lead and dispatch official confirmed ticket notifications (Email + direct Lead WhatsApp with QR link)
          if (ticket.lead_id) {
            const leadRes = await client.query("SELECT * FROM leads WHERE id = $1", [ticket.lead_id]);
            const lead = leadRes.rows[0];
            if (lead) {
              await notifyNewTicket(
                {
                  id: ticket.id,
                  tipo_entrada: ticket.tipo_entrada,
                  tipo_pago: ticket.tipo_pago,
                  monto_pagado: ticket.monto_pagado,
                  metodo_pago: ticket.metodo_pago || "pasarela_digital",
                  ticket_hash: ticket.ticket_hash,
                },
                lead
              );
            }
          }
        }
      } finally {
        client.release();
      }
    }

    return new Response(JSON.stringify({ received: true }), {
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
