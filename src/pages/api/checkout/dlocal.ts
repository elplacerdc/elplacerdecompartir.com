import type { APIRoute } from "astro";
import { createPaymentLink } from "../../../services/dlocal";

export const POST: APIRoute = async ({ request, url }) => {
  const formData = await request.formData();
  
  const userId = formData.get("userId")?.toString() || "guest_" + Date.now();
  const userEmail = formData.get("userEmail")?.toString() || "guest@example.com";
  const userName = formData.get("userName")?.toString() || "VIP Guest";

  const orderId = `VIP_${userId}_${Date.now()}`;
  
  // Base URL for callbacks
  const baseUrl = `${url.protocol}//${url.host}`;
  const successUrl = `${baseUrl}/the-corset-society?payment=success`;
  const cancelUrl = `${baseUrl}/the-corset-society?payment=cancelled`;
  const notificationUrl = `${baseUrl}/api/webhooks/dlocal`;

  try {
    const redirectUrl = await createPaymentLink({
      amount: 99.00,
      currency: "USD",
      country: "CO", // Assuming Colombia based on project context, but can be updated or dynamic
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
    console.error("Checkout error:", error);
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
};
