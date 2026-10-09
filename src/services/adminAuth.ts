import crypto from "crypto";
import { pool } from "../db";

const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "AdminPlacer2026!*";
const SESSION_SECRET = process.env.SESSION_SECRET || "elplacerdc-admin-secret-key-2026-luxury-vault";

export async function getAdminPassword(): Promise<string> {
  try {
    const client = await pool.connect();
    try {
      const res = await client.query("SELECT value FROM admin_settings WHERE key = 'admin_password' LIMIT 1");
      if (res.rows.length > 0 && res.rows[0].value) {
        return res.rows[0].value;
      }
    } finally {
      client.release();
    }
  } catch (e: any) {
    console.warn("[AdminAuth] DB getAdminPassword fallback:", e.message);
  }
  return DEFAULT_ADMIN_PASSWORD;
}

export async function setAdminPassword(newPassword: string): Promise<boolean> {
  const trimmed = newPassword.trim();
  if (trimmed.length < 6) {
    throw new Error("La nueva contraseña debe tener al menos 6 caracteres");
  }

  const client = await pool.connect();
  try {
    await client.query(`
      INSERT INTO admin_settings (key, value, updated_at)
      VALUES ('admin_password', $1, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW()
    `, [trimmed]);
    return true;
  } finally {
    client.release();
  }
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  if (!password) return false;
  const current = await getAdminPassword();
  return password.trim() === current.trim();
}

export function generateAdminSessionToken(): string {
  const timestamp = Date.now().toString();
  const hmac = crypto.createHmac("sha256", SESSION_SECRET).update(`admin:${timestamp}`).digest("hex");
  return `${timestamp}.${hmac}`;
}

export function verifyAdminSessionToken(token?: string | null): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [timestampStr, expectedHmac] = parts;
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  // Session valid for 30 days
  const maxAge = 30 * 24 * 60 * 60 * 1000;
  if (Date.now() - timestamp > maxAge) return false;

  try {
    const actualHmac = crypto.createHmac("sha256", SESSION_SECRET).update(`admin:${timestampStr}`).digest("hex");
    const bufExpected = Buffer.from(expectedHmac);
    const bufActual = Buffer.from(actualHmac);
    if (bufExpected.length !== bufActual.length) return false;
    return crypto.timingSafeEqual(bufExpected, bufActual);
  } catch {
    return false;
  }
}
