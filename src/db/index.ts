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
  whatsapp_verified?: boolean;
  email_verified?: boolean;
  primer_pago_acreditado?: boolean;
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
    whatsapp_verified?: boolean;
    email_verified?: boolean;
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

    // 1. Cross-Data Verification: Query by Phone variants first, then by Email
    let leadByPhone: Lead | null = null;
    let leadByEmail: Lead | null = null;

    if (phoneVariants.length > 0) {
      const phoneRes = await client.query("SELECT * FROM leads WHERE whatsapp = ANY($1) LIMIT 1", [phoneVariants]);
      leadByPhone = phoneRes.rows[0] || null;
    }

    if (cleanEmail) {
      const emailRes = await client.query("SELECT * FROM leads WHERE email = $1 LIMIT 1", [cleanEmail]);
      leadByEmail = emailRes.rows[0] || null;
    }

    // Strict Cross-Data Prevention: Phone and Email cannot belong to different registered leads
    if (leadByPhone && leadByEmail && leadByPhone.id !== leadByEmail.id) {
      return {
        status: "conflict",
        isDuplicate: false,
        isChannelNew: false,
        channel: resolvedChannel,
        error: "El número de WhatsApp y el correo electrónico pertenecen a registros distintos. No se permiten cruces entre usuarios registrados.",
      };
    }

    // Resolve unified lead (phone priority as primary contact key)
    const existingLead: Lead | null = leadByPhone || leadByEmail;

    // 2. Existing Lead Path (Seamless Tagging & Journey Consolidation)
    if (existingLead) {
      const existingMeta = existingLead.metadata || {};
      const existingChannels: string[] = Array.isArray(existingMeta.registered_channels)
        ? [...existingMeta.registered_channels]
        : [];

      if (existingLead.corset_vip && !existingChannels.includes("corset")) {
        existingChannels.push("corset");
      }
      if (existingLead.origen === "web_comunidad" && !existingChannels.includes("elplacerdc")) {
        existingChannels.push("elplacerdc");
      }
      if (existingLead.origen === "alianza_centro_cultural" && !existingChannels.includes("centro_cultural")) {
        existingChannels.push("centro_cultural");
      }

      const isChannelNew = !existingChannels.includes(resolvedChannel);
      if (isChannelNew) {
        existingChannels.push(resolvedChannel);
      }

      // Consolidate tags as an additive monotonic set with canonical names
      const existingTags: string[] = Array.isArray(existingMeta.tags) ? existingMeta.tags : [];
      const newTagsToAdd: string[] = [];
      if (resolvedChannel === "elplacerdc" || data.origen === "web_comunidad" || (!existingTags.includes("general") && !existingTags.includes("corset") && !existingTags.includes("alianzas"))) {
        newTagsToAdd.push("general");
      }
      if (resolvedChannel === "corset" || (data.corset_vip && data.origen === "web_corset")) {
        newTagsToAdd.push("corset");
        newTagsToAdd.push("corset_vip");
        if (!existingTags.includes("vip_activo")) {
          newTagsToAdd.push("posible vip");
        }
      }
      if (targetChannel === "centro_cultural" || data.origen === "alianza_centro_cultural") {
        newTagsToAdd.push("alianzas");
      }
      if (existingLead.vip_until && new Date(existingLead.vip_until) > new Date()) {
        newTagsToAdd.push("vip_activo");
      }
      const consolidatedTags = Array.from(new Set([...existingTags, ...newTagsToAdd]));

      // Consolidate journey log
      const journey = Array.isArray(existingMeta.journey) ? [...existingMeta.journey] : [];
      journey.push({
        channel: resolvedChannel,
        timestamp: new Date().toISOString(),
        origen: data.origen || null,
        tipo_alianza: data.metadata?.tipo_alianza || null,
      });

      const mergedMeta = {
        ...existingMeta,
        ...(data.metadata || {}),
        registered_channels: existingChannels,
        tags: consolidatedTags,
        journey,
      };

      const isWhatsappVerified = Boolean(data.whatsapp_verified || (existingLead as any).whatsapp_verified);
      const isEmailVerified = Boolean(data.email_verified || (existingLead as any).email_verified);

      const updatedLeadRes = await client.query(
        `UPDATE leads SET
          alias_nombre = COALESCE(alias_nombre, $1),
          email = CASE WHEN $2::text IS NOT NULL AND $2::text != '' THEN $2::text ELSE email END,
          whatsapp = COALESCE(whatsapp, $3),
          rol = CASE WHEN rol IS NOT NULL AND rol != 'otro' THEN rol WHEN $4 != 'otro' THEN $4 ELSE rol END,
          ciudad = COALESCE(ciudad, $5),
          corset_vip = CASE WHEN ($6 = true OR corset_vip = true) THEN true ELSE false END,
          afiliado_id = COALESCE(afiliado_id, $7),
          metadata = $8,
          whatsapp_verified = CASE WHEN $10 = true THEN true ELSE whatsapp_verified END,
          email_verified = CASE WHEN $11 = true THEN true ELSE email_verified END,
          updated_at = NOW()
        WHERE id = $9
        RETURNING *`,
        [
          data.alias_nombre || null,
          cleanEmail,
          canonicalPhone || existingLead.whatsapp,
          normalizedRol,
          data.ciudad || null,
          Boolean(resolvedChannel === "corset" || (data.corset_vip && data.origen === "web_corset") || (existingLead.corset_vip && (existingChannels.includes("corset") || existingLead.origen === "web_corset"))),
          data.afiliado_id || null,
          JSON.stringify(mergedMeta),
          existingLead.id,
          isWhatsappVerified,
          isEmailVerified,
        ]
      );

      const updatedLead = updatedLeadRes.rows[0];

      // Sincronizar email en afiliados si el embajador ya existía
      if (cleanEmail && phoneVariants.length > 0) {
        try {
          await client.query(
            `UPDATE afiliados SET email = $1 WHERE (whatsapp IS NOT NULL AND whatsapp = ANY($2::text[])) OR email = $1`,
            [cleanEmail, phoneVariants]
          );
        } catch (_) {}
      }

      return {
        status: isChannelNew ? "new_channel" : "updated",
        lead: updatedLead,
        isDuplicate: !isChannelNew,
        isChannelNew,
        channel: resolvedChannel,
        message: isChannelNew 
          ? "¡Canal habilitado exitosamente en tu perfil!" 
          : "¡Datos y participación actualizados exitosamente!",
      };
    }

    // 3. New Lead Insertion Path (Ensure canonical tags array is initialized monotonically)
    const initialTags: string[] = [];
    if (resolvedChannel === "corset" || Boolean(data.corset_vip)) {
      initialTags.push("corset");
      initialTags.push("corset_vip");
      initialTags.push("posible vip");
    } else if (resolvedChannel === "centro_cultural" || data.origen === "alianza_centro_cultural") {
      initialTags.push("alianzas");
    } else {
      initialTags.push("general");
    }

    const initialMeta = {
      ...(data.metadata || {}),
      registered_channels: [resolvedChannel],
      tags: Array.from(new Set(initialTags)),
      journey: [{
        channel: resolvedChannel,
        timestamp: new Date().toISOString(),
        origen: data.origen || null,
        tipo_alianza: data.metadata?.tipo_alianza || null,
      }],
    };

    try {
      const isWhatsappVerified = Boolean(data.whatsapp_verified);
      const isEmailVerified = Boolean(data.email_verified);

      const inserted = await client.query(
        `INSERT INTO leads (
          alias_nombre, email, whatsapp, rol, ciudad, origen, afiliado_id, corset_vip, metadata, whatsapp_verified, email_verified
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          data.alias_nombre || null,
          cleanEmail,
          canonicalPhone,
          normalizedRol,
          data.ciudad || "Bogotá",
          data.origen || (resolvedChannel === "corset" ? "web_corset" : resolvedChannel === "centro_cultural" ? "alianza_centro_cultural" : "web_comunidad"),
          data.afiliado_id || null,
          Boolean(resolvedChannel === "corset" || data.corset_vip),
          JSON.stringify(initialMeta),
          isWhatsappVerified,
          isEmailVerified,
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

export function maskEmail(email: string | null): string {
  if (!email) return "u****@privado.com";
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2) return "u****@privado.com";
  const user = parts[0];
  const domain = parts[1];
  if (user.length <= 2) {
    return `${user[0]}****@${domain}`;
  }
  return `${user[0]}****${user[user.length - 1]}@${domain}`;
}

export async function recordAffiliatePayment(affiliateAlias: string, leadId?: string): Promise<{ success: boolean; credited: boolean }> {
  const client = await pool.connect();
  try {
    const cleanAlias = affiliateAlias.trim().toLowerCase();

    // 1. Antifraude / Regla de acreditación única: sólo la primera compra real del lead suma al embajador
    if (leadId) {
      const leadCheck = await client.query("SELECT primer_pago_acreditado FROM leads WHERE id::text = $1", [leadId]);
      if (leadCheck.rows[0]?.primer_pago_acreditado) {
        // Ya fue acreditado por una compra previa. Ignorar compras subsecuentes de forma silenciosa
        return { success: true, credited: false };
      }
      // Marcar primer pago acreditado de forma atómica
      await client.query("UPDATE leads SET primer_pago_acreditado = true, updated_at = NOW() WHERE id::text = $1", [leadId]);
    }

    // 2. Acreditar venta al embajador con tope de 3 entradas gratuitas
    const res = await client.query(
      `UPDATE afiliados 
       SET referidos_pagados = referidos_pagados + 1,
           entradas_ganadas = LEAST(3, FLOOR((referidos_pagados + 1) / 3))
       WHERE LOWER(alias) = $1
       RETURNING *`,
      [cleanAlias]
    );

    if (res.rowCount && res.rowCount > 0) {
      const updatedRow = res.rows[0];
      const purchases = updatedRow.referidos_pagados || 0;
      const tickets = updatedRow.entradas_ganadas || 0;

      // 3. Disparo de multi-mensajería al embajador (WhatsApp + Email)
      import("../services/notifications").then(({ notifyAmbassadorSaleAcredited, notifyAmbassadorFreeTicketWon }) => {
        notifyAmbassadorSaleAcredited(
          { alias: updatedRow.alias, nombre: updatedRow.nombre, whatsapp: updatedRow.whatsapp, email: updatedRow.email },
          purchases,
          tickets
        ).catch((e) => console.error("[Notify Sale Acredited Err]:", e));

        // Solo notifica bono de entrada gratis hasta 3 veces máximo
        if (purchases <= 9 && purchases % 3 === 0) {
          notifyAmbassadorFreeTicketWon(
            { alias: updatedRow.alias, nombre: updatedRow.nombre, whatsapp: updatedRow.whatsapp, email: updatedRow.email },
            tickets
          ).catch((e) => console.error("[Notify Free Ticket Won Err]:", e));
        }
      }).catch((e) => console.error("[Import Notifications Err]:", e));

      return { success: true, credited: true };
    }

    return { success: false, credited: false };
  } finally {
    client.release();
  }
}

export async function trackAffiliateClick(affiliateAlias: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE afiliados SET clicks = COALESCE(clicks, 0) + 1 WHERE LOWER(alias) = $1`,
      [affiliateAlias.trim().toLowerCase()]
    );
  } finally {
    client.release();
  }
}

