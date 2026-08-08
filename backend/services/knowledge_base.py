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
import time

EMBED_MODEL = "voyage-3"       # 1024 dimensiones — coincide con el esquema de kb_chunks
EMBED_DIMS = 1024
CHUNK_CHARS = 4000             # ~1000 tokens: suficiente para conservar el argumento completo
CHUNK_OVERLAP = 500            # solape para no cortar una idea a la mitad
# Límites de Voyage SIN método de pago: 3 peticiones/min y 10,000 tokens/min.
# Con tarjeta registrada (los 200M tokens gratis se mantienen) suben muchísimo.
# Los valores por defecto son los conservadores para que funcione en cualquier caso;
# se pueden subir con variables de entorno cuando la cuenta ya tenga límites normales.
MAX_BATCH = int(os.getenv("VOYAGE_MAX_BATCH", "8"))
MAX_TOKENS_BATCH = int(os.getenv("VOYAGE_MAX_TOKENS_BATCH", "8000"))
# Segundos entre peticiones. 21s ≈ 3 RPM (el tope del plan sin tarjeta).
PACE_SECONDS = float(os.getenv("VOYAGE_PACE_SECONDS", "21"))


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

def _lotes_por_tokens(textos: list):
    """Agrupa por TOKENS, no por número de textos. Voyage limita los tokens totales por
    petición (~120K en voyage-3): 100 fragmentos densos ya rozan ese tope y la petición
    falla entera. Estimación conservadora de 1 token ≈ 3.5 caracteres."""
    lote, tokens_lote = [], 0
    for t in textos:
        tks = len(t) // 3 + 1
        if lote and (tokens_lote + tks > MAX_TOKENS_BATCH or len(lote) >= MAX_BATCH):
            yield lote
            lote, tokens_lote = [], 0
        lote.append(t)
        tokens_lote += tks
    if lote:
        yield lote


def embed_textos(textos: list, tipo: str = "document") -> tuple:
    """Genera embeddings. Devuelve (lista_de_vectores, error).

    NO se traga los errores: si Voyage falla, el motivo llega hasta la interfaz. Antes se
    devolvían Nones en silencio y el usuario solo veía "no se pudo indexar" sin explicación.
    """
    if not textos:
        return [], "No hay texto que procesar"
    if not embeddings_disponibles():
        return [], "Proveedor de embeddings no configurado (falta VOYAGE_API_KEY)"

    vo = _client()
    salida, ultimo_error = [], None
    lotes = list(_lotes_por_tokens(textos))
    ultima_peticion = 0.0

    for n, lote in enumerate(lotes):
        # Marcar el ritmo para no chocar con el límite de peticiones por minuto
        espera = PACE_SECONDS - (time.monotonic() - ultima_peticion)
        if n > 0 and espera > 0:
            time.sleep(espera)

        vectores = None
        for intento in range(4):
            try:
                ultima_peticion = time.monotonic()
                r = vo.embed(lote, model=EMBED_MODEL, input_type=tipo)
                vectores = r.embeddings
                break
            except Exception as e:
                ultimo_error = f"{type(e).__name__}: {e}"
                es_limite = "rate" in str(e).lower() or "429" in str(e)
                # Ante límite de tasa hay que esperar de verdad, no unos segundos
                pausa = 65 if es_limite else 3 * (intento + 1)
                print(f"[WARN] embeddings lote {n + 1}/{len(lotes)}, intento {intento + 1}/4 "
                      f"({len(lote)} textos): {e} — esperando {pausa}s")
                if intento < 3:
                    time.sleep(pausa)

        if vectores is None:
            salida.extend([None] * len(lote))
        else:
            salida.extend(vectores)
            if (n + 1) % 10 == 0:
                print(f"[KB] embeddings: {n + 1}/{len(lotes)} lotes listos")

    validos = sum(1 for v in salida if v is not None)
    if validos == 0:
        return salida, (ultimo_error or "Voyage no devolvió ningún embedding")
    return salida, None


def embed_consulta(texto: str):
    """Embedding de una consulta (input_type distinto al de los documentos)."""
    vectores, _ = embed_textos([texto], tipo="query")
    return vectores[0] if vectores and vectores[0] is not None else None


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
