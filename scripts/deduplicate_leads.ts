import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERROR: DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString });

function normalizePhone(raw?: string): string | null {
  if (!raw) return null;
  // Clean all non-digits
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // 10 digits starting with 3 (standard Colombian mobile: 3XXXXXXXXX)
  if (digits.length === 10 && digits.startsWith("3")) {
    return `+57${digits}`;
  }
  // 12 digits starting with 573 (Colombia country code + mobile)
  if (digits.length === 12 && digits.startsWith("573")) {
    return `+${digits}`;
  }
  // If user provided +57 with extra 0
  if (digits.length === 13 && digits.startsWith("5703")) {
    return `+57${digits.slice(3)}`;
  }
  // If 10 digits starting with something else (landlines or non-standard)
  if (digits.length === 10) {
    return `+57${digits}`;
  }
  // If already full international number > 10 digits
  if (digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

function normalizeEmail(raw?: string): string | null {
  if (!raw) return null;
  const clean = raw.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(clean) ? clean : null;
}

function detectRol(name?: string): "hombre_solo" | "mujer_sola" | "pareja" | "otro" {
  if (!name) return "otro";
  const lower = name.toLowerCase();

  if (
    lower.includes(",") ||
    lower.includes(" y ") ||
    lower.includes(" & ") ||
    lower.includes(" / ") ||
    lower.includes("pareja") ||
    lower.includes("esposos") ||
    lower.includes("novios")
  ) {
    return "pareja";
  }

  const femaleKeywords = [
    "mujer", "chica", "dama", "señorita", "unicornio", "maria", "paola", "laura", 
    "diana", "carolina", "claudia", "ana", "valentina", "camila", "daniela", "sofia",
    "andrea", "natalia", "juliana", "tatiana", "jessica", "vanessa", "adriana"
  ];

  if (femaleKeywords.some((kw) => lower.includes(kw))) {
    return "mujer_sola";
  }

  return "hombre_solo";
}

async function run() {
  console.log("=== INICIANDO DEDUPLICACIÓN & INGESTA DE LEADS ===");

  const vcfPath = "/var/www/data/leads_source/contactos.vcf";
  const xlsxPath = "/var/www/data/leads_source/Todas_Bases_Bogota_limpieza1.xlsx";

  if (!fs.existsSync(vcfPath)) {
    console.error(`Archivo VCF no encontrado en ${vcfPath}`);
    process.exit(1);
  }

  // 1. Parse VCF
  console.log("1. Procesando contactos.vcf...");
  const vcfContent = fs.readFileSync(vcfPath, "utf-8");
  const rawCards = vcfContent.split("BEGIN:VCARD");

  interface LeadRecord {
    alias_nombre: string;
    email: string | null;
    whatsapp: string | null;
    rol: "hombre_solo" | "mujer_sola" | "pareja" | "otro";
    ciudad: string;
    origen: string;
  }

  const leadsByPhone = new Map<string, LeadRecord>();
  const leadsByEmail = new Map<string, LeadRecord>();
  const leadsByName = new Map<string, LeadRecord>();

  let vcfCount = 0;
  for (const card of rawCards) {
    if (!card.includes("END:VCARD")) continue;
    vcfCount++;

    let fn = "";
    let tel = "";

    const lines = card.split(/\r?\n/);
    for (const line of lines) {
      if (line.startsWith("FN:") || line.startsWith("FN;")) {
        fn = line.substring(line.indexOf(":") + 1).trim();
      } else if (!fn && (line.startsWith("N:") || line.startsWith("N;"))) {
        const parts = line.substring(line.indexOf(":") + 1).split(";");
        fn = parts.filter(Boolean).reverse().join(" ").trim();
      } else if (line.startsWith("TEL") && line.includes(":")) {
        tel = line.substring(line.indexOf(":") + 1).trim();
      }
    }

    const normPhone = normalizePhone(tel);
    if (!normPhone) continue;

    const rol = detectRol(fn);
    const record: LeadRecord = {
      alias_nombre: fn || "Contacto WhatsApp",
      email: null,
      whatsapp: normPhone,
      rol,
      ciudad: "Bogotá",
      origen: "contactos_vcf",
    };

    leadsByPhone.set(normPhone, record);
    if (fn) {
      leadsByName.set(fn.toLowerCase().trim(), record);
    }
  }

  console.log(`✓ VCF procesado: ${vcfCount} tarjetas leídas, ${leadsByPhone.size} teléfonos móviles únicos normalizados.`);

  // 2. Parse Excel
  console.log("2. Procesando Todas_Bases_Bogota_limpieza1.xlsx...");
  let excelCount = 0;
  let excelMerged = 0;
  let excelNew = 0;

  if (fs.existsSync(xlsxPath)) {
    const wb = XLSX.readFile(xlsxPath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);
    excelCount = rows.length;

    for (const row of rows) {
      const email = normalizeEmail(row.Correo || row.correo || row.Email || row.email);
      const name = (row.NOMBRE || row.nombre || row.Nombre || "").toString().trim();
      const ciudad = (row.Ciudad || row.ciudad || "Bogotá").toString().trim();
      const rol = detectRol(name);

      if (!email && !name) continue;

      // Check if we can match by name with existing VCF lead
      const nameKey = name.toLowerCase().trim();
      const matchedLead = nameKey ? leadsByName.get(nameKey) : null;

      if (matchedLead && email) {
        matchedLead.email = email;
        matchedLead.origen = "vcf_and_excel_bogota";
        if (email) leadsByEmail.set(email, matchedLead);
        excelMerged++;
      } else if (email) {
        if (leadsByEmail.has(email)) {
          const existing = leadsByEmail.get(email)!;
          if (name && !existing.alias_nombre) existing.alias_nombre = name;
        } else {
          const newRecord: LeadRecord = {
            alias_nombre: name || "Contacto Email",
            email,
            whatsapp: null,
            rol,
            ciudad: ciudad || "Bogotá",
            origen: "excel_bogota",
          };
          leadsByEmail.set(email, newRecord);
          excelNew++;
        }
      }
    }
    console.log(`✓ Excel procesado: ${excelCount} filas leídas. ${excelMerged} fusionados con VCF por nombre, ${excelNew} nuevos registrados por correo.`);
  }

  // 3. Combine unique leads
  const allLeads: LeadRecord[] = [];
  const visited = new Set<LeadRecord>();

  for (const lead of leadsByPhone.values()) {
    if (!visited.has(lead)) {
      visited.add(lead);
      allLeads.push(lead);
    }
  }

  for (const lead of leadsByEmail.values()) {
    if (!visited.has(lead)) {
      visited.add(lead);
      allLeads.push(lead);
    }
  }

  console.log(`3. Total consolidado para inserción en PostgreSQL: ${allLeads.length} leads únicos.`);

  // 4. Batch Upsert to PostgreSQL
  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;

  try {
    await client.query("BEGIN");

    for (const lead of allLeads) {
      // Upsert query prioritizing unique email or unique whatsapp
      const res = await client.query(
        `INSERT INTO leads (alias_nombre, email, whatsapp, rol, ciudad, origen)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (whatsapp) DO UPDATE SET
           alias_nombre = COALESCE(EXCLUDED.alias_nombre, leads.alias_nombre),
           email = COALESCE(EXCLUDED.email, leads.email),
           origen = EXCLUDED.origen,
           updated_at = NOW()
         RETURNING (xmax = 0) AS is_insert`,
        [
          lead.alias_nombre,
          lead.email,
          lead.whatsapp,
          lead.rol,
          lead.ciudad,
          lead.origen,
        ]
      );

      if (res.rows[0]?.is_insert) {
        inserted++;
      } else {
        updated++;
      }
    }

    await client.query("COMMIT");
    console.log(`✓ Ingesta PostgreSQL completada: ${inserted} leads creados, ${updated} actualizados/unificados.`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error en batch insert PostgreSQL:", err);
    throw err;
  } finally {
    client.release();
  }

  // 5. Export CRM Leads SSoT to Excel
  console.log("4. Exportando SSoT consolidada a Google Drive...");
  const exportRes = await pool.query(
    "SELECT id, alias_nombre, email, whatsapp, rol, ciudad, origen, corset_vip, created_at FROM leads ORDER BY created_at ASC"
  );

  const ws = XLSX.utils.json_to_sheet(exportRes.rows);
  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWb, ws, "Leads_SSoT");

  const outPath = "/var/www/data/crm_leads_ssot.xlsx";
  XLSX.writeFile(outWb, outPath);
  console.log(`✓ Archivo Excel generado en ${outPath} con ${exportRes.rows.length} registros.`);

  console.log("=== DEDUPLICACIÓN & INGESTA EXITOSA ===");
  await pool.end();
}

run().catch((err) => {
  console.error("Fallo general:", err);
  process.exit(1);
});