export async function ensureAffiliateCode(aliasOrName: string, whatsapp?: string | null, email?: string | null): Promise<string> {
  const client = await pool.connect();
  try {
    const phoneNorm = normalizePhone(whatsapp);
    const cleanPhone = phoneNorm ? phoneNorm.canonical : null;
    const phoneVariants = phoneNorm ? phoneNorm.variants : [];
    const cleanEmail = email ? email.trim().toLowerCase() : null;

    // 1. Check if an affiliate already exists with this phone or email
    if (phoneVariants.length > 0 || cleanEmail) {
      const existing = await client.query(
        `SELECT alias FROM afiliados 
         WHERE (whatsapp = ANY($1) AND array_length($1::text[], 1) > 0) 
            OR (email = $2 AND $2 IS NOT NULL) 
         LIMIT 1`,
        [phoneVariants, cleanEmail]
      );
      if (existing.rows.length > 0) {
        return existing.rows[0].alias;
      }
    }

    // 2. Derive base code from aliasOrName
    const baseCode = (aliasOrName || "embajador")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "") || "embajador";

    let candidate = baseCode;
    let attempt = 1;

    while (attempt <= 10) {
      const check = await client.query(`SELECT 1 FROM afiliados WHERE LOWER(alias) = $1`, [candidate]);
      if (check.rows.length === 0) {
        // Available!
        await client.query(
          `INSERT INTO afiliados (alias, nombre, whatsapp, email) VALUES ($1, $2, $3, $4) ON CONFLICT (alias) DO NOTHING`,
          [candidate, aliasOrName || "Embajador", cleanPhone, cleanEmail]
        );
        return candidate;
      }
      candidate = `${baseCode}${Math.floor(100 + Math.random() * 900)}`;
      attempt++;
    }

    const fallbackCode = `embajador${Date.now().toString().slice(-5)}`;
    await client.query(
      `INSERT INTO afiliados (alias, nombre, whatsapp, email) VALUES ($1, $2, $3, $4) ON CONFLICT (alias) DO NOTHING`,
      [fallbackCode, aliasOrName || "Embajador", cleanPhone, cleanEmail]
    );
    return fallbackCode;
  } finally {
    client.release();
  }
}

