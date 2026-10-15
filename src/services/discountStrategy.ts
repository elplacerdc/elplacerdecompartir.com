import { pool, normalizePhone } from "../db";

export type DiscountDomain = "event_ticket" | "vip_membership";

export interface DiscountContext {
  domain: DiscountDomain;
  whatsapp?: string | null;
  email?: string | null;
  affiliateRef?: string | null;
  isVipActive?: boolean;
}

export interface DiscountResult {
  hasDiscount: boolean;
  discountRate: number; // e.g. 0.20, 0.10 or 0
  isVipAmbassador?: boolean;
  reason: string;
  strategy: string;
}

export interface DiscountStrategy {
  name: string;
  calculate(ctx: DiscountContext): Promise<DiscountResult>;
}

/**
 * ElPlacerDC Single-Use Strategy:
 * 20% ambassador discount for VIP ambassadors / 10% standard, single-use per independent domain:
 * - 1st event ticket purchase (event_tickets confirmed/paid)
 * - 1st VIP membership credential purchase (leads.primer_pago_acreditado / corset_vip)
 * Domains are completely decoupled: purchasing an event ticket does not consume the VIP discount, and vice-versa.
 * Active VIP members maintain their permanent 20% honor tariff on events.
 */
export class ElPlacerDcDiscountStrategy implements DiscountStrategy {
  name = "elplacerdc";

  async calculate(ctx: DiscountContext): Promise<DiscountResult> {
    const { domain, whatsapp, email, affiliateRef, isVipActive } = ctx;

    // Active VIP members always get the 20% honor tariff on event tickets
    if (domain === "event_ticket" && isVipActive) {
      return {
        hasDiscount: true,
        discountRate: 0.20,
        isVipAmbassador: true,
        reason: "active_vip_privilege",
        strategy: this.name,
      };
    }

    // Without ambassador reference, regular standard rate applies
    if (!affiliateRef || affiliateRef.trim() === "") {
      return {
        hasDiscount: false,
        discountRate: 0,
        reason: "standard_rate",
        strategy: this.name,
      };
    }

    const cleanEmail = email && email.trim() ? email.trim().toLowerCase() : null;
    const phoneNorm = normalizePhone(whatsapp);
    const phoneVariants = phoneNorm ? phoneNorm.variants : [];

    const client = await pool.connect();
    try {
      // Prevención de auto-referido: un embajador no puede ser su propio referente
      let effectiveAffiliateRef = affiliateRef;
      if (effectiveAffiliateRef && (cleanEmail || phoneVariants.length > 0)) {
        try {
          const selfCheck = await client.query(
            `SELECT alias FROM afiliados 
             WHERE LOWER(alias) = LOWER($1)
               AND ((email IS NOT NULL AND LOWER(email) = LOWER($2)) 
                    OR ($3::text[] IS NOT NULL AND whatsapp = ANY($3::text[])))
             LIMIT 1`,
            [effectiveAffiliateRef.trim(), cleanEmail || '', phoneVariants.length > 0 ? phoneVariants : null]
          );
          if (selfCheck.rows.length > 0) {
            // Si el comprador es el mismo embajador, verificar su referidor original en leads
            const leadRefCheck = await client.query(
              `SELECT afiliado_id FROM leads 
               WHERE (email IS NOT NULL AND LOWER(email) = LOWER($1))
                  OR ($2::text[] IS NOT NULL AND whatsapp = ANY($2::text[]))
               LIMIT 1`,
              [cleanEmail || '', phoneVariants.length > 0 ? phoneVariants : null]
            );
            const trueRef = leadRefCheck.rows[0]?.afiliado_id;
            if (trueRef && trueRef.toLowerCase() !== effectiveAffiliateRef.trim().toLowerCase()) {
              effectiveAffiliateRef = trueRef;
            } else {
              effectiveAffiliateRef = "segisw";
            }
          }
        } catch (_) {}
      }

      // Consultar si el embajador referente cuenta con credencial VIP activa
      let isReferringAmbassadorVip = false;
      if (effectiveAffiliateRef) {
        try {
          const ambRes = await client.query(
            `SELECT l.vip_until, l.metadata, l.corset_vip, l.primer_pago_acreditado 
             FROM afiliados a 
             LEFT JOIN leads l ON (LOWER(l.email) = LOWER(a.email) OR l.whatsapp = a.whatsapp OR LOWER(l.alias_nombre) = LOWER(a.alias))
             WHERE LOWER(a.alias) = LOWER($1)
             LIMIT 1`,
            [effectiveAffiliateRef.trim()]
          );
          if (ambRes.rows.length > 0) {
            const amb = ambRes.rows[0];
            isReferringAmbassadorVip = Boolean(
              (amb.vip_until && new Date(amb.vip_until) > new Date()) ||
              (amb.metadata?.vip_until && new Date(amb.metadata.vip_until) > new Date()) ||
              (Array.isArray(amb.metadata?.tags) && amb.metadata.tags.includes("vip_activo")) ||
              (Boolean(amb.corset_vip) && Boolean(amb.primer_pago_acreditado)) ||
              effectiveAffiliateRef.trim().toLowerCase() === "segisw"
            );
          } else if (effectiveAffiliateRef.trim().toLowerCase() === "segisw") {
            isReferringAmbassadorVip = true;
          }
        } catch (e) {
          console.warn("[DiscountStrategy Amb Check Err]:", e);
        }
      }

      const activeRate = isReferringAmbassadorVip ? 0.20 : 0.10;

      if (domain === "event_ticket") {
        // Check prior confirmed event ticket purchases
        if (cleanEmail || phoneVariants.length > 0) {
          const queryParams: any[] = [];
          const conditions: string[] = [];

          if (phoneVariants.length > 0) {
            queryParams.push(phoneVariants);
            conditions.push(`l.whatsapp = ANY($${queryParams.length})`);
          }

          if (cleanEmail) {
            queryParams.push(cleanEmail);
            conditions.push(`LOWER(l.email) = LOWER($${queryParams.length})`);
          }

          const ticketCheckQuery = `
            SELECT COUNT(*)::int as count
            FROM event_tickets et
            JOIN leads l ON et.lead_id = l.id
            WHERE (${conditions.join(" OR ")})
              AND et.estado IN ('confirmado', 'aprobado', 'pagado', 'asistido')
          `;

          const checkRes = await client.query(ticketCheckQuery, queryParams);
          const confirmedTicketsCount = Number(checkRes.rows[0]?.count || 0);

          if (confirmedTicketsCount > 0) {
            return {
              hasDiscount: false,
              discountRate: 0,
              isVipAmbassador: isReferringAmbassadorVip,
              reason: "ambassador_single_use_consumed_event_ticket",
              strategy: this.name,
            };
          }
        }

        // First event ticket: grant 20% (VIP ambassador) or 10% (standard ambassador)
        return {
          hasDiscount: true,
          discountRate: activeRate,
          isVipAmbassador: isReferringAmbassadorVip,
          reason: isReferringAmbassadorVip ? "vip_ambassador_first_event_ticket" : "ambassador_first_event_ticket",
          strategy: this.name,
        };
      }

      if (domain === "vip_membership") {
        // Check prior VIP purchases / accredited status
        if (cleanEmail || phoneVariants.length > 0) {
          const queryParams: any[] = [];
          const conditions: string[] = [];

          if (phoneVariants.length > 0) {
            queryParams.push(phoneVariants);
            conditions.push(`whatsapp = ANY($${queryParams.length})`);
          }

          if (cleanEmail) {
            queryParams.push(cleanEmail);
            conditions.push(`LOWER(email) = LOWER($${queryParams.length})`);
          }

          const vipCheckQuery = `
            SELECT primer_pago_acreditado, corset_vip, vip_until, metadata
            FROM leads
            WHERE (${conditions.join(" OR ")})
            ORDER BY created_at DESC
            LIMIT 1
          `;

          const checkRes = await client.query(vipCheckQuery, queryParams);
          if (checkRes.rows.length > 0) {
            const row = checkRes.rows[0];
            const hasPriorVipPurchase = Boolean(
              row.primer_pago_acreditado === true ||
              row.corset_vip === true ||
              (row.vip_until && new Date(row.vip_until).getTime() > 0) ||
              row.metadata?.vip_purchased === true
            );

            if (hasPriorVipPurchase) {
              return {
                hasDiscount: false,
                discountRate: 0,
                isVipAmbassador: isReferringAmbassadorVip,
                reason: "ambassador_single_use_consumed_vip_membership",
                strategy: this.name,
              };
            }
          }
        }

        // First VIP membership purchase: grant 20% (VIP ambassador) or 10% (standard ambassador)
        return {
          hasDiscount: true,
          discountRate: activeRate,
          isVipAmbassador: isReferringAmbassadorVip,
          reason: isReferringAmbassadorVip ? "vip_ambassador_first_vip_membership" : "ambassador_first_vip_membership",
          strategy: this.name,
        };
      }

      return {
        hasDiscount: false,
        discountRate: 0,
        reason: "unknown_domain",
        strategy: this.name,
      };
    } finally {
      client.release();
    }
  }
}

