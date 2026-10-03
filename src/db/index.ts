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

export function getPhoneVariants(phone?: string | null): string[] {
  if (!phone) return [];
  const digits = phone.replace(/\D/g, "");
  if (!digits) return [];
  const variants = new Set<string>();
  variants.add(phone.trim());
  variants.add(digits);
  if (digits.length === 10 && digits.startsWith("3")) {
    variants.add(`57${digits}`);
    variants.add(`+57${digits}`);
  } else if (digits.length === 12 && digits.startsWith("573")) {
    const raw10 = digits.slice(2);
    variants.add(raw10);
    variants.add(`+57${raw10}`);
    variants.add(digits);
  }
  return Array.from(variants);
}

export async function findLeadByContact(email?: string, whatsapp?: string): Promise<Lead | null> {
  const client = await pool.connect();
  try {
    const cleanEmail = email && email.trim() ? email.trim().toLowerCase() : null;
    const phoneVariants = getPhoneVariants(whatsapp);

    if (!cleanEmail && phoneVariants.length === 0) {
      return null;
    }

    let queryStr = "SELECT * FROM leads WHERE ";
    const conditions: string[] = [];
    const params: any[] = [];

    if (cleanEmail) {
      params.push(cleanEmail);
      conditions.push(`email = $${params.length}`);
    }

    if (phoneVariants.length > 0) {
      params.push(phoneVariants);
      conditions.push(`whatsapp = ANY($${params.length})`);
    }

    queryStr += `(${conditions.join(" OR ")}) ORDER BY created_at DESC LIMIT 1`;

    const res = await client.query(queryStr, params);
    return res.rows[0] || null;
  } finally {
    client.release();
  }
}

export async function upsertLead(data: {
  alias_nombre?: string;
  email?: string;
  whatsapp?: string;
  rol?: "hombre_solo" | "mujer_sola" | "pareja" | "otro" | string;
  ciudad?: string;
  origen?: string;
  afiliado_id?: string;
  corset_vip?: boolean;
  metadata?: Record<string, any>;
}): Promise<Lead> {
  const client = await pool.connect();
  try {
    const cleanEmail = data.email && data.email.trim() ? data.email.trim().toLowerCase() : null;
    const cleanWhatsapp = data.whatsapp && data.whatsapp.trim() ? data.whatsapp.trim() : null;
    const phoneVariants = getPhoneVariants(cleanWhatsapp);

    // Normalize rol to match check constraint: hombre_solo, mujer_sola, pareja, otro
    const validRoles = ["hombre_solo", "mujer_sola", "pareja", "otro"];
    const normalizedRol = data.rol && validRoles.includes(data.rol) ? data.rol : "otro";

    const existing = await findLeadByContact(cleanEmail || undefined, cleanWhatsapp || undefined);

    if (existing) {
      // Safely determine if email or whatsapp can be updated without causing unique constraint violations
      let targetEmail = existing.email;
      if (cleanEmail && cleanEmail !== existing.email) {
        // Verify cleanEmail isn't claimed by ANOTHER lead record
        const conflictEmail = await client.query(
          "SELECT id FROM leads WHERE email = $1 AND id != $2 LIMIT 1",
          [cleanEmail, existing.id]
        );
        if (conflictEmail.rows.length === 0) {
          targetEmail = cleanEmail;
        }
      }

      let targetWhatsapp = existing.whatsapp;
      if (cleanWhatsapp && cleanWhatsapp !== existing.whatsapp) {
        // Verify phone isn't claimed by ANOTHER lead record
        const conflictPhone = await client.query(
          "SELECT id FROM leads WHERE whatsapp = ANY($1) AND id != $2 LIMIT 1",
          [phoneVariants, existing.id]
        );
        if (conflictPhone.rows.length === 0) {
          targetWhatsapp = cleanWhatsapp;
        }
      }

      const mergedMetadata = {
        ...(existing.metadata || {}),
        ...(data.metadata || {}),
      };

      const updated = await client.query(
        `UPDATE leads SET
          alias_nombre = COALESCE($1, alias_nombre),
          email = $2,
          whatsapp = $3,
          rol = CASE WHEN $4 != 'otro' THEN $4 ELSE rol END,
          ciudad = COALESCE($5, ciudad),
          corset_vip = CASE WHEN $6 = true THEN true ELSE corset_vip END,
          metadata = $7,
          updated_at = NOW()
        WHERE id = $8
        RETURNING *`,
        [
          data.alias_nombre || null,
          targetEmail,
          targetWhatsapp,
          normalizedRol,
          data.ciudad || null,
          data.corset_vip || false,
          JSON.stringify(mergedMetadata),
          existing.id,
        ]
      );
      return updated.rows[0];
    } else {
      try {
        const inserted = await client.query(
          `INSERT INTO leads (
            alias_nombre, email, whatsapp, rol, ciudad, origen, afiliado_id, corset_vip, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *`,
          [
            data.alias_nombre || null,
            cleanEmail,
            cleanWhatsapp,
            normalizedRol,
            data.ciudad || "Bogotá",
            data.origen || "web_comunidad",
            data.afiliado_id || null,
            data.corset_vip || false,
            JSON.stringify(data.metadata || {}),
          ]
        );
        return inserted.rows[0];
      } catch (insertErr: any) {
        // Fallback guard: In case of race condition unique violation (code 23505), fetch and return the conflicting record
        if (insertErr.code === "23505") {
          const fallback = await client.query(
            `SELECT * FROM leads WHERE (email = $1 OR whatsapp = ANY($2)) ORDER BY created_at DESC LIMIT 1`,
            [cleanEmail, phoneVariants]
          );
          if (fallback.rows.length > 0) {
            return fallback.rows[0];
          }
        }
        throw insertErr;
      }
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
