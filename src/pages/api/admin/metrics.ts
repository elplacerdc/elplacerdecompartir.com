import type { APIRoute } from "astro";
import { pool } from "../../../db";
import { verifyAdminSessionToken } from "../../../services/adminAuth";

export const GET: APIRoute = async ({ cookies }) => {
  const token = cookies.get("admin_token")?.value;
  if (!verifyAdminSessionToken(token)) {
    return new Response(JSON.stringify({ success: false, error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const client = await pool.connect();
  try {
    // 1. Metric Counts
    const leadsCountRes = await client.query("SELECT COUNT(*)::int AS count FROM leads");
    const affiliatesCountRes = await client.query("SELECT COUNT(*)::int AS count FROM afiliados");
    const ticketsCountRes = await client.query("SELECT COUNT(*)::int AS count FROM event_tickets");
    const checkinsCountRes = await client.query("SELECT COUNT(*)::int AS count FROM event_tickets WHERE estado = 'asistido'");
    const clicksSumRes = await client.query("SELECT COALESCE(SUM(clicks), 0)::int AS count FROM afiliados");
    
    // Pending cash & Bre-B
    const pendingCashRes = await client.query(`
      SELECT 
        COUNT(*)::int AS count,
        COUNT(*) FILTER (WHERE metodo_pago ILIKE '%bre%' OR referencia_transaccion ILIKE '%bre%')::int AS bre_b_count
      FROM event_tickets 
      WHERE tipo_pago = 'reserva_40' OR estado IN ('pendiente', 'pendiente_efectivo', 'pendiente_verificacion')
    `);

    // Financial calculations
    const totalRevenueRes = await client.query(`
      SELECT COALESCE(SUM(monto_pagado), 0)::numeric AS sum 
      FROM event_tickets 
      WHERE estado != 'cancelado'
    `);

    const perEventRes = await client.query(`
      SELECT evento, COALESCE(SUM(monto_pagado), 0)::numeric AS total, COUNT(*)::int AS tickets_count
      FROM event_tickets
      WHERE estado != 'cancelado'
      GROUP BY evento
      ORDER BY total DESC
    `);

    const perMonthRes = await client.query(`
      SELECT TO_CHAR(created_at, 'YYYY-MM') AS month, COALESCE(SUM(monto_pagado), 0)::numeric AS total, COUNT(*)::int AS tickets_count
      FROM event_tickets
      WHERE estado != 'cancelado'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 12
    `);

    const currentWeekRes = await client.query(`
      SELECT COALESCE(SUM(monto_pagado), 0)::numeric AS sum
      FROM event_tickets
      WHERE estado != 'cancelado' AND created_at >= DATE_TRUNC('week', NOW())
    `);

    const currentWeekendRes = await client.query(`
      SELECT COALESCE(SUM(monto_pagado), 0)::numeric AS sum
      FROM event_tickets
      WHERE estado != 'cancelado'
        AND EXTRACT(DOW FROM created_at) IN (0, 5, 6)
        AND created_at >= NOW() - INTERVAL '7 days'
    `);

    // 2. Enriched Leads (Unified Directory up to 150)
    const recentLeadsRes = await client.query(`
      SELECT 
        l.id, l.alias_nombre, l.email, l.whatsapp, l.rol, l.ciudad, l.origen, l.corset_vip, l.metadata, l.created_at,
        a.alias AS affiliate_alias,
        COALESCE(a.clicks, 0) AS affiliate_clicks,
        COALESCE(a.referidos_pagados, 0) AS affiliate_referrals,
        COALESCE(a.entradas_ganadas, 0) AS affiliate_tickets_won,
        (CASE WHEN l.corset_vip = true OR l.rol = 'pareja' OR l.origen ILIKE '%vip%' OR l.origen ILIKE '%corset%' THEN true ELSE false END) AS is_possible_vip,
        (SELECT COUNT(*)::int FROM event_tickets et WHERE et.lead_id = l.id) AS tickets_count
      FROM leads l
      LEFT JOIN afiliados a ON (
        (a.email IS NOT NULL AND LOWER(a.email) = LOWER(l.email)) OR 
        (a.whatsapp IS NOT NULL AND RIGHT(a.whatsapp, 10) = RIGHT(l.whatsapp, 10))
      )
      ORDER BY l.created_at DESC
      LIMIT 150
    `);

    // 3. All Affiliates (up to 100)
    const affiliatesRes = await client.query(`
      SELECT id, alias, nombre, whatsapp, email, clicks, referidos_pagados, entradas_ganadas, created_at
      FROM afiliados
      ORDER BY created_at DESC
      LIMIT 100
    `);

    // 4. All Tickets & Reservations with Bre-B flag (up to 150)
    const ticketsRes = await client.query(`
      SELECT t.id, t.evento, t.tipo_entrada, t.tipo_pago, t.monto_pagado, t.metodo_pago, t.referencia_transaccion, t.estado, t.ticket_hash, t.created_at,
             l.alias_nombre, l.whatsapp, l.email,
             (CASE WHEN t.metodo_pago ILIKE '%bre%' OR t.referencia_transaccion ILIKE '%bre%' THEN true ELSE false END) AS is_bre_b
      FROM event_tickets t
      LEFT JOIN leads l ON t.lead_id = l.id
      ORDER BY t.created_at DESC
      LIMIT 150
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
          pendingCash: pendingCashRes.rows[0]?.count || 0,
          pendingBreB: pendingCashRes.rows[0]?.bre_b_count || 0,
          totalRevenue: Number(totalRevenueRes.rows[0]?.sum || 0),
        },
        financial: {
          totalRevenue: Number(totalRevenueRes.rows[0]?.sum || 0),
          perEvent: perEventRes.rows.map(r => ({ evento: r.evento, total: Number(r.total), count: r.tickets_count })),
          perMonth: perMonthRes.rows.map(r => ({ month: r.month, total: Number(r.total), count: r.tickets_count })),
          currentWeek: Number(currentWeekRes.rows[0]?.sum || 0),
          currentWeekend: Number(currentWeekendRes.rows[0]?.sum || 0),
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
