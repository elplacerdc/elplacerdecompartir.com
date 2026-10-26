import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { pool, upsertLead } from "../src/db";

describe("BAI-246: Ambassador Dashboard — Responsive, Decoupled Sections & Profile Fix", () => {
  it("should have correct markup, order and responsiveness in dashboard.astro", () => {
    const content = readFileSync("src/pages/dashboard.astro", "utf-8");

    // 1. Botón 'Hazte VIP' responsivo (sin whitespace-nowrap en la inyección)
    expect(content).not.toContain('Hazte VIP (${vipPriceDisplay})${vipDiscountTag} →\n              </a>\n            `;\n          }\n        } else {\n          if (vipBadge) {\n            vipBadge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[#f7f4ee]/10 text-[#f7f4ee]/60 border border-[#f7f4ee]/20";\n            vipBadge.textContent = "Comunidad General";\n          }\n          if (vipDesc) vipDesc.textContent = "Accede a las veladas secretas de The Corset Society solicitando tu admisión al círculo exclusivo.";\n          if (vipActionContainer) {\n            const isReferredUser = Boolean(\n              stats.referredBy ||\n              localStorage.getItem("affiliate_ref") ||\n              document.cookie.includes("affiliate_ref") ||\n              new URLSearchParams(window.location.search).get("ref")\n            );\n            const vipPriceDisplay = isReferredUser ? "$179.000 COP" : "$199.000 COP";\n            const vipDiscountTag = isReferredUser ? \' <span class="text-[10px] text-[#81c784] font-normal font-sans ml-1">(-10% Embajador)</span>\' : \'\';\n            vipActionContainer.innerHTML = `\n              <a href="/the-corset-society" class="px-4 py-2 rounded-lg border border-[#c5a059]/60 text-[#ead397] hover:bg-[#c5a059]/20 text-xs font-bold uppercase tracking-wider transition-all inline-block whitespace-nowrap">');
    expect(content).toContain('Hazte VIP (${vipPriceDisplay})${vipDiscountTag} →');

    // 2. Quitar (10% descuento al comprar) del contador
    expect(content).toContain("Personas registradas con tu link</span>");
    expect(content).not.toContain("Personas registradas con tu link (10% descuento al comprar)");

    // 3. Enlace ancla a la sección de ajustes de perfil en el nombre del usuario
    expect(content).toContain('href="#section-profile-settings"');
    expect(content).toContain('id="ambassador-name"');

    // 4. Desacople y orden estricto de las 3 secciones:
    // 1º section-registros < 2º section-custom-code < 3º section-profile-settings
    const idxRegistros = content.indexOf('id="section-registros"');
    const idxCustomCode = content.indexOf('id="section-custom-code"');
    const idxProfileSettings = content.indexOf('id="section-profile-settings"');

    expect(idxRegistros).toBeGreaterThan(0);
    expect(idxCustomCode).toBeGreaterThan(idxRegistros);
    expect(idxProfileSettings).toBeGreaterThan(idxCustomCode);

    // 5. Textos purgados de section-custom-code
    expect(content).not.toContain("personaliza tu alias y comparte tu acceso oficial");
    expect(content).not.toContain("Personalizar tu Alias de Enlace");

    // 6. Botón de guardar perfil vinculado a submit y click
    expect(content).toContain('profileForm?.addEventListener("submit", handleProfileSave);');
    expect(content).toContain('btnSaveProfile?.addEventListener("click", handleProfileSave);');
  });

  it("should successfully update lead profile via /api/leads/update-profile by phone or alias", async () => {
    const testPhone = "+570009998877";
    const testAlias = "test-ambassador-profile";
    const client = await pool.connect();

    try {
      // Crear lead de prueba
      await client.query("DELETE FROM leads WHERE whatsapp = $1 OR alias_nombre = $2", [testPhone, testAlias]);
      const initialLead = await upsertLead({
        whatsapp: testPhone,
        alias_nombre: testAlias,
        email: "ambassador@test.com",
        rol: "pareja",
        ciudad: "Bogotá",
      });

      expect(initialLead).toBeDefined();

      // Probar actualización vía handler
      const { POST } = await import("../src/pages/api/leads/update-profile");
      const req = new Request("http://localhost/api/leads/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: testAlias, // Busqueda por alias
          alias_nombre: "Ambassador Updated",
          rol: "mujer_sola",
          ciudad: "Medellín",
          email: "ambassador_new@test.com",
        }),
      });

      const res = await POST({ request: req } as any);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.lead.alias_nombre).toBe("Ambassador Updated");
      expect(data.lead.rol).toBe("mujer_sola");
      expect(data.lead.ciudad).toBe("Medellín");
      expect(data.lead.email).toBe("ambassador_new@test.com");

      // Limpieza
      await client.query("DELETE FROM leads WHERE whatsapp = $1 OR alias_nombre = $2", [testPhone, "Ambassador Updated"]);
    } finally {
      client.release();
    }
  });
});
