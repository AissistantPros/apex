"""Quita emojis decorativos de las pantallas de Apex Lite (no toca ✓ × ▲ ▼ → ni las pantallas de IA de Pro)."""
import re, sys

# Emojis "de dibujo" (bloque 1F300–1FAFF) y unos pocos símbolos que se usan como adorno.
EMOJI = re.compile(
    "[\U0001F300-\U0001FAFF"
    "✅⚠⚡✨⭐⏰-⏳⌚⌛❤♀♂❗❓❔"
    "⚙✏✉☀-☄☎☔☕✒]"
    "[️‍]*[\U0001F300-\U0001FAFF♀♂❤]?️? ?"
)
total = 0
for f in sys.argv[1:]:
    s = open(f, encoding="utf-8").read()
    nuevo, n = EMOJI.subn("", s)
    if n:
        open(f, "w", encoding="utf-8").write(nuevo)
    print(f"{n:3d}  {f}")
    total += n
print("total", total)
