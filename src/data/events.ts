export interface CulturalEvent {
  id: string;
  slug: string;
  title: string;
  badge: string;
  badgeClass?: string;
  date: string; // ISO 8601 with timezone (e.g. 2026-10-09T23:59:59-05:00)
  displayDate: string;
  description: string;
  image: string;
  link?: string;
  buttonText?: string;
  buttonClass?: string;
  cardBgClass?: string;
  cardBorderClass?: string;
  imgBgClass?: string;
  isPartner?: boolean;
}

export const CULTURAL_EVENTS: CulturalEvent[] = [
  {
    id: "apertura-3-oct",
    slug: "apertura-3-oct",
    title: "Primera Invitación y Apertura",
    badge: "3 de Octubre de 2026",
    badgeClass: "bg-[#c5a059]/20 text-[#c5a059] border-[#c5a059]/40",
    date: "2026-10-03T23:59:59-05:00",
    displayDate: "Sábado 3 de Octubre de 2026",
    description: "Inauguramos nuestro espacio con un grupo selecto de invitados, cata sensorial y una velada espectacular para sentar las bases de nuestra comunidad en Bogotá.",
    image: "/media/primera_invitacion_centro_cultural.jpg",
    cardBgClass: "bg-[#250F22]",
    cardBorderClass: "border-[#c5a059]/40",
    isPartner: false,
  },
  {
    id: "sitio-9-oct",
    slug: "sitio-9-oct",
    title: "Viernes 9 de Octubre",
    badge: "Evento Oficial ElPlacerDC",
    badgeClass: "bg-[#c5a059]/10 text-[#c5a059] border-[#c5a059]/30",
    date: "2026-10-09T23:59:59-05:00",
    displayDate: "Viernes 9 de Octubre de 2026",
    description: "Tu gran oportunidad de conocer el nuevo lugar de ElPlacerDC. Un encuentro diseñado para explorar las nuevas instalaciones, compartir entre personas afines y disfrutar de una atmósfera de libertad sin presiones.",
    image: "/media/eventos-elplacerdc/viernes-9-octubre-sitio.jpg",
    link: "/eventos/sitio-9-oct",
    buttonText: "Ver Detalles y Reservar",
    buttonClass: "bg-[#c5a059] text-[#180A1A] hover:bg-[#ead397]",
    cardBgClass: "bg-[#250F22]",
    cardBorderClass: "border-[#c5a059]/40",
    imgBgClass: "bg-[#1E0A1A]",
    isPartner: false,
  },
  {
    id: "impacto-10-oct",
    slug: "impacto-10-oct",
    title: "Impacto Producciones - Sábado 10",
    badge: "Evento Aliado",
    badgeClass: "bg-[#8E4A8C]/20 border-[#8E4A8C]/40 text-[#f3e5f5]",
    date: "2026-10-10T23:59:59-05:00",
    displayDate: "Sábado 10 de Octubre de 2026",
    description: "Nuestros aliados de Impacto Producciones se toman la casa. Una noche distinta con música, shows y performances en vivo en nuestro escenario central.",
    image: "/media/eventos-aliados/sabado-10-octubre_impacto-producciones.jpg",
    link: "/eventos/impacto-10-oct",
    buttonText: "Ver Detalles y Reservar",
    buttonClass: "bg-[#8E4A8C] hover:bg-[#a35da1] text-white",
    cardBgClass: "bg-[#1E0C24]",
    cardBorderClass: "border-[#8E4A8C]/40",
    imgBgClass: "bg-[#200d28]/60",
    isPartner: true,
  },
  {
    id: "taller-baile-erotico",
    slug: "taller-baile-erotico",
    title: "Taller de Baile Erótico — Sensualidad & Heels",
    badge: "Viernes 16 de Octubre",
    badgeClass: "bg-[#c5a059]/20 text-[#ead397] border-[#c5a059]/40",
    date: "2026-10-16T23:59:59-05:00",
    displayDate: "Viernes 16 de Octubre de 2026",
    description: "Clase y taller de Sensualidad, Expresión Corporal y Heels Dance para todo público de mente abierta sin importar su inclinación sexual. Entrada para solos y parejas por igual valor.",
    image: "/media/eventos-elplacerdc/flyer_taller-baile-erotico-16-oct.jpg",
    link: "/taller-baile-erotico",
    buttonText: "Ver Detalles y Reservar Pase",
    buttonClass: "bg-[#c5a059] text-[#0a0608] hover:bg-[#ead397]",
    cardBgClass: "bg-[#250F22]",
    cardBorderClass: "border-[#c5a059]/40",
    imgBgClass: "bg-[#1E0A1A]",
    isPartner: false,
  },
  {
    id: "luna-llena",
    slug: "luna-llena",
    title: "Noche de Luna Llena — Halloween",
    badge: "🌕 The Corset Society • Gala de Misterio",
    badgeClass: "bg-[#c5a059]/20 border-[#c5a059]/40 text-[#ead397]",
    date: "2026-10-31T23:59:59-05:00",
    displayDate: "Sábado 31 de Octubre de 2026",
    description: "Máscarada exclusiva en nuestro Centro Cultural. Gala Noir, antifaces y misterio en las noches de luna llena. Tu asistencia incluye el primer año de membresía VIP gratis.",
    image: "/media/corset-society/flyer_halloween_clean.jpg",
    link: "/the-corset-society/luna-llena",
    buttonText: "Ver Tarifas y Reservar Entrada",
    buttonClass: "bg-gradient-to-r from-[#c5a059] to-[#ead397] text-[#050505] hover:brightness-110",
    cardBgClass: "bg-[#0a050c]",
    cardBorderClass: "border-[#c5a059]/50",
    imgBgClass: "bg-[#0a050c]",
    isPartner: false,
  },
];

export function getUpcomingEvents(now: Date = new Date()): CulturalEvent[] {
  return CULTURAL_EVENTS.filter((e) => new Date(e.date).getTime() >= now.getTime()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

export function getPastEvents(now: Date = new Date()): CulturalEvent[] {
  return CULTURAL_EVENTS.filter((e) => new Date(e.date).getTime() < now.getTime()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}
