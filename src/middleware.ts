import { defineMiddleware } from "astro:middleware";
import { trackAffiliateClick } from "./db";

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const host = context.request.headers.get("host") || url.host;

  // 1. Intercept corset.elplacerdecompartir.com or corset.* subdomain -> REDIRECT to primary domain
  if (host.startsWith("corset.")) {
    const targetPath = url.pathname === "/" || url.pathname === "" 
      ? "/the-corset-society" 
      : (url.pathname.startsWith("/the-corset-society") ? url.pathname : `/the-corset-society${url.pathname}`);
    return context.redirect(`https://elplacerdecompartir.com${targetPath}${url.search}`);
  }

  // 2. Seguridad / Bloqueo de URL vieja /admin hacia el exterior
  if (url.pathname === "/admin" || url.pathname === "/admin/") {
    return new Response("Not Found", { status: 404 });
  }

  // 3. Motor de Afiliados: Captura en caliente de clics de enlaces (?ref=, ?r= o /r/:alias)
  const refParam = url.searchParams.get("ref") || url.searchParams.get("r");
  let detectedAlias: string | null = null;

  if (refParam) {
    detectedAlias = refParam.trim().toLowerCase();
  } else if (url.pathname.startsWith("/r/")) {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[1]) {
      detectedAlias = segments[1].trim().toLowerCase();
    }
  }

  if (detectedAlias) {
    context.cookies.set("affiliate_ref", detectedAlias, {
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 días
      httpOnly: false,
      secure: true,
      sameSite: "lax",
    });

    // Registrar clic en caliente si no fue registrado en esta sesión
    const clickSessionCookie = `clk_${detectedAlias}`;
    if (!context.cookies.get(clickSessionCookie)?.value) {
      context.cookies.set(clickSessionCookie, "1", {
        path: "/",
        maxAge: 3600, // 1 hora de debounce por visitante
        httpOnly: true,
        sameSite: "lax",
      });
      trackAffiliateClick(detectedAlias).catch((e) =>
        console.error("[Middleware Track Click Err]:", e)
      );
    }

    if (url.pathname.startsWith("/r/")) {
      const toParam = url.searchParams.get("to");
      if (toParam === "luna-llena") {
        return context.redirect("/the-corset-society/luna-llena");
      } else if (toParam === "corset") {
        return context.redirect("/the-corset-society");
      }
      return context.redirect("/centro-cultural");
    }
  }

  // 4. Inyección de Cabecera Anti-Robots / Crawlers estricta para /adminn
  const response = await next();

  if (url.pathname.startsWith("/adminn")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet, noimageindex");
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  }

  return response;
});
