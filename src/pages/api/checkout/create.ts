import type { APIRoute } from "astro";
import { pool, upsertLead } from "../../../db";
import crypto from "crypto";

const PRICES: Record<string, { total: number; reserva_40: number; label: string }> = {
  pareja: { total: 100000, reserva_40: 40000, label: "Pareja" },
  single: { total: 120000, reserva_40: 50000, label: "Single (Hombre Solo)" },
  unicornio: { total: 30000, reserva_40: 10000, label: "Unicornio (Mujer Sola)" },
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
    const leadResult = await upsertLead(
      {
        alias_nombre,
        email,
        whatsapp,
        rol: tipo_entrada === "pareja" ? "pareja" : tipo_entrada === "unicornio" ? "mujer_sola" : "hombre_solo",
        corset_vip: true,
        origen: "evento_luna_llena",
        afiliado_id: affiliateRef || undefined,
      },
      "corset"
    );

    if (leadResult.status === "conflict") {
      return new Response(JSON.stringify({ error: leadResult.error }), { status: 409 });
    }

    const lead = leadResult.lead;
    if (!lead) {
      return new Response(JSON.stringify({ error: "No se pudo vincular el perfil de invitado." }), { status: 500 });
    }

    const isDigitalGateway = metodo_pago === "pasarela_digital" || metodo_pago === "dlocal_go";

    // 2. Insert or Reuse pending ticket (Idempotency lock: avoid multi-click duplication within 60s)
    const client = await pool.connect();
    let ticketId = "";
    let ticketHash = "";
    try {
      const existing = await client.query(
        `SELECT id, ticket_hash FROM event_tickets 
         WHERE lead_id = $1 AND evento = 'luna_llena' AND tipo_entrada = $2 AND tipo_pago = $3 AND estado = 'pendiente' AND created_at > NOW() - INTERVAL '60 seconds'
         ORDER BY created_at DESC LIMIT 1`,
        [lead.id, tipo_entrada, modalidad_pago]
      );

      if (existing.rows.length > 0) {
        ticketId = existing.rows[0].id;
        ticketHash = existing.rows[0].ticket_hash;
      } else {
        ticketHash = crypto.randomBytes(16).toString("hex");
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
            metodo_pago || "pasarela_digital",
            isDigitalGateway ? "pendiente" : "pendiente_verificacion",
            affiliateRef,
            ticketHash,
          ]
        );
        ticketId = res.rows[0].id;
      }
    } finally {
      client.release();
    }

    // 3. Handle Payment Method
    if (isDigitalGateway) {
      const apiKey = process.env.DLOCAL_GO_API_KEY;
      const secretKey = process.env.DLOCAL_GO_SECRET_KEY;
      const isSandbox = (process.env.DLOCAL_GO_ENV || "").toLowerCase() === "sandbox";
      const dlocalUrl = isSandbox 
        ? "https://api-sbx.dlocalgo.com/v1/payments" 
        : "https://api.dlocalgo.com/v1/payments";

      if (apiKey && secretKey) {
        try {
          const dlRes = await fetch(dlocalUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Authorization": `Bearer ${apiKey}:${secretKey}`,
            },
            body: JSON.stringify({
              amount: monto,
              currency: "COP",
              country: "CO",
              order_id: ticketId,
              description: `Cover Luna Llena: ${priceInfo.label} (${modalidad_pago === "reserva_40" ? "Separación 40%" : "Pago Total"})`,
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
          } else {
            console.error("[dLocal Go Error Response]:", dlData);
            return new Response(JSON.stringify({ 
              error: dlData.message || "No se pudo generar la sesión de pago digital con dLocal Go. Por favor intenta de nuevo." 
            }), {
              status: 502,
              headers: { "Content-Type": "application/json" },
            });
          }
        } catch (e: any) {
          console.error("[dLocal Gateway Fetch Error]:", e.message);
          return new Response(JSON.stringify({ 
            error: "Error de comunicación con la pasarela dLocal Go. Por favor intenta de nuevo." 
          }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }
      } else {
        return new Response(JSON.stringify({ 
          error: "Pasarela dLocal Go no configurada en este entorno." 
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Direct WhatsApp / Nequi / Bre-B Flow (Solo cuando el usuario selecciona explícitamente nequi_breb)
    const waText = encodeURIComponent(
      `🌕 *RESERVA NOCHE DE LUNA LLENA — THE CORSET SOCIETY*\n\n` +
      `👤 *Alias/Nombre:* ${alias_nombre}\n` +
      `🎟️ *Entrada:* ${priceInfo.label}\n` +
      `💵 *Modalidad:* ${modalidad_pago === "reserva_40" ? "Separación 40% ($" + monto.toLocaleString("es-CO") + ")" : "Pago Total ($" + monto.toLocaleString("es-CO") + ")"}\n` +
      `🔐 *Ticket Hash:* ${ticketHash}\n\n` +
      `Deseo coordinar el pago directo vía Nequi / Bre-B con la atención oficial.`
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
