import type { APIRoute } from "astro";

const WHATSAPP_WORKER_URL =
  process.env.WHATSAPP_WORKER_URL || "http://whatsappbot:3005/webhook";

/**
 * Webhook Endpoint -> Forwarded to decoupled `whatsappbot` worker
 * The worker processes operator takeover commands: #stop, #off, #silencio, #desactivar.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const rawBody = await request.text();
    if (!rawBody || rawBody.trim() === "") {
      return new Response(JSON.stringify({ status: "ignored_empty" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Forward immediately to dedicated whatsappbot worker (<10ms)
    fetch(WHATSAPP_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: rawBody,
    }).catch((err) => {
      console.warn("[Proxy:whatsappbot] Failed to proxy to worker:", err);
    });

    return new Response(
      JSON.stringify({
        status: "acknowledged",
        handler: "whatsappbot-worker",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
