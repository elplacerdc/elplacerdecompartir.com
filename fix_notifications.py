import re

with open('src/services/notifications.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Quitar la palabra concierge
content = content.replace("concierge", "equipo")
content = content.replace("Concierge", "Equipo")

# 2. Corset WA
new_corset_wa = """const leadCorsetWa =
      `🖤 *THE CORSET SOCIETY — LÍNEA DE ALTA EXCLUSIVIDAD*\n\n` +
      `Estimado(a) *${lead.alias_nombre || "Invitado(a)"}*,\n\n` +
      `Te contactamos directo por WhatsApp al ser nuestro canal preferencial y confidencial de atención oficial.\n\n` +
      `Hemos recibido tu postulación a nuestra credencial VIP de suscripción anual. The Corset Society celebra encuentros privados de etiqueta rigurosa y brinda acceso a beneficios únicos, diseñados para salvaguardar la intimidad, la elegancia y la distinción de nuestras veladas.\n\n` +
      `Tu perfil se encuentra en evaluación. Puedes asegurar tu alta y conocer todos los detalles de la membresía en nuestra landing exclusiva: https://elplacerdecompartir.com/corset-vip\n\n` +
      `_«El acceso se concede, no se anuncia.»_\n\n` +
      `🎩 *Equipo Oficial • The Corset Society`;"""
content = re.sub(r'const leadCorsetWa =[\s\S]*?`;', new_corset_wa, content)

# 3. Placer WA
new_placer_wa = """const leadPlacerWa =
      `🌹 *EL PLACER DE COMPARTIR — COMUNIDAD*\n\n` +
      `Hola *${lead.alias_nombre || "Bienvenido(a)"}* ✨\n\n` +
      `Te escribimos directo a tu WhatsApp porque es nuestra línea ágil para convocatorias comunitarias, eventos y coordinación en tiempo real.\n\n` +
      `¡Qué alegría darte la bienvenida! Somos pioneros en Colombia en explorar la libertad relacional, el consentimiento lúcido y el erotismo libre de presiones.\n\n` +
      `Te acabamos de remitir a tu correo electrónico una guía con nuestros principios comunitarios y la presentación de nuestro nuevo Centro Cultural en Bogotá.\n\n` +
      `Si deseas ganar recompensas por cada registro o membresía, únete como embajador compartiendo nuestro enlace: https://elplacerdecompartir.com/#embajadores\n\n` +
      `Guarda este contacto en tu agenda para no perderte nuestros próximos eventos.\n\n` +
      `🌹 *El Placer de Compartir`;"""
content = re.sub(r'const leadPlacerWa =[\s\S]*?`;', new_placer_wa, content)

# We also need to fix the emails. Let's write the whole file since it's easier.
# Actually I'll replace the `corsetHtml` and `placerHtml` directly.

import re

with open('src/services/notifications.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 2. Corset Email
# Replace FromName to Spanish if it says anything in English.
content = content.replace('fromName: "The Corset Society - Elite Concierge"', 'fromName: "The Corset Society - Equipo Oficial"')

# Fix Corset HTML
content = re.sub(
    r'<p>Estimado\(a\) <strong.*?</strong>,</p>.*?<p>Te hemos enviado previamente un saludo directo a tu WhatsApp.*?</p>',
    r'<p>Estimado(a) <strong style="color: #ead397;">${lead.alias_nombre || "Invitado(a)"}</strong>,</p>\n            <p>Te hemos enviado previamente un saludo directo a tu WhatsApp (<strong style="color: #ead397;">${formattedPhone}</strong>), nuestro canal prioritario. Mediante esta comunicación formal dejamos constancia de tu solicitud de admisión a nuestra membresía anual VIP.</p>',
    content,
    flags=re.DOTALL
)

content = re.sub(
    r'<p style="margin: 0; font-size: 13px; color: #f7f4ee;">\s*👑 <strong>Círculo Privado de Ticket Alto:</strong>.*?Nuestras galas cuentan con covers e inversión de nivel prémium, diseñados como filtro natural para salvaguardar la intimidad, la elegancia patrimonial y el aforo sumamente reservado de cada velada.\s*</p>',
    r'<p style="margin: 0; font-size: 13px; color: #f7f4ee;">\n                👑 <strong>Credencial VIP Anual:</strong> Tu membresía te otorga descuentos permanentes, invitaciones prioritarias a eventos exclusivos y acceso a la comunidad premium, actuando como filtro de elegancia y privacidad.\n              </p>',
    content,
    flags=re.DOTALL
)

content = re.sub(
    r'</ul>\s*<p style="color: #ead397; font-style: italic;',
    r'</ul>\n            <div style="text-align: center; margin: 30px 0;">\n              <a href="https://elplacerdecompartir.com/#embajadores" style="background-color: #c5a059; color: #050505; padding: 10px 20px; text-decoration: none; font-weight: bold; border-radius: 20px; font-size: 12px; text-transform: uppercase;">Únete como Embajador</a>\n            </div>\n            <p style="color: #ead397; font-style: italic;',
    content
)

# 4. Placer Email (Carta Comunitaria -> removed, added Eventos, and Galeria link)
content = content.replace("Carta Comunitaria y Bienvenida Oficial", "Bienvenida Oficial")
content = content.replace("Centro Cultural El Placer de Compartir — Carta Comunitaria", "Centro Cultural El Placer de Compartir — Bienvenida")

content = re.sub(
    r'🎭 <strong>Centro Cultural Físico:</strong>.*?<br/>\s*Sede segura y estética en Bogotá',
    r'🎭 <strong>Centro Cultural y Eventos:</strong><br/>\nSede segura y estética en Bogotá para talleres, eventos y exploración',
    content,
    flags=re.DOTALL
)

content = re.sub(
    r'</ul>\s*<p style="color: #ead397; font-style: italic; text-align: center; margin: 25px 0;',
    r'</ul>\n            <div style="text-align: center; margin: 30px 0;">\n              <a href="https://elplacerdecompartir.com/galeria-centro-cultural" style="background-color: #b84a39; color: #f7f4ee; padding: 10px 20px; text-decoration: none; font-weight: bold; border-radius: 20px; font-size: 12px; text-transform: uppercase;">Explora la Galería del Centro</a>\n            </div>\n            <p style="color: #ead397; font-style: italic; text-align: center; margin: 25px 0;',
    content
)

with open('src/services/notifications.ts', 'w', encoding='utf-8') as f:
    f.write(content)

