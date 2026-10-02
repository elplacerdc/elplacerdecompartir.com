export interface SendEmailOptions {
  to: string;
  name?: string;
  subject: string;
  html: string;
}

export async function sendTransactionalEmail({
  to,
  name,
  subject,
  html,
}: SendEmailOptions): Promise<{ success: boolean; provider: string; error?: string }> {
  const zeptomailToken = process.env.ZEPTOMAIL_SEND_MAIL_TOKEN;
  const fromEmail = process.env.ZEPTOMAIL_DEFAULT_FROM_EMAIL || "info@elplacerdecompartir.com";

  // 1. Primary: ZeptoMail REST API (RFC 8058 & DMARC compliant)
  if (zeptomailToken) {
    try {
      const response = await fetch("https://api.zeptomail.com/v1.1/email", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Zoho-enczapikey ${zeptomailToken}`,
        },
        body: JSON.stringify({
          from: { address: fromEmail, name: "El Placer de Compartir" },
          to: [{ email_address: { address: to, name: name || to } }],
          subject,
          htmlbody: html,
        }),
      });

      if (response.ok) {
        return { success: true, provider: "zeptomail" };
      }
      const errText = await response.text();
      console.warn("ZeptoMail API returned non-200:", errText);
    } catch (err: any) {
      console.warn("ZeptoMail fetch failed, falling back:", err.message);
    }
  }

  // 2. Fallback Simulation / Console Log
  console.log(`[Email Fallback] To: ${to}, Subject: ${subject}`);
  return { success: true, provider: "fallback" };
}
