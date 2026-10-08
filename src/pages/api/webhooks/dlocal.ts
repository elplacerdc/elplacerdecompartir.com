import type { APIRoute } from "astro";
import { verifySignature } from "../../../services/dlocal";
import { db } from "../../../db";
import { user } from "../../../db/schema";
import { eq } from "drizzle-orm";

export const POST: APIRoute = async ({ request }) => {
  const signatureHeader = request.headers.get("Authorization") || request.headers.get("Signature") || "";
  const xLoginHeader = request.headers.get("X-Login") || "";
  const xDateHeader = request.headers.get("X-Date") || "";
  
  const requestBody = await request.text();

  if (!verifySignature(xLoginHeader, xDateHeader, requestBody, signatureHeader)) {
    return new Response("Invalid signature", { status: 401 });
  }

  try {
    const data = JSON.parse(requestBody);

    if (data.status === "PAID") {
      const orderId = data.order_id;
      if (orderId && orderId.startsWith("VIP_")) {
        const parts = orderId.split("_");
        const userId = parts[1];
        
        if (userId) {
          const oneYearFromNow = new Date();
          oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

          await db.update(user)
            .set({ vipUntil: oneYearFromNow })
            .where(eq(user.id, userId));
        }
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
};
