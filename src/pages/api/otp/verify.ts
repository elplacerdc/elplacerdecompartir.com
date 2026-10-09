import type { APIRoute } from "astro";
import { verifyChannelOTP } from "../../../services/evolution";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const destination = body.destination || body.whatsapp || body.email;
    const code = body.code || body.otp;
    const channel = body.channel;

    if (!destination || !code) {
      return new Response(JSON.stringify({ success: false, error: "Destino y código son obligatorios" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const isValid = await verifyChannelOTP(destination, code, channel);

    if (isValid) {
      return new Response(JSON.stringify({ success: true, verified: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      return new Response(JSON.stringify({ success: false, error: "Código inválido o expirado" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    console.error("[API OTP Verify Err]:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
