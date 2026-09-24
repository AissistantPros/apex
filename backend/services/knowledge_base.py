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
import base64
import io
import os
import re
import time

EMBED_MODEL = "voyage-3"       # 1024 dimensiones — coincide con el esquema de kb_chunks
EMBED_DIMS = 1024
CHUNK_CHARS = 4000             # ~1000 tokens: suficiente para conservar el argumento completo
CHUNK_OVERLAP = 500            # solape para no cortar una idea a la mitad
# Ritmo ADAPTATIVO: arranca rápido (límites normales de Voyage, con tarjeta registrada) y,
# si aparece un error de límite de tasa, se degrada solo al modo conservador del plan
# gratuito (3 peticiones/min, 10K tokens/min). Así funciona en ambos casos sin configurar nada.
RAPIDO       = {"batch": 64, "tokens": 100_000, "pace": 0.4}
CONSERVADOR  = {"batch": 8,  "tokens": 8_000,   "pace": 21.0}

# Permiten forzar un modo por entorno si hiciera falta, pero no es necesario.
MAX_BATCH = int(os.getenv("VOYAGE_MAX_BATCH", RAPIDO["batch"]))
MAX_TOKENS_BATCH = int(os.getenv("VOYAGE_MAX_TOKENS_BATCH", RAPIDO["tokens"]))
PACE_SECONDS = float(os.getenv("VOYAGE_PACE_SECONDS", RAPIDO["pace"]))


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

def _extraer_pdf_pdfium(raw: bytes) -> list:
    """Extractor principal. pypdfium2 (motor de Chrome/PDFium) es bastante más robusto que
    pypdf con PDFs generados por editores diversos."""
    try:
        import pypdfium2 as pdfium
    except ImportError:
        return []
    try:
        doc = pdfium.PdfDocument(io.BytesIO(raw))
        out = []
        for i in range(len(doc)):
            try:
                txt = doc[i].get_textpage().get_text_range() or ""
            except Exception:
                txt = ""
            if txt.strip():
                out.append((i + 1, txt))
        return out
    except Exception as e:
        print(f"[WARN] pypdfium2 no pudo leer el PDF: {e}")
        return []


def _extraer_pdf_pypdf(raw: bytes, nombre: str) -> list:
    """Respaldo por si pypdfium2 no está disponible o falla."""
    try:
        from pypdf import PdfReader
    except ImportError:
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


def extraer_paginas(raw: bytes, nombre: str) -> list:
    """Devuelve [(n_pagina, texto)] del archivo. Conserva la página para poder citarla."""
    low = (nombre or "").lower()

    if low.endswith(".pdf"):
        # pypdfium2 PRIMERO: extrae texto de muchos PDFs donde pypdf devuelve vacío y
        # el archivo se marcaría como "escaneado" por error, disparando un OCR innecesario
        # (y con costo). Comprobado con "Peptide protocols": pypdf leía 2 car/página,
        # pypdfium2 lee 1875.
        out = _extraer_pdf_pdfium(raw)
        if out:
            return out
        return _extraer_pdf_pypdf(raw, nombre)

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
            texto = raw.decode("utf-8", errors="replace")
        except Exception:
            return []
        return _dividir_markdown_en_paginas(texto)

    return []


# Marcas de salto de página que suelen dejar los conversores (Marker, pymupdf4llm, etc.)
_MARCAS_PAGINA = [
    re.compile(r"\{(\d+)\}-{10,}"),                  # Marker: {12}------------
    re.compile(r"===\s*PAGINA\s*(\d+)\s*===", re.I), # nuestro propio OCR
    re.compile(r"<!--\s*page[:\s]*(\d+)\s*-->", re.I),
    re.compile(r"^\s*\[?page\s+(\d+)\]?\s*$", re.I | re.M),
]


def _dividir_markdown_en_paginas(texto: str) -> list:
    """Convierte markdown/texto plano en [(pagina, texto)].

    Si el conversor dejó marcas de página (Marker las pone como {12}------------), se
    respetan para poder citar la página real. Si no hay marcas, se parte en bloques por
    tamaño y se numeran de forma aproximada — mejor que mandar todo como "página 1".
    """
    for patron in _MARCAS_PAGINA:
        partes = patron.split(texto)
        if len(partes) >= 3:                      # hubo al menos una marca
            paginas, i = [], 1
            # partes = [previo, n1, cuerpo1, n2, cuerpo2, ...]
            if partes[0].strip():
                paginas.append((1, partes[0]))
            while i < len(partes) - 1:
                try:
                    n = int(partes[i])
                except (ValueError, TypeError):
                    n = len(paginas) + 1
                cuerpo = partes[i + 1]
                if cuerpo and cuerpo.strip():
                    paginas.append((n, cuerpo))
                i += 2
            if paginas:
                return paginas

    # Sin marcas: trocear por tamaño y numerar aproximado (~2500 car ≈ 1 página de libro)
    if len(texto) <= 2500:
        return [(1, texto)] if texto.strip() else []
    paginas, n = [], 1
    for i in range(0, len(texto), 2500):
        trozo = texto[i:i + 2500]
        if trozo.strip():
            paginas.append((n, trozo))
        n += 1
    return paginas


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


