#!/usr/bin/env python3
"""
Convierte tus PDFs con Marker (en TU Mac) y los sube a la biblioteca de APEX.

Por qué en tu Mac y no en el servidor: Marker necesita 3.5-5 GB de RAM y modelos de deep
learning; el backend en Render no tiene esa capacidad. Tu Mac con Apple Silicon lo corre
acelerado por MPS, gratis y con mejor calidad que la visión pura — sobre todo en tablas de
dosis, que es justo lo que importa en los libros de péptidos.

Marker conserva las marcas de página ({12}------------), así que APEX puede seguir citando
"pág. 143" en sus recomendaciones.

── INSTALACIÓN (una sola vez) ──────────────────────────────────────────────────
    pip install marker-pdf requests

── USO ─────────────────────────────────────────────────────────────────────────
    # Convertir y subir toda una carpeta
    python scripts/subir_biblioteca.py ~/Libros --area functional

    # Solo convertir, sin subir (para revisar el markdown antes)
    python scripts/subir_biblioteca.py ~/Libros --solo-convertir

    # Subir markdown ya convertido
    python scripts/subir_biblioteca.py ~/Libros/salida --solo-subir --area longevity

── OPCIONES ────────────────────────────────────────────────────────────────────
    --area      functional | longevity | traditional | general   (default: general)
    --tipo      libro | guia | paper | protocolo | notas          (default: libro)
    --backend   URL del backend (default: el de producción)
"""
import argparse
import os
import subprocess
import sys
from pathlib import Path

BACKEND_DEFAULT = "https://apex-4sjg.onrender.com"


def _marker_bin() -> str:
    """Ruta a marker_single. Prefiere el entorno virtual .venv-marker del proyecto, para no
    depender de que esté en el PATH del sistema."""
    for candidato in (
        Path(__file__).resolve().parents[2] / ".venv-marker" / "bin" / "marker_single",
        Path.home() / "Desktop" / "Apex" / ".venv-marker" / "bin" / "marker_single",
    ):
        if candidato.exists():
            return str(candidato)
    return "marker_single"


def convertir_con_marker(pdf: Path, salida: Path) -> Path | None:
    """Convierte un PDF a markdown con Marker. Devuelve la ruta del .md o None."""
    salida.mkdir(parents=True, exist_ok=True)
    destino = salida / f"{pdf.stem}.md"
    if destino.exists() and destino.stat().st_size > 1000:
        print(f"  ↷ ya convertido, se omite: {destino.name}")
        return destino

    print(f"  ⚙  convirtiendo (puede tardar varios minutos)…")
    entorno = os.environ.copy()
    entorno.setdefault("TORCH_DEVICE", "mps")   # acelera en Apple Silicon
    try:
        # marker_single deja la salida en <output_dir>/<nombre>/<nombre>.md
        subprocess.run(
            [_marker_bin(), str(pdf), "--output_dir", str(salida), "--output_format", "markdown"],
            check=True, capture_output=True, text=True, timeout=3600, env=entorno,
        )
    except FileNotFoundError:
        print("  ✗ No se encontró 'marker_single'. Instálalo con:  pip install marker-pdf")
        return None
    except subprocess.CalledProcessError as e:
        print(f"  ✗ Marker falló: {(e.stderr or '')[-400:]}")
        return None
    except subprocess.TimeoutExpired:
        print("  ✗ Marker tardó más de 1 hora — se omite este libro")
        return None

    # Buscar el .md que dejó (la estructura de carpetas varía por versión)
    candidatos = sorted(salida.rglob(f"{pdf.stem}*.md"), key=lambda p: -p.stat().st_size)
    if not candidatos:
        print("  ✗ Marker no generó ningún .md")
        return None
    if candidatos[0] != destino:
        destino.write_text(candidatos[0].read_text(encoding="utf-8"), encoding="utf-8")
    return destino


def subir(md: Path, backend: str, area: str, tipo: str, autor: str = "") -> bool:
    try:
        import requests
    except ImportError:
        print("  ✗ Falta 'requests'. Instálalo con:  pip install requests")
        return False

    titulo = md.stem.replace("_", " ").replace("-", " ").strip()
    try:
        with open(md, "rb") as f:
            r = requests.post(
                f"{backend}/kb/upload_file",
                files={"file": (md.name, f, "text/markdown")},
                data={"titulo": titulo, "autor": autor, "tipo": tipo, "area": area},
                timeout=300,
            )
        if r.status_code == 200:
            print(f"  ✓ subido: {titulo}")
            return True
        print(f"  ✗ error {r.status_code}: {r.text[:250]}")
    except Exception as e:
        print(f"  ✗ fallo al subir: {e}")
    return False


def main():
    p = argparse.ArgumentParser(description="Convierte PDFs con Marker y los sube a APEX")
    p.add_argument("carpeta", help="Carpeta con los PDFs (o con los .md si usas --solo-subir)")
    p.add_argument("--area", default="general",
                   choices=["functional", "longevity", "traditional", "general"])
    p.add_argument("--tipo", default="libro",
                   choices=["libro", "guia", "paper", "protocolo", "notas"])
    p.add_argument("--autor", default="")
    p.add_argument("--backend", default=os.getenv("APEX_BACKEND", BACKEND_DEFAULT))
    p.add_argument("--solo-convertir", action="store_true")
    p.add_argument("--solo-subir", action="store_true")
    args = p.parse_args()

    carpeta = Path(args.carpeta).expanduser()
    if not carpeta.is_dir():
        sys.exit(f"No existe la carpeta: {carpeta}")

    salida = carpeta / "salida_markdown"

    if args.solo_subir:
        archivos = sorted(carpeta.glob("*.md"))
        if not archivos:
            sys.exit(f"No hay archivos .md en {carpeta}")
        print(f"\nSubiendo {len(archivos)} documento(s) a {args.backend}  [área: {args.area}]\n")
        ok = sum(subir(md, args.backend, args.area, args.tipo, args.autor) for md in archivos)
        print(f"\nListo: {ok}/{len(archivos)} subidos.")
        return

    pdfs = sorted(carpeta.glob("*.pdf"))
    if not pdfs:
        sys.exit(f"No hay PDFs en {carpeta}")

    print(f"\n{len(pdfs)} PDF(s) en {carpeta}")
    print(f"Markdown se guardará en: {salida}")
    if not args.solo_convertir:
        print(f"Se subirán a: {args.backend}  [área: {args.area}]")
    print()

    convertidos, subidos = 0, 0
    for i, pdf in enumerate(pdfs, 1):
        mb = pdf.stat().st_size / 1024 / 1024
        print(f"[{i}/{len(pdfs)}] {pdf.name}  ({mb:.1f} MB)")
        md = convertir_con_marker(pdf, salida)
        if not md:
            continue
        convertidos += 1
        if not args.solo_convertir and subir(md, args.backend, args.area, args.tipo, args.autor):
            subidos += 1

    print(f"\n── Resumen ──")
    print(f"Convertidos: {convertidos}/{len(pdfs)}")
    if not args.solo_convertir:
        print(f"Subidos:     {subidos}/{len(pdfs)}")
    print(f"Markdown en: {salida}")


if __name__ == "__main__":
    main()
