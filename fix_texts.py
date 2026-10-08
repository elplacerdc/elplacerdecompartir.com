import re
import os

def update_file(path, replacements):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        for old, new in replacements:
            if callable(old):
                content = old(content)
            else:
                content = content.replace(old, new)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {path}")
    except Exception as e:
        print(f"Error reading {path}: {e}")

# 1. index.astro changes
index_replacements = [
    ("novedades de la comunidad", "eventos de la comunidad"),
    ("nombre de pila", "pseudónimo"),
    ("acceso ceremonial", "solicitar admisión VIP"),
    ("luxury & ticket alto", "La Linea de Alta Exclusivad de ElPlacerDC"),
    # Replace image with flayer_membresia_clean.jpg and make clickable
    (re.compile(r'<img[^>]*src=["\']/?[^>]*corset[^>]*["\'][^>]*>'), r'<a href="/the-corset-society"><img src="/media/flayer_membresia_clean.jpg" alt="The Corset Society VIP" class="rounded-lg shadow-xl" /></a>')
]

update_file('src/pages/index.astro', [
    (lambda c: c.replace("novedades de la comunidad", "eventos de la comunidad"), ""),
    (lambda c: c.replace("nombre de pila", "pseudónimo"), ""),
    (lambda c: c.replace("acceso ceremonial", "solicitar admisión VIP"), ""),
    (lambda c: c.replace("luxury & ticket alto", "La Linea de Alta Exclusivad de ElPlacerDC"), ""),
])

# 2. centro-cultural.astro changes
cc_replacements = [
    (lambda c: c.replace("sitio -", "oportunidad de conocer el nuevo lugar de ElPlacerDC"), ""),
    (lambda c: c.replace("celebraciones y veladas", "veladas y fantasias"), "")
]
update_file('src/pages/centro-cultural.astro', cc_replacements)

# 3. Header / Menu Superior
header_replacements = [
    (lambda c: c.replace("<!-- Add menu items here -->", '<a href="/#eventos" class="hover:text-primary">Próximos Eventos</a><a href="/#alianzas" class="hover:text-primary">Postular Alianza</a><a href="/#embajadores" class="hover:text-primary">Gana como Embajador</a><a href="/#comunidad" class="hover:text-primary">Unirme a la comunidad</a>'), "")
]
update_file('src/components/Header.astro', header_replacements)

print("Text replacements completed")
