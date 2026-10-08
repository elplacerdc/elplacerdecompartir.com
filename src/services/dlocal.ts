import crypto from 'crypto';

export interface PaymentRequest {
  amount: number;
  currency: string;
  country: string;
  payer: {
    name: string;
    email: string;
  };
  orderId: string;
  successUrl: string;
  cancelUrl: string;
  notificationUrl: string;
}

export async function createPaymentLink(req: PaymentRequest) {
  const xLogin = process.env.DLOCAL_X_LOGIN;
  const xTransKey = process.env.DLOCAL_X_TRANS_KEY;
  const secretKey = process.env.DLOCAL_SECRET_KEY;
  const apiUrl = process.env.DLOCAL_API_URL || "https://sandbox.dlocal.com";
  
  if (!xLogin || !xTransKey || !secretKey) {
    throw new Error("Missing dLocal configuration");
  }

  const xDate = new Date().toISOString();
  
  const payload = {
    amount: req.amount,
    currency: req.currency,
    country: req.country,
    payment_method_flow: "REDIRECT",
    payer: {
      name: req.payer.name,
      email: req.payer.email
    },
    order_id: req.orderId,
    success_url: req.successUrl,
    back_url: req.cancelUrl,
    notification_url: req.notificationUrl,
    description: "Annual VIP Membership"
  };

  const requestBody = JSON.stringify(payload);

  const stringToSign = `${xLogin}${xDate}${requestBody}`;
  const signature = crypto.createHmac('sha256', secretKey).update(stringToSign).digest('hex');

  const response = await fetch(`${apiUrl}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Date": xDate,
      "X-Login": xLogin,
      "X-Trans-Key": xTransKey,
      "X-Version": "2.1",
      "Authorization": `V2-HMAC-SHA256, Signature: ${signature}`
    },
    body: requestBody
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("dLocal payment link creation failed:", errorText);
    throw new Error(`Payment link creation failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.redirect_url;
}

export function verifySignature(
  xLoginHeader: string,
  xDateHeader: string,
  requestBody: string,
  signatureHeader: string
): boolean {
  const secretKey = process.env.DLOCAL_SECRET_KEY;
  if (!secretKey) return false;

  const stringToSign = `${xLoginHeader}${xDateHeader}${requestBody}`;
  const expectedSignature = crypto.createHmac('sha256', secretKey).update(stringToSign).digest('hex');

  const hashMatch = signatureHeader.match(/Signature:\s*([a-f0-9]+)/i);
  const receivedHash = hashMatch ? hashMatch[1] : signatureHeader;

  return expectedSignature === receivedHash;
}
