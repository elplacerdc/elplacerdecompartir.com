import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const query = (text: string, params?: any[]) => pool.query(text, params);

export interface Lead {
  id: string;
  alias_nombre: string | null;
  email: string | null;
  whatsapp: string | null;
  rol: "hombre_solo" | "mujer_sola" | "pareja" | "otro" | null;
  ciudad: string | null;
  origen: string | null;
  afiliado_id: string | null;
  corset_vip: boolean;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export async function findLeadByContact(email?: string, whatsapp?: string): Promise<Lead | null> {
  const client = await pool.connect();
  try {
    let query = "SELECT * FROM leads WHERE false";
    const params: string[] = [];

    if (email && whatsapp) {
      query = "SELECT * FROM leads WHERE email = $1 OR whatsapp = $2 LIMIT 1";
      params.push(email.trim().toLowerCase(), whatsapp.trim());
    } else if (email) {
      query = "SELECT * FROM leads WHERE email = $1 LIMIT 1";
      params.push(email.trim().toLowerCase());
    } else if (whatsapp) {
      query = "SELECT * FROM leads WHERE whatsapp = $1 LIMIT 1";
      params.push(whatsapp.trim());
    } else {
      return null;
    }

    const res = await client.query(query, params);
    return res.rows[0] || null;
  } finally {
    client.release();
  }
}

export async function upsertLead(data: {
  alias_nombre?: string;
  email?: string;
  whatsapp?: string;
  rol?: "hombre_solo" | "mujer_sola" | "pareja" | "otro";
  ciudad?: string;
  origen?: string;
  afiliado_id?: string;
  corset_vip?: boolean;
}): Promise<Lead> {
  const client = await pool.connect();
  try {
    const existing = await findLeadByContact(data.email, data.whatsapp);

    if (existing) {
      const updated = await client.query(
        `UPDATE leads SET
          alias_nombre = COALESCE($1, alias_nombre),
          email = COALESCE($2, email),
          whatsapp = COALESCE($3, whatsapp),
          rol = COALESCE($4, rol),
          ciudad = COALESCE($5, ciudad),
          corset_vip = CASE WHEN $6 = true THEN true ELSE corset_vip END,
          updated_at = NOW()
        WHERE id = $7
        RETURNING *`,
        [
          data.alias_nombre || null,
          data.email ? data.email.trim().toLowerCase() : null,
          data.whatsapp ? data.whatsapp.trim() : null,
          data.rol || null,
          data.ciudad || null,
          data.corset_vip || false,
          existing.id,
        ]
      );
      return updated.rows[0];
    } else {
      const inserted = await client.query(
        `INSERT INTO leads (alias_nombre, email, whatsapp, rol, ciudad, origen, afiliado_id, corset_vip)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          data.alias_nombre || null,
          data.email ? data.email.trim().toLowerCase() : null,
          data.whatsapp ? data.whatsapp.trim() : null,
          data.rol || "otro",
          data.ciudad || "Bogotá",
          data.origen || "web_comunidad",
          data.afiliado_id || null,
          data.corset_vip || false,
        ]
      );
      return inserted.rows[0];
    }
  } finally {
    client.release();
  }
}

export async function recordAffiliatePayment(affiliateAlias: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `UPDATE afiliados 
       SET referidos_pagados = referidos_pagados + 1,
           entradas_ganadas = FLOOR((referidos_pagados + 1) / 3)
       WHERE alias = $1
       RETURNING *`,
      [affiliateAlias.trim().toLowerCase()]
    );
    return res.rowCount !== null && res.rowCount > 0;
  } finally {
    client.release();
  }
}
