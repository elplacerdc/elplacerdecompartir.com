import type { APIRoute } from "astro";
import { pool, recordAffiliatePayment, ensureAffiliateCode } from "../../../db";
import { verifyAdminSessionToken } from "../../../services/adminAuth";

export const ALL: APIRoute = async ({ request, cookies }) => {
  const token = cookies.get("admin_token")?.value;
  if (!verifyAdminSessionToken(token)) {
    return new Response(JSON.stringify({ success: false, error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const client = await pool.connect();
  try {
    const method = request.method.toUpperCase();

    // DELETE a record: Lógica indivisible registro=lead=embajador
    if (method === "DELETE") {
      const url = new URL(request.url);
      const entity = url.searchParams.get("entity"); // "lead" | "affiliate" | "user" | "ticket"
      const id = url.searchParams.get("id");

      if (!entity || !id) {
        return new Response(JSON.stringify({ success: false, error: "Parámetros entity e id requeridos" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (entity === "ticket") {
        await client.query("DELETE FROM event_tickets WHERE id::text = $1 OR ticket_hash = $1", [id]);
        return new Response(JSON.stringify({ success: true, message: "Ticket eliminado" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Para lead, affiliate o user: Borrado atómico e indivisible en cascada
      // 1. Obtener datos del lead y/o afiliado antes de borrar
      const leadRes = await client.query(
        "SELECT * FROM leads WHERE id::text = $1 OR email = $1 OR whatsapp = $1 LIMIT 1",
        [id]
      );
      const affRes = await client.query(
        "SELECT * FROM afiliados WHERE id::text = $1 OR alias = $1 OR email = $1 OR whatsapp = $1 LIMIT 1",
        [id]
      );

      const leadRow = leadRes.rows[0];
      const affRow = affRes.rows[0];

      const leadId = leadRow?.id;
      const cleanEmail = (leadRow?.email || affRow?.email || "").toLowerCase();
      const cleanPhone = leadRow?.whatsapp || affRow?.whatsapp || "";
      const phoneEnd = cleanPhone ? cleanPhone.replace(/\D/g, "").slice(-10) : "";
      const affAlias = affRow?.alias;

      // 1. Eliminar tickets asociados al lead o a su contacto
      await client.query(
        `DELETE FROM event_tickets 
         WHERE lead_id::text = $1 
            OR lead_id IN (
              SELECT id FROM leads 
              WHERE ($2 != '' AND LOWER(email) = $2)
                 OR ($3 != '' AND RIGHT(regexp_replace(whatsapp, '\\D', '', 'g'), 10) = $3)
            )`,
        [leadId || id, cleanEmail, phoneEnd]
      );

      // 2. Desvincular referidos y comisiones que apuntaban a este usuario
      if (affAlias) {
        try {
          await client.query(
            `UPDATE leads SET afiliado_id = NULL 
             WHERE LOWER(afiliado_id) = LOWER($1) OR afiliado_id = $2`,
            [affAlias, leadId || id]
          );
          await client.query(
            `UPDATE event_tickets SET afiliado_ref = NULL 
             WHERE LOWER(afiliado_ref) = LOWER($1)`,
            [affAlias]
          );
        } catch (_) {}
      }

      // 3. Eliminar de leads
      if (leadId || cleanEmail || phoneEnd) {
        await client.query(
          `DELETE FROM leads 
           WHERE id::text = $1 
              OR ($2 != '' AND LOWER(email) = $2)
              OR ($3 != '' AND RIGHT(regexp_replace(whatsapp, '\\D', '', 'g'), 10) = $3)`,
          [leadId || id, cleanEmail, phoneEnd]
        );
      }

      // 4. Eliminar de afiliados
      if (affAlias || cleanEmail || phoneEnd) {
        await client.query(
          `DELETE FROM afiliados 
           WHERE LOWER(alias) = LOWER($1) 
              OR id::text = $2
              OR ($3 != '' AND LOWER(email) = $3)
              OR ($4 != '' AND RIGHT(regexp_replace(whatsapp, '\\D', '', 'g'), 10) = $4)`,
          [affAlias || id, id, cleanEmail, phoneEnd]
        );
      }

      // 5. Eliminar de ambassadors
      if (leadId || cleanEmail || phoneEnd) {
        try {
          await client.query(
            `DELETE FROM ambassadors 
             WHERE id::text = $1 
                OR ($2 != '' AND LOWER(email) = $2) 
                OR ($3 != '' AND RIGHT(regexp_replace(phone, '\\D', '', 'g'), 10) = $3)`,
            [leadId || id, cleanEmail, phoneEnd]
          );
        } catch (_) {}
      }

      // 6. Eliminar de tablas auth (user, verification, session)
      if (leadId || cleanEmail || phoneEnd) {
        try {
          await client.query(
            `DELETE FROM "user" 
             WHERE id::text = $1 
                OR ($2 != '' AND LOWER(email) = $2) 
                OR ($3 != '' AND RIGHT(regexp_replace("phoneNumber", '\\D', '', 'g'), 10) = $3)`,
            [leadId || id, cleanEmail, phoneEnd]
          );
        } catch (_) {}

        try {
          await client.query(
            `DELETE FROM "verification" 
             WHERE ($1 != '' AND LOWER(identifier) = $1) 
                OR ($2 != '' AND RIGHT(regexp_replace(identifier, '\\D', '', 'g'), 10) = $2)`,
            [cleanEmail, phoneEnd]
          );
        } catch (_) {}

        try {
          await client.query(
            `DELETE FROM "session" WHERE "userId"::text = $1`,
            [leadId || id]
          );
        } catch (_) {}
      }

      // 7. Desbloqueo y purga total de Valkey (OTP, human takeover, sesiones, descuentos y flags)
      if (process.env.VALKEY_URL) {
        try {
          const Redis = (await import("ioredis")).default;
          const redis = new Redis(process.env.VALKEY_URL, { lazyConnect: true });
          await redis.connect();
          
          const matchedKeys = new Set<string>();

          // Patrones por escaneo
          const patterns: string[] = [];
          if (phoneEnd && phoneEnd.length >= 7) {
            patterns.push(`*${phoneEnd}*`);
          }
          if (cleanEmail && cleanEmail.includes("@")) {
            patterns.push(`*${cleanEmail}*`);
          }
          if (affAlias && affAlias.length >= 3) {
            patterns.push(`*${affAlias.toLowerCase()}*`);
          }
          if (leadId) {
            patterns.push(`*${leadId}*`);
          }

          for (const pat of patterns) {
            try {
              const found = await redis.keys(pat);
              found.forEach((k) => matchedKeys.add(k));
            } catch (_) {}
          }

          // Llaves explícitas
          if (phoneEnd) {
            [
              `otp:wa:${phoneEnd}`,
              `otp:wa:57${phoneEnd}`,
              `wa:human_takeover:${phoneEnd}`,
              `wa:human_takeover:57${phoneEnd}`,
              `wa:affiliate_pitched:${phoneEnd}`,
              `wa:affiliate_pitched:57${phoneEnd}`,
              `chat:sessions:${phoneEnd}`,
              `chat:sessions:57${phoneEnd}`,
              `bot:status:${phoneEnd}`,
              `bot:status:57${phoneEnd}`,
              `lid:${phoneEnd}`,
              `lid:57${phoneEnd}`,
              `lead:session:${phoneEnd}`,
              `lead:discount:${phoneEnd}`,
            ].forEach((k) => matchedKeys.add(k));
          }
          if (cleanEmail) {
            matchedKeys.add(`otp:email:${cleanEmail}`);
            matchedKeys.add(`lead:discount:${cleanEmail}`);
          }

          const keysArray = Array.from(matchedKeys);
          if (keysArray.length > 0) {
            await redis.del(...keysArray);
          }
          redis.disconnect();
        } catch (vErr: any) {
          console.warn("[Valkey purge on lead delete]:", vErr.message);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Registro y perfil de embajador eliminados y desbloqueados de forma indivisible",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // POST: Create a record manually
    if (method === "POST") {
      const body = await request.json();
      const { entity, data } = body;

      if (!entity || !data) {
        return new Response(JSON.stringify({ success: false, error: "entity y data requeridos" }), { status: 400 });
      }

      if (entity === "lead") {
        let cleanRol = data.rol ? data.rol.toString().trim().toLowerCase() : "otro";
        if (cleanRol === "single") cleanRol = "hombre_solo";
        else if (cleanRol === "unicornio") cleanRol = "mujer_sola";
        else if (cleanRol === "general") cleanRol = "otro";
        if (!["hombre_solo", "mujer_sola", "pareja", "otro"].includes(cleanRol)) {
          cleanRol = "otro";
        }

        const res = await client.query(`
          INSERT INTO leads (alias_nombre, whatsapp, email, rol, ciudad, origen, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [
          data.alias_nombre || "Invitado Manual",
          data.whatsapp || null,
          data.email || null,
          cleanRol,
          data.ciudad || "Bogotá",
          data.origen || "admin_manual",
          JSON.stringify({ created_by: "admin", note: data.note || "" }),
        ]);

        // Auto-provisionar embajador para mantener indivisibilidad
        try {
          await ensureAffiliateCode(data.alias_nombre || "Embajador", data.whatsapp, data.email);
        } catch (e: any) {}

        return new Response(JSON.stringify({ success: true, record: res.rows[0] }), { status: 201 });
      }

      if (entity === "affiliate") {
        const alias = (data.alias || "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
        if (!alias) {
          return new Response(JSON.stringify({ success: false, error: "Alias de embajador requerido" }), { status: 400 });
        }
        const res = await client.query(`
          INSERT INTO afiliados (alias, nombre, whatsapp, email)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `, [alias, data.nombre || alias, data.whatsapp || null, data.email || null]);
        return new Response(JSON.stringify({ success: true, record: res.rows[0] }), { status: 201 });
      }

      if (entity === "ticket") {
        // Validación estricta: asignar siempre a un usuario existente
        if (!data.lead_id) {
          return new Response(JSON.stringify({
            success: false,
            error: "Todo pase o cortesía debe asignarse obligatoriamente a un usuario existente del directorio (lead_id requerido)",
          }), { status: 400 });
        }

        const leadCheck = await client.query("SELECT * FROM leads WHERE id::text = $1", [data.lead_id]);
        if (leadCheck.rows.length === 0) {
          return new Response(JSON.stringify({
            success: false,
            error: "El usuario seleccionado no existe en la base de datos",
          }), { status: 404 });
        }
        const assignedLead = leadCheck.rows[0];

        // Diferenciación en dos categorías:
        // A) Pago real efectivo en sitio (diferente a Bre-B/digital)
        // B) Cortesía manual ($0)
        const isCortesia = data.categoria === "cortesia" || Number(data.monto_pagado || 0) === 0;
        const montoPagado = isCortesia ? 0 : Number(data.monto_pagado || 0);
        const metodoPago = isCortesia ? (data.metodo_pago || "cortesia_manual") : (data.metodo_pago || "efectivo_sitio");
        const tipoPago = data.tipo_pago || (isCortesia ? "cortesia_100" : "total_100");

        const ticketHash = `MANUAL-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
        const res = await client.query(`
          INSERT INTO event_tickets (evento, tipo_entrada, tipo_pago, monto_pagado, metodo_pago, estado, ticket_hash, lead_id, afiliado_ref)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `, [
          data.evento || "luna_llena",
          data.tipo_entrada || "general",
          tipoPago,
          montoPagado,
          metodoPago,
          data.estado || "confirmado",
          ticketHash,
          assignedLead.id,
          assignedLead.afiliado_id || null,
        ]);

        // Si es membresía VIP anual o el evento es corset_vip, activar credencial en el lead
        if (data.evento === "corset_vip" || (data.tipo_entrada && data.tipo_entrada.includes("vip"))) {
          try {
            await client.query(`
              UPDATE leads
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
              WHERE id = $1
            `, [assignedLead.id]);
          } catch (vipErr: any) {
            console.warn("[Admin VIP Lead Update Err]:", vipErr.message);
          }
        }

        // Activación de credencial VIP con promoción Luna Llena SOLO si es pago completo o asistido
        const isFullPaidOrAttended = !isCortesia && (tipoPago === "total" || tipoPago === "total_100" || tipoPago === "pago_total" || data.estado === "asistido");
        if (data.evento === "luna_llena" && isFullPaidOrAttended) {
          try {
            await client.query(`
              UPDATE leads
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
              WHERE id = $1
            `, [assignedLead.id]);
          } catch (vipErr: any) {
            console.warn("[Admin Luna Llena VIP Promo Err]:", vipErr.message);
          }
        }

        // Acreditación al embajador SOLO con pago total (100%) o luego de asistido (no solo con reserva)
        let acreditado = false;
        if (isFullPaidOrAttended && assignedLead.afiliado_id) {
          try {
            const accRes = await recordAffiliatePayment(assignedLead.afiliado_id, assignedLead.id);
            acreditado = accRes.credited;
          } catch (e: any) {
            console.error("[Manual Ticket Accreditation Err]:", e);
          }
        } else if (!isCortesia && assignedLead.afiliado_id && (tipoPago === "reserva" || tipoPago === "reserva_40")) {
          // Notificar la reserva aclarando que la acreditación se completará al pagar el 100% o asistir
          import("../../../services/notifications").then(({ notifyAmbassadorNewReferral }) => {
            pool.query("SELECT * FROM afiliados WHERE LOWER(alias) = LOWER($1) LIMIT 1", [assignedLead.afiliado_id])
              .then(ambRes => {
                if (ambRes.rows.length > 0) {
                  notifyAmbassadorNewReferral(ambRes.rows[0], {
                    alias_nombre: assignedLead.alias_nombre,
                    email: assignedLead.email
                  }).catch(() => {});
                }
              }).catch(() => {});
          });
        }

        // Generar o resolver el código de embajador PROPIO del usuario notificado
        let userOwnAffiliateCode: string | undefined = undefined;
        try {
          userOwnAffiliateCode = await ensureAffiliateCode(assignedLead.alias_nombre || "Embajador", assignedLead.whatsapp, assignedLead.email);
        } catch (affErr: any) {
          console.warn("[Ensure Affiliate Code Err]:", affErr.message);
        }

        // Notificación automática multi-canal (QR email + WhatsApp) para emisión manual / cortesía
        import("../../../services/notifications").then(({ notifyEventReservation }) => {
          notifyEventReservation(
            {
              evento: data.evento || "luna_llena",
              ticket_hash: ticketHash,
            },
            {
              alias_nombre: assignedLead.alias_nombre,
              whatsapp: assignedLead.whatsapp,
              email: assignedLead.email,
            },
            {
              isNewLead: false,
              affiliateCode: userOwnAffiliateCode || undefined,
            }
          ).catch((nErr) => console.error("[Admin Manual Pass Notification Err]:", nErr));
        });

        return new Response(JSON.stringify({
          success: true,
          record: res.rows[0],
          acreditado,
          categoria: isCortesia ? "cortesia_manual" : "pago_real_efectivo",
        }), { status: 201 });
      }

      return new Response(JSON.stringify({ success: false, error: "Entidad no válida" }), { status: 400 });
    }

    // PUT: Update a record
    if (method === "PUT") {
      const body = await request.json();
      const { entity, id, updates } = body;

      if (!entity || !id || !updates) {
        return new Response(JSON.stringify({ success: false, error: "entity, id y updates requeridos" }), { status: 400 });
      }

      if (entity === "ticket") {
        const res = await client.query(`
          UPDATE event_tickets
          SET estado = COALESCE($1, estado),
              monto_pagado = COALESCE($2, monto_pagado),
              metodo_pago = COALESCE($3, metodo_pago)
          WHERE id::text = $4 OR ticket_hash = $4
          RETURNING *
        `, [updates.estado || null, updates.monto_pagado || null, updates.metodo_pago || null, id]);
        
        const updatedTicket = res.rows[0];
        if (updatedTicket && updates.estado === "asistido") {
          // Activar VIP de Luna Llena al confirmar asistencia
          if (updatedTicket.evento === "luna_llena" && updatedTicket.lead_id) {
            try {
              await client.query(`
                UPDATE leads
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
                WHERE id = $1
              `, [updatedTicket.lead_id]);
            } catch (_) {}
          }
          // Acreditar venta al embajador al asistir
          if (updatedTicket.afiliado_ref && updatedTicket.lead_id) {
            try {
              await recordAffiliatePayment(updatedTicket.afiliado_ref, updatedTicket.lead_id);
            } catch (_) {}
          }
        }
        return new Response(JSON.stringify({ success: true, record: updatedTicket }), { status: 200 });
      }

      if (entity === "lead") {
        const {
          alias_nombre, whatsapp, email, rol, ciudad, origen, afiliado_id,
          corset_vip, vip_until, primer_pago_acreditado, vip_status
        } = updates;

        // 1. Normalizar rol para cumplir estrictamente con leads_rol_check
        let cleanRol = rol ? rol.toString().trim().toLowerCase() : null;
        if (cleanRol === "single") cleanRol = "hombre_solo";
        else if (cleanRol === "unicornio") cleanRol = "mujer_sola";
        else if (cleanRol === "general") cleanRol = "otro";
        if (cleanRol && !["hombre_solo", "mujer_sola", "pareja", "otro"].includes(cleanRol)) {
          cleanRol = "otro";
        }

        // 2. Obtener lead actual para sincronizar tags y metadata
        const existingLeadRes = await client.query("SELECT * FROM leads WHERE id::text = $1", [id]);
        const existingLead = existingLeadRes.rows[0];
        if (!existingLead) {
          return new Response(JSON.stringify({ success: false, error: "Lead no encontrado" }), { status: 404 });
        }

        let computedVip: boolean = existingLead.corset_vip;
        let computedVipUntil: string | null = existingLead.vip_until ? new Date(existingLead.vip_until).toISOString() : null;

        let existingMeta = existingLead.metadata || {};
        let existingTags: string[] = Array.isArray(existingMeta.tags) ? [...existingMeta.tags] : [];

        if (vip_status === "vip_activo") {
          computedVip = true;
          computedVipUntil = vip_until || (computedVipUntil && new Date(computedVipUntil) > new Date() ? computedVipUntil : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString());
          if (!existingTags.includes("vip_activo")) existingTags.push("vip_activo");
          if (!existingTags.includes("corset_vip")) existingTags.push("corset_vip");
          existingTags = existingTags.filter((t) => t !== "posible vip" && t !== "posible_vip");
        } else if (vip_status === "no_vip") {
          computedVip = false;
          computedVipUntil = null;
          existingTags = existingTags.filter((t) => t !== "vip_activo" && t !== "corset_vip" && t !== "posible vip" && t !== "posible_vip");
        } else if (vip_status === "posible_vip") {
          computedVip = true;
          computedVipUntil = null;
          if (!existingTags.includes("posible vip")) existingTags.push("posible vip");
          if (!existingTags.includes("corset_vip")) existingTags.push("corset_vip");
          existingTags = existingTags.filter((t) => t !== "vip_activo");
        } else {
          // Si no se envió vip_status explícito, respetar corset_vip si vino definido
          if (corset_vip !== undefined) {
            computedVip = Boolean(corset_vip);
          }
          if (vip_until !== undefined) {
            computedVipUntil = vip_until ? new Date(vip_until).toISOString() : null;
          }
        }

        const updatedMetadata = {
          ...existingMeta,
          tags: Array.from(new Set(existingTags)),
          vip_until: computedVipUntil,
        };

        const res = await client.query(`
          UPDATE leads
          SET alias_nombre = COALESCE($1, alias_nombre),
              whatsapp = COALESCE($2, whatsapp),
              email = COALESCE($3, email),
              rol = COALESCE($4, rol),
              ciudad = COALESCE($5, ciudad),
              origen = COALESCE($6, origen),
              afiliado_id = $7::text,
              corset_vip = $8::boolean,
              vip_until = ($9::text)::timestamptz,
              primer_pago_acreditado = CASE WHEN $10::boolean IS NOT NULL THEN $10::boolean ELSE primer_pago_acreditado END,
              metadata = $11::jsonb,
              updated_at = NOW()
          WHERE id::text = $12
          RETURNING *
        `, [
          alias_nombre || null,
          whatsapp || null,
          email || null,
          cleanRol || null,
          ciudad || null,
          origen || null,
          afiliado_id !== undefined ? (afiliado_id || null) : existingLead.afiliado_id,
          computedVip,
          computedVipUntil ? String(computedVipUntil) : null,
          primer_pago_acreditado !== undefined ? primer_pago_acreditado : null,
          JSON.stringify(updatedMetadata),
          id
        ]);

        const updatedLead = res.rows[0];

        // 3. Sincronizar en afiliados si corresponde
        try {
          const finalAlias = updatedLead.alias_nombre || alias_nombre;
          const finalWa = updatedLead.whatsapp || whatsapp;
          const finalEmail = updatedLead.email || email;
          const oldWa = existingLead.whatsapp;
          const oldEmail = existingLead.email;

          await client.query(`
            UPDATE afiliados
            SET nombre = COALESCE($1, nombre),
                whatsapp = COALESCE($2, whatsapp),
                email = COALESCE($3, email),
                updated_at = NOW()
            WHERE (email IS NOT NULL AND (LOWER(email) = LOWER($4) OR LOWER(email) = LOWER($3)))
               OR (whatsapp IS NOT NULL AND (whatsapp = $5 OR whatsapp = $2))
          `, [finalAlias || null, finalWa || null, finalEmail || null, oldEmail || "", oldWa || ""]);
        } catch (affSyncErr: any) {
          console.warn("[Admin Lead Affiliate Sync Err]:", affSyncErr.message);
        }

        return new Response(JSON.stringify({ success: true, record: updatedLead }), { status: 200 });
      }

      if (entity === "affiliate") {
        const res = await client.query(`
          UPDATE afiliados
          SET nombre = COALESCE($1, nombre),
              whatsapp = COALESCE($2, whatsapp),
              email = COALESCE($3, email)
          WHERE id::text = $4 OR alias = $4
          RETURNING *
        `, [updates.nombre || null, updates.whatsapp || null, updates.email || null, id]);
        return new Response(JSON.stringify({ success: true, record: res.rows[0] }), { status: 200 });
      }

      return new Response(JSON.stringify({ success: false, error: "Entidad no válida" }), { status: 400 });
    }

    return new Response(JSON.stringify({ success: false, error: "Método no soportado" }), { status: 405 });
  } catch (e: any) {
    console.error("[Admin Records API Err]:", e);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    client.release();
  }
};
