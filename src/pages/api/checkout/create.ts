import type { APIRoute } from "astro";
import { pool, upsertLead } from "../../../db";
import { resolveDiscount } from "../../../services/discountStrategy";
import crypto from "crypto";

const PRICES: Record<string, { total: number; reserva_40: number; label: string }> = {
  pareja: { total: 100000, reserva_40: 40000, label: "Pareja" },
  single: { total: 120000, reserva_40: 50000, label: "Single (Hombre Solo)" },
  unicornio: { total: 30000, reserva_40: 10000, label: "Unicornio (Mujer Sola)" },
};

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { tipo_entrada, metodo_pago, alias_nombre, email, whatsapp } = body;
    const rawModalidad = body.modalidad_pago || body.tipo_pago || "pago_total";
    const modalidad_pago = rawModalidad === "reserva_40" ? "reserva_40" : "pago_total";

    const priceInfo = PRICES[tipo_entrada];
    if (!priceInfo) {
      return new Response(JSON.stringify({ error: "Tipo de entrada inválido" }), { status: 400 });
    }

    const baseMonto = modalidad_pago === "reserva_40" ? priceInfo.reserva_40 : priceInfo.total;
    const affiliateRef = (body.ref || body.afiliado_id || cookies?.get("affiliate_ref")?.value || "")
      .toString()
      .trim()
      .toLowerCase() || null;

    // Check if user has active VIP credential for permanent 10% discount
    let isVipActive = false;
    if (whatsapp || email) {
      try {
        const checkClient = await pool.connect();
        try {
          const vipCheck = await checkClient.query(
            `SELECT vip_until, metadata FROM leads 
             WHERE (whatsapp IS NOT NULL AND whatsapp = $1) OR (email IS NOT NULL AND LOWER(email) = LOWER($2)) 
             LIMIT 1`,
            [whatsapp || '', email || '']
          );
          if (vipCheck.rows.length > 0) {
            const vRow = vipCheck.rows[0];
            isVipActive = Boolean(
              (vRow.vip_until && new Date(vRow.vip_until) > new Date()) ||
              (vRow.metadata?.vip_until && new Date(vRow.metadata.vip_until) > new Date()) ||
              (vRow.metadata?.tags && vRow.metadata.tags.includes("vip_activo"))
            );
          }
        } finally {
          checkClient.release();
        }
      } catch (e) {}
    }

    const discountResult = await resolveDiscount({
      domain: "event_ticket",
      whatsapp,
      email,
      affiliateRef,
      isVipActive,
    });
    const hasDiscount = discountResult.hasDiscount;
    const discountRate = discountResult.discountRate;
    const monto = Math.round(baseMonto * (1 - discountRate));

    // 1. Upsert lead first
    const leadResult = await upsertLead(
      {
        alias_nombre,
        email,
        whatsapp,
        rol: tipo_entrada === "pareja" ? "pareja" : tipo_entrada === "unicornio" ? "mujer_sola" : "hombre_solo",
        corset_vip: isVipActive,
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

    // 1.1 Validar filtro dinámico para hombres solos (Single)
    if (tipo_entrada === "single") {
      const clientRatio = await pool.connect();
      try {
        const countsRes = await clientRatio.query(
          `SELECT 
             COUNT(*) FILTER (WHERE tipo_entrada = 'pareja' AND estado NOT IN ('cancelado', 'rechazado')) as parejas,
             COUNT(*) FILTER (WHERE tipo_entrada = 'single' AND estado NOT IN ('cancelado', 'rechazado')) as singles
           FROM event_tickets
           WHERE evento = 'luna_llena'`
        );
        const parejas = parseInt(countsRes.rows[0]?.parejas || "0", 10);
        const singles = parseInt(countsRes.rows[0]?.singles || "0", 10);

        const isUserVip = Boolean(
          isVipActive || 
          lead.primer_pago_acreditado ||
          (lead.vip_until && new Date(lead.vip_until) > new Date()) ||
          (lead.metadata?.tags && lead.metadata.tags.includes("vip_activo"))
        );

        // Subfiltro VIP: De las 3 primeras plazas para hombre, 1 plaza se reserva para socio VIP
        if (singles >= 2 && !isUserVip && singles < 3) {
          const waText = encodeURIComponent(
            `Hola Segisw, soy ${lead.alias_nombre || 'invitado'} (ID: ${lead.id.substring(0, 8)}) y deseo consultar cupos Single para Luna Llena.`
          );
          const whatsappUrl = `https://wa.me/573194194785?text=${waText}`;
          return new Response(
            JSON.stringify({
              error: `El último cupo disponible en esta fase está reservado exclusivamente para miembros con Credencial VIP activa. Para desbloquear tu reserva inmediata, activa tu credencial VIP.`,
              vipRequired: true,
              checkoutUrl: `/corset-vip#vip-checkout-box`,
              whatsappUrl,
              waitlist: true,
            }),
            { status: 422, headers: { "Content-Type": "application/json" } }
          );
        }

        // A partir de 3 hombres confirmados rige proporción 1:3 respecto a parejas confirmadas:
        const maxSinglesAllowed = Math.max(3, Math.floor(parejas / 3));

        if (singles >= maxSinglesAllowed) {
          const waText = encodeURIComponent(
            `Hola Segisw, soy ${lead.alias_nombre || 'invitado'} (ID: ${lead.id.substring(0, 8)}) y deseo validar cupo en lista de espera para pase Single en Luna Llena.`
          );
          const whatsappUrl = `https://wa.me/573194194785?text=${waText}`;

          const parejasInfo = parejas > 6 ? ` Actualmente contamos con ${parejas} parejas confirmadas.` : "";
          const errorMsg = `Cupos de pase Single temporalmente en espera por política de aforo y equilibrio del evento.${parejasInfo} Te invitamos a comunicarte directamente con Segisw para coordinar tu ingreso o consultar nuevas liberaciones de aforo.`;

          return new Response(
            JSON.stringify({
              error: errorMsg,
              waitlist: true,
              parejas: parejas > 6 ? parejas : undefined,
              whatsappUrl,
              whatsappButtonText: "Hablar con Segisw por WhatsApp",
            }),
            { status: 422, headers: { "Content-Type": "application/json" } }
          );
        }
      } finally {
        clientRatio.release();
      }
    }

    const isDigitalGateway = metodo_pago === "pasarela_digital" || metodo_pago === "dlocal_go";

    if (!isDigitalGateway) {
      // Manual coordination via WhatsApp (Bre-B, Nequi, Transferencia)
      // Zero DB ticket creation, zero automatic reservation, zero QR/notifications until manually approved in /adminn.
      const waText = encodeURIComponent(
        `🌕 *COORDINACIÓN DE PAGO MANUAL — NOCHE DE LUNA LLENA — THE CORSET SOCIETY*\n\n` +
        `👤 *Alias/Nombre:* ${alias_nombre}\n` +
        `📱 *WhatsApp:* ${whatsapp}\n` +
        `📧 *Email:* ${email}\n` +
        `🎟️ *Entrada:* ${priceInfo.label}\n` +
        `💵 *Modalidad:* ${modalidad_pago === "reserva_40" ? "Separación 40% ($" + monto.toLocaleString("es-CO") + ")" : "Pago Total ($" + monto.toLocaleString("es-CO") + ")"}\n` +
        (affiliateRef ? `🤝 *Referido por:* ${affiliateRef}\n` : "") +
        `\nHola Segisw, deseo coordinar mi pago manual vía Bre-B, Nequi o transferencia bancaria para el evento.`
      );
      const waUrl = `https://wa.me/573194194785?text=${waText}`;

      return new Response(JSON.stringify({ success: true, redirect_url: waUrl }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

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
            "pendiente",
            affiliateRef,
            ticketHash,
          ]
        );
        ticketId = res.rows[0].id;
      }
    } finally {
      client.release();
    }

    // 3. Handle Digital Payment Method
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
            description: `Cover Luna Llena: ${priceInfo.label} (${modalidad_pago === "reserva_40" ? "Separación 40%" : "Pago Total"})`.slice(0, 95),
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
          console.error("[Digital Gateway Error Response]:", dlData);
          return new Response(JSON.stringify({ 
            error: dlData.message || "No se pudo generar la sesión de pago digital. Por favor intenta de nuevo." 
          }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }
      } catch (e: any) {
        console.error("[Digital Gateway Fetch Error]:", e.message);
        return new Response(JSON.stringify({ 
          error: "Error de comunicación con la pasarela de pagos. Por favor intenta de nuevo." 
        }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ 
        error: "Pasarela digital de pagos no configurada en este entorno." 
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
