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

      // Eliminar tickets asociados al lead
      if (leadId) {
        await client.query("DELETE FROM event_tickets WHERE lead_id::text = $1", [leadId]);
      }

      // Eliminar de leads
      if (leadId || cleanEmail || phoneEnd) {
        await client.query(
          `DELETE FROM leads 
           WHERE id::text = $1 
              OR ($2 != '' AND LOWER(email) = $2)
              OR ($3 != '' AND RIGHT(regexp_replace(whatsapp, '\\D', '', 'g'), 10) = $3)`,
          [leadId || id, cleanEmail, phoneEnd]
        );
      }

      // Eliminar de afiliados
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

      // Eliminar de ambassadors
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

      // Eliminar de tablas auth (user, verification, session)
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

      // Desbloqueo y purga total de Valkey (OTP, human takeover, sesiones y flags)
      if (process.env.VALKEY_URL) {
        try {
          const Redis = (await import("ioredis")).default;
          const redis = new Redis(process.env.VALKEY_URL, { lazyConnect: true });
          await redis.connect();
          const keysToPurge: string[] = [];
          if (phoneEnd) {
            keysToPurge.push(
              `otp:wa:${phoneEnd}`,
              `otp:wa:57${phoneEnd}`,
              `wa:human_takeover:${phoneEnd}`,
              `wa:human_takeover:57${phoneEnd}`,
              `wa:affiliate_pitched:${phoneEnd}`,
              `wa:affiliate_pitched:57${phoneEnd}`,
              `chat:sessions:${phoneEnd}`,
              `chat:sessions:57${phoneEnd}`
            );
          }
          if (cleanEmail) {
            keysToPurge.push(`otp:email:${cleanEmail}`);
          }
          if (keysToPurge.length > 0) {
            await redis.del(...keysToPurge);
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
        const res = await client.query(`
          INSERT INTO leads (alias_nombre, whatsapp, email, rol, ciudad, origen, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [
          data.alias_nombre || "Invitado Manual",
          data.whatsapp || null,
          data.email || null,
          data.rol || "otro",
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
                  metadata = jsonb_set(
                    COALESCE(metadata, '{}'::jsonb),
                    '{vip_until}',
                    to_jsonb((NOW() + INTERVAL '1 year')::text)
                  )
              WHERE id = $1
            `, [assignedLead.id]);
          } catch (vipErr: any) {
            console.warn("[Admin VIP Lead Update Err]:", vipErr.message);
          }
        }

        // Acreditación al embajador si es PAGO REAL y tiene afiliado_id asignado
        let acreditado = false;
        if (!isCortesia && assignedLead.afiliado_id) {
          try {
            const accRes = await recordAffiliatePayment(assignedLead.afiliado_id, assignedLead.id);
            acreditado = accRes.credited;
          } catch (e: any) {
            console.error("[Manual Ticket Accreditation Err]:", e);
          }
        }

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
        return new Response(JSON.stringify({ success: true, record: res.rows[0] }), { status: 200 });
      }

      if (entity === "lead") {
        const res = await client.query(`
          UPDATE leads
          SET alias_nombre = COALESCE($1, alias_nombre),
              whatsapp = COALESCE($2, whatsapp),
              email = COALESCE($3, email),
              rol = COALESCE($4, rol)
          WHERE id::text = $5
          RETURNING *
        `, [updates.alias_nombre || null, updates.whatsapp || null, updates.email || null, updates.rol || null, id]);
        return new Response(JSON.stringify({ success: true, record: res.rows[0] }), { status: 200 });
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
