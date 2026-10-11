import { syncLeadToListmonk, syncSubscriberToListmonk, LISTMONK_LISTS } from "./listmonk";

export type DomainEventType = 
  | "lead.registered"
  | "lead.email_verified"
  | "vip.activated"
  | "ticket.reserved"
  | "ticket.attended"
  | "ambassador.ticket_won";

export interface DomainEventPayload {
  leadId?: string;
  email?: string | null;
  whatsapp?: string | null;
  name?: string | null;
  rol?: string | null;
  ciudad?: string | null;
  channel?: string | null;
  metadata?: Record<string, any>;
}

/**
 * Universal Automation Engine event dispatcher for ElPlacerDC.
 * Decouples background jobs (Listmonk hypersegmentation, tagging, notifications)
 * from the synchronous Astro HTTP response loop.
 */
export async function dispatchDomainEvent(
  event: DomainEventType,
  payload: DomainEventPayload
): Promise<void> {
  // Execute decoupled via setImmediate to never block HTTP execution
  setImmediate(async () => {
    try {
      if (!payload.email) return;

      switch (event) {
        case "lead.registered":
        case "lead.email_verified": {
          await syncLeadToListmonk(
            {
              email: payload.email,
              alias_nombre: payload.name,
              whatsapp: payload.whatsapp,
              rol: payload.rol,
              ciudad: payload.ciudad,
              corset_vip: payload.channel === "corset",
              metadata: payload.metadata,
            },
            payload.channel || "web"
          );
          break;
        }

        case "vip.activated": {
          await syncSubscriberToListmonk({
            email: payload.email,
            name: payload.name || undefined,
            whatsapp: payload.whatsapp || undefined,
            listIds: [LISTMONK_LISTS.GENERAL, LISTMONK_LISTS.CORSET, LISTMONK_LISTS.VIP],
            tags: ["vip_activo", "credencial_activa"],
            attribs: { vip_active: true, vip_updated_at: new Date().toISOString() },
          });
          break;
        }

        case "ticket.reserved": {
          await syncSubscriberToListmonk({
            email: payload.email,
            name: payload.name || undefined,
            whatsapp: payload.whatsapp || undefined,
            listIds: [LISTMONK_LISTS.GENERAL],
            tags: ["reserva_evento", payload.channel === "corset" ? "reserva_luna_llena" : "reserva_comunidad"],
          });
          break;
        }

        case "ambassador.ticket_won": {
          await syncSubscriberToListmonk({
            email: payload.email,
            name: payload.name || undefined,
            whatsapp: payload.whatsapp || undefined,
            listIds: [LISTMONK_LISTS.GENERAL],
            tags: ["embajador_ganador_pases", "embajador_activo"],
          });
          break;
        }

        default:
          break;
      }
    } catch (err: any) {
      console.error(`[Automation Engine Err (${event})]:`, err.message);
    }
  });
}
