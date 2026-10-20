import type { APIRoute } from "astro";
import { pool, upsertLead } from "../../../db";
import { resolveDiscount } from "../../../services/discountStrategy";
import crypto from "crypto";

interface EventTier {
  total: number;
  reserva?: number;
  label: string;
}

const EVENT_PRICES: Record<string, Record<string, EventTier>> = {
  luna_llena: {
    pareja: { total: 100000, reserva: 40000, label: "Pareja" },
    single: { total: 120000, reserva: 50000, label: "Single (Hombre Solo)" },
    unicornio: { total: 30000, reserva: 10000, label: "Unicornio (Mujer Sola)" },
  },
  taller_baile_erotico: {
    taller_solo: { total: 40000, label: "Pase Solo Taller (Individual o Pareja)" },
    taller_velada: { total: 120000, reserva: 60000, label: "Pase Taller + Velada VIP Centro Cultural" },
  },
};

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { tipo_entrada, metodo_pago, alias_nombre, email, whatsapp } = body;
    
    const rawEvento = (body.evento || body.event || "luna_llena").toString().toLowerCase().replace(/-/g, "_");
    const evento = rawEvento.includes("taller") || rawEvento.includes("baile") ? "taller_baile_erotico" : "luna_llena";
    const eventTiers = EVENT_PRICES[evento] || EVENT_PRICES.luna_llena;
    const priceInfo = eventTiers[tipo_entrada] || EVENT_PRICES.luna_llena[tipo_entrada] || EVENT_PRICES.taller_baile_erotico[tipo_entrada];

    if (!priceInfo) {
      return new Response(JSON.stringify({ error: "Tipo de entrada inválido" }), { status: 400 });
    }

    const rawModalidad = body.modalidad_pago || body.tipo_pago || "pago_total";
    let modalidad_pago = "pago_total";
    if (priceInfo.reserva && (rawModalidad === "reserva" || rawModalidad === "reserva_40" || rawModalidad === "reserva_50")) {
      modalidad_pago = evento === "taller_baile_erotico" ? "reserva_50" : "reserva_40";
    }

    const baseMonto = modalidad_pago !== "pago_total" && priceInfo.reserva ? priceInfo.reserva : priceInfo.total;
    const rawAffiliateRef = (body.ref || body.afiliado_id || cookies?.get("affiliate_ref")?.value || "")
      .toString()
      .trim()
      .toLowerCase() || null;

    // Anti self-referral and locked referrer resolution
    let affiliateRef = rawAffiliateRef;
    if (whatsapp || email || alias_nombre) {
      try {
        const cleanPhone = (whatsapp || "").toString().replace(/\D/g, "");
        const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;
        const cleanEmail = (email || "").toString().trim().toLowerCase();
        const cleanAlias = (alias_nombre || "").toString().trim().toLowerCase();

        // 1. Resolver Embajador Padre para fallback orgánico si no viene enlace en la compra
        const existingLeadRes = await pool.query(
          `SELECT afiliado_id FROM leads 
           WHERE (email IS NOT NULL AND LOWER(email) = $1)
              OR (whatsapp IS NOT NULL AND RIGHT(regexp_replace(whatsapp, '\\D', '', 'g'), 10) = $2)
           LIMIT 1`,
          [cleanEmail, last10]
        );
        const parentAffiliate = (existingLeadRes.rows[0]?.afiliado_id || "").toString().trim().toLowerCase() || null;

        // Si la compra no trae enlace de último clic, fallback al Embajador Padre (LTV)
        if (!affiliateRef && parentAffiliate) {
          affiliateRef = parentAffiliate;
        }

        // 2. Anti auto-referido estricto contra la tabla de afiliados
        if (affiliateRef) {
          const selfAff = await pool.query(
            `SELECT alias FROM afiliados 
             WHERE LOWER(alias) = LOWER($1)
               AND ((email IS NOT NULL AND LOWER(email) = $2)
                    OR (whatsapp IS NOT NULL AND RIGHT(regexp_replace(whatsapp, '\\D', '', 'g'), 10) = $3)
                    OR (nombre IS NOT NULL AND LOWER(nombre) = $4))
             LIMIT 1`,
            [affiliateRef, cleanEmail, last10, cleanAlias]
          );
          if (selfAff.rows.length > 0 || (cleanAlias && affiliateRef === cleanAlias)) {
            affiliateRef = (parentAffiliate && parentAffiliate !== affiliateRef) ? parentAffiliate : null;
          }
        }
      } catch (_) {}
    }

    // Check if user has active VIP credential for permanent 20% honor discount
    let isVipActive = false;
    if (whatsapp || email) {
      try {
        const cleanPhone = (whatsapp || "").toString().replace(/\D/g, "");
        const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;
        const cleanEmail = (email || "").toString().trim().toLowerCase();

        const vipCheck = await pool.query(
          `SELECT id, vip_until, metadata, corset_vip, primer_pago_acreditado FROM leads 
           WHERE (email IS NOT NULL AND LOWER(email) = $1)
              OR (whatsapp IS NOT NULL AND RIGHT(regexp_replace(whatsapp, '\\D', '', 'g'), 10) = $2)
           LIMIT 1`,
          [cleanEmail, last10]
        );
        if (vipCheck.rows.length > 0) {
          const vRow = vipCheck.rows[0];
          isVipActive = Boolean(
            (vRow.vip_until && new Date(vRow.vip_until) > new Date()) ||
            (vRow.metadata?.vip_until && new Date(vRow.metadata.vip_until) > new Date()) ||
            (Array.isArray(vRow.metadata?.tags) && vRow.metadata.tags.includes("vip_activo")) ||
            (Boolean(vRow.corset_vip) && Boolean(vRow.primer_pago_acreditado)) ||
            (Boolean(vRow.corset_vip) && (!Array.isArray(vRow.metadata?.tags) || !vRow.metadata.tags.includes("posible vip")))
          );

          // Auto-heal active VIP tag in DB if missing
          if (isVipActive && (!Array.isArray(vRow.metadata?.tags) || !vRow.metadata.tags.includes("vip_activo"))) {
            try {
              await pool.query(`
                UPDATE leads 
                SET metadata = jsonb_set(
                  COALESCE(metadata, '{}'::jsonb), 
                  '{tags}', 
                  to_jsonb(array_append(array_remove(array_remove(COALESCE(ARRAY(SELECT jsonb_array_elements_text(metadata->'tags')), '{}'::text[]), 'posible vip'), 'posible_vip'), 'vip_activo'))
                )
                WHERE id = $1
              `, [vRow.id]);
            } catch (_) {}
          }
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
        rol: (tipo_entrada === "pareja" || tipo_entrada === "taller_velada") ? "pareja" : tipo_entrada === "unicornio" ? "mujer_sola" : "hombre_solo",
        corset_vip: isVipActive,
        origen: `evento_${evento}`,
        afiliado_id: affiliateRef || undefined,
      },
      evento === "taller_baile_erotico" ? "elplacerdc" : "corset"
    );

    if (leadResult.status === "conflict") {
      return new Response(JSON.stringify({ error: leadResult.error }), { status: 409 });
    }

    const lead = leadResult.lead;
    if (!lead) {
      return new Response(JSON.stringify({ error: "No se pudo vincular el perfil de invitado." }), { status: 500 });
    }

    // 1.1 Validar filtro dinámico para hombres solos (Single en Luna Llena)
    if (evento === "luna_llena" && tipo_entrada === "single") {
      const countsRes = await pool.query(
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
    }

    // Invariant: First Signup Locks Last-Click Referral.
    // If the registered lead already has an attributed ambassador (lead.afiliado_id), that affiliate is immutable and takes absolute priority!
    const lockedAffiliate = lead.afiliado_id || (affiliateRef && affiliateRef !== (lead.alias_nombre || '').toLowerCase() ? affiliateRef : null);

    const isDigitalGateway = metodo_pago === "pasarela_digital" || metodo_pago === "dlocal_go";

    if (!isDigitalGateway) {
      // Manual coordination via WhatsApp (Bre-B, Nequi, Transferencia)
      const waTitle = evento === "taller_baile_erotico"
        ? `💃 *COORDINACIÓN DE PAGO MANUAL — TALLER DE BAILE — EL PLACER DE COMPARTIR*`
        : `🌕 *COORDINACIÓN DE PAGO MANUAL — NOCHE DE LUNA LLENA — THE CORSET SOCIETY*`;

      const modLabel = modalidad_pago === "reserva_50"
        ? `Separación 50% ($${monto.toLocaleString("es-CO")})`
        : modalidad_pago === "reserva_40"
        ? `Separación 40% ($${monto.toLocaleString("es-CO")})`
        : `Pago Total ($${monto.toLocaleString("es-CO")})`;

      const waText = encodeURIComponent(
        `${waTitle}\n\n` +
        `👤 *Alias/Nombre:* ${alias_nombre}\n` +
        `📱 *WhatsApp:* ${whatsapp}\n` +
        `📧 *Email:* ${email}\n` +
        `🎟️ *Entrada:* ${priceInfo.label}\n` +
        `💵 *Modalidad:* ${modLabel}\n` +
        (lockedAffiliate ? `🤝 *Referido por:* ${lockedAffiliate}\n` : "") +
        `\nHola Segisw, deseo coordinar mi pago manual vía Bre-B, Nequi o transferencia bancaria para el evento.`
      );
      const waUrl = `https://wa.me/573194194785?text=${waText}`;

      return new Response(JSON.stringify({ success: true, redirect_url: waUrl }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Insert or Reuse pending ticket (Idempotency lock: avoid multi-click duplication within 60s)
    let ticketId = "";
    let ticketHash = "";
    const existing = await pool.query(
      `SELECT id, ticket_hash FROM event_tickets 
       WHERE lead_id = $1 AND evento = $2 AND tipo_entrada = $3 AND tipo_pago = $4 AND estado = 'pendiente' AND created_at > NOW() - INTERVAL '60 seconds'
       ORDER BY created_at DESC LIMIT 1`,
      [lead.id, evento, tipo_entrada, modalidad_pago]
    );

    if (existing.rows.length > 0) {
      ticketId = existing.rows[0].id;
      ticketHash = existing.rows[0].ticket_hash;
    } else {
      ticketHash = crypto.randomBytes(16).toString("hex");
      const res = await pool.query(
        `INSERT INTO event_tickets (
          lead_id, evento, tipo_entrada, tipo_pago, monto_pagado, metodo_pago, 
          estado, afiliado_ref, ticket_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          lead.id,
          evento,
          tipo_entrada,
          modalidad_pago,
          monto,
          metodo_pago || "pasarela_digital",
          "pendiente",
          lockedAffiliate,
          ticketHash,
        ]
      );
      ticketId = res.rows[0].id;
    }

    // 3. Handle Digital Payment Method
    const apiKey = process.env.DLOCAL_GO_API_KEY;
    const secretKey = process.env.DLOCAL_GO_SECRET_KEY;
    const isSandbox = (process.env.DLOCAL_GO_ENV || "").toLowerCase() === "sandbox";
    const dlocalUrl = isSandbox 
      ? "https://api-sbx.dlocalgo.com/v1/payments" 
      : "https://api.dlocalgo.com/v1/payments";

    // Sanitización estricta de términos restringidos por pasarelas (Compliance dLocal Go)
    const cleanTierLabel = (priceInfo.label || "")
      .replace(/er[oó]tico/gi, "")
      .replace(/(\(hasta 4am\)|hasta 4am)/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    const eventDesc = evento === "taller_baile_erotico"
      ? `Taller de Baile: ${cleanTierLabel} (${modalidad_pago === "reserva_50" ? "Separacion 50%" : "Pago Total"})`.slice(0, 95)
      : `Cover Cultural: ${cleanTierLabel} (${modalidad_pago === "reserva_40" ? "Separacion 40%" : "Pago Total"})`.slice(0, 95);

    const backUrl = evento === "taller_baile_erotico"
      ? "https://elplacerdecompartir.com/taller-baile-erotico/"
      : "https://elplacerdecompartir.com/the-corset-society/luna-llena/";

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
            description: eventDesc,
            success_url: `https://elplacerdecompartir.com/the-corset-society/ticket?hash=${ticketHash}`,
            back_url: backUrl,
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
    console.error("[Checkout Create Error]:", error);
    const isConnError = error?.code === "53300" || 
      error?.message?.includes("connection slots") || 
      error?.message?.includes("too many clients") ||
      error?.message?.includes("timeout exceeded");

    const userMessage = isConnError
      ? "En este momento estamos experimentando alta demanda en el sistema de pagos. Por favor intenta nuevamente en unos instantes."
      : error.message || "Error al procesar la orden.";

    return new Response(JSON.stringify({ error: userMessage }), {
      status: isConnError ? 503 : 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
