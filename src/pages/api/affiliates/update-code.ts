import type { APIRoute } from "astro";
import { updateAffiliateCode } from "../../../db";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { oldCode, newCode } = body;

    if (!oldCode || !newCode) {
      return new Response(
        JSON.stringify({ success: false, error: "Código actual y nuevo son obligatorios" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const result = await updateAffiliateCode(oldCode, newCode);

    if (result.success) {
      // Update cookie if it was tracking old code
      if (cookies.get("affiliate_ref")?.value === oldCode.toLowerCase()) {
        cookies.set("affiliate_ref", newCode.toLowerCase(), {
          path: "/",
          maxAge: 30 * 24 * 60 * 60,
          httpOnly: false,
          sameSite: "lax",
        });
      }

      return new Response(JSON.stringify({ success: true, newCode: newCode.toLowerCase() }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    console.error("[API Affiliate Update Err]:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
