import type { APIRoute } from "astro";
import { verifyAdminPassword, generateAdminSessionToken } from "../../../../services/adminAuth";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return new Response(JSON.stringify({ success: false, error: "Contraseña requerida" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const isValid = await verifyAdminPassword(password);
    if (!isValid) {
      return new Response(JSON.stringify({ success: false, error: "Contraseña administrativa incorrecta" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const token = generateAdminSessionToken();
    cookies.set("admin_token", token, {
      path: "/",
      httpOnly: true,
      secure: false, // works in dev and prod HTTP/HTTPS
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return new Response(JSON.stringify({ success: true, message: "Sesión administrativa iniciada" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[Admin Login Err]:", e);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
