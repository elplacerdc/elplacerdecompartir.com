import type { APIRoute } from "astro";
import { sendOTP } from "../../../services/evolution";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { whatsapp } = body;

    if (!whatsapp) {
      return new Response(JSON.stringify({ success: false, error: "WhatsApp number is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await sendOTP(whatsapp);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[API OTP Send Err]:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
