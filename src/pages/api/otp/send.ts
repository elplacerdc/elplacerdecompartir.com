import type { APIRoute } from "astro";
import { sendChannelOTP } from "../../../services/evolution";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const destination = body.destination || body.whatsapp || body.email;
    const channel = body.channel || (body.email && !body.whatsapp ? "email" : "whatsapp");
    const emailFallback = body.email || (destination && destination.includes("@") ? destination : undefined);
    const phoneFallback = body.whatsapp || (!destination?.includes("@") ? destination : undefined);

    if (!destination && !emailFallback) {
      return new Response(JSON.stringify({ success: false, error: "Destino (WhatsApp o Correo) requerido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const targetDest = destination || emailFallback;
    const result = await sendChannelOTP(targetDest, channel, emailFallback, phoneFallback);

    if (result.success) {
      return new Response(JSON.stringify({ 
        success: true, 
        channel: result.channelUsed || channel,
        fallback: result.fallback || false,
        message: result.fallback 
          ? `Código enviado a tu correo (${emailFallback})` 
          : (result.channelUsed === "email" ? "Código enviado a tu correo" : "Código enviado a tu WhatsApp")
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      return new Response(JSON.stringify({ success: false, error: result.error || "Error al enviar código" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    console.error("[API OTP Send Err]:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
