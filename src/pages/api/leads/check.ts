import type { APIRoute } from "astro";
import { findLeadByContact } from "../../../db";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { email, whatsapp } = body;

    if (!email && !whatsapp) {
      return new Response(JSON.stringify({ error: "Email o WhatsApp requerido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const lead = await findLeadByContact(email, whatsapp);

    if (lead) {
      return new Response(
        JSON.stringify({
          exists: true,
          lead: {
            id: lead.id,
            alias_nombre: lead.alias_nombre,
            email: lead.email,
            whatsapp: lead.whatsapp,
            rol: lead.rol,
            ciudad: lead.ciudad,
            corset_vip: lead.corset_vip,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ exists: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
