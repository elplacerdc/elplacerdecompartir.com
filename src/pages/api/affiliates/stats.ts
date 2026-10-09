import type { APIRoute } from "astro";
import { getAffiliateStats } from "../../../db";

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const identifier = url.searchParams.get("identifier") || url.searchParams.get("code") || url.searchParams.get("phone");

    if (!identifier) {
      return new Response(JSON.stringify({ success: false, error: "Identificador de embajador requerido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const stats = await getAffiliateStats(identifier);

    if (!stats) {
      return new Response(JSON.stringify({ success: false, error: "Embajador no encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, stats }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[API Affiliate Stats Err]:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