export async function getAffiliateStats(identifier: string): Promise<{
  alias: string;
  nombre: string;
  whatsapp: string | null;
  email: string | null;
  rol?: string | null;
  ciudad?: string | null;
  alias_nombre?: string | null;
  referredBy?: string | null;
  clicks: number;
  leadsCount: number;
  purchasesCount: number;
  freeTicketsEarned: number;
  subsequentDiscounts: number;
  vipStatus: "no_vip" | "posible_vip" | "vip_activo";
  referredLeads: Array<{ email_masked: string; created_at: Date; compro_entrada: boolean; channel_tag: string }>;
} | null> {
  const client = await pool.connect();
  try {
    const clean = identifier.trim().toLowerCase();
    const phoneNorm = normalizePhone(identifier);
    const phoneVariants = phoneNorm ? phoneNorm.variants : [];

    let res = await client.query(
      `SELECT * FROM afiliados 
       WHERE LOWER(alias) = $1 OR email = $1 
          OR ($2::text[] IS NOT NULL AND array_length($2::text[], 1) > 0 AND whatsapp = ANY($2::text[]))
       LIMIT 1`,
      [clean, phoneVariants.length > 0 ? phoneVariants : null]
    );

    // If not found in afiliados directly, check if user exists in leads and auto-provision!
    if (res.rows.length === 0) {
      let leadRow = null;
      if (phoneVariants.length > 0) {
        const leadRes = await client.query(
          `SELECT * FROM leads WHERE whatsapp = ANY($1) LIMIT 1`,
          [phoneVariants]
        );
        leadRow = leadRes.rows[0];
      }
      if (!leadRow && clean) {
        const leadRes = await client.query(
          `SELECT * FROM leads WHERE email = $1 LIMIT 1`,
          [clean]
        );
        leadRow = leadRes.rows[0];
      }

      if (leadRow) {
        await ensureAffiliateCode(leadRow.alias_nombre || "Embajador", leadRow.whatsapp, leadRow.email);
        res = await client.query(
          `SELECT * FROM afiliados 
           WHERE email = $1 
              OR ($2::text[] IS NOT NULL AND array_length($2::text[], 1) > 0 AND whatsapp = ANY($2::text[]))
           LIMIT 1`,
          [clean, phoneVariants.length > 0 ? phoneVariants : null]
        );
      }
    }

    if (res.rows.length === 0) return null;
    const row = res.rows[0];

    // Count and list leads referring this alias (privacy-safe: only alias, rol, ciudad, date)
    const leadsRes = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM leads WHERE LOWER(afiliado_id) = $1`,
      [row.alias.toLowerCase()]
    );
    const leadsCount = leadsRes.rows[0]?.cnt || 0;

    const referredLeadsRes = await client.query(
      `SELECT email, created_at, primer_pago_acreditado, origen, metadata 
       FROM leads 
       WHERE LOWER(afiliado_id) = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [row.alias.toLowerCase()]
    );

    // Consultar el estado VIP del propio embajador
    let vipStatus: "no_vip" | "posible_vip" | "vip_activo" = "no_vip";
    const ambPhoneVariants = getPhoneVariants(row.whatsapp);
    const ambLeadRes = await client.query(
      `SELECT corset_vip, vip_until, metadata, primer_pago_acreditado, rol, ciudad, alias_nombre, email, afiliado_id FROM leads 
       WHERE (email IS NOT NULL AND email = $1) 
          OR ($2::text[] IS NOT NULL AND array_length($2::text[], 1) > 0 AND whatsapp = ANY($2::text[])) 
       LIMIT 1`,
      [row.email, ambPhoneVariants.length > 0 ? ambPhoneVariants : null]
    );
    const ambLead = ambLeadRes.rows[0] || null;
    if (ambLead) {
      const hasActiveVip = Boolean(
        (ambLead.vip_until && new Date(ambLead.vip_until) > new Date()) ||
        (ambLead.metadata?.vip_until && new Date(ambLead.metadata.vip_until) > new Date()) ||
        (ambLead.metadata?.tags && ambLead.metadata.tags.includes("vip_activo"))
      );
      if (hasActiveVip) {
        vipStatus = "vip_activo";
      } else if (Boolean(ambLead.corset_vip) || (ambLead.metadata?.tags && (ambLead.metadata.tags.includes("corset") || ambLead.metadata.tags.includes("posible vip")))) {
        vipStatus = "posible_vip";
      }
    }

    const purchases = row.referidos_pagados || 0;
    const freeTicketsEarned = Math.min(3, Math.floor(purchases / 3));
    const subsequentDiscounts = Math.max(0, purchases - 9);

    return {
      alias: row.alias,
      nombre: row.nombre || row.alias,
      whatsapp: row.whatsapp,
      email: ambLead?.email || row.email,
      rol: ambLead?.rol || null,
      ciudad: ambLead?.ciudad || null,
      alias_nombre: ambLead?.alias_nombre || row.nombre || row.alias,
      referredBy: ambLead?.afiliado_id || null,
      clicks: row.clicks || 0,
      leadsCount,
      purchasesCount: purchases,
      freeTicketsEarned,
      subsequentDiscounts,
      vipStatus,
      referredLeads: referredLeadsRes.rows.map((r) => {
        const tags = Array.isArray(r.metadata?.tags) ? r.metadata.tags : [];
        const isCorset = tags.includes("corset") || r.origen === "web_corset";
        return {
          email_masked: maskEmail(r.email),
          created_at: r.created_at,
          compro_entrada: Boolean(r.primer_pago_acreditado),
          channel_tag: isCorset ? "corset" : "general", // Excluye 'alianzas' para el embajador
        };
      }),
    };
  } finally {
    client.release();
  }
}

