import type { APIRoute } from "astro";
import { createPaymentLink } from "../../../services/dlocal";
import { resolveDiscount } from "../../../services/discountStrategy";

export const POST: APIRoute = async ({ request, url, cookies }) => {
  let userId = "guest_" + Date.now();
  let userEmail = "contacto@elplacerdecompartir.com";
  let userName = "Invitado VIP";
  let userPhone: string | null = null;
  const isJson = (request.headers.get("content-type") || "").includes("application/json");

  let bodyRef: string | null = null;
  if (isJson) {
    try {
      const json = await request.json();
      if (json.userId) userId = json.userId;
      if (json.userEmail) userEmail = json.userEmail;
      if (json.userName) userName = json.userName;
      if (json.userPhone) userPhone = json.userPhone;
      if (json.whatsapp) userPhone = json.whatsapp;
      if (json.ref) bodyRef = json.ref.toString();
    } catch {}
  } else {
    try {
      const formData = await request.formData();
      const uId = formData.get("userId")?.toString();
      const uEmail = formData.get("userEmail")?.toString();
      const uName = formData.get("userName")?.toString();
      const uPhone = formData.get("userPhone")?.toString() || formData.get("whatsapp")?.toString();
      const r = formData.get("ref")?.toString() || formData.get("affiliate_ref")?.toString();
      if (uId) userId = uId;
      if (uEmail) userEmail = uEmail;
      if (uName) userName = uName;
      if (uPhone) userPhone = uPhone;
      if (r) bodyRef = r;
    } catch {}
  }

  const affiliateRef = (bodyRef || cookies.get("affiliate_ref")?.value || "").toString().trim().toLowerCase() || null;
  const discountResult = await resolveDiscount({
    domain: "vip_membership",
    whatsapp: userPhone,
    email: userEmail,
    affiliateRef,
  });
  const discountRate = discountResult.discountRate;
  const finalAmount = discountRate >= 0.20 
    ? 159000.00 
    : (discountRate >= 0.10 ? 179000.00 : 199000.00);

  const orderId = `CORSET_VIP_${userId}_${Date.now()}`;
  const baseUrl = `${url.protocol}//${url.host}`;
  const successUrl = `${baseUrl}/corset-vip?payment=success`;
  const cancelUrl = `${baseUrl}/corset-vip?payment=cancelled`;
  const notificationUrl = `${baseUrl}/api/webhooks/dlocal`;

  const descDiscount = discountRate >= 0.20 
    ? " (Descuento VIP 20%)" 
    : (discountRate >= 0.10 ? " (Descuento Embajador 10%)" : "");

  try {
    const redirectUrl = await createPaymentLink({
      amount: finalAmount,
      currency: "COP",
      country: "CO",
      description: "Membresía Anual The Corset Society" + (affiliateRef ? descDiscount : ""),
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
