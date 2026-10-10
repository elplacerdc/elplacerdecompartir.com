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
    const url = new URL(request.url);

    // GET: List expenses for an event
    if (method === "GET") {
      const evento = url.searchParams.get("evento") || "luna_llena";
      const res = await client.query(
        `SELECT id, evento, concepto, monto::float, created_at, updated_at 
         FROM event_expenses 
         WHERE evento = $1 
         ORDER BY created_at ASC`,
        [evento]
      );
      const total = res.rows.reduce((acc, row) => acc + (Number(row.monto) || 0), 0);

      return new Response(JSON.stringify({ success: true, expenses: res.rows, total }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // POST: Create a new expense item
    if (method === "POST") {
      const body = await request.json();
      const { evento = "luna_llena", concepto, monto } = body;

      if (!concepto || monto === undefined) {
        return new Response(JSON.stringify({ success: false, error: "Concepto y monto son requeridos" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const res = await client.query(
        `INSERT INTO event_expenses (evento, concepto, monto) 
         VALUES ($1, $2, $3) 
         RETURNING id, evento, concepto, monto::float, created_at, updated_at`,
        [evento, concepto.trim(), Number(monto) || 0]
      );

      return new Response(JSON.stringify({ success: true, expense: res.rows[0] }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    // PUT: Update an existing expense item
    if (method === "PUT") {
      const body = await request.json();
      const { id, concepto, monto } = body;

      if (!id) {
        return new Response(JSON.stringify({ success: false, error: "ID de gasto requerido" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const res = await client.query(
        `UPDATE event_expenses 
         SET concepto = COALESCE($1, concepto), 
             monto = COALESCE($2, monto), 
             updated_at = NOW() 
         WHERE id::text = $3 
         RETURNING id, evento, concepto, monto::float, created_at, updated_at`,
        [concepto ? concepto.trim() : null, monto !== undefined ? Number(monto) : null, id]
      );

      if (res.rowCount === 0) {
        return new Response(JSON.stringify({ success: false, error: "Gasto no encontrado" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, expense: res.rows[0] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // DELETE: Delete an expense item
    if (method === "DELETE") {
      let id = url.searchParams.get("id");
      if (!id) {
        try {
          const body = await request.json();
          id = body.id;
        } catch {}
      }

      if (!id) {
        return new Response(JSON.stringify({ success: false, error: "ID de gasto requerido" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      await client.query("DELETE FROM event_expenses WHERE id::text = $1", [id]);

      return new Response(JSON.stringify({ success: true, message: "Gasto eliminado exitosamente" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, error: "Método no soportado" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[API Admin Expenses Err]:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    client.release();
  }
};