# ── OCR de PDFs escaneados ────────────────────────────────────────────────────
# Usa la visión NATIVA de Claude sobre el PDF: no hace falta instalar Tesseract ni
# poppler en el servidor, ni contratar otro servicio. Es la misma técnica que ya usamos
# para leer los estudios de laboratorio que sube el médico.

# OCR DESACTIVADO por defecto: consume API de Claude (~$3-5 por libro escaneado).
# Para los escaneados conviene usar Marker en la Mac, que es gratuito y de mejor calidad.
# Se puede reactivar poniendo ENABLE_OCR=true en el entorno.
ENABLE_OCR = os.getenv("ENABLE_OCR", "false").lower() in ("1", "true", "yes")
OCR_MODEL = os.getenv("OCR_MODEL", "claude-sonnet-4-6")
OCR_PAGINAS_POR_LOTE = int(os.getenv("OCR_PAGINAS_POR_LOTE", "20"))
OCR_MAX_PAGINAS = int(os.getenv("OCR_MAX_PAGINAS", "900"))   # tope de seguridad por libro

OCR_PROMPT = """Este PDF está escaneado: sus páginas son imágenes, no texto.

TRANSCRIBE fielmente todo el texto que veas, página por página.

REGLAS:
- Antes de cada página escribe exactamente: ===PAGINA n=== (n = número de página del lote, empezando en 1).
- Transcribe el contenido tal cual: títulos, párrafos, listas, tablas (en texto plano, separando columnas con |), pies de figura y dosis.
- Conserva números, unidades y dosis EXACTOS — es material clínico y un error de dosis es grave.
- No resumas, no interpretes, no corrijas al autor, no agregues comentarios tuyos.
- Si una página está en blanco o es solo una imagen sin texto, escribe únicamente: (sin texto)
- Si una palabra es ilegible, escribe [ilegible] en su lugar; nunca la inventes."""


def es_pdf_escaneado(paginas: list, total_paginas: int = None) -> bool:
    """Un PDF con texto real trae cientos de caracteres por página. Muy pocos = escaneo."""
    if not paginas:
        return True
    total_chars = sum(len(t) for _, t in paginas)
    n = total_paginas or len(paginas)
    return (total_chars / max(n, 1)) < 120


def ocr_pdf(raw: bytes, progreso=None) -> tuple:
    """Transcribe un PDF escaneado con la visión de Claude.
    Devuelve ([(n_pagina, texto)], error)."""
    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError:
        return [], "pypdf no está instalado"
    try:
        from anthropic import Anthropic
    except ImportError:
        return [], "El SDK de Anthropic no está instalado"

    try:
        reader = PdfReader(io.BytesIO(raw))
        total = len(reader.pages)
    except Exception as e:
        return [], f"No se pudo abrir el PDF: {e}"

    if total > OCR_MAX_PAGINAS:
        return [], (f"El PDF tiene {total} páginas y el tope de OCR es {OCR_MAX_PAGINAS}. "
                    "Divídelo en partes y súbelas por separado.")

    client = Anthropic()
    salida = []

    for inicio in range(0, total, OCR_PAGINAS_POR_LOTE):
        fin = min(inicio + OCR_PAGINAS_POR_LOTE, total)
        try:
            writer = PdfWriter()
            for p in reader.pages[inicio:fin]:
                writer.add_page(p)
            buf = io.BytesIO()
            writer.write(buf)
            b64 = base64.b64encode(buf.getvalue()).decode()

            r = client.messages.create(
                model=OCR_MODEL,
                max_tokens=16000,
                messages=[{"role": "user", "content": [
                    {"type": "text", "text": OCR_PROMPT},
                    {"type": "document",
                     "source": {"type": "base64", "media_type": "application/pdf", "data": b64}},
                ]}],
            )
            texto = next((b.text for b in r.content if b.type == "text"), "")

            # Repartir el resultado en sus páginas reales
            partes = re.split(r"===\s*PAGINA\s*(\d+)\s*===", texto)
            if len(partes) > 1:
                for i in range(1, len(partes) - 1, 2):
                    rel = int(partes[i])
                    cuerpo = partes[i + 1].strip()
                    if cuerpo and cuerpo != "(sin texto)":
                        salida.append((inicio + rel, cuerpo))
            elif texto.strip():
                salida.append((inicio + 1, texto.strip()))

            if progreso:
                progreso(fin, total)
        except Exception as e:
            print(f"[WARN] OCR falló en páginas {inicio + 1}-{fin}: {e}")

    if not salida:
        return [], "El OCR no logró extraer texto de ninguna página"
    return salida, None


