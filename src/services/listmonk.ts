import { pool } from "../db";

export const LISTMONK_LISTS = {
  GENERAL: 8,
  CORSET: 9,
  VIP: 10,
};

export interface ListmonkSyncOptions {
  email: string;
  name?: string;
  whatsapp?: string;
  listIds?: number[];
  tags?: string[];
  attribs?: Record<string, any>;
}

/**
 * Synchronizes subscriber to Listmonk with atomic transactional safety in PostgreSQL.
 * Inserts or updates subscriber attributes and sets membership across targeted lists.
 */
export async function syncSubscriberToListmonk(options: ListmonkSyncOptions): Promise<{ success: boolean; subscriberId?: number; error?: string }> {
  const cleanEmail = (options.email || "").trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { success: false, error: "Correo electrónico inválido para Listmonk" };
  }

  const client = await pool.connect();
  try {
    const name = (options.name || cleanEmail).trim();
    const cleanWhatsapp = (options.whatsapp || "").trim();
    const tags = Array.from(new Set(options.tags || []));
    const listIds = Array.from(new Set(options.listIds && options.listIds.length > 0 ? options.listIds : [LISTMONK_LISTS.GENERAL]));

    const mergedAttribs = {
      ...(options.attribs || {}),
      whatsapp: cleanWhatsapp || undefined,
      tags,
      updated_at: new Date().toISOString(),
    };

    // 1. Upsert into listmonk.subscribers
    const subRes = await client.query(
      `INSERT INTO listmonk.subscribers (uuid, email, name, attribs, status)
       VALUES (gen_random_uuid(), $1, $2, $3::jsonb, 'enabled')
       ON CONFLICT (lower(email)) DO UPDATE SET
         name = CASE WHEN $2 != '' AND $2 != $1 THEN $2 ELSE listmonk.subscribers.name END,
         attribs = listmonk.subscribers.attribs || $3::jsonb,
         updated_at = NOW()
       RETURNING id`,
      [cleanEmail, name, JSON.stringify(mergedAttribs)]
    );

    const subscriberId = subRes.rows[0]?.id;

    // 2. Associate with target lists
    if (subscriberId) {
      for (const listId of listIds) {
        await client.query(
          `INSERT INTO listmonk.subscriber_lists (subscriber_id, list_id, status)
           VALUES ($1, $2, 'confirmed')
           ON CONFLICT (subscriber_id, list_id) DO UPDATE SET
             status = 'confirmed',
             updated_at = NOW()`,
          [subscriberId, listId]
        );
      }
    }

    return { success: true, subscriberId };
  } catch (err: any) {
    console.error("[Listmonk Direct Sync Err]:", err.message);
    return { success: false, error: err.message };
  } finally {
    client.release();
  }
}

/**
 * High-level helper to synchronize a Lead to Listmonk based on channel and role
 */
export async function syncLeadToListmonk(lead: {
  email?: string | null;
  alias_nombre?: string | null;
  whatsapp?: string | null;
  rol?: string | null;
  ciudad?: string | null;
  corset_vip?: boolean | null;
  is_active_vip?: boolean | null;
  metadata?: Record<string, any>;
}, channel?: string): Promise<{ success: boolean; error?: string }> {
  if (!lead.email) {
    return { success: false, error: "Lead sin correo electrónico omitido de Listmonk" };
  }

  const listIds: number[] = [LISTMONK_LISTS.GENERAL];
  const tags: string[] = ["lead"];

  if (lead.rol) tags.push(`rol_${lead.rol}`);
  if (lead.ciudad) tags.push(`ciudad_${lead.ciudad.toLowerCase().replace(/\s+/g, "_")}`);

  if (lead.corset_vip || channel === "corset") {
    listIds.push(LISTMONK_LISTS.CORSET);
    tags.push("posible_vip");
    tags.push("corset");
  }

  if (lead.is_active_vip || (lead.metadata && lead.metadata.vip_until && new Date(lead.metadata.vip_until) > new Date())) {
    listIds.push(LISTMONK_LISTS.VIP);
    tags.push("vip_activo");
  }

  return syncSubscriberToListmonk({
    email: lead.email,
    name: lead.alias_nombre || undefined,
    whatsapp: lead.whatsapp || undefined,
    listIds,
    tags,
    attribs: {
      rol: lead.rol,
      ciudad: lead.ciudad,
      origen: channel || "web",
    },
  });
}

/**
 * Legacy adapter for addSubscriber
 */
export const addSubscriber = async (
  email: string,
  name: string,
  listIds: number[] = [LISTMONK_LISTS.GENERAL]
) => {
  return syncSubscriberToListmonk({
    email,
    name,
    listIds,
  });
};
