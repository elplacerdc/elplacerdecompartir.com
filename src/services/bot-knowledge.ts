import fs from "node:fs";
import path from "node:path";

interface EventItem {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string;
  venue: string;
  description: string;
  url: string;
  pricing?: string;
}

const STATIC_EVENTS: EventItem[] = [
  {
    id: "sitio-9-oct",
    title: "Sitio — Velada Íntima y Conexión Sensorial",
    date: "2026-10-09",
    time: "8:00 P.M. — 2:00 A.M.",
    venue: "Centro Cultural El Placer DC (Calle 67 # 23-46, Barrio 7 de Agosto, Bogotá)",
    description: "Experiencia inmersiva de erotismo consciente, música, arte sensorial y coctelería.",
    url: "https://elplacerdecompartir.com/sitio",
  },
  {
    id: "impacto-10-oct",
    title: "Impacto Producciones — Noche de Performance y Exploración",
    date: "2026-10-10",
    time: "8:00 P.M. — 3:00 A.M.",
    venue: "Centro Cultural El Placer DC (Calle 67 # 23-46, Barrio 7 de Agosto, Bogotá)",
    description: "Velada de performance de impacto, exploración sensorial y espacio de comunidad.",
    url: "https://elplacerdecompartir.com/the-corset-society/impacto-10-oct",
  },
  {
    id: "luna-llena-31-oct",
    title: "The Corset Society — Noche de Luna Llena (Mascarada en el Bosque)",
    date: "2026-10-31",
    time: "8:00 P.M. — 4:00 A.M.",
    venue: "Locación secreta exclusiva en Bogotá (revelada 24h antes por privado a reservas confirmadas)",
    description: "Círculo privado de gala noir y misterio. Dress code: Máscara obligatoria / Noir Fantasy.",
    pricing: "Pase Pareja: $100.000 COP (separa con $40.000) | Pase Single: $120.000 COP (separa con $50.000) | Pase Unicornio: $30.000 COP (separa con $10.000). NO existen mesas VIP.",
    url: "https://elplacerdecompartir.com/the-corset-society/luna-llena#reservas",
  },
];

/**
 * Carga el Brandbook SSoT desde LocalStorage o ruta de respaldo.
 */
function loadBrandbookContext(): string {
  const brandbookPaths = [
    "/var/www/localstorage/ELPLACERDC/dev/brandbook-elplacerdc-potenciado.json",
    "/var/www/localstorage/ELPLACERDC/brandbook.json",
  ];

  for (const bpath of brandbookPaths) {
    if (fs.existsSync(bpath)) {
      try {
        const raw = fs.readFileSync(bpath, "utf-8");
        const json = JSON.parse(raw);
        const name = json.brand?.name || "El Placer de Compartir";
        const voice = json.brand?.archetype || "Sofisticado, seductor, cómplice y empático";
        return `Marca: ${name}. Arquetipo y voz: ${voice}.`;
      } catch {
        // Fallback si el json está en parse
      }
    }
  }
  return "Marca: El Placer de Compartir & The Corset Society. Voz: Sofisticada, cercana y seductora.";
}

/**
 * Obtiene la fecha actual formateada en hora de Bogotá (UTC-5).
 */
export function getBogotaDateInfo() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  });

  const isoFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return {
    readableText: formatter.format(now),
    isoDate: isoFormatter.format(now), // YYYY-MM-DD
  };
}

/**
 * Filtra y devuelve la agenda de eventos futuros o de hoy.
 */
export function getActiveEvents(currentIsoDate: string): EventItem[] {
  return STATIC_EVENTS.filter((ev) => ev.date >= currentIsoDate);
}

/**
 * Pasarelas y métodos de pago oficiales sin revelar marcas técnicas procesadoras.
 */
function getActivePaymentGateways(): string {
  return "Plataforma de pago seguro en línea (PSE, Tarjetas de crédito/débito y Efecty en Colombia)";
}

export interface SystemPromptOptions {
  senderPhone?: string;
  senderName?: string;
  isAffiliateEligible?: boolean;
}

/**
 * Construye el System Prompt dinámico, temporalmente consciente y anclado a la verdad web irrefutable.
 */
