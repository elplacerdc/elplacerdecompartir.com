import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const host = context.request.headers.get("host") || url.host;

  // Intercept corset.elplacerdecompartir.com or corset.* subdomain -> REDIRECT to primary domain
  if (host.startsWith("corset.")) {
    const targetPath = url.pathname === "/" || url.pathname === "" 
      ? "/the-corset-society" 
      : (url.pathname.startsWith("/the-corset-society") ? url.pathname : `/the-corset-society${url.pathname}`);
    return context.redirect(`https://elplacerdecompartir.com${targetPath}${url.search}`);
  }

  // Motor de Afiliados (Global para todo el ecosistema): /r/:alias
  if (url.pathname.startsWith("/r/")) {
    const segments = url.pathname.split("/").filter(Boolean);
    const alias = segments[1];
    if (alias) {
      context.cookies.set("affiliate_ref", alias, {
        path: "/",
        maxAge: 30 * 24 * 60 * 60, // 30 días
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      });
      const toParam = url.searchParams.get("to");
      if (toParam === "luna-llena") {
        return context.redirect("/the-corset-society/luna-llena");
      } else if (toParam === "corset") {
        return context.redirect("/the-corset-society");
      }
      return context.redirect("/centro-cultural");
    }
  }

  return next();
});
