"""
Base de conocimiento (RAG) de APEX.

El médico sube sus libros y guías (Attia, protocolos de péptidos, guías clínicas...) y el
sistema los usa como fuente para fundamentar sus recomendaciones. Reemplaza a la búsqueda web
que quitamos: da grounding real y consistente (el mismo caso cita lo mismo dos veces) sin la
variabilidad, el costo ni la latencia de internet.

Diseño:
  PDF/DOCX/TXT → texto por página → fragmentos con solape → embeddings (Voyage) → pgvector
  Consulta → embedding → búsqueda por coseno → fragmentos con su fuente para citar.

Todo degrada de forma segura: si falta la API key de embeddings o la librería, el sistema
sigue funcionando exactamente como hoy, solo que sin el RAG.
"""
import io
import os
import re

EMBED_MODEL = "voyage-3"       # 1024 dimensiones — coincide con el esquema de kb_chunks
EMBED_DIMS = 1024
CHUNK_CHARS = 4000             # ~1000 tokens: suficiente para conservar el argumento completo
CHUNK_OVERLAP = 500            # solape para no cortar una idea a la mitad
MAX_BATCH = 100                # límite de textos por llamada de embeddings


def embeddings_disponibles() -> bool:
    """¿Está configurado el proveedor de embeddings?"""
    if not os.getenv("VOYAGE_API_KEY"):
        return False
    try:
        import voyageai  # noqa: F401
        return True
    except ImportError:
        return False


def _client():
    import voyageai
    return voyageai.Client()


# ── Extracción de texto ───────────────────────────────────────────────────────

def extraer_paginas(raw: bytes, nombre: str) -> list:
    """Devuelve [(n_pagina, texto)] del archivo. Conserva la página para poder citarla."""
    low = (nombre or "").lower()

    if low.endswith(".pdf"):
        try:
            from pypdf import PdfReader
        except ImportError:
            print("[WARN] pypdf no instalado: no se puede leer el PDF")
            return []
        try:
            reader = PdfReader(io.BytesIO(raw))
            out = []
            for i, page in enumerate(reader.pages, start=1):
                try:
                    txt = page.extract_text() or ""
                except Exception:
                    txt = ""
                if txt.strip():
                    out.append((i, txt))
            return out
        except Exception as e:
            print(f"[WARN] no se pudo leer el PDF {nombre}: {e}")
            return []

    if low.endswith(".docx"):
        try:
            import docx
            doc = docx.Document(io.BytesIO(raw))
            texto = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
            return [(1, texto)] if texto.strip() else []
        except Exception as e:
            print(f"[WARN] no se pudo leer el DOCX {nombre}: {e}")
            return []

    if low.endswith((".txt", ".md", ".csv")):
        try:
            return [(1, raw.decode("utf-8", errors="replace"))]
        except Exception:
            return []

    return []


def _limpiar(texto: str) -> str:
    """Quita artefactos típicos de PDF: guiones de corte, saltos sueltos, espacios dobles."""
    texto = texto.replace("\r", "\n")
    texto = re.sub(r"(\w)-\n(\w)", r"\1\2", texto)      # palabra cor-\ntada → cortada
    texto = re.sub(r"(?<![\n.:;!?])\n(?![\n•\-\d])", " ", texto)  # salto dentro del párrafo
    texto = re.sub(r"[ \t]{2,}", " ", texto)
    return re.sub(r"\n{3,}", "\n\n", texto).strip()


def fragmentar(paginas: list) -> list:
    """Agrupa el texto en fragmentos de ~CHUNK_CHARS con solape, sin perder la página.
    Devuelve [{'contenido', 'pagina'}]."""
    chunks = []
    buffer, buf_pagina = "", None

    for pagina, texto in paginas:
        limpio = _limpiar(texto)
        if not limpio:
            continue
        if buf_pagina is None:
            buf_pagina = pagina
        buffer += ("\n\n" if buffer else "") + limpio

        while len(buffer) >= CHUNK_CHARS:
            corte = buffer.rfind("\n\n", 0, CHUNK_CHARS)
            if corte < CHUNK_CHARS // 2:
                corte = buffer.rfind(". ", 0, CHUNK_CHARS)
            if corte < CHUNK_CHARS // 2:
                corte = CHUNK_CHARS
            trozo = buffer[:corte].strip()
            if len(trozo) > 120:                       # descarta restos sin contenido real
                chunks.append({"contenido": trozo, "pagina": buf_pagina})
            buffer = buffer[max(0, corte - CHUNK_OVERLAP):].strip()
            buf_pagina = pagina

    if len(buffer.strip()) > 120:
        chunks.append({"contenido": buffer.strip(), "pagina": buf_pagina or 1})
    return chunks


# ── Embeddings ────────────────────────────────────────────────────────────────

def embed_textos(textos: list, tipo: str = "document") -> list:
    """Genera embeddings por lotes. Devuelve [] si el proveedor no está configurado."""
    if not textos or not embeddings_disponibles():
        return []
    vo = _client()
    salida = []
    for i in range(0, len(textos), MAX_BATCH):
        lote = textos[i:i + MAX_BATCH]
        try:
            r = vo.embed(lote, model=EMBED_MODEL, input_type=tipo)
            salida.extend(r.embeddings)
        except Exception as e:
            print(f"[WARN] fallo al generar embeddings (lote {i}): {e}")
            salida.extend([None] * len(lote))
    return salida


def embed_consulta(texto: str):
    """Embedding de una consulta (input_type distinto al de los documentos)."""
    r = embed_textos([texto], tipo="query")
    return r[0] if r else None


# ── Formato para el prompt ────────────────────────────────────────────────────

def formatear_fragmentos(fragmentos: list) -> str:
    """Arma el bloque que se inyecta al prompt, con la fuente de cada fragmento para citar.
    Mismo encuadre anti-anclaje que el vademécum: es material de consulta, no un guion."""
    if not fragmentos:
        return ""
    partes = []
    for f in fragmentos:
        fuente = f.get("titulo") or "Fuente"
        if f.get("autor"):
            fuente += f" — {f['autor']}"
        if f.get("pagina"):
            fuente += f", pág. {f['pagina']}"
        partes.append(f"[{fuente}]\n{f.get('contenido', '').strip()}")

    return (
        "══ BIBLIOTECA CLÍNICA DEL MÉDICO (fragmentos relevantes de sus propios libros y guías) ══\n"
        "Estos extractos vienen de la biblioteca que el médico cargó al sistema. Úsalos para "
        "fundamentar tus recomendaciones y CÍTALOS por su título y autor cuando los uses.\n\n"
        + "\n\n---\n\n".join(partes)
        + "\n\nCÓMO USARLOS: son material de consulta, no un guion a seguir. Si un fragmento no "
          "aplica a este paciente, ignóralo. Si tu conocimiento médico contradice un fragmento, "
          "dilo con transparencia en vez de repetirlo. No inventes citas ni páginas que no estén "
          "aquí arriba."
    )