export async function updateAffiliateCode(oldAlias: string, newAlias: string): Promise<{ success: boolean; error?: string }> {
  const client = await pool.connect();
  try {
    const cleanOld = oldAlias.trim().toLowerCase();
    const cleanNew = newAlias.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");

    if (!cleanNew || cleanNew.length < 3) {
      return { success: false, error: "El código debe tener al menos 3 caracteres alfanuméricos" };
    }

    if (cleanOld === cleanNew) return { success: true };

    const check = await client.query(`SELECT 1 FROM afiliados WHERE LOWER(alias) = $1`, [cleanNew]);
    if (check.rows.length > 0) {
      return { success: false, error: "Este código de embajador ya se encuentra en uso por otra persona" };
    }

    await client.query(`UPDATE afiliados SET alias = $1 WHERE LOWER(alias) = $2`, [cleanNew, cleanOld]);
    // Also update referenced leads and event tickets
    await client.query(`UPDATE leads SET afiliado_id = $1 WHERE LOWER(afiliado_id) = $2`, [cleanNew, cleanOld]);
    await client.query(`UPDATE event_tickets SET afiliado_ref = $1 WHERE LOWER(afiliado_ref) = $2`, [cleanNew, cleanOld]);

    return { success: true };
  } finally {
    client.release();
  }
}

// --- DRIZZLE ORM ---
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export const db = drizzle(pool, { schema });

