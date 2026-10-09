import crypto from 'crypto';

export interface PaymentRequest {
  amount: number;
  currency?: string;
  country?: string;
  description?: string;
  orderId?: string;
  payer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  successUrl: string;
  cancelUrl: string;
  notificationUrl: string;
}

export function getDlocalConfig() {
  const apiKey = process.env.DLOCAL_GO_API_KEY;
  const secretKey = process.env.DLOCAL_GO_SECRET_KEY;
  const isSandbox = (process.env.DLOCAL_GO_ENV || "").toLowerCase() === "sandbox";
  const baseUrl = isSandbox ? "https://api-sbx.dlocalgo.com" : "https://api.dlocalgo.com";

  if (!apiKey || !secretKey) {
    throw new Error("Missing dLocal Go configuration (DLOCAL_GO_API_KEY / DLOCAL_GO_SECRET_KEY)");
  }

  return { apiKey, secretKey, baseUrl, isSandbox };
}

export async function createPaymentLink(req: PaymentRequest): Promise<string> {
  const { apiKey, secretKey, baseUrl } = getDlocalConfig();

  const payload: Record<string, any> = {
    amount: req.amount,
    currency: req.currency || "COP",
    country: req.country || "CO",
    order_id: req.orderId || `ORDER_${Date.now()}`,
    description: (req.description || "The Corset Society - Membresía VIP").slice(0, 95),
    success_url: req.successUrl,
    back_url: req.cancelUrl,
    notification_url: req.notificationUrl,
  };

  if (req.payer && (req.payer.name || req.payer.email)) {
    payload.payer = {
      name: req.payer.name,
      email: req.payer.email,
      phone: req.payer.phone,
    };
  }

  const response = await fetch(`${baseUrl}/v1/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Authorization": `Bearer ${apiKey}:${secretKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[dLocal Go Payment Error]:", response.status, errorText);
    throw new Error(`Error en pasarela de pago (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!data.redirect_url) {
    throw new Error(data.message || "No se recibió redirect_url de dLocal Go");
  }

  return data.redirect_url;
}

export async function retrievePayment(paymentId: string) {
  const { apiKey, secretKey, baseUrl } = getDlocalConfig();

  const response = await fetch(`${baseUrl}/v1/payments/${paymentId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}:${secretKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[dLocal Go Retrieve Payment Error]:", response.status, errorText);
    throw new Error(`Error al consultar pago (${response.status}): ${errorText}`);
  }

  return await response.json();
}

export function verifySignature(rawBody: string, authHeader: string): boolean {
  const apiKey = process.env.DLOCAL_GO_API_KEY;
  const secretKey = process.env.DLOCAL_GO_SECRET_KEY;
  if (!apiKey || !secretKey || !authHeader) return false;

  const match = authHeader.match(/Signature:\s*([a-f0-9]+)/i);
  const receivedSig = (match ? match[1] : authHeader.replace(/^Bearer\s+/i, "")).trim().toLowerCase();

  const expectedSig = crypto
    .createHmac("sha256", secretKey)
    .update(apiKey + rawBody)
    .digest("hex")
    .toLowerCase();

  try {
    return crypto.timingSafeEqual(Buffer.from(receivedSig, "hex"), Buffer.from(expectedSig, "hex"));
  } catch {
    return false;
  }
}
