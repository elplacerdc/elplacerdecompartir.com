import type { APIRoute } from "astro";
import { pool, normalizePhone, getPhoneVariants } from "../../../db";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { identifier, alias_nombre, rol, ciudad, email } = body;

    const cleanIdentifier = (identifier || "").toString().trim();
    if (!cleanIdentifier) {
      return new Response(JSON.stringify({ success: false, error: "Identificador de sesión requerido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const cleanAlias = (alias_nombre || "").toString().trim();
    const cleanEmail = (email || "").toString().trim().toLowerCase();
    const cleanCiudad = (ciudad || "").toString().trim();
    const validRoles = ["hombre_solo", "mujer_sola", "pareja", "otro"];
    const cleanRol = validRoles.includes(rol) ? rol : undefined;

    const phoneNorm = normalizePhone(cleanIdentifier);
    const phoneVariants = phoneNorm ? phoneNorm.variants : [];

    const client = await pool.connect();
    try {
      // 1. Buscar el lead por teléfono o email
      let leadRes = await client.query(
        `SELECT * FROM leads 
         WHERE (whatsapp IS NOT NULL AND whatsapp = ANY($1)) 
            OR (email IS NOT NULL AND LOWER(email) = $2)
         LIMIT 1`,
        [phoneVariants.length > 0 ? phoneVariants : [cleanIdentifier], cleanIdentifier.toLowerCase()]
      );

      if (leadRes.rows.length === 0) {
        return new Response(JSON.stringify({ success: false, error: "Usuario no encontrado" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const existingLead = leadRes.rows[0];

      // 2. Actualizar datos en leads
      const updateRes = await client.query(
        `UPDATE leads SET
          alias_nombre = COALESCE(NULLIF($1::text, ''), alias_nombre),
          rol = COALESCE(NULLIF($2::text, ''), rol),
          ciudad = COALESCE(NULLIF($3::text, ''), ciudad),
          email = COALESCE(NULLIF($4::text, ''), email),
          updated_at = NOW()
        WHERE id = $5
        RETURNING *`,
        [
          cleanAlias || null,
          cleanRol || null,
          cleanCiudad || null,
          cleanEmail || null,
          existingLead.id,
        ]
      );

      const updatedLead = updateRes.rows[0];

      // 3. Sincronizar en afiliados
      try {
        await client.query(
          `UPDATE afiliados SET
            nombre = COALESCE(NULLIF($1::text, ''), nombre),
            email = COALESCE(NULLIF($2::text, ''), email),
            updated_at = NOW()
          WHERE (whatsapp IS NOT NULL AND whatsapp = ANY($3::text[])) 
             OR (email IS NOT NULL AND LOWER(email) = $4)
             OR id::text = $5`,
          [
            cleanAlias || null,
            cleanEmail || null,
            phoneVariants.length > 0 ? phoneVariants : [cleanIdentifier],
            cleanIdentifier.toLowerCase(),
            String(existingLead.id),
          ]
        );
      } catch (_) {}

      return new Response(
        JSON.stringify({
          success: true,
          lead: {
            alias_nombre: updatedLead.alias_nombre,
            rol: updatedLead.rol,
            ciudad: updatedLead.ciudad,
            email: updatedLead.email,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("[API Update Profile Err]:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
