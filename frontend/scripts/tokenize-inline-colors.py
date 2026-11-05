"""Convierte colores hex escritos en estilos inline (style={{...}}, constantes C = {...}) a tokens CSS.
En el tema oscuro (Pro) los tokens valen lo mismo que el hex original; en el claro (Lite) siguen la marca.
Uso:  python3 -I scripts/tokenize-inline-colors.py archivo.tsx ..."""
import re, sys
MAPA = {
    "#00e5a0": "var(--c-green)", "#00ffb0": "var(--c-green)",
    "#0ea5e9": "var(--c-blue)", "#0891b2": "var(--c-blue)", "#7dd3fc": "var(--c-blue)",
    "#a78bfa": "var(--c-violet)", "#6366f1": "var(--c-violet)", "#c4b5fd": "var(--c-violet)",
    "#f472b6": "var(--c-pink)", "#ec4899": "var(--c-pink)",
    "#f59e0b": "var(--c-amber)", "#f97316": "var(--c-orange)", "#f43f5e": "var(--c-red)",
    "#dde6ef": "var(--c-text)", "#c8d6e5": "var(--c-text)",
    "#7a95aa": "var(--c-text-2)", "#8fa8bd": "var(--c-text-2)", "#9fb2c4": "var(--c-text-2)",
    "#3d5870": "var(--c-text-3)", "#5a7fa0": "var(--c-text-3)",
    "#0d1520": "var(--c-card)", "#101c28": "var(--c-card)",
    "#111820": "var(--c-subtle)", "#161f28": "var(--c-subtle)",
    "#1e2d3d": "var(--c-border)", "#2a3a4d": "var(--c-border-2)", "#2a3f54": "var(--c-border-2)",
    "#070a0e": "var(--c-bg)", "#080b10": "var(--c-bg)",
}
LIT = re.compile(r"(['\"`])(#[0-9a-fA-F]{6})\1")
total = 0
for f in sys.argv[1:]:
    s = open(f, encoding="utf-8").read()
    n = 0
    def rep(m):
        global n
        v = MAPA.get(m.group(2).lower())
        if not v: return m.group(0)
        n += 1
        return f"{m.group(1)}{v}{m.group(1)}"
    s2 = LIT.sub(rep, s)
    # texto negro/blanco sobre botones de acento: sigue al color de acento
    s2, k = re.subn(r"color:\s*(['\"])#000(?:000)?\1", "color: 'var(--c-primary-fg)'", s2)
    n += k
    if n: open(f, "w", encoding="utf-8").write(s2)
    print(f"{n:3d}  {f}"); total += n
print("total", total)