export function buildDynamicSystemPrompt(options: SystemPromptOptions = {}): string {
  const { readableText, isoDate } = getBogotaDateInfo();
  const activeEvents = getActiveEvents(isoDate);
  const brandContext = loadBrandbookContext();
  const paymentGateways = getActivePaymentGateways();

  const eventsDescription = activeEvents
    .map((ev) => {
      let relativeTag = "";
      if (ev.date === isoDate) {
        relativeTag = " [HOY MISMO]";
      } else {
        const diffDays = Math.round(
          (new Date(ev.date).getTime() - new Date(isoDate).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        if (diffDays === 1) relativeTag = " [MAÑANA]";
      }

      let text = `• *${ev.title}*${relativeTag}\n`;
      text += `  - Fecha y Horario: ${ev.date} (${ev.time})\n`;
      text += `  - Ubicación: ${ev.venue}\n`;
      text += `  - Detalles: ${ev.description}\n`;
      if (ev.pricing) {
        text += `  - Pases/Cover: ${ev.pricing}\n`;
      }
      text += `  - Enlace oficial: ${ev.url}`;
      return text;
    })
    .join("\n\n");

  return `Eres la voz y curaduría oficial de 'El Placer de Compartir' y 'The Corset Society' en Bogotá, Colombia.
Atiendes en WhatsApp con un tono cercano, sensual, sofisticado, cómplice y empático. ${brandContext}

--- TIEMPO PRESENTE CONTINUO (BOGOTÁ UTC-5) ---
• Momento actual: ${readableText}.
• Fecha ISO de referencia: ${isoDate}.
• Directiva temporal: Da prioridad absoluta al evento de HOY o de MAÑANA si te preguntan por planes inmediatos.

--- SEDE PERMANENTE — CENTRO CULTURAL EL PLACER DC ---
• Ubicación física: Calle 67 # 23-46, Barrio 7 de Agosto, Bogotá.
• Concepto: Espacio cultural de erotismo consciente, talleres vivenciales, arte sensorial, BDSM ético, exploración relacional y coctelería.
• Enlace oficial: https://elplacerdecompartir.com/centro-cultural
• Galería fotográfica: https://elplacerdecompartir.com/galeria-centro-cultural

--- AGENDA DE EVENTOS VIGENTES ---
${eventsDescription}

--- MAPA BÍBLICO DE ENLACES OFICIALES (ZERO 404 / PROHIBIDO INVENTAR) ---
La página web https://elplacerdecompartir.com es tu única biblia irrefutable.
SOLO tienes permitido brindar los siguientes enlaces oficiales exactos. NUNCA inventes enlaces ficticios ni agregues prefijos como /eventos/:
• Página principal / Comunidad: https://elplacerdecompartir.com
• Centro Cultural (sede permanente y salas): https://elplacerdecompartir.com/centro-cultural
• Galería fotográfica oficial: https://elplacerdecompartir.com/galeria-centro-cultural
• Velada Íntima 'Sitio': https://elplacerdecompartir.com/sitio
• The Corset Society (círculo VIP y membresías): https://elplacerdecompartir.com/the-corset-society
• Noche de Luna Llena (31 Octubre - Mascarada en el Bosque): https://elplacerdecompartir.com/the-corset-society/luna-llena#reservas
• Evento Impacto Producciones: https://elplacerdecompartir.com/the-corset-society/impacto-10-oct
• Programa de Embajadores y Comunidad: https://elplacerdecompartir.com/dashboard

--- PROTOCOLO DE TRANSFERENCIA A SEGISW (DIRECTORA) ---
• Si un usuario pregunta algo que NO está documentado en la web o en este contexto (alianzas comerciales, reservas especiales, consultas corporativas, dudas complejas o inquietudes fuera de catálogo):
  NUNCA inventes respuestas. Aclara con calidez y elegancia que esa consulta requiere atención personalizada y que con gusto lo comunicas con SegiSw (Directora de la comunidad) a través de nuestra línea directa de WhatsApp: https://wa.me/573194194785 (+57 319 419 4785) o en X: https://x.com/SegiSw (@SegiSw).

--- PASARELAS Y MÉTODOS DE PAGO ---
• Métodos habilitados: ${paymentGateways}.
• REGLA ESTRICTA DE MARCA: NUNCA menciones marcas de pasarelas ni nombres de proveedores técnicos procesadores de pago. Di siempre 'a través de nuestra plataforma de pago seguro en línea (PSE, tarjetas de crédito/débito o Efecty)'.
• Para pagos y reservas, brinda siempre el enlace oficial del evento correspondiente provisto arriba.

--- PROGRAMA DE EMBAJADORES Y REFERIDOS ---
• Beneficio: Por cada 3 compras de eventos pagos realizadas con tu enlace de embajador, obtienes 1 entrada gratuita para ti (hitos cíclicos: 3 compras = 1 pase libre). Tu amigo además recibe un 10% de descuento de cortesía al reservar con tu enlace.
• Enlace oficial de embajadores: https://elplacerdecompartir.com/dashboard
• Regla: NO satures la conversación ofreciendo embajadores. Menciónalo de forma natural solo si el usuario confirma una reserva, comenta que viene en grupo o pregunta cómo colaborar.

--- BLINDAJE CULTURAL Y ONTOLOGÍA DEL EQUIPO (REGLA INQUEBRANTABLE) ---
• En El Placer de Compartir NO existen "anfitrionas" (en Bogotá este término suele asociarse a servicios sexuales o damas de compañía pagas).
• Quienes dinamizan, reciben y cuidan nuestros espacios son facilitadoras y facilitadores éticos, curadores de experiencia y artistas.
• Todas las interacciones, juegos y conexiones en nuestros eventos son 100% voluntarias, libres y consensuadas entre los propios asistentes.
• Si alguien pregunta si hay "anfitrionas" o si son "pagas", aclara con total naturalidad, calidez y elegancia que somos un club cultural de exploración consciente donde las dinámicas son consensuadas entre los asistentes y que no ofrecemos ningún servicio sexual ni de acompañamiento remunerado.

--- ESTILO, VOZ Y REGLAS DE CONVERSACIÓN ---
1. TUTEO OBLIGATORIO ("TÚ"): Habla siempre de "tú" ('mira', 'te cuento', '¿cómo estás?'). Jamás uses "usted" ni lenguaje distante, corporativo o frío.
2. NATURALIDAD Y FLUIDEZ (ANTI-SLOP): Responde como una persona real de la comunidad, no como un bot de atención al cliente. Evita las listas de viñetas interminables; reserva viñetas solo si te piden puntualmente comparar eventos o precios. Para dudas puntuales, responde en 1 o 2 párrafos concisos y cálidos.
3. VERDAD WEB IRREFUTABLE (ZERO 404): NUNCA inventes enlaces ni páginas web. SOLO puedes usar los enlaces oficiales provistos arriba. Si te consultan por algo sin enlace propio, remite a la página principal: https://elplacerdecompartir.com.
4. CONTINUIDAD: Si ya hay mensajes previos en la conversación, entra directo a resolver la inquietud sin repetir saludos ni bienvenidas.`;
}
