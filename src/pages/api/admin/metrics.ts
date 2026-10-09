import type { APIRoute } from "astro";
import { pool } from "../../../db";

export const GET: APIRoute = async () => {
  const client = await pool.connect();
  try {
    // 1. Metric Counts
    const leadsCountRes = await client.query("SELECT COUNT(*)::int AS count FROM leads");
    const affiliatesCountRes = await client.query("SELECT COUNT(*)::int AS count FROM afiliados");
    const ticketsCountRes = await client.query("SELECT COUNT(*)::int AS count FROM event_tickets");
    const checkinsCountRes = await client.query("SELECT COUNT(*)::int AS count FROM event_tickets WHERE estado = 'asistido'");
    const clicksSumRes = await client.query("SELECT COALESCE(SUM(clicks), 0)::int AS count FROM afiliados");

    // 2. Recent Leads
    const recentLeadsRes = await client.query(`
      SELECT id, alias_nombre, email, whatsapp, rol, ciudad, origen, corset_vip, metadata, created_at
      FROM leads
      ORDER BY created_at DESC
      LIMIT 25
    `);

    // 3. Top Affiliates
    const affiliatesRes = await client.query(`
      SELECT id, alias, nombre, whatsapp, email, clicks, referidos_pagados, entradas_ganadas, created_at
      FROM afiliados
      ORDER BY created_at DESC
      LIMIT 25
    `);

    // 4. Recent Tickets
    const ticketsRes = await client.query(`
      SELECT t.id, t.evento, t.tipo_entrada, t.tipo_pago, t.monto_pagado, t.estado, t.ticket_hash, t.created_at,
             l.alias_nombre, l.whatsapp, l.email
      FROM event_tickets t
      LEFT JOIN leads l ON t.lead_id = l.id
      ORDER BY t.created_at DESC
      LIMIT 25
    `);

    return new Response(
      JSON.stringify({
        success: true,
        counts: {
          totalLeads: leadsCountRes.rows[0]?.count || 0,
          totalAffiliates: affiliatesCountRes.rows[0]?.count || 0,
          totalTickets: ticketsCountRes.rows[0]?.count || 0,
          totalCheckins: checkinsCountRes.rows[0]?.count || 0,
          totalClicks: clicksSumRes.rows[0]?.count || 0,
        },
        leads: recentLeadsRes.rows,
        affiliates: affiliatesRes.rows,
        tickets: ticketsRes.rows,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[API Admin Metrics Err]:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    client.release();
  }
};
