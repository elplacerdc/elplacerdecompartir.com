import type { APIRoute } from "astro";
import { pool, upsertLead } from "../../../db";
import crypto from "crypto";

const PRICES: Record<string, { total: number; reserva_40: number; label: string }> = {
  pareja: { total: 100000, reserva_40: 40000, label: "Pareja" },
  single: { total: 120000, reserva_40: 48000, label: "Single" },
  unicornio: { total: 30000, reserva_40: 12000, label: "Unicornio (Mujer Sola)" },
};

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { tipo_entrada, modalidad_pago, metodo_pago, alias_nombre, email, whatsapp } = body;

    const priceInfo = PRICES[tipo_entrada];
    if (!priceInfo) {
      return new Response(JSON.stringify({ error: "Tipo de entrada inválido" }), { status: 400 });
    }

    const monto = modalidad_pago === "reserva_40" ? priceInfo.reserva_40 : priceInfo.total;
    const affiliateRef = cookies.get("affiliate_ref")?.value || null;

    // 1. Upsert lead first
    const lead = await upsertLead({
      alias_nombre,
      email,
      whatsapp,
      rol: tipo_entrada === "pareja" ? "pareja" : tipo_entrada === "unicornio" ? "mujer_sola" : "hombre_solo",
      corset_vip: true,
      origen: "evento_luna_llena",
      afiliado_id: affiliateRef || undefined,
    });

    const ticketHash = crypto.randomBytes(16).toString("hex");

    // 2. Insert into event_tickets
    const client = await pool.connect();
    let ticketId = "";
    try {
      const res = await client.query(
        `INSERT INTO event_tickets (
          lead_id, evento, tipo_entrada, tipo_pago, monto_pagado, metodo_pago, 
          estado, afiliado_ref, ticket_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          lead.id,
          "luna_llena",
          tipo_entrada,
          modalidad_pago,
          monto,
          metodo_pago || "nequi_breb",
          metodo_pago === "dlocal_go" ? "pendiente" : "pendiente_verificacion",
          affiliateRef,
          ticketHash,
        ]
      );
      ticketId = res.rows[0].id;
    } finally {
      client.release();
    }

    // 3. Handle Payment Method
    if (metodo_pago === "dlocal_go") {
      const apiKey = process.env.DLOCAL_GO_API_KEY;
      const secretKey = process.env.DLOCAL_GO_SECRET_KEY;

      if (apiKey && secretKey) {
        // dLocal Go payment creation
        try {
          const dlRes = await fetch("https://api.dlocalgo.com/v1/payments", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}:${secretKey}`,
            },
            body: JSON.stringify({
              amount: monto,
              currency: "COP",
              country: "CO",
              order_id: ticketId,
              description: `Cover Luna Llena: ${priceInfo.label} (${modalidad_pago})`,
              success_url: `https://elplacerdecompartir.com/the-corset-society/ticket?hash=${ticketHash}`,
              back_url: "https://elplacerdecompartir.com/the-corset-society/luna-llena",
              notification_url: "https://elplacerdecompartir.com/api/webhooks/dlocal",
            }),
          });
          const dlData = await dlRes.json();
          if (dlData.redirect_url) {
            return new Response(JSON.stringify({ success: true, redirect_url: dlData.redirect_url, ticketHash }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
        } catch (e: any) {
          console.warn("dLocal Go call error, fallback to direct channel:", e.message);
        }
      }
    }

    // Direct WhatsApp / Nequi / Bre-B Flow
    const waText = encodeURIComponent(
      `🌕 *RESERVA NOCHE DE LUNA LLENA — THE CORSET SOCIETY*\n\n` +
      `👤 *Alias/Nombre:* ${alias_nombre}\n` +
      `🎟️ *Entrada:* ${priceInfo.label}\n` +
      `💵 *Modalidad:* ${modalidad_pago === "reserva_40" ? "Separación 40% ($" + monto.toLocaleString("es-CO") + ")" : "Pago Total ($" + monto.toLocaleString("es-CO") + ")"}\n` +
      `🔐 *Ticket Hash:* ${ticketHash}\n\n` +
      `Deseo coordinar el pago vía Nequi / Bre-B a la línea oficial.`
    );
    const waUrl = `https://wa.me/573194194785?text=${waText}`;

    return new Response(JSON.stringify({ success: true, redirect_url: waUrl, ticketHash }), {
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
