import type { APIRoute } from "astro";
import { trackAffiliateClick } from "../../../db";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return new Response(JSON.stringify({ success: false, error: "Código requerido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await trackAffiliateClick(code);

    // Set cookie for 30 days
    cookies.set("affiliate_ref", code.toLowerCase(), {
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: false,
      sameSite: "lax",
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[API Affiliate Track Err]:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
