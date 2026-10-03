import type { APIRoute } from "astro";
import { pool, recordAffiliatePayment } from "../../../db";
import { sendTransactionalEmail } from "../../../services/email";
import { sendEvolutionWhatsApp } from "../../../services/notifications";

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

          // 2. Fetch lead for email confirmation
          if (ticket.lead_id) {
            const leadRes = await client.query("SELECT * FROM leads WHERE id = $1", [ticket.lead_id]);
            if (leadRes.rows[0]?.email) {
              const lead = leadRes.rows[0];
              await sendTransactionalEmail({
                to: lead.email,
                name: lead.alias_nombre,
                subject: "✨ Tu Ticket Lacrado — The Corset Society Noche de Luna Llena",
                html: `
                  <div style="background-color: #050505; color: #f7f4ee; padding: 40px; font-family: sans-serif; border: 1px solid #c5a059;">
                    <h2 style="color: #c5a059; text-transform: uppercase;">The Corset Society</h2>
                    <p>Hola <strong>${lead.alias_nombre}</strong>,</p>
                    <p>Tu entrada para la <strong>Noche de Luna Llena</strong> ha sido confirmada exitosamente.</p>
                    <p style="font-size: 18px; color: #ead397; padding: 15px; border: 1px dashed #c5a059; text-align: center;">
                      Ticket Token: <strong>${ticket.ticket_hash}</strong>
                    </p>
                    <p>Lugar: Reserva Secreta (enviada 24h antes del evento vía WhatsApp confidencial).<br/>
                    Recuerda asistir con tu máscara o caracterización mística.</p>
                  </div>
                `,
              });
            }

            // Brand notification email & WhatsApp alert
            const brandSubject = `[Pago Exitoso Digital] ${ticket.tipo_entrada.toUpperCase()} - ${leadRes.rows[0]?.alias_nombre || 'Invitado'}`;
            const brandHtml = `
              <div style="font-family: sans-serif; padding: 20px; background-color: #f7f4ee; color: #1a1a1a;">
                <h2 style="color: #2e7d32;">Pago Confirmado (Pasarela Digital)</h2>
                <p><strong>Invitado:</strong> ${leadRes.rows[0]?.alias_nombre || 'N/A'}</p>
                <p><strong>Entrada:</strong> ${ticket.tipo_entrada} (${ticket.tipo_pago})</p>
                <p><strong>Monto:</strong> $${Number(ticket.monto_pagado).toLocaleString('es-CO')} COP</p>
                <p><strong>Transacción ID:</strong> ${event.payment_id || event.id}</p>
                <p><strong>Ticket Hash:</strong> ${ticket.ticket_hash}</p>
              </div>
            `;
            sendTransactionalEmail({
              to: "web@elplacerdecompartir.com",
              name: "Admin El Placer de Compartir",
              subject: brandSubject,
              html: brandHtml,
            }).catch(() => {});

            sendEvolutionWhatsApp(
              "573021004070",
              `✅ *PAGO CONFIRMADO (Pasarela Digital)*\n\n` +
              `🎟️ *Entrada:* ${ticket.tipo_entrada} (${ticket.tipo_pago})\n` +
              `💵 *Monto:* $${Number(ticket.monto_pagado).toLocaleString("es-CO")} COP\n` +
              `👤 *Invitado:* ${leadRes.rows[0]?.alias_nombre || 'N/A'}\n` +
              `🔐 *Hash:* ${ticket.ticket_hash.substring(0, 16)}`
            ).catch(() => {});
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
