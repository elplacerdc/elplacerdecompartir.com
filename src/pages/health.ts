import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      status: "ok",
      service: "webdev",
      brand: "El Placer de Compartir",
      environment: process.env.NODE_ENV || "development",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      connectivity: {
        evolution: !!process.env.EVOLUTION_URL,
        listmonk: !!process.env.LISTMONK_URL,
        database: !!process.env.DATABASE_URL,
        nats: !!process.env.NATS_URL,
        valkey: !!process.env.VALKEY_URL,
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }
  );
};
