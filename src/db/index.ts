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

export interface NormalizedPhone {
  canonical: string;   // E.164: +573104722959
  waNumber: string;    // pure digits for wa.me / Evolution: 573104722959
  display: string;     // user-friendly formatted: +57 310 472 2959
  variants: string[];  // array of representations for DB indexed lookups
  isColombia: boolean;
}

/**
 * Normalizes phone numbers with intelligent Colombian (+57) mobile deduction
 * and graceful preservation of explicit international country codes (+1, +34, etc.)
 */
export function normalizePhone(rawPhone?: string | null): NormalizedPhone | null {
  if (!rawPhone) return null;
  const trimmed = rawPhone.trim();
  if (!trimmed) return null;

  const rawDigits = trimmed.replace(/\D/g, "");
  if (!rawDigits) return null;

  const variants = new Set<string>();
  variants.add(trimmed);
  variants.add(rawDigits);

  let canonical = "";
  let waNumber = "";
  let display = "";
  let isColombia = false;

  // Case 1: Explicit Colombian 10-digit mobile starting with 3 (e.g., 3101234567)
  if (rawDigits.length === 10 && rawDigits.startsWith("3")) {
    isColombia = true;
    canonical = `+57${rawDigits}`;
    waNumber = `57${rawDigits}`;
    display = `+57 ${rawDigits.slice(0, 3)} ${rawDigits.slice(3, 6)} ${rawDigits.slice(6)}`;
    variants.add(canonical);
    variants.add(waNumber);
    variants.add(rawDigits);
    variants.add(`+57 ${rawDigits.slice(0, 3)} ${rawDigits.slice(3, 6)} ${rawDigits.slice(6)}`);
    variants.add(`${rawDigits.slice(0, 3)} ${rawDigits.slice(3, 6)} ${rawDigits.slice(6)}`);
  }
  // Case 2: 12-digit number starting with 573 (e.g., 573101234567)
  else if (rawDigits.length === 12 && rawDigits.startsWith("573")) {
    isColombia = true;
    const national = rawDigits.slice(2);
    canonical = `+${rawDigits}`;
    waNumber = rawDigits;
    display = `+57 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
    variants.add(canonical);
    variants.add(waNumber);
    variants.add(national);
    variants.add(`+57${national}`);
    variants.add(`+57 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`);
  }
  // Case 3: Starts with explicit '+' international prefix
  else if (trimmed.startsWith("+")) {
    canonical = `+${rawDigits}`;
    waNumber = rawDigits;
    display = trimmed;
    variants.add(canonical);
    variants.add(waNumber);
    if (rawDigits.startsWith("57") && rawDigits.length === 12) {
      isColombia = true;
      const nat = rawDigits.slice(2);
      variants.add(nat);
      variants.add(`+57${nat}`);
    }
  }
  // Case 4: International dialing prefix '00'
  else if (rawDigits.startsWith("00") && rawDigits.length > 4) {
    const without00 = rawDigits.slice(2);
    canonical = `+${without00}`;
    waNumber = without00;
    display = `+${without00}`;
    variants.add(canonical);
    variants.add(waNumber);
  }
  // Case 5: Default fallback (Deduce Colombia if length is 10)
  else if (rawDigits.length === 10) {
    isColombia = true;
    canonical = `+57${rawDigits}`;
    waNumber = `57${rawDigits}`;
    display = `+57 ${rawDigits}`;
    variants.add(canonical);
    variants.add(waNumber);
    variants.add(rawDigits);
  } else {
    canonical = `+${rawDigits}`;
    waNumber = rawDigits;
    display = trimmed;
    variants.add(canonical);
    variants.add(waNumber);
  }

  return {
    canonical,
    waNumber,
    display,
    variants: Array.from(variants),
    isColombia,
  };
}

export function getPhoneVariants(phone?: string | null): string[] {
  const norm = normalizePhone(phone);
  return norm ? norm.variants : [];
}

export async function findLeadByContact(email?: string, whatsapp?: string): Promise<Lead | null> {
  const client = await pool.connect();
  try {
    const cleanEmail = email && email.trim() ? email.trim().toLowerCase() : null;
    const phoneNorm = normalizePhone(whatsapp);
    const phoneVariants = phoneNorm ? phoneNorm.variants : [];

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

export interface UpsertLeadResult {
  status: "created" | "updated" | "new_channel" | "already_registered" | "conflict";
  lead?: Lead;
  isDuplicate: boolean;
  isChannelNew: boolean;
  channel: string;
  error?: string;
  message?: string;
}

export async function upsertLead(
  data: {
    alias_nombre?: string;
    email?: string;
    whatsapp?: string;
    rol?: "hombre_solo" | "mujer_sola" | "pareja" | "otro" | string;
    ciudad?: string;
    origen?: string;
    afiliado_id?: string;
    corset_vip?: boolean;
    metadata?: Record<string, any>;
  },
  targetChannel?: "elplacerdc" | "corset" | "centro_cultural" | string
): Promise<UpsertLeadResult> {
  const resolvedChannel = targetChannel || (data.corset_vip ? "corset" : "elplacerdc");

  const client = await pool.connect();
  try {
    const cleanEmail = data.email && data.email.trim() ? data.email.trim().toLowerCase() : null;
    const phoneNorm = normalizePhone(data.whatsapp);
    const canonicalPhone = phoneNorm ? phoneNorm.canonical : null;
    const phoneVariants = phoneNorm ? phoneNorm.variants : [];

    const validRoles = ["hombre_solo", "mujer_sola", "pareja", "otro"];
    const normalizedRol = data.rol && validRoles.includes(data.rol) ? data.rol : "otro";

    // 1. Cross-Data Verification: Query by Email and by Phone separately
    let leadByEmail: Lead | null = null;
    let leadByPhone: Lead | null = null;

    if (cleanEmail) {
      const emailRes = await client.query("SELECT * FROM leads WHERE email = $1 LIMIT 1", [cleanEmail]);
      leadByEmail = emailRes.rows[0] || null;
    }

    if (phoneVariants.length > 0) {
      const phoneRes = await client.query("SELECT * FROM leads WHERE whatsapp = ANY($1) LIMIT 1", [phoneVariants]);
      leadByPhone = phoneRes.rows[0] || null;
    }

    // 1.1 Cross-Data Collision Check: Email belongs to one person, WhatsApp to another
    if (leadByEmail && leadByPhone && leadByEmail.id !== leadByPhone.id) {
      return {
        status: "conflict",
        isDuplicate: false,
        isChannelNew: false,
        channel: resolvedChannel,
        error: "El correo electrónico y el número de WhatsApp suministrados pertenecen a dos registros diferentes en nuestra plataforma. Por favor verifica tus datos de contacto.",
      };
    }

    // 1.2 Cross-Data Mismatch Alert:
    // If Email exists and has a registered phone that does NOT match this phone
    if (leadByEmail && canonicalPhone && leadByEmail.whatsapp) {
      const existingPhoneVariants = getPhoneVariants(leadByEmail.whatsapp);
      const phoneMatches = phoneVariants.some((v) => existingPhoneVariants.includes(v));
      if (!phoneMatches) {
        return {
          status: "conflict",
          isDuplicate: false,
          isChannelNew: false,
          channel: resolvedChannel,
          error: "El correo suministrado ya se encuentra vinculado a otro número de WhatsApp en nuestro sistema. Por favor ingresa con tu número original o contacta a soporte.",
        };
      }
    }

    // If Phone exists and has a registered email that does NOT match this email
    if (leadByPhone && cleanEmail && leadByPhone.email) {
      if (leadByPhone.email.toLowerCase() !== cleanEmail) {
        return {
          status: "conflict",
          isDuplicate: false,
          isChannelNew: false,
          channel: resolvedChannel,
          error: "El número de WhatsApp suministrado ya se encuentra registrado con otro correo electrónico en nuestra plataforma. Por favor ingresa con tu correo original.",
        };
      }
    }

    const existingLead: Lead | null = leadByEmail || leadByPhone;

    // 2. Existing Lead Path
    if (existingLead) {
      const existingMeta = existingLead.metadata || {};
      const existingChannels: string[] = Array.isArray(existingMeta.registered_channels)
        ? [...existingMeta.registered_channels]
        : [];

      // Infer legacy channels if not explicitly populated
      if (existingLead.corset_vip && !existingChannels.includes("corset")) {
        existingChannels.push("corset");
      }
      if (existingLead.origen === "web_comunidad" && !existingChannels.includes("elplacerdc")) {
        existingChannels.push("elplacerdc");
      }
      if (existingLead.origen === "alianza_centro_cultural" && !existingChannels.includes("centro_cultural")) {
        existingChannels.push("centro_cultural");
      }

      // Check if user is ALREADY registered in this specific channel
      if (existingChannels.includes(resolvedChannel)) {
        return {
          status: "already_registered",
          lead: existingLead,
          isDuplicate: true,
          isChannelNew: false,
          channel: resolvedChannel,
          message:
            resolvedChannel === "corset"
              ? "Tu solicitud de admisión a The Corset Society ya se encuentra registrada y en proceso de evaluación confidencial."
              : resolvedChannel === "centro_cultural"
              ? "Ya hemos recibido tu propuesta de alianza para el Centro Cultural. Nuestro equipo de dirección y producción se comunicará contigo."
              : "Ya haces parte activa de nuestra comunidad. Tu registro previo se encuentra confirmado.",
        };
      }

      // User exists in another channel, now registering in a NEW channel!
      existingChannels.push(resolvedChannel);

      const mergedMeta = {
        ...existingMeta,
        ...(data.metadata || {}),
        registered_channels: existingChannels,
      };

      const updatedLeadRes = await client.query(
        `UPDATE leads SET
          alias_nombre = COALESCE($1, alias_nombre),
          email = COALESCE($2, email),
          whatsapp = COALESCE($3, whatsapp),
          rol = CASE WHEN $4 != 'otro' THEN $4 ELSE rol END,
          ciudad = COALESCE($5, ciudad),
          corset_vip = CASE WHEN $6 = true THEN true ELSE corset_vip END,
          metadata = $7,
          updated_at = NOW()
        WHERE id = $8
        RETURNING *`,
        [
          data.alias_nombre || null,
          cleanEmail || existingLead.email,
          canonicalPhone || existingLead.whatsapp,
          normalizedRol,
          data.ciudad || null,
          resolvedChannel === "corset" ? true : existingLead.corset_vip,
          JSON.stringify(mergedMeta),
          existingLead.id,
        ]
      );

      return {
        status: "new_channel",
        lead: updatedLeadRes.rows[0],
        isDuplicate: false,
        isChannelNew: true,
        channel: resolvedChannel,
        message: "¡Canal habilitado exitosamente en tu perfil!",
      };
    }

    // 3. New Lead Insertion Path
    const initialMeta = {
      ...(data.metadata || {}),
      registered_channels: [resolvedChannel],
    };

    try {
      const inserted = await client.query(
        `INSERT INTO leads (
          alias_nombre, email, whatsapp, rol, ciudad, origen, afiliado_id, corset_vip, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          data.alias_nombre || null,
          cleanEmail,
          canonicalPhone,
          normalizedRol,
          data.ciudad || "Bogotá",
          data.origen || (resolvedChannel === "corset" ? "web_corset" : resolvedChannel === "centro_cultural" ? "alianza_centro_cultural" : "web_comunidad"),
          data.afiliado_id || null,
          resolvedChannel === "corset" ? true : Boolean(data.corset_vip),
          JSON.stringify(initialMeta),
        ]
      );

      return {
        status: "created",
        lead: inserted.rows[0],
        isDuplicate: false,
        isChannelNew: true,
        channel: resolvedChannel,
        message: "¡Registro creado exitosamente!",
      };
    } catch (insertErr: any) {
      // Race condition safety fallback
      if (insertErr.code === "23505") {
        const fallback = await client.query(
          `SELECT * FROM leads WHERE (email = $1 OR whatsapp = ANY($2)) ORDER BY created_at DESC LIMIT 1`,
          [cleanEmail, phoneVariants]
        );
        if (fallback.rows.length > 0) {
          return {
            status: "already_registered",
            lead: fallback.rows[0],
            isDuplicate: true,
            isChannelNew: false,
            channel: resolvedChannel,
            message: "Tu registro ya se encontraba procesado en el sistema.",
          };
        }
      }
      throw insertErr;
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