/**
 * Continuous Strategy (for future multi-brand deployments where discounts apply continuously)
 */
export class AllPurchasesDiscountStrategy implements DiscountStrategy {
  name = "all_purchases";

  async calculate(ctx: DiscountContext): Promise<DiscountResult> {
    if (ctx.affiliateRef || ctx.isVipActive) {
      return {
        hasDiscount: true,
        discountRate: 0.10,
        reason: "continuous_ambassador_discount",
        strategy: this.name,
      };
    }
    return {
      hasDiscount: false,
      discountRate: 0,
      reason: "standard_rate",
      strategy: this.name,
    };
  }
}

/**
 * Standard Rate Strategy (for standalone brands without affiliate programs)
 */
export class StandardRateStrategy implements DiscountStrategy {
  name = "standard_rate";

  async calculate(_ctx: DiscountContext): Promise<DiscountResult> {
    return {
      hasDiscount: false,
      discountRate: 0,
      reason: "standard_rate",
      strategy: this.name,
    };
  }
}

// Registry of available strategies
const strategies: Record<string, DiscountStrategy> = {
  elplacerdc: new ElPlacerDcDiscountStrategy(),
  all_purchases: new AllPurchasesDiscountStrategy(),
  standard_rate: new StandardRateStrategy(),
};

/**
 * Primary resolver for checkout discounts across all business domains
 */
export async function resolveDiscount(ctx: DiscountContext): Promise<DiscountResult> {
  const strategyKey = process.env.DISCOUNT_STRATEGY || "elplacerdc";
  const strategy = strategies[strategyKey] || strategies.elplacerdc;
  return strategy.calculate(ctx);
}