# ── Embeddings ────────────────────────────────────────────────────────────────

def _lotes_por_tokens(textos: list, max_tokens: int = None, max_batch: int = None):
    """Agrupa por TOKENS, no por número de textos: Voyage limita los tokens totales por
    petición y un lote demasiado grande falla entero. 1 token ≈ 3 caracteres."""
    max_tokens = max_tokens or MAX_TOKENS_BATCH
    max_batch = max_batch or MAX_BATCH
    lote, tokens_lote = [], 0
    for t in textos:
        tks = len(t) // 3 + 1
        if lote and (tokens_lote + tks > max_tokens or len(lote) >= max_batch):
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
    # Cola de pendientes: si hay que degradar el ritmo, se re-agrupan en lotes más chicos
    pendientes = list(textos)
    modo = {"batch": MAX_BATCH, "tokens": MAX_TOKENS_BATCH, "pace": PACE_SECONDS}
    degradado = False
    ultima_peticion = 0.0
    procesados = 0
    total = len(textos)

    while pendientes:
        lote = next(_lotes_por_tokens(pendientes, modo["tokens"], modo["batch"]))
        espera = modo["pace"] - (time.monotonic() - ultima_peticion)
        if ultima_peticion and espera > 0:
            time.sleep(espera)

        vectores = None
        rehacer_lote = False
        for intento in range(4):
            try:
                ultima_peticion = time.monotonic()
                r = vo.embed(lote, model=EMBED_MODEL, input_type=tipo)
                vectores = r.embeddings
                break
            except Exception as e:
                ultimo_error = f"{type(e).__name__}: {e}"
                es_limite = "rate" in str(e).lower() or "429" in str(e)
                if es_limite and not degradado:
                    # La cuenta tiene los límites del plan gratuito: pasar a ritmo
                    # conservador y REHACER este lote, ya partido en trozos más chicos.
                    modo = dict(CONSERVADOR)
                    degradado = True
                    rehacer_lote = True
                    print("[KB] límite de tasa detectado → ritmo conservador "
                          "(3 peticiones/min). Más lento, pero termina.")
                    time.sleep(65)
                    break
                pausa = 65 if es_limite else 3 * (intento + 1)
                print(f"[WARN] embeddings ({len(lote)} textos), intento {intento + 1}/4: "
                      f"{e} — esperando {pausa}s")
                if intento < 3:
                    time.sleep(pausa)

        if rehacer_lote:
            continue          # no consume pendientes: se reintenta con lotes más chicos

        salida.extend(vectores if vectores is not None else [None] * len(lote))
        del pendientes[:len(lote)]
        procesados += len(lote)
        if procesados % 100 < len(lote):
            print(f"[KB] embeddings: {procesados}/{total} fragmentos")

    validos = sum(1 for v in salida if v is not None)
    if validos == 0:
        return salida, (ultimo_error or "Voyage no devolvió ningún embedding")
    return salida, None


import concurrent.futures as _futures
# Pool a NIVEL DE MÓDULO: el timeout debe ser no-bloqueante. Con un `with ThreadPoolExecutor`,
# al salir se hace shutdown(wait=True) y se espera al hilo colgado — eso anula el timeout.
_QUERY_POOL = _futures.ThreadPoolExecutor(max_workers=3)


def embed_consulta(texto: str, timeout_s: float = 8.0):
    """Embedding de una consulta para búsqueda en la biblioteca.

    Va en la RUTA CRÍTICA del diagnóstico, así que es una llamada ÚNICA y ACOTADA por timeout:
    NO usa la lógica de reintentos/degradación de embed_textos (que puede dormir minutos y está
    pensada para indexar libros). Si Voyage tarda o falla, devuelve None y el sistema sigue sin
    biblioteca — nunca cuelga el análisis. El hilo rezagado termina solo por su cuenta.
    """
    if not texto or not embeddings_disponibles():
        return None

    def _call():
        import voyageai
        # Cliente acotado para consultas: sin reintentos y con timeout de red, para que el
        # hilo no quede vivo indefinidamente si Voyage no responde.
        try:
            vo = voyageai.Client(max_retries=0, timeout=10)
        except TypeError:
            vo = _client()  # por si esta versión del SDK no acepta esos parámetros
        r = vo.embed([texto[:1400]], model=EMBED_MODEL, input_type="query")
        return r.embeddings[0]

    fut = _QUERY_POOL.submit(_call)
    try:
        return fut.result(timeout=timeout_s)
    except Exception as e:
        fut.cancel()
        print(f"[WARN] embed_consulta abortada (timeout/fallo, no bloquea el análisis): {e}")
        return None


