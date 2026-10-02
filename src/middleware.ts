import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const host = context.request.headers.get("host") || url.host;

  // Intercept corset.elplacerdecompartir.com or corset.* subdomain
  if (host.startsWith("corset.")) {
    if (url.pathname === "/" || url.pathname === "") {
      return context.rewrite("/the-corset-society");
    }
    if (!url.pathname.startsWith("/the-corset-society") && !url.pathname.startsWith("/api") && !url.pathname.startsWith("/media") && !url.pathname.startsWith("/assets")) {
      return context.rewrite(`/the-corset-society${url.pathname}`);
    }
  }

  // Motor de Afiliados (Centro Cultural): /r/:alias
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
      return context.redirect("/centro-cultural");
    }
  }

  return next();
});
