import type { APIRoute } from "astro";
import { verifyAdminSessionToken, verifyAdminPassword, setAdminPassword } from "../../../../services/adminAuth";

export const POST: APIRoute = async ({ request, cookies }) => {
  const token = cookies.get("admin_token")?.value;
  if (!verifyAdminSessionToken(token)) {
    return new Response(JSON.stringify({ success: false, error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!newPassword || newPassword.trim().length < 6) {
      return new Response(JSON.stringify({ success: false, error: "La nueva contraseña debe tener mínimo 6 caracteres" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (currentPassword) {
      const isValid = await verifyAdminPassword(currentPassword);
      if (!isValid) {
        return new Response(JSON.stringify({ success: false, error: "La contraseña actual no es correcta" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    await setAdminPassword(newPassword.trim());

    return new Response(JSON.stringify({ success: true, message: "Contraseña actualizada exitosamente" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[Admin Change Password Err]:", e);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
