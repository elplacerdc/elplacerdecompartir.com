import { test, expect } from "@playwright/test";
import { BasePage } from "./base-page";

test.describe("El Placer de Compartir & The Corset Society — E2E Suite", () => {
  test("Homepage: Header Badges, Hero, Dirección, Corset Section and LeadForm", async ({ page }) => {
    const base = new BasePage(page);
    await base.goto("/");

    // Title and H1
    await expect(page).toHaveTitle(/El Placer de Compartir/i);
    const h1 = page.locator("h1");
    await expect(h1).toContainText("El arte de compartir");

    // Header Navigation Links & Badges
    await expect(page.getByRole("link", { name: /Centro Cultural/i }).first()).toBeVisible();
    await expect(page.getByText("Nuevo").first()).toBeVisible(); // Badge Nuevo
    await expect(page.getByRole("link", { name: /The Corset Society/i }).first()).toBeVisible(); // Candado
    await expect(page.getByText("Comunidad").first()).toBeVisible();
    await page.getByRole("button", { name: "Comunidad" }).hover();
    await expect(page.getByRole("link", { name: /Próximos Eventos/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Luna Llena/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Panel Embajadores" }).first()).toBeVisible(); // Botón dedicado

    // WhatsApp CTA with guided copy
    const waLink = page.locator('header a[href*="wa.me/573194194785"]');
    await expect(waLink).toBeVisible();
    const href = await waLink.getAttribute("href");
    expect(href).toContain("te%20escribo%20desde%20la%20p%C3%A1gina%20web");

    // Dirección SegiSw
    await expect(page.getByText(/SegiSw/i).first()).toBeVisible();

    // Centro Cultural Mini-Galería
    const miniGallery = page.locator('a[href="/galeria-centro-cultural"]');
    expect(await miniGallery.count()).toBeGreaterThanOrEqual(4);

    // The Corset Society Section
    await expect(page.getByRole("link", { name: /SOLICITAR ADMISIÓN VIP/i }).first()).toBeVisible();

    // Ambassador Section
    await expect(page.getByText("Gana como Embajador de El Placer de Compartir")).toBeVisible();
    await expect(page.getByRole("link", { name: "OBTENER MI ENLACE DE EMBAJADOR" })).toBeVisible();

    // LeadForm with 2-phase progressive registration controls
    await expect(page.getByText("ENTRADA A LA COMUNIDAD")).toBeVisible();
    await expect(page.getByPlaceholder("Ej: 310 123 4567")).toBeVisible();
    await expect(page.locator("#btn-send-wa-otp")).toBeVisible();
    await expect(page.getByPlaceholder("Tu alias o nombre discreto")).toBeAttached();
    await expect(page.locator("#lead-remaining-fields")).toHaveClass(/hidden/);
  });

  test("Centro Cultural: Growth Copywriting, Buttons, Alianzas and Ambassador Section", async ({ page }) => {
    const base = new BasePage(page);
    await base.goto("/centro-cultural");

    // Copywriting affirmations (NOT swinger, NO wet zones)
    const growthCopy = page.locator("p", { hasText: /no somos un bar swinger tradicional.*ni contamos con zonas húmedas/i });
    await expect(growthCopy).toBeVisible();

    // Navigation and Action buttons
    await expect(page.getByRole("link", { name: "Próximos Eventos" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Galería de Espacios/i })).toBeVisible();

    // Allied event & Luna Llena
    await expect(page.getByText(/Impacto Producciones/i).first()).toBeVisible();
    await expect(page.locator('#proximos-eventos').getByText(/Noche de Luna Llena/i)).toBeVisible();

    // Ambassador Section embedded
    await expect(page.getByText("Gana como Embajador de El Placer de Compartir")).toBeVisible();

    // Alliance Form with Veladas y Fantasías
    const select = page.locator("select[name='tipo_alianza']");
    await expect(select).toBeVisible();
    await expect(page.locator("option[value='alquiler_espacio_privado']")).toContainText("Veladas y Fantasías");
  });

  test("Admin Dashboard: Password Gate, Login, KPIs and QR Check-in Terminal", async ({ page }) => {
    const base = new BasePage(page);
    await base.goto("/admin");

    // 1. Unauthenticated Password Gate
    await expect(page.locator("#admin-password-input")).toBeVisible();

    // 2. Perform Login with default password
    await page.fill("#admin-password-input", "AdminPlacer2026!*");
    await page.click("#btn-login-submit");

    // 3. Authenticated Dashboard Elements
    await expect(page.locator("h1")).toContainText("Dashboard de Administración", { timeout: 10000 });
    await expect(page.getByText("Total Leads").first()).toBeVisible();
    await expect(page.getByText("Embajadores").first()).toBeVisible();
    await expect(page.getByText("Pases Emitidos").first()).toBeVisible();
    await expect(page.getByText("Pendientes Efectivo").first()).toBeVisible();
    await expect(page.getByText("Validador de Asistencia y Escáner QR")).toBeVisible();

    // 4. Test Clickable Metric opens Drawer
    await page.click("#card-kpi-leads");
    await expect(page.locator("#drawer-container")).toBeVisible();
    await expect(page.locator("#drawer-title")).toContainText("Directorio de Contactos");
    await page.click("#drawer-close");
    await expect(page.locator("#drawer-container")).toBeHidden();
  });

  test("Galería Centro Cultural: Snap Carousels, Lobby Zone and Videos", async ({ page }) => {
    const base = new BasePage(page);
    await base.goto("/galeria-centro-cultural");

    await expect(page.locator("h1")).toContainText("Galería Centro Cultural");

    // Zones
    await expect(page.getByText("Lobby & Recepción Principal")).toBeVisible();
    await expect(page.getByText("Salones de Talleres & Encuentros")).toBeVisible();
    await expect(page.getByText("Habitaciones & Espacios Íntimos")).toBeVisible();
    await expect(page.getByText("Zona Licorera & Coctelería")).toBeVisible();

    // Video players
    const videos = page.locator("video");
    expect(await videos.count()).toBeGreaterThanOrEqual(2);

    // Postulation anchor link
    const allianceBtn = page.getByRole("link", { name: /Reserva un espacio \(Alianzas\)/i });
    await expect(allianceBtn).toHaveAttribute("href", "/centro-cultural#postulacion");
  });

  test("Eventos: Sitio 9 Octubre & Impacto 10 Octubre Interactive Forms", async ({ page }) => {
    const base = new BasePage(page);

    // Sitio 9 Octubre
    await base.goto("/eventos/sitio-9-oct");
    await expect(page.getByText("Evento Oficial ElPlacerDC")).toBeVisible();
    await expect(page.locator("h1")).toContainText("Viernes 9 de Octubre");
    await expect(page.getByText(/descontracturadas/i)).toHaveCount(0);
    await expect(page.getByText("Reserva tu Pase Gratuito")).toBeVisible();
    await expect(page.getByPlaceholder("310 123 4567")).toBeVisible();

    // Impacto 10 Octubre
    await base.goto("/eventos/impacto-10-oct");
    await expect(page.locator("h1")).toContainText("Impacto Producciones");
    await expect(page.getByText("Asegura tu Asistencia")).toBeVisible();
    await expect(page.getByPlaceholder("310 123 4567")).toBeVisible();
  });

  test("The Corset Society & Corset VIP: Annual Pricing, Luna Llena and Form", async ({ page }) => {
    const base = new BasePage(page);

    // The Corset Society Index
    await base.goto("/the-corset-society");
    await expect(page.getByText(/\$199\.000\s*COP/i).first()).toBeVisible();
    await expect(page.getByText(/Noche de Luna Llena/i).first()).toBeVisible();
    await expect(page.getByText("Solicitud de Admisión VIP").first()).toBeVisible();

    // Corset VIP Dedicated Landing
    await base.goto("/corset-vip");
    await expect(page.locator("h1")).toContainText("Tu Credencial VIP");
    await expect(page.getByText(/\$199\.000\s*COP/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Adquirir Membresía Anual VIP/i })).toBeVisible();
    await expect(page.getByText("Solicitud de Admisión VIP").first()).toBeVisible();
  });

  test("Dashboard: Ambassador Metrics, Link Customization and Canonical Domain", async ({ page }) => {
    const base = new BasePage(page);
    await base.goto("/dashboard");

    await expect(page.locator("h1")).toContainText("Panel de Control de Embajador");
    await expect(page.getByText("Acceso a Embajadores")).toBeVisible();
    await expect(page.getByPlaceholder("Ej: 310 123 4567")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar Código de Acceso" })).toBeVisible();

    // Verify authenticated dashboard elements exist in DOM
    await expect(page.locator("#metric-clicks")).toBeAttached();
    await expect(page.locator("#metric-leads")).toBeAttached();
    await expect(page.locator("#metric-purchases")).toBeAttached();
    await expect(page.locator("#metric-tickets")).toBeAttached();

    // Verify canonical domain elplacerdecompartir.com is used (and NO elplacerdc.com)
    const content = await page.content();
    expect(content.includes("elplacerdc.com/?ref=")).toBe(false);
    expect(content.includes("elplacerdecompartir.com/?ref=")).toBe(true);
  });

  test("Absolute Invariant: ZERO 'concierge' occurrences across all rendered HTML", async ({ page }) => {
    const routes = [
      "/",
      "/centro-cultural",
      "/galeria-centro-cultural",
      "/eventos/sitio-9-oct",
      "/eventos/impacto-10-oct",
      "/the-corset-society",
      "/corset-vip",
      "/dashboard",
      "/admin",
    ];

    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const content = await page.content();
      const count = (content.match(/concierge/gi) || []).length;
      expect(count, `Found 'concierge' on route ${route}`).toBe(0);
    }
  });
});
