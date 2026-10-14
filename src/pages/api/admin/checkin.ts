import type { APIRoute } from "astro";
import { pool } from "../../../db";
import { verifyAdminSessionToken } from "../../../services/adminAuth";

export const POST: APIRoute = async ({ request, cookies }) => {
  const token = cookies.get("admin_token")?.value;
  if (!verifyAdminSessionToken(token)) {
    return new Response(JSON.stringify({ success: false, error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const client = await pool.connect();
  try {
    const body = await request.json();
    let rawCode = (body.ticket_hash || body.code || "").trim();

    if (!rawCode) {
      return new Response(JSON.stringify({ success: false, error: "Código o Hash de ticket requerido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Clean prefix if coming from ELPLACERDC-EVENT-<hash> format
    const cleanHash = rawCode.replace(/^ELPLACERDC-EVENT-/, "").trim();

    // Query ticket
    const ticketRes = await client.query(
      `SELECT t.*, l.alias_nombre, l.whatsapp, l.email, l.rol
       FROM event_tickets t
       LEFT JOIN leads l ON t.lead_id = l.id
       WHERE t.ticket_hash = $1 OR t.id::text = $1
       LIMIT 1`,
      [cleanHash]
    );

    if (ticketRes.rows.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Entrada no encontrada. Verifica que el código QR pertenezca a un evento registrado.",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const ticket = ticketRes.rows[0];

    // Already checked in
    if (ticket.estado === "asistido") {
      return new Response(
        JSON.stringify({
          success: true,
          already_checked_in: true,
          message: "Esta entrada YA fue validada previamente.",
          ticket: {
            id: ticket.id,
            evento: ticket.evento,
            tipo_entrada: ticket.tipo_entrada,
            estado: ticket.estado,
            titular: ticket.alias_nombre || "Invitado",
            whatsapp: ticket.whatsapp,
            email: ticket.email,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Mark as attended
    const updateRes = await client.query(
      `UPDATE event_tickets 
       SET estado = 'asistido'
       WHERE id = $1
       RETURNING *`,
      [ticket.id]
    );

    // Activación de credencial VIP de Luna Llena al asistir físicamente (en puerta)
    if (ticket.evento === "luna_llena" && ticket.lead_id) {
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
        `, [ticket.lead_id]);
      } catch (vipErr: any) {
        console.warn("[Checkin Luna Llena VIP Promo Err]:", vipErr.message);
      }
    }

    // Acreditar venta al embajador al momento de asistir (regla de asistencia cumplida)
    if (ticket.afiliado_ref && ticket.lead_id) {
      try {
        const { recordAffiliatePayment } = await import("../../../db");
        await recordAffiliatePayment(ticket.afiliado_ref, ticket.lead_id);
      } catch (affErr: any) {
        console.warn("[Checkin Affiliate Credit Err]:", affErr.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        already_checked_in: false,
        message: "✓ Asistencia verificada exitosamente. Acceso concedido.",
        ticket: {
          id: ticket.id,
          evento: ticket.evento,
          tipo_entrada: ticket.tipo_entrada,
          estado: "asistido",
          titular: ticket.alias_nombre || "Invitado",
          whatsapp: ticket.whatsapp,
          email: ticket.email,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[API Admin Checkin Err]:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    client.release();
  }
};
