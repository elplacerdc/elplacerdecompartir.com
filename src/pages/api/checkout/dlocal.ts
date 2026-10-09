import type { APIRoute } from "astro";
import { createPaymentLink } from "../../../services/dlocal";

export const POST: APIRoute = async ({ request, url }) => {
  let userId = "guest_" + Date.now();
  let userEmail = "contacto@elplacerdecompartir.com";
  let userName = "Invitado VIP";
  const isJson = (request.headers.get("content-type") || "").includes("application/json");

  if (isJson) {
    try {
      const json = await request.json();
      if (json.userId) userId = json.userId;
      if (json.userEmail) userEmail = json.userEmail;
      if (json.userName) userName = json.userName;
    } catch {}
  } else {
    try {
      const formData = await request.formData();
      const uId = formData.get("userId")?.toString();
      const uEmail = formData.get("userEmail")?.toString();
      const uName = formData.get("userName")?.toString();
      if (uId) userId = uId;
      if (uEmail) userEmail = uEmail;
      if (uName) userName = uName;
    } catch {}
  }

  const orderId = `CORSET_VIP_${userId}_${Date.now()}`;
  const baseUrl = `${url.protocol}//${url.host}`;
  const successUrl = `${baseUrl}/corset-vip?payment=success`;
  const cancelUrl = `${baseUrl}/corset-vip?payment=cancelled`;
  const notificationUrl = `${baseUrl}/api/webhooks/dlocal`;

  try {
    const redirectUrl = await createPaymentLink({
      amount: 199000.00,
      currency: "COP",
      country: "CO",
      description: "Membresía Anual The Corset Society",
      payer: {
        name: userName,
        email: userEmail
      },
      orderId,
      successUrl,
      cancelUrl,
      notificationUrl
    });

    if (isJson) {
      return new Response(JSON.stringify({ success: true, redirect_url: redirectUrl }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return Response.redirect(redirectUrl, 303);
  } catch (error: any) {
    console.error("VIP Checkout error:", error);
    if (isJson) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(`Error al procesar pago: ${error.message}`, { status: 500 });
  }
};
