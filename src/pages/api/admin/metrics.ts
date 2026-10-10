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
    const aliadosCountRes = await client.query(`
      SELECT COUNT(*)::int AS count 
      FROM leads 
      WHERE origen ILIKE '%alianza%' OR origen ILIKE '%aliado%' OR origen ILIKE '%centro_cultural%'
    `);
    const vipCountRes = await client.query("SELECT COUNT(*)::int AS count FROM leads WHERE corset_vip = true");
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

    // Financial calculations: Gross, Gateway Fees (1.99% + $800 COP + 19% IVA), Net Revenue & Fixed Expenses
    const revenueStatsRes = await client.query(`
      SELECT 
        COALESCE(SUM(monto_pagado), 0)::numeric AS gross_revenue,
        COALESCE(SUM(
          CASE 
            WHEN metodo_pago IN ('pasarela_digital', 'dlocal_go', 'pasarela_digital_live', 'tarjeta', 'pse') 
            THEN ((0.0199 * monto_pagado + 800) * 1.19)
            ELSE 0 
          END
        ), 0)::numeric AS gateway_fees
      FROM event_tickets 
      WHERE estado NOT IN ('cancelado', 'rechazado')
    `);

    const grossRevenue = Number(revenueStatsRes.rows[0]?.gross_revenue || 0);
    const gatewayFees = Math.round(Number(revenueStatsRes.rows[0]?.gateway_fees || 0));
    const netRevenue = Math.max(0, grossRevenue - gatewayFees);

    const expensesRes = await client.query(`
      SELECT id, evento, concepto, monto::float, created_at 
      FROM event_expenses 
      ORDER BY created_at ASC
    `);
    const totalExpenses = expensesRes.rows.reduce((acc, row) => acc + (Number(row.monto) || 0), 0);
    const netMargin = netRevenue - totalExpenses;

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

    // 2. Enriched Leads (Unified Directory up to 200)
    const recentLeadsRes = await client.query(`
      SELECT 
        l.id, l.alias_nombre, l.email, l.whatsapp, l.rol, l.ciudad, l.origen, l.corset_vip, l.metadata, l.created_at,
        COALESCE(l.primer_pago_acreditado, false) AS primer_pago_acreditado,
        COALESCE(a.alias, '') AS affiliate_alias,
        COALESCE(a.clicks, 0) AS affiliate_clicks,
        COALESCE((SELECT COUNT(*)::int FROM leads ref WHERE LOWER(ref.afiliado_id) = LOWER(a.alias)), 0) AS affiliate_leads_count,
        COALESCE(a.referidos_pagados, 0) AS affiliate_sales_count,
        COALESCE(a.entradas_ganadas, 0) AS affiliate_tickets_won,
        (CASE WHEN l.corset_vip = true THEN true ELSE false END) AS is_possible_vip,
        (SELECT COUNT(*)::int FROM event_tickets et WHERE et.lead_id = l.id) AS tickets_count
      FROM leads l
      LEFT JOIN afiliados a ON (
        (a.email IS NOT NULL AND LOWER(a.email) = LOWER(l.email)) OR 
        (a.whatsapp IS NOT NULL AND RIGHT(regexp_replace(a.whatsapp, '\\D', '', 'g'), 10) = RIGHT(regexp_replace(l.whatsapp, '\\D', '', 'g'), 10)) OR
        (a.alias IS NOT NULL AND LOWER(a.alias) = LOWER(l.alias_nombre))
      )
      ORDER BY l.created_at DESC
      LIMIT 200
    `);

    // 3. All Affiliates (up to 150) con desglose de referidos registrados vs ventas pagadas
    const affiliatesRes = await client.query(`
      SELECT 
        a.id, a.alias, a.nombre, a.whatsapp, a.email, a.clicks, a.referidos_pagados, a.entradas_ganadas, a.created_at,
        (SELECT COUNT(*)::int FROM leads WHERE LOWER(afiliado_id) = LOWER(a.alias)) AS referidos_registrados
      FROM afiliados a
      ORDER BY a.created_at DESC
      LIMIT 150
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
          totalAliados: aliadosCountRes.rows[0]?.count || 0,
          totalVip: vipCountRes.rows[0]?.count || 0,
          totalTickets: ticketsCountRes.rows[0]?.count || 0,
          totalCheckins: checkinsCountRes.rows[0]?.count || 0,
          totalClicks: clicksSumRes.rows[0]?.count || 0,
          pendingCash: pendingCashRes.rows[0]?.count || 0,
          pendingBreB: pendingCashRes.rows[0]?.bre_b_count || 0,
          totalRevenue: grossRevenue,
          grossRevenue,
          gatewayFees,
          netRevenue,
          totalExpenses,
          netMargin,
        },
        financial: {
          grossRevenue,
          totalRevenue: grossRevenue,
          gatewayFees,
          netRevenue,
          totalExpenses,
          netMargin,
          expenses: expensesRes.rows,
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
