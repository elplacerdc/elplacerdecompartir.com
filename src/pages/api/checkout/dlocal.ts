import type { APIRoute } from "astro";
import { createPaymentLink } from "../../../services/dlocal";

export const POST: APIRoute = async ({ request, url }) => {
  const formData = await request.formData();
  
  const userId = formData.get("userId")?.toString() || "guest_" + Date.now();
  const userEmail = formData.get("userEmail")?.toString() || "guest@example.com";
  const userName = formData.get("userName")?.toString() || "Invitado VIP";

  const orderId = `CORSET_VIP_${userId}_${Date.now()}`;
  
  // Base URL for callbacks
  const baseUrl = `${url.protocol}//${url.host}`;
  const successUrl = `${baseUrl}/corset-vip?payment=success`;
  const cancelUrl = `${baseUrl}/corset-vip?payment=cancelled`;
  const notificationUrl = `${baseUrl}/api/webhooks/dlocal`;

  try {
    const redirectUrl = await createPaymentLink({
      amount: 199000.00,
      currency: "COP",
      country: "CO",
      payer: {
        name: userName,
        email: userEmail
      },
      orderId,
      successUrl,
      cancelUrl,
      notificationUrl
    });

    return Response.redirect(redirectUrl, 303);
  } catch (error: any) {
    console.error("VIP Checkout error:", error);
    return new Response(`Error al procesar pago: ${error.message}`, { status: 500 });
  }
};
