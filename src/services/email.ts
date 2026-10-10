import nodemailer from "nodemailer";

export interface SendEmailOptions {
  to: string;
  name?: string;
  fromName?: string;
  fromEmail?: string;
  subject: string;
  html: string;
  replyTo?: string;
}

const DEFAULT_FROM_EMAIL = "web@elplacerdecompartir.com";
const DEFAULT_FROM_NAME = "El Placer de Compartir";

// Reusable Transporters
let sesTransporter: nodemailer.Transporter | null = null;
let spacemailTransporter: nodemailer.Transporter | null = null;

function getSESTransporter(): nodemailer.Transporter | null {
  const user = process.env.SES_SMTP_USER || process.env.SMTP_USER;
  const pass = process.env.SES_SMTP_PASSWORD || process.env.SMTP_PASSWORD;
  if (!user || !pass) return null;

  if (!sesTransporter) {
    sesTransporter = nodemailer.createTransport({
      host: "email-smtp.us-east-1.amazonaws.com",
      port: 587,
      secure: false, // STARTTLS
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 15000,
    });
  }
  return sesTransporter;
}

function getSpaceMailTransporter(): nodemailer.Transporter | null {
  const user = process.env.SPACEMAIL_USER;
  const pass = process.env.SPACEMAIL_PASSWORD;
  if (!user || !pass) return null;

  if (!spacemailTransporter) {
    spacemailTransporter = nodemailer.createTransport({
      host: "mail.spacemail.com",
      port: 587,
      secure: false, // STARTTLS
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 15000,
    });
  }
  return spacemailTransporter;
}

/**
 * Sends a transactional email using multi-tier enterprise transport:
 * 1. Primary: AWS SES SMTP (us-east-1)
 * 2. Secondary: SpaceMail SMTP (mail.spacemail.com)
 * 3. Tertiary: ZeptoMail REST API
 */
export async function sendTransactionalEmail({
  to,
  name,
  fromName,
  fromEmail,
  subject,
  html,
  replyTo,
}: SendEmailOptions): Promise<{ success: boolean; provider: string; messageId?: string; error?: string }> {
  const senderEmail = fromEmail || process.env.AWS_FROM_EMAIL || DEFAULT_FROM_EMAIL;
  const senderName = fromName || DEFAULT_FROM_NAME;
  const formattedFrom = `"${senderName.replace(/"/g, '')}" <${senderEmail}>`;
  const formattedTo = name ? `"${name.replace(/"/g, '')}" <${to}>` : to;

  const errors: string[] = [];

  // 1. Tier 1: AWS SES SMTP (Verified, high deliverability, SPF/DKIM aligned)
  const ses = getSESTransporter();
  if (ses) {
    try {
      const headers: Record<string, string> = {};
      if (process.env.AWS_SES_CONFIGURATION_SET) {
        headers["X-SES-CONFIGURATION-SET"] = process.env.AWS_SES_CONFIGURATION_SET;
      }

      const info = await ses.sendMail({
        from: formattedFrom,
        to: formattedTo,
        subject,
        html,
        replyTo: replyTo || senderEmail,
        headers,
      });

      console.info(`[Email Success] Dispatched via AWS SES to ${to} (MessageId: ${info.messageId})`);
      return { success: true, provider: "aws_ses", messageId: info.messageId };
    } catch (sesErr: any) {
      console.warn(`[Email Warn] AWS SES failed for ${to}:`, sesErr.message);
      errors.push(`SES: ${sesErr.message}`);
      // Invalidate cached transporter on fatal connection error
      if (sesErr.code === "ECONNECTION" || sesErr.code === "ETIMEDOUT") {
        sesTransporter = null;
      }
    }
  }

  // 2. Tier 2: SpaceMail SMTP (Reliable secondary corporate MX)
  const spacemail = getSpaceMailTransporter();
  if (spacemail) {
    try {
      const info = await spacemail.sendMail({
        from: formattedFrom,
        to: formattedTo,
        subject,
        html,
        replyTo: replyTo || senderEmail,
      });

      console.info(`[Email Success] Dispatched via SpaceMail to ${to} (MessageId: ${info.messageId})`);
      return { success: true, provider: "spacemail", messageId: info.messageId };
    } catch (spaceErr: any) {
      console.warn(`[Email Warn] SpaceMail failed for ${to}:`, spaceErr.message);
      errors.push(`SpaceMail: ${spaceErr.message}`);
      if (spaceErr.code === "ECONNECTION" || spaceErr.code === "ETIMEDOUT") {
        spacemailTransporter = null;
      }
    }
  }

  // 3. Tier 3: ZeptoMail REST API (Tertiary fallback)
  const zeptomailToken = process.env.ZEPTOMAIL_SEND_MAIL_TOKEN;
  if (zeptomailToken) {
    try {
      const authHeader = zeptomailToken.startsWith("Zoho-enczapikey ")
        ? zeptomailToken
        : `Zoho-enczapikey ${zeptomailToken}`;

      const response = await fetch("https://api.zeptomail.com/v1.1/email", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({
          from: { address: senderEmail, name: senderName },
          to: [{ email_address: { address: to, name: name || to } }],
          subject,
          htmlbody: html,
        }),
      });

      if (response.ok) {
        console.info(`[Email Success] Dispatched via ZeptoMail to ${to}`);
        return { success: true, provider: "zeptomail" };
      }
      const errText = await response.text();
      console.warn(`[Email Warn] ZeptoMail returned non-200 for ${to}:`, errText);
      errors.push(`ZeptoMail: ${errText}`);
    } catch (zeptoErr: any) {
      console.warn(`[Email Warn] ZeptoMail fetch failed for ${to}:`, zeptoErr.message);
      errors.push(`ZeptoMail: ${zeptoErr.message}`);
    }
  }

  // If all live transports fail, log critical error and report failure
  const fullErrorMsg = errors.join(" | ");
  console.error(`[Email ERROR] All live transports exhausted for ${to}. Errors: ${fullErrorMsg}`);
  return {
    success: false,
    provider: "failed",
    error: fullErrorMsg || "No active email transport configured",
  };
}
