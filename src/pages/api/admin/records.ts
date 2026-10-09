import type { APIRoute } from "astro";
import { pool } from "../../../db";
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

    // DELETE a record
    if (method === "DELETE") {
      const url = new URL(request.url);
      const entity = url.searchParams.get("entity"); // "lead" | "affiliate" | "ticket"
      const id = url.searchParams.get("id");

      if (!entity || !id) {
        return new Response(JSON.stringify({ success: false, error: "Parámetros entity e id requeridos" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (entity === "lead") {
        await client.query("DELETE FROM event_tickets WHERE lead_id::text = $1", [id]);
        await client.query("DELETE FROM leads WHERE id::text = $1", [id]);
      } else if (entity === "affiliate") {
        await client.query("DELETE FROM afiliados WHERE id::text = $1 OR alias = $1", [id]);
      } else if (entity === "ticket") {
        await client.query("DELETE FROM event_tickets WHERE id::text = $1 OR ticket_hash = $1", [id]);
      } else {
        return new Response(JSON.stringify({ success: false, error: "Entidad no válida" }), { status: 400 });
      }

      return new Response(JSON.stringify({ success: true, message: `Registro eliminado de ${entity}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
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
        const ticketHash = `MANUAL-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
        const res = await client.query(`
          INSERT INTO event_tickets (evento, tipo_entrada, tipo_pago, monto_pagado, metodo_pago, estado, ticket_hash, lead_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `, [
          data.evento || "luna_llena",
          data.tipo_entrada || "general",
          data.tipo_pago || "total_100",
          Number(data.monto_pagado || 0),
          data.metodo_pago || "efectivo",
          data.estado || "pagado",
          ticketHash,
          data.lead_id || null,
        ]);
        return new Response(JSON.stringify({ success: true, record: res.rows[0] }), { status: 201 });
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