# ── Formato para el prompt ────────────────────────────────────────────────────

def consultar_biblioteca(consulta: str, area: str = None, match_count: int = 6) -> str:
    """Busca en la biblioteca del médico y devuelve el bloque listo para inyectar al prompt.
    Punto único usado por chat, diagnósticos y protocolos. Devuelve "" si no hay biblioteca
    configurada o no hay coincidencias — el sistema sigue igual sin ella.

    area: 'functional' | 'longevity' | 'traditional' → filtra a esa voz + lo 'general'.
          None → busca en TODA la biblioteca (para el chat, que no tiene una voz fija).
    """
    from db import search_kb  # import local para evitar ciclo de importación
    if not embeddings_disponibles():
        return ""
    consulta = (consulta or "").strip()
    if len(consulta) < 15:
        return ""
    try:
        vector = embed_consulta(consulta[:1400])
        if not vector:
            return ""
        fragmentos = search_kb(vector, match_count=match_count, area=area)
        return formatear_fragmentos(fragmentos)
    except Exception as e:
        print(f"[WARN] consulta a la biblioteca falló: {e}")
        return ""


def consultar_peptidos(consulta: str, match_count: int = 12) -> str:
    """Consulta SOLO los libros de péptidos y devuelve el bloque listo para el prompt del
    agente experto en péptidos. Umbral de similitud más bajo (0.25) y más fragmentos, porque
    la consulta es sobre indicaciones/mecanismos de péptidos, no sobre el caso completo."""
    from db import search_kb_peptidos  # import local para evitar ciclo
    if not embeddings_disponibles():
        return ""
    consulta = (consulta or "").strip()
    if len(consulta) < 10:
        return ""
    try:
        vector = embed_consulta(consulta[:1400])
        if not vector:
            return ""
        fragmentos = search_kb_peptidos(vector, match_count=match_count)
        if not fragmentos:
            return ""
        bloque = formatear_fragmentos(fragmentos)
        # Reetiqueta el encabezado para que quede claro que son los libros de péptidos.
        return bloque.replace(
            "══ BIBLIOTECA CLÍNICA DEL MÉDICO (fragmentos relevantes de sus propios libros y guías) ══",
            "══ LITERATURA DE PÉPTIDOS (fragmentos de los libros/manuales de péptidos de la biblioteca — cítalos) ══",
        )
    except Exception as e:
        print(f"[WARN] consulta de péptidos falló: {e}")
        return ""


def formatear_fragmentos(fragmentos: list) -> str:
    """Arma el bloque que se inyecta al prompt, con la fuente de cada fragmento para citar.
    Mismo encuadre anti-anclaje que el vademécum: es material de consulta, no un guion."""
    if not fragmentos:
        return ""
    partes = []
    hay_notas = False
    for f in fragmentos:
        es_nota = (f.get("tipo") == "notas")
        fuente = f.get("titulo") or "Fuente"
        if f.get("autor"):
            fuente += f" — {f['autor']}"
        if f.get("pagina"):
            fuente += f", pág. {f['pagina']}"
        if es_nota:
            # Nota de investigación del médico generada con IA: NO es literatura publicada.
            # Se marca para que el modelo no la cite como si fuera una fuente autorizada.
            hay_notas = True
            fuente = f"NOTA IA (no verificada) — {fuente}"
        partes.append(f"[{fuente}]\n{f.get('contenido', '').strip()}")

    aviso_notas = ""
    if hay_notas:
        aviso_notas = (
            "\n\nATENCIÓN — FRAGMENTOS MARCADOS COMO \"NOTA IA (no verificada)\": son notas de "
            "investigación que el propio médico generó con ayuda de IA, NO literatura publicada ni "
            "guías validadas. Trátalos como una pista o hipótesis, nunca como evidencia sólida. Si "
            "los usas, dilo explícitamente (\"según tus notas de investigación, que conviene "
            "verificar…\") y NO les des el mismo peso que a un libro o guía real. Prioriza siempre "
            "las fuentes publicadas por encima de estas notas."
        )

    return (
        "══ BIBLIOTECA CLÍNICA DEL MÉDICO (fragmentos relevantes de sus propios libros y guías) ══\n"
        "Estos extractos vienen de la biblioteca que el médico cargó al sistema. Úsalos para "
        "fundamentar tus recomendaciones y CÍTALOS por su título y autor cuando los uses.\n\n"
        + "\n\n---\n\n".join(partes)
        + "\n\nCÓMO USARLOS: son material de consulta, no un guion a seguir. Si un fragmento no "
          "aplica a este paciente, ignóralo. Si tu conocimiento médico contradice un fragmento, "
          "dilo con transparencia en vez de repetirlo. No inventes citas ni páginas que no estén "
          "aquí arriba."
        + aviso_notas
    )
