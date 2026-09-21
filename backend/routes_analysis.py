"""
Análisis clínico — flujo secuencial con input del médico entre cada paso.
El médico es el jefe. La IA propone, el médico decide.
Cada paso recibe la versión CONFIRMADA por el médico del paso anterior.
"""

from fastapi import APIRouter, HTTPException, Depends, Header, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import json, re, time, base64, io, os
from anthropic import Anthropic
from db import (
    insert_analysis, get_analysis, update_analysis, get_visit, update_visit, get_patient,
    insert_ai_call_log, list_ai_call_logs, list_patient_visits, list_patient_analyses,
    find_medications, find_upgrades_for,
    save_doctor_preference, get_doctor_preferences, deactivate_doctor_preference,
    log_prescriptions, get_prescription_stats,
    get_vademecum_by_voice, get_clinical_baselines, search_kb,
    get_doctor_profile,
)
from services.knowledge_base import (
    embed_consulta, embeddings_disponibles, formatear_fragmentos,
    consultar_biblioteca as _kb_consultar,
)

from services.system_prompt import (
    get_traditional_diagnosis_prompt,
    get_functional_medicine_prompt,
    get_longevity_diagnosis_prompt,
    get_protocol_prompt,
    get_protocol_validation_prompt,
    get_secondary_validation_prompt,
    get_functional_clarifying_questions_prompt,
    get_longevity_clarifying_questions_prompt,
    get_lean_draft_prompt,
    build_patient_context,
    build_visit_context,
)

router = APIRouter(prefix="/analyze", tags=["analysis"])
client = Anthropic()

# ── DeepSeek para los 3 pasos de diagnóstico caros (opcional, con fallback a Opus) ──
# Si NO existe DEEPSEEK_API_KEY, todo funciona idéntico a hoy (Opus). Si existe, los pasos
# de diagnóstico marcados con diagnostic=True usan DeepSeek (compatible con la API de Anthropic).
DEEPSEEK_API_KEY  = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/anthropic")
DEEPSEEK_MODEL    = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
_deepseek_client = None

def _get_deepseek_client():
    global _deepseek_client
    if _deepseek_client is None and DEEPSEEK_API_KEY:
        # 180s: los diagnósticos funcional/longevidad con thinking + contexto grande pueden
        # tardar bastante ANTES del primer token; 60s se quedaba corto y cortaba el stream.
        _deepseek_client = Anthropic(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL, timeout=180)
    return _deepseek_client

def get_diagnostic_client_and_model():
    """(client, model, is_deepseek) para los 3 pasos de diagnóstico caros.
    Con DEEPSEEK_API_KEY → DeepSeek; sin ella → Opus (idéntico a hoy)."""
    ds = _get_deepseek_client()
    return (ds, DEEPSEEK_MODEL, True) if ds else (client, MODEL_DIAGNOSE, False)

# Modelos por tarea (costo vs calidad) — estrategia tiered para controlar $ y latencia.
MODEL_DIAGNOSE  = "claude-opus-4-8"    # diagnóstico final — máxima profundidad de razonamiento (calidad crítica)
MODEL_PROTOCOL  = "claude-sonnet-4-6"  # protocolos/tratamiento — Sonnet: buena calidad, mucho más barato y rápido
MODEL_EXTRACT   = "claude-sonnet-4-6"  # transcripción de estudios — no necesita Opus
MODEL_DRAFT     = "claude-sonnet-4-6"  # borrador ligero — tarea estructuralmente simple, prioriza velocidad
MODEL_VALIDATE  = "claude-haiku-4-5"
MODEL_CHAT      = "claude-haiku-4-5"
# Tope de búsquedas web por llamada (cuando esté habilitada).
WEB_SEARCH_MAX_USES = 3
# Búsqueda web DESACTIVADA: era la causa de que el protocolo tardara 8 min y de que el MISMO caso
# diera recomendaciones distintas cada vez (resultados de internet variables). El conocimiento
# propio del modelo es extenso y consistente. Se reemplazará por un RAG sobre PDFs médicos fijos.
ENABLE_WEB_SEARCH = False

# Dominios oficiales permitidos para la herramienta de búsqueda web — todas fuentes
# gratuitas, sin licencia, mantenidas por agencias/organismos reconocidos. Nada de
# foros, blogs ni sitios de opinión.
ALLOWED_MEDICAL_DOMAINS = [
    "pubmed.ncbi.nlm.nih.gov",   # PubMed/NCBI — literatura revisada por pares
    "ncbi.nlm.nih.gov",
    "dailymed.nlm.nih.gov",      # DailyMed (FDA/NLM) — etiquetas oficiales de medicamentos
    "rxnav.nlm.nih.gov",         # RxNorm/RxNav (NLM) — normalización de medicamentos, interacciones
    "fda.gov",                  # FDA — aprobaciones, alertas, retiros
    "cdc.gov",                  # CDC — guías de salud pública y prevención
    "who.int",                  # OMS — guías internacionales
    "nice.org.uk",              # NICE (Reino Unido) — guías clínicas basadas en evidencia
    "medlineplus.gov",          # MedlinePlus (NLM) — información clínica de enfermedades
]

# Fuentes oficiales mexicanas — SOLO para medicina tradicional (diagnóstico + protocolo).
# Funcional y longevidad NO las usan: casi no hay guías/regulación mexicana para esos
# enfoques, así que agregar estos dominios ahí solo diluiría la búsqueda sin aportar nada.
ALLOWED_MEXICO_MEDICAL_DOMAINS = [
    "cofepris.gob.mx",       # COFEPRIS — medicamentos registrados/autorizados en México, alertas sanitarias
    "gob.mx",                # gob.mx/salud, gob.mx/cofepris, etc. — Secretaría de Salud y organismos federales
    "dof.gob.mx",            # Diario Oficial de la Federación — NOMs (Normas Oficiales Mexicanas), reglamentos
    "imss.gob.mx",           # IMSS — guías y catálogos del instituto
    "cenetec-difusion.com",  # CENETEC — Guías de Práctica Clínica México (catálogo maestro IMSS/Salud)
]

# Herramienta de búsqueda web server-side de Claude, restringida a dominios oficiales —
# Anthropic ejecuta la búsqueda, no requiere loop de tool-use del lado nuestro.
# "global": fuentes internacionales — usa esta para funcional y longevidad.
# "mx": internacionales + mexicanas — SOLO para medicina tradicional (diagnóstico y protocolo),
# porque ahí es donde importa si un medicamento existe en México, con qué nombre, y bajo qué
# regulación de COFEPRIS — algo que las guías internacionales no cubren.
WEB_SEARCH_TOOLS = {
    "global": {
        "type": "web_search_20260209",
        "name": "web_search",
        "allowed_domains": ALLOWED_MEDICAL_DOMAINS,
        "max_uses": WEB_SEARCH_MAX_USES,
    },
    "mx": {
        "type": "web_search_20260209",
        "name": "web_search",
        "allowed_domains": ALLOWED_MEDICAL_DOMAINS + ALLOWED_MEXICO_MEDICAL_DOMAINS,
        "max_uses": WEB_SEARCH_MAX_USES,
    },
}

# Validación secundaria (chequeo de alucinaciones/seguridad) — desactivada temporalmente
# durante pruebas para acelerar el flujo. Reactivar antes de producción.
ENABLE_SECONDARY_VALIDATION = False

# ── VOZ DE CONCIENCIA (crítico que reta al generador antes de entregar al médico) ──
# Un segundo LLM audita el protocolo con 5 preguntas y, si tiene objeciones, el generador
# corrige. Máximo 1 ronda de corrección para no disparar tiempo/costo.
ENABLE_CONSCIENCE = True
CONSCIENCE_MAX_ROUNDS = 1


async def get_doctor_id(authorization: Optional[str] = Header(None)) -> str:
    # Usa la sesión REAL (antes estaba hardcodeado a un doctor fijo — bypass de auth
    # y de multi-tenant). get_actor exige token válido (401) y resuelve la clínica.
    from auth import get_actor
    return get_actor(authorization)["doctor_id"]


class FunctionalRequest(BaseModel):
    doctor_traditional: str = ""
    ai_traditional_original: str = ""
    protocol_traditional: str = ""
    doctor_answers: str = ""            # Q&A del interrogatorio funcional (esta etapa)
    prior_qa: str = ""                  # Q&A dirigido de la etapa convencional (encadenado)
    patient_id: str = ""


class LongevityRequest(BaseModel):
    doctor_traditional: str = ""
    doctor_functional: str = ""
    ai_traditional_original: str = ""
    ai_functional_original: str = ""
    protocol_traditional: str = ""
    protocol_functional: str = ""
    doctor_answers: str = ""            # Q&A del interrogatorio de longevidad (esta etapa)
    prior_qa: str = ""                  # Q&A dirigido de convencional + funcional (encadenado)
    patient_id: str = ""


class ProtocolRequest(BaseModel):
    protocol_type: str
    doctor_traditional: str = ""
    doctor_functional: str = ""
    doctor_longevity: str = ""
    ai_traditional_original: str = ""
    ai_functional_original: str = ""
    ai_longevity_original: str = ""


class CloseRequest(BaseModel):
    doctor_traditional: str = ""
    doctor_functional: str = ""
    doctor_longevity: str = ""
    protocol_traditional: str = ""
    protocol_functional: str = ""
    protocol_longevity: str = ""


class ChatRequest(BaseModel):
    question: str
    current_diagnosis: str


class ClarifyRequest(BaseModel):
    patient_data: dict = {}
    selected_type: str = "traditional"


class FinalizeFirstRequest(BaseModel):
    doctor_answers: str = ""


class ClarifyFunctionalRequest(BaseModel):
    doctor_traditional: str = ""
    doctor_functional: str = ""          # dx funcional (para la ronda de longevidad)
    patient_id: str = ""
    previous: Optional[list] = None      # [{"q","a"}] acumulado de rondas previas de ESTA etapa
    prior_qa: str = ""                   # Q&A dirigido de etapas ANTERIORES (encadenado)
    es_ultima_ronda: bool = True         # si la ronda a generar es la última permitida


def _fmt_previous_qa(previous) -> str:
    """Convierte [{q,a}] de la ronda anterior en texto para el prompt de 2ª ronda."""
    if not previous or not isinstance(previous, list):
        return ""
    lineas = []
    for item in previous:
        if isinstance(item, dict):
            q = (item.get("q") or "").strip()
            a = (item.get("a") or "").strip()
            if q:
                lineas.append(f"- P: {q}\n  R: {a or '(sin respuesta)'}")
    return "\n".join(lineas)


def _all_visits(patient_id: str) -> list:
    """Visitas del paciente enriquecidas con el análisis (dx + tratamiento/estudios) de cada una,
    para que el contexto de historial pueda dar SEGUIMIENTO real (qué se indicó antes) y no
    tratar cada visita como la primera. El análisis de cada visita queda en v['_analysis']."""
    if not patient_id:
        return []
    visits = list_patient_visits(patient_id) or []
    try:
        analyses = list_patient_analyses(patient_id) or []
        by_visit = {a.get("visit_id"): a for a in analyses if a.get("visit_id")}
        for v in visits:
            a = by_visit.get(v.get("id"))
            if a:
                v["_analysis"] = a
    except Exception as e:
        print(f"[WARN _all_visits analyses] {e}")
    return visits


def _kb_query_desde_caso(patient: dict, visit: dict) -> str:
    """Arma una consulta breve para la biblioteca a partir de los datos clínicos del caso."""
    partes = []
    for k in ("motivo_consulta", "motivo", "padecimiento_actual", "sintomas", "chief_complaint",
              "diagnostico_previo", "antecedentes"):
        v = (visit or {}).get(k) or (patient or {}).get(k)
        if v and isinstance(v, str):
            partes.append(v)
    return " ".join(partes)[:1400]


def _biblioteca_para_diagnostico(diagnosis_type: str, patient: dict, visit: dict, extra_context: str) -> str:
    """Añade al extra_context los fragmentos relevantes de la biblioteca para esta voz."""
    consulta = _kb_query_desde_caso(patient, visit)
    bloque = _kb_consultar(consulta, area=diagnosis_type) if consulta else ""
    if bloque:
        return (extra_context + "\n\n" + bloque) if extra_context else bloque
    return extra_context


def build_diagnosis_prompt(diagnosis_type: str, full_patient: dict, full_visit: dict, extra_context: str = "",
                            all_visits: list = None) -> str:
    """Genera el prompt de diagnóstico correspondiente sin depender de un diagnóstico previo."""
    extra_context = _biblioteca_para_diagnostico(diagnosis_type, full_patient, full_visit, extra_context)
    if diagnosis_type == "functional":
        return get_functional_medicine_prompt(full_patient, "", visit_data=full_visit, extra_context=extra_context, all_visits=all_visits)
    if diagnosis_type == "longevity":
        return get_longevity_diagnosis_prompt(full_patient, "", visit_data=full_visit, extra_context=extra_context, all_visits=all_visits)
    return get_traditional_diagnosis_prompt(full_patient, full_visit, extra_context=extra_context, all_visits=all_visits)


def build_doctor_context(ai_original: str, doctor_version: str, label: str) -> str:
    """Genera texto de contexto explicando qué cambió el médico vs lo que propuso la IA."""
    star_note = ""
    if "⭐ ELEGIDO POR EL MÉDICO" in doctor_version:
        star_note = "\nIMPORTANTE: las líneas marcadas con ⭐ ELEGIDO POR EL MÉDICO son el/los diagnóstico(s) que el médico seleccionó como correcto(s) de la lista — puede no coincidir con el de mayor porcentaje. Usa ESE diagnóstico como base para los siguientes pasos, no el de mayor %."
    if not ai_original or ai_original.strip() == doctor_version.strip():
        return f"\n{label} (aceptado sin cambios por el médico):\n{doctor_version}{star_note}"
    return f"""
{label}:
- Lo que la IA propuso: {ai_original[:600]}{'...' if len(ai_original) > 600 else ''}
- Lo que el MÉDICO confirmó (versión final, puede tener cambios): {doctor_version}
NOTA: Si hay diferencias, el médico tiene razón. Su versión es la verdad clínica para este paciente.{star_note}
"""


def _chat_snippet(history: list, max_turns: int = 6) -> str:
    """Extrae los últimos N turnos del chat para incluir como contexto."""
    if not history:
        return ""
    recent = history[-max_turns * 2:]
    lines = []
    for msg in recent:
        role = "Médico" if msg["role"] == "user" else "IA"
        lines.append(f"  {role}: {msg['content'][:200]}{'...' if len(msg['content']) > 200 else ''}")
    return "\n\nCONVERSACIÓN RECIENTE CON EL MÉDICO:\n" + "\n".join(lines)


def _strip_json_fences(text: str) -> str:
    """Quita ```json ... ``` si el modelo envuelve el JSON en un bloque de código.
    Tolera una respuesta truncada (sin ``` de cierre, p.ej. por max_tokens) quitando
    solo la cerca de apertura en ese caso."""
    t = text.strip()
    m = re.match(r'^```(?:json)?\s*([\s\S]*?)\s*```$', t)
    if m:
        return m.group(1).strip()
    m = re.match(r'^```(?:json)?\s*([\s\S]*)$', t)
    return m.group(1).strip() if m else t


def parse_lean_draft_json(text: str) -> dict:
    """
    Parsea la salida del borrador ligero (razonamiento_breve, hipotesis, preguntas).
    Nunca lanza — si no se puede parsear, regresa una estructura vacía y el flujo
    sigue con 0 preguntas en vez de tumbar el análisis.
    """
    raw = _strip_json_fences(text)
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict) and isinstance(parsed.get("hipotesis"), list):
            return {
                "razonamiento_breve": parsed.get("razonamiento_breve", ""),
                "hipotesis": parsed["hipotesis"],
                "preguntas": parsed.get("preguntas") or [],
            }
    except Exception:
        pass
    return {"razonamiento_breve": "", "hipotesis": [], "preguntas": []}


def render_lean_draft_for_context(draft: dict) -> str:
    """Renderiza el borrador ligero como texto compacto para pasarlo como contexto a la
    pasada final — no es lo que ve el médico, solo insumo para el razonamiento del modelo."""
    lines = []
    if draft.get("razonamiento_breve"):
        lines.append(f"Razonamiento preliminar: {draft['razonamiento_breve']}")
    for h in draft.get("hipotesis", []):
        comp = f" (complicación de: {h['es_complicacion_de']})" if h.get("es_complicacion_de") else ""
        lines.append(f"  • {h.get('nombre','?')} — confianza preliminar {h.get('confianza','?')}%{comp}")
    return "\n".join(lines) if lines else "(sin hipótesis preliminares)"


def parse_protocol_json_safe(text: str) -> dict | None:
    """Confirma que el texto es un JSON de protocolo válido con al menos un item.
    Usado para descartar una validación secundaria que haya devuelto algo no usable."""
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict) and isinstance(parsed.get("items"), list) and len(parsed["items"]) > 0:
            return parsed
    except Exception:
        pass
    return None


# ── Adjuntos multimodales: documentos y fotos que sube el médico ──────────────
# Claude lee PDFs e imágenes de forma nativa (bloques document/image). Convertimos
# los archivos guardados (labs_files, etc.) para que sus HALLAZGOS lleguen al análisis,
# no solo el nombre del archivo.
MAX_ATTACH_B64 = 4_800_000  # ~3.5 MB por archivo ya en base64; corta blobs gigantes
SUPPORTED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}


def _split_data_url(data: str) -> tuple[str, str]:
    """Devuelve (media_type, base64) de un data URL ('data:application/pdf;base64,....')
    o de base64 crudo sin cabecera."""
    if not data or not isinstance(data, str):
        return "", ""
    if data.startswith("data:"):
        try:
            header, b64 = data.split(",", 1)
            media = header[5:].split(";")[0].strip()  # entre 'data:' y ';base64'
            return media, b64
        except ValueError:
            return "", ""
    return "", data  # base64 crudo


def build_file_content_blocks(files) -> tuple[list, list]:
    """Convierte una lista de archivos [{name,type,size,data}] en bloques de contenido
    nativos de Claude (PDF -> document, imagen -> image). Devuelve (blocks, skipped)
    donde skipped son notas de archivos que no se pudieron leer en línea."""
    blocks, skipped = [], []
    if not isinstance(files, list):
        return blocks, skipped
    for f in files:
        if not isinstance(f, dict):
            continue
        name = f.get("name") or "archivo adjunto"
        declared = (f.get("type") or "").lower()
        media, b64 = _split_data_url(f.get("data") or "")
        media = (media or declared).lower()
        if not b64:
            skipped.append(f"{name} (sin datos legibles)")
            continue
        if len(b64) > MAX_ATTACH_B64:
            skipped.append(f"{name} (demasiado grande para leer automáticamente)")
            continue
        if media == "application/pdf" or name.lower().endswith(".pdf"):
            blocks.append({
                "type": "document",
                "title": name,
                "source": {"type": "base64", "media_type": "application/pdf", "data": b64},
            })
        elif media in SUPPORTED_IMAGE_TYPES:
            blocks.append({
                "type": "image",
                "source": {"type": "base64", "media_type": media, "data": b64},
            })
        else:
            skipped.append(f"{name} (formato {media or 'desconocido'} no legible en línea)")
    return blocks, skipped


def _decode_file_bytes(data: str) -> bytes:
    """Decodifica el base64 (data URL o crudo) de un archivo a bytes."""
    _, b64 = _split_data_url(data)
    if not b64:
        return b""
    try:
        return base64.b64decode(b64)
    except Exception:
        return b""


def _docx_to_text(raw: bytes) -> str:
    """Extrae texto (párrafos + tablas) de un .docx. '' si falla o falta la librería."""
    try:
        import docx  # python-docx
    except ImportError:
        return ""
    try:
        doc = docx.Document(io.BytesIO(raw))
        parts = [p.text.strip() for p in doc.paragraphs if p.text and p.text.strip()]
        for table in doc.tables:
            for row in table.rows:
                cells = [c.text.strip() for c in row.cells]
                if any(cells):
                    parts.append(" | ".join(cells))
        return "\n".join(parts).strip()
    except Exception:
        return ""


def _xlsx_to_text(raw: bytes) -> str:
    """Extrae texto (celdas por hoja) de un .xlsx. '' si falla o falta la librería."""
    try:
        import openpyxl
    except ImportError:
        return ""
    try:
        wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        out = []
        for ws in wb.worksheets:
            out.append(f"[Hoja: {ws.title}]")
            for row in ws.iter_rows(values_only=True):
                vals = [str(c) for c in row if c is not None and str(c).strip() != ""]
                if vals:
                    out.append(" | ".join(vals))
        return "\n".join(out).strip()
    except Exception:
        return ""


def extract_text_from_files(files) -> tuple[list, list]:
    """Convierte a texto, en el backend, los archivos que Claude NO lee de forma nativa
    (.docx, .xlsx, .txt, .csv) para no perder su información. Los PDFs e imágenes se saltan
    (esos van como bloques nativos). Devuelve (parts, skipped) con parts=[(nombre, texto)]."""
    parts, skipped = [], []
    if not isinstance(files, list):
        return parts, skipped
    for f in files:
        if not isinstance(f, dict):
            continue
        name = f.get("name") or "archivo"
        low = name.lower()
        media, _ = _split_data_url(f.get("data") or "")
        media = (media or (f.get("type") or "")).lower()
        # PDF e imágenes se procesan nativamente en otro lado — aquí no.
        if media == "application/pdf" or low.endswith(".pdf") or media in SUPPORTED_IMAGE_TYPES:
            continue
        raw = _decode_file_bytes(f.get("data") or "")
        if not raw:
            continue
        text = ""
        if low.endswith(".docx") or "wordprocessingml" in media:
            text = _docx_to_text(raw)
        elif low.endswith(".xlsx") or "spreadsheetml" in media:
            text = _xlsx_to_text(raw)
        elif low.endswith((".txt", ".csv")) or media.startswith("text/"):
            try:
                text = raw.decode("utf-8", errors="replace").strip()
            except Exception:
                text = ""
        else:
            # .doc/.xls antiguos u otros binarios: no soportados aquí
            continue
        if text:
            parts.append((name, text[:20000]))  # corte de tamaño para no inflar el prompt
        else:
            skipped.append(f"{name} (no se pudo extraer texto)")
    return parts, skipped


def _visit_file_blocks(visit: dict) -> list:
    """Bloques de contenido con los documentos/fotos clínicos de la visita, con un
    encabezado que le dice a la IA qué son. [] si no hay nada legible."""
    files = (visit or {}).get("labs_files")
    blocks, skipped = build_file_content_blocks(files)
    if not blocks and not skipped:
        return []
    lead = ("DOCUMENTOS ADJUNTOS POR EL MÉDICO (resultados de laboratorio, estudios de "
            "imagen o fotos clínicas que se subieron para esta visita — LÉELOS y cruza sus "
            "hallazgos con el resto del expediente; son parte integral del caso, no un anexo "
            "decorativo):")
    if skipped:
        lead += ("\nArchivos que no se pudieron leer automáticamente (menciónalos como "
                 "pendientes de revisión manual solo si serían relevantes): " + "; ".join(skipped))
    if not blocks:
        return [{"type": "text", "text": lead}]
    return [{"type": "text", "text": lead}] + blocks


# ── Entitlements de IA: gate por servicio contratado + conteo de créditos ─────
def _clinic_from_doctor(doctor_id: str):
    if not doctor_id:
        return None
    try:
        p = get_doctor_profile(doctor_id) or {}
        return p.get("clinic_id") or doctor_id
    except Exception:
        return doctor_id


_VISIT_CLINIC_CACHE: dict = {}
def _clinic_from_visit(visit_id: str):
    if not visit_id:
        return None
    if visit_id in _VISIT_CLINIC_CACHE:
        return _VISIT_CLINIC_CACHE[visit_id]
    c = None
    try:
        from db import supabase
        v = supabase.table("visits").select("doctor_id").eq("id", visit_id).limit(1).execute().data
        did = v[0].get("doctor_id") if v else None
        c = _clinic_from_doctor(did) if did else None
    except Exception:
        c = None
    _VISIT_CLINIC_CACHE[visit_id] = c
    return c


def _gate_ai(doctor_id: str, feature: str = None):
    """Bloquea si el servicio de IA no está contratado o no quedan créditos."""
    from services.plans import require_ai
    require_ai(_clinic_from_doctor(doctor_id), feature)


def _consume_ai(visit_id: str, input_tokens: int, output_tokens: int, step: str = "",
                model: str = "", clinic: str = None):
    total = int(input_tokens or 0) + int(output_tokens or 0)
    if not total:
        return
    try:
        from services.plans import consume_credits
        from services.usage import log_event
        if clinic is None:
            clinic = _clinic_from_visit(visit_id)
        consume_credits(clinic, total)   # los créditos se siguen midiendo por el total
        log_event(None, clinic, "doctor", f"ia.{step or 'call'}", "IA clínica",
                  ai_tokens=total, input_tokens=int(input_tokens or 0),
                  output_tokens=int(output_tokens or 0), model=model, visit_id=visit_id)
    except Exception:
        pass


def _usage_split(obj) -> tuple:
    """(input_tokens, output_tokens) de una respuesta o mensaje final de Anthropic."""
    u = getattr(obj, "usage", None)
    if not u:
        return 0, 0
    return (getattr(u, "input_tokens", 0) or 0), (getattr(u, "output_tokens", 0) or 0)


def _safe_update_analysis(visit_id: str, data: dict):
    """Guarda en `analyses` sin tumbar el flujo. El guardado del resultado clínico NUNCA
    debe depender de que el post-proceso (validación, parseo, conciencia) tenga éxito."""
    try:
        update_analysis(visit_id, {**data, "updated_at": datetime.utcnow().isoformat()})
    except Exception as e:
        print(f"[WARN] no se pudo persistir en analyses ({list(data)[:2]}): {e}")


def _has_binary_blocks(attachments) -> bool:
    """True si hay adjuntos que requieren VISIÓN (imágenes/PDF). DeepSeek es solo texto,
    así que no se le pueden enrutar tareas con este tipo de adjuntos."""
    if not attachments:
        return False
    for b in attachments:
        if isinstance(b, dict) and b.get("type") in ("image", "document"):
            return True
    return False


def call_claude(prompt: str, system: str = "", model: str = MODEL_DIAGNOSE, max_tokens: int = 2000,
                 visit_id: str = "", step: str = "", thinking: bool = False, web_search: str = "",
                 attachments: list = None, temperature: float = None, diagnostic: bool = False,
                 fallback_model: str = None, cheap: bool = False) -> str:
    """web_search: "" (sin búsqueda), "global" (fuentes internacionales) o "mx"
    (internacionales + mexicanas — solo medicina tradicional).
    diagnostic=True: rutea a DeepSeek si hay API key (si no, usa `model`). DeepSeek no soporta
    web_search server-side de Anthropic → se desactiva en esa ruta. Si DeepSeek falla, hace
    fallback ÚNICO a `fallback_model` (o MODEL_DIAGNOSE) recuperando el web_search original.
    cheap=True: tareas auxiliares de SOLO TEXTO (aclaración, validación, borrador, chat) — rutea a
    DeepSeek para ahorrar, con fallback a `model`. Si hay adjuntos binarios (visión), NO rutea a
    DeepSeek y usa `model` tal cual, porque DeepSeek no puede leer imágenes/PDF."""
    if not ENABLE_WEB_SEARCH:
        web_search = ""
    cli, used_model, is_ds = (client, model, False)
    web_search_original = web_search
    # Modelo Anthropic de respaldo según el tipo de tarea.
    _default_fb = MODEL_DIAGNOSE if diagnostic else (fallback_model or model)
    # cheap NO se rutea a DeepSeek si trae adjuntos que requieren visión.
    route_ds = diagnostic or (cheap and not _has_binary_blocks(attachments))
    if route_ds:
        ds = _get_deepseek_client()
        if ds:
            cli, used_model, is_ds = ds, DEEPSEEK_MODEL, True
            web_search = ""   # DeepSeek no tiene la web_search server-side de Anthropic
        else:
            # Sin key de DeepSeek: usar el modelo base correcto (Sonnet/Haiku/Opus según la tarea).
            used_model = fallback_model or _default_fb
    content = [{"type": "text", "text": prompt}] + attachments if attachments else prompt

    def _build_kwargs(mdl: str, ws: str) -> dict:
        kw = {
            "model": mdl,
            "max_tokens": max(max_tokens, 12000) if thinking else max_tokens,
            "messages": [{"role": "user", "content": content}],
        }
        if system:
            kw["system"] = system
        if thinking:
            kw["thinking"] = {"type": "adaptive"}
        elif temperature is not None:
            kw["temperature"] = temperature   # temperature no es compatible con thinking
        if ws:
            kw["tools"] = [WEB_SEARCH_TOOLS[ws]]
        return kw

    start = time.monotonic()
    try:
        response = cli.messages.create(**_build_kwargs(used_model, web_search))
    except Exception as e:
        if not (route_ds and is_ds):
            raise
        # Fallback ÚNICO a Anthropic (fallback_model o el modelo base de la tarea), recuperando web_search.
        used_model = fallback_model or _default_fb
        print(f"[FALLBACK] DeepSeek falló en '{step}' ({e}); reintento con {used_model}")
        response = client.messages.create(**_build_kwargs(used_model, web_search_original))
    # Con thinking activado, el primer bloque de contenido es el razonamiento, no la
    # respuesta — hay que buscar el primer bloque de tipo "text". Con web_search puede
    # haber bloques server_tool_use/web_search_tool_result antes del texto también.
    text = next((b.text for b in response.content if b.type == "text"), "")
    in_tok, out_tok = _usage_split(response)
    clinic = _clinic_from_visit(visit_id) if visit_id else None
    _consume_ai(visit_id, in_tok, out_tok, step, used_model, clinic)   # loguea el modelo REAL usado
    if visit_id:
        latency_ms = int((time.monotonic() - start) * 1000)
        try:
            insert_ai_call_log({
                "visit_id": visit_id,
                "step": step,
                "model": used_model,
                "prompt": prompt,
                "response": text,
                "input_tokens": in_tok,
                "output_tokens": out_tok,
                "clinic_id": clinic,
                "latency_ms": latency_ms,
                "created_at": datetime.utcnow().isoformat(),
            })
        except HTTPException:
            raise
        except Exception as e:
            # El logging nunca debe tumbar el flujo de diagnóstico
            print(f"[WARN] no se pudo guardar ai_call_log ({step}): {e}")
    return text


def call_claude_stream(prompt: str, model: str = MODEL_DIAGNOSE, max_tokens: int = 2000,
                        visit_id: str = "", step: str = "", thinking: bool = False, web_search: str = "",
                        attachments: list = None, temperature: float = None, diagnostic: bool = False,
                        fallback_model: str = None):
    """
    Igual que call_claude, pero yield-ea el texto de la respuesta en deltas conforme
    llegan (para mostrarlo en vivo al médico en vez de una espera ciega). text_stream
    ya filtra los deltas de thinking — solo entrega texto de la respuesta final.
    Al agotarse el generador, ya se guardó el log en ai_call_logs con el texto completo.
    web_search: "" / "global" / "mx" — ver call_claude().
    diagnostic=True: DeepSeek si hay API key (si no, Opus). DeepSeek no soporta web_search;
    fallback ÚNICO a Opus SOLO si falla ANTES de emitir el primer delta (ya emitido no se reinicia).
    """
    if not ENABLE_WEB_SEARCH:
        web_search = ""
    cli, used_model, is_ds = (client, model, False)
    web_search_original = web_search
    if diagnostic:
        ds = _get_deepseek_client()
        if ds:
            cli, used_model, is_ds = ds, DEEPSEEK_MODEL, True
            web_search = ""   # DeepSeek no tiene la web_search server-side de Anthropic
        else:
            used_model = fallback_model or MODEL_DIAGNOSE
    content = [{"type": "text", "text": prompt}] + attachments if attachments else prompt

    def _build_kwargs(mdl: str, ws: str) -> dict:
        # DeepSeek NO usa 'thinking' en streaming: el "pensar" genera un gap silencioso (sin
        # texto al frontend) que un proxy puede cortar por inactividad. Sin thinking empieza a
        # emitir texto de inmediato. Se mantiene el max_tokens alto para no truncar. El fallback
        # a Opus SÍ usa thinking (mejor razonamiento). El presupuesto de tokens no cambia.
        use_thinking = thinking and (mdl != DEEPSEEK_MODEL)
        kw = {
            "model": mdl,
            "max_tokens": max(max_tokens, 12000) if thinking else max_tokens,
            "messages": [{"role": "user", "content": content}],
        }
        if use_thinking:
            kw["thinking"] = {"type": "adaptive"}
        elif temperature is not None:
            kw["temperature"] = temperature   # temperature no es compatible con thinking
        if ws:
            kw["tools"] = [WEB_SEARCH_TOOLS[ws]]
        return kw

    def _open_stream(a_client, kw):
        # Algunas versiones del SDK no aceptan 'temperature' en el helper messages.stream().
        try:
            return a_client.messages.stream(**kw)
        except TypeError as e:
            if "temperature" in str(e) and "temperature" in kw:
                kw.pop("temperature", None)
                return a_client.messages.stream(**kw)
            raise

    start = time.monotonic()
    chunks = []
    in_tok = out_tok = 0
    used_model_final = used_model

    def _stream_deltas(a_client, mdl, ws):
        """Abre el stream y produce deltas; al terminar setea tokens y el modelo usado."""
        nonlocal in_tok, out_tok, used_model_final
        with _open_stream(a_client, _build_kwargs(mdl, ws)) as stream:
            for delta in stream.text_stream:
                yield delta
            try:
                in_tok, out_tok = _usage_split(stream.get_final_message())
            except Exception:
                in_tok, out_tok = 0, 0
            used_model_final = mdl

    primary = _stream_deltas(cli, used_model, web_search)
    try:
        for delta in primary:
            chunks.append(delta)
            yield delta
    except Exception as e:
        # Fallback a Opus SOLO si aún no emitimos nada (si ya hubo deltas, no se reinicia).
        if diagnostic and is_ds and not chunks:
            _fb = fallback_model or MODEL_DIAGNOSE
            print(f"[FALLBACK] DeepSeek falló en stream '{step}' ({e}); reintento con {_fb}")
            for delta in _stream_deltas(client, _fb, web_search_original):
                chunks.append(delta)
                yield delta
        else:
            raise
    try:
        _consume_ai(visit_id, in_tok, out_tok, step, used_model_final)
    except Exception:
        pass
    text = "".join(chunks)
    if visit_id:
        latency_ms = int((time.monotonic() - start) * 1000)
        clinic = _clinic_from_visit(visit_id)
        try:
            insert_ai_call_log({
                "visit_id": visit_id,
                "step": step,
                "model": used_model_final,
                "prompt": prompt,
                "response": text,
                "input_tokens": in_tok,
                "output_tokens": out_tok,
                "clinic_id": clinic,
                "latency_ms": latency_ms,
                "created_at": datetime.utcnow().isoformat(),
            })
        except HTTPException:
            raise
        except Exception as e:
            print(f"[WARN] no se pudo guardar ai_call_log ({step}): {e}")


def maybe_validate(prompt_text: str, visit_id: str = "", step: str = "") -> str:
    """Corre la validación secundaria (chequeo de alucinaciones) solo si está activada."""
    if not ENABLE_SECONDARY_VALIDATION:
        return ""
    return call_claude(prompt_text, model=MODEL_VALIDATE, max_tokens=800, visit_id=visit_id, step=step, cheap=True)


# ── Extracción de estudios: leer el PDF/foto UNA vez, guardar los datos, soltar el binario ──
LABS_EXTRACTION_PROMPT = """Eres un asistente clínico transcribiendo estudios de laboratorio y de gabinete.
Adjunto van uno o más documentos/fotos (resultados de laboratorio, estudios de imagen, reportes).

TU TAREA: TRANSCRIBIR fielmente TODOS los datos, no interpretarlos ni diagnosticar (eso lo hará otro médico después).
- Extrae CADA parámetro con: nombre del analito, resultado, unidades y rango de referencia (si aparece).
- Marca con (↑) o (↓) los valores fuera de rango cuando el propio documento lo indique o sea evidente por el rango.
- Anota el tipo de estudio, la fecha del estudio y el laboratorio/institución si son visibles.
- Para estudios de imagen o reportes narrativos, transcribe los hallazgos y la conclusión textual.
- Si un valor está ilegible o dudoso, escríbelo como "[ilegible]" — nunca inventes un número.
- NO agregues diagnóstico, interpretación clínica ni recomendaciones. Solo los datos.

FORMATO: texto claro y estructurado, agrupado por estudio. Encabeza cada estudio con su nombre y fecha.
Sé completo pero sin relleno. Si no hay ningún dato legible, responde exactamente: SIN DATOS LEGIBLES."""


def extract_labs_data(visit: dict, visit_id: str = "") -> str:
    """Lee los archivos adjuntos de la visita y devuelve una transcripción estructurada de
    sus valores. PDF/imagen van nativos a la IA; .docx/.xlsx/.txt se convierten a texto en
    el backend y se anexan al prompt. Devuelve "" si no hay nada legible."""
    files = (visit or {}).get("labs_files")
    blocks, skipped_native = build_file_content_blocks(files)   # PDF/imagen
    text_parts, skipped_text = extract_text_from_files(files)   # .docx/.xlsx/.txt/.csv
    if not blocks and not text_parts:
        return ""
    prompt = LABS_EXTRACTION_PROMPT
    if text_parts:
        joined = "\n\n".join(f"--- {n} ---\n{t}" for n, t in text_parts)
        prompt += ("\n\nADEMÁS, aquí va el texto YA EXTRAÍDO de otros archivos adjuntos "
                   "(transcríbelo y normalízalo igual que los documentos anexos):\n" + joined)
    # Solo repórtale como "no legibles" los que NINGÚN camino pudo manejar (dedup por nombre).
    handled = {n for n, _ in text_parts}
    truly_skipped = {}
    for s in skipped_native + skipped_text:
        nm = s.split(" (")[0]
        if nm not in handled and nm not in truly_skipped:
            truly_skipped[nm] = s
    if truly_skipped:
        prompt += "\n\n(Archivos que no se pudieron leer, ignóralos: " + "; ".join(truly_skipped.values()) + ")"
    text = call_claude(prompt, model=MODEL_EXTRACT, max_tokens=8000,
                       visit_id=visit_id, step="extract_labs", attachments=blocks)
    text = (text or "").strip()
    if not text or text.upper().startswith("SIN DATOS LEGIBLES"):
        return ""
    return text


def _labs_need_extraction(visit: dict) -> bool:
    """True si hay archivos con binario aún sin transcribir."""
    if not visit or visit.get("labs_extracted"):
        return False
    files = visit.get("labs_files") or []
    return any(isinstance(f, dict) and f.get("data") for f in files)


def _ensure_labs_extracted(visit_id: str, visit: dict) -> dict:
    """Extrae los datos de los estudios adjuntos UNA vez, los persiste en labs_extracted
    y SUELTA el binario (data) para ahorrar espacio. Idempotente: si ya se extrajo, no
    hace nada. Si la extracción falla, deja el binario intacto (los adjuntos siguen como
    fallback). Devuelve el visit (posiblemente actualizado) para usarlo en esta misma corrida."""
    if not _labs_need_extraction(visit):
        return visit
    try:
        text = extract_labs_data(visit, visit_id=visit_id)
    except HTTPException:
        raise
    except Exception as e:
        print(f"[WARN] extracción de estudios falló ({visit_id}): {e}")
        return visit
    if not text:
        return visit  # nada legible — conserva el binario por si acaso
    # Conserva solo metadatos del archivo (para la ficha), suelta el binario pesado.
    stripped = []
    for f in (visit.get("labs_files") or []):
        if isinstance(f, dict):
            meta = {k: f.get(k) for k in ("name", "type", "size") if f.get(k) is not None}
            meta["extracted"] = True
            stripped.append(meta)
    updated = {**visit, "labs_extracted": text, "labs_files": stripped}
    try:
        update_visit(visit_id, {"labs_extracted": text, "labs_files": stripped})
    except HTTPException:
        raise
    except Exception as e:
        print(f"[WARN] no se pudo persistir labs_extracted ({visit_id}): {e}")
    return updated


def extract_structured_header(raw_text: str) -> tuple[dict, str]:
    """
    Extrae el JSON de la primera línea y retorna (metadata, resto_del_texto).
    metadata = {"confidence": int}
    """
    metadata = {"confidence": 75}
    text = raw_text.strip()
    # Buscar la primera línea que sea JSON válido
    first_line_end = text.find('\n')
    if first_line_end > 0:
        first_line = text[:first_line_end].strip()
        try:
            parsed = json.loads(first_line)
            if "confidence" in parsed:
                metadata["confidence"] = int(parsed.get("confidence", 75))
                return metadata, text[first_line_end:].strip()
        except Exception:
            pass
    # También buscar JSON inline con regex
    m = re.search(r'\{[^}]*"confidence"\s*:\s*\d+[^}]*\}', text)
    if m:
        try:
            parsed = json.loads(m.group())
            metadata["confidence"] = int(parsed.get("confidence", 75))
            cleaned = text[:m.start()].strip() + "\n" + text[m.end():].strip()
            return metadata, cleaned.strip()
        except Exception:
            pass
    return metadata, text


class PreferenceRequest(BaseModel):
    tipo: str = "sustituir"      # sustituir | preferir | evitar | agregar_siempre
    cuando: str = ""             # contexto donde aplica
    de_item: str = ""
    a_item: str = ""
    nota: str = ""
    origen: str = "chat"


class PracticeLogRequest(BaseModel):
    protocol_type: str = ""
    diagnostico_contexto: str = ""
    ai_protocol: str = ""        # lo que propuso la IA
    doctor_protocol: str = ""    # lo que el médico dejó tras editar/aceptar


@router.get("/preferences/list")
async def list_preferences(doctor_id: str = Depends(get_doctor_id)):
    """Preferencias activas del médico (para mostrarlas y poder desactivarlas)."""
    return {"preferences": get_doctor_preferences(doctor_id)}


@router.post("/preferences")
async def create_preference(body: PreferenceRequest, doctor_id: str = Depends(get_doctor_id)):
    """Guarda una preferencia que el médico pidió recordar para casos futuros."""
    pref = {
        "doctor_id": doctor_id,
        "tipo": body.tipo,
        "cuando": body.cuando or None,
        "de_item": body.de_item or None,
        "a_item": body.a_item or None,
        "nota": body.nota or None,
        "origen": body.origen or "chat",
    }
    saved = save_doctor_preference(pref)
    if not saved:
        raise HTTPException(500, "No se pudo guardar la preferencia")
    return {"ok": True, "preference": saved}


@router.delete("/preferences/{pref_id}")
async def delete_preference(pref_id: str, doctor_id: str = Depends(get_doctor_id)):
    """Desactiva una preferencia (el médico cambió de opinión)."""
    return {"ok": deactivate_doctor_preference(pref_id)}


def _age_range(patient: dict) -> str:
    """Rango de edad (no la fecha) — clínicamente útil sin identificar al paciente."""
    dob = (patient or {}).get("date_of_birth") or (patient or {}).get("birth_date")
    if not dob:
        return ""
    try:
        from datetime import date as _d
        born = _d.fromisoformat(str(dob)[:10])
        age = (_d.today() - born).days // 365
        low = (age // 10) * 10
        return f"{low}-{low+9}"
    except Exception:
        return ""


@router.post("/{visit_id}/log_practice")
async def log_practice(visit_id: str, body: PracticeLogRequest,
                       doctor_id: str = Depends(get_doctor_id)):
    """Registra qué aceptó, agregó o quitó el médico respecto de lo que propuso la IA.
    PRIVACIDAD: no se guarda ningún identificador del paciente — solo el contexto clínico
    y el tratamiento, más demografía gruesa (sexo y rango de edad)."""
    ai_items = {}
    for it in (parse_protocol_json_safe(body.ai_protocol) or {}).get("items", []):
        if isinstance(it, dict) and it.get("nombre_generico"):
            ai_items[it["nombre_generico"].strip().lower()] = it
    doc_items = {}
    for it in (parse_protocol_json_safe(body.doctor_protocol) or {}).get("items", []):
        if isinstance(it, dict) and it.get("nombre_generico"):
            doc_items[it["nombre_generico"].strip().lower()] = it

    if not ai_items and not doc_items:
        return {"ok": True, "registrados": 0}

    analysis = get_analysis(visit_id) or {}
    patient_id = analysis.get("patient_id")
    patient = get_patient(patient_id) if patient_id else {}
    sexo = (patient or {}).get("sexo_biologico") or (patient or {}).get("sex") or ""
    rango = _age_range(patient)

    def row(item: dict, accion: str) -> dict:
        return {
            "doctor_id": doctor_id,
            "visit_id": visit_id,
            "protocolo_tipo": body.protocol_type or None,
            "diagnostico_contexto": (body.diagnostico_contexto or "")[:400] or None,
            "item_nombre": item.get("nombre_generico"),
            "item_tipo": item.get("tipo"),
            "accion": accion,
            "sexo": sexo or None,
            "rango_edad": rango or None,
        }

    rows = []
    for k, it in doc_items.items():
        rows.append(row(it, "aceptado_ia" if k in ai_items else "agregado_doctor"))
    for k, it in ai_items.items():
        if k not in doc_items:
            rows.append(row(it, "eliminado_doctor"))

    return {"ok": True, "registrados": log_prescriptions(rows)}


@router.post("/{visit_id}/extract_labs")
async def trigger_extract_labs(
    visit_id: str,
    background_tasks: BackgroundTasks,
    doctor_id: str = Depends(get_doctor_id),
):
    """Dispara la extracción de estudios (PDF/foto/docx→texto) en SEGUNDO PLANO.
    El frontend lo llama al dejar la sección de estudios, para que la transcripción ya
    esté lista (cacheada en labs_extracted) cuando el médico llegue al análisis, en vez
    de esperar ~15s en la primera corrida. Retorna al instante; es idempotente."""
    _gate_ai(doctor_id, "ia_estudios")
    def _job():
        try:
            visit = get_visit(visit_id) or {}
            _ensure_labs_extracted(visit_id, visit)
        except HTTPException:
            raise
        except Exception as e:
            print(f"[WARN] extract_labs en segundo plano falló ({visit_id}): {e}")
    background_tasks.add_task(_job)
    return {"status": "scheduled", "visit_id": visit_id}


@router.post("/{visit_id}/clarify")
async def get_clarifying_questions(
    visit_id: str,
    body: ClarifyRequest,
    doctor_id: str = Depends(get_doctor_id),
):
    """
    Borrador LIGERO (hipótesis preliminares + preguntas ya filtradas por valor de
    información) en UNA sola llamada — no genera explicación completa, fuentes ni
    estudios, eso solo pasa en /finalize_first. El borrador ligero se guarda para
    usarse como contexto en /finalize_first, que siempre corre la pasada completa
    (con o sin respuestas del médico) para que lo que ve el médico nunca sea el
    borrador incompleto.
    """
    try:
        visit_record = get_visit(visit_id) or {}
        visit_record = _ensure_labs_extracted(visit_id, visit_record)
        patient_id = body.patient_data.get("patient_id") or visit_record.get("patient_id", "")
        patient_record = get_patient(patient_id) if patient_id else {}

        full_patient = {**body.patient_data, **patient_record}
        full_visit = visit_record
        all_visits = _all_visits(patient_id)
        diagnosis_type = body.selected_type if body.selected_type in ("traditional", "functional", "longevity") else "traditional"

        if not get_analysis(visit_id):
            insert_analysis({
                "id": f"analysis_{visit_id}",
                "visit_id": visit_id,
                "patient_id": patient_id,
                "doctor_id": doctor_id,
                "status": "in_progress",
                "chat_history": [],
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            })

        # Borrador ligero: hipótesis preliminares + preguntas con criterio de valor de
        # información, en una sola llamada rápida. Solo soporta "traditional" por ahora
        # (funcional/longevidad tienen su propio flujo de aclaración, sin cambios).
        draft_prompt = get_lean_draft_prompt(full_patient, full_visit, all_visits=all_visits)
        raw_draft = call_claude(draft_prompt, model=MODEL_DRAFT, visit_id=visit_id, step=f"draft_{diagnosis_type}",
                                attachments=_visit_file_blocks(full_visit), cheap=True)
        lean_draft = parse_lean_draft_json(raw_draft)

        hipotesis = lean_draft["hipotesis"]
        draft_confidence = hipotesis[0].get("confianza", 75) if hipotesis else 75
        draft_context = render_lean_draft_for_context(lean_draft)

        update_analysis(visit_id, {
            "draft_diagnosis": draft_context,
            "draft_confidence": draft_confidence,
            "draft_validation": "",
            "draft_type": diagnosis_type,
            "updated_at": datetime.utcnow().isoformat(),
        })

        # Convencional: UNA sola ronda; tantas preguntas como necesite, tope estricto 10.
        questions = [q["pregunta"] for q in lean_draft["preguntas"] if q.get("pregunta")][:10]

        return {"visit_id": visit_id, "questions": questions}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR clarify] {str(e)}")
        # No bloquear el flujo si falla
        return {"visit_id": visit_id, "questions": []}


def _build_finalize_first_prompt(visit_id: str, body: FinalizeFirstRequest) -> tuple[str, str, list]:
    """Arma el prompt completo de finalize_first. Devuelve (prompt, draft_type, attachments).
    Lanza HTTPException si no hay análisis/borrador. Compartido entre la ruta normal
    y la de streaming para no duplicar la lógica de armado del prompt."""
    analysis = get_analysis(visit_id)
    if not analysis:
        raise HTTPException(404, "Análisis no encontrado")

    draft_diagnosis = analysis.get("draft_diagnosis") or ""
    draft_type = analysis.get("draft_type") or "traditional"

    if not draft_diagnosis:
        raise HTTPException(404, "No hay un borrador de diagnóstico para esta visita")

    doctor_answers = (body.doctor_answers or "").strip()

    visit_record = get_visit(visit_id) or {}
    visit_record = _ensure_labs_extracted(visit_id, visit_record)
    patient_id = analysis.get("patient_id")
    patient_data = get_patient(patient_id) if patient_id else {}
    all_visits = _all_visits(patient_id)

    respuestas_block = (
        f"""
RESPUESTAS DEL MÉDICO A LAS PREGUNTAS DE ACLARACIÓN:
{doctor_answers}
"""
        if doctor_answers else
        "\nEl médico no agregó respuestas adicionales — procede con la información disponible.\n"
    )

    extra_context = f"""
HIPÓTESIS PRELIMINARES DE TU PROPIO BORRADOR RÁPIDO (razonamiento previo, no lo repitas tal cual —
úsalo como punto de partida y complétalo con la explicación, fuentes y estudios que le faltan):
{draft_diagnosis}
{respuestas_block}
INSTRUCCIÓN: Genera ahora el diagnóstico COMPLETO (con explicación, fuentes y estudios sugeridos).
Si las respuestas del médico NO cambian el diagnóstico de forma material, mantén el mismo ranking
y porcentajes de certeza de tu borrador. Si SÍ cambian algo, ajusta el diagnóstico y/o los
porcentajes en consecuencia.
"""

    prompt = build_diagnosis_prompt(draft_type, patient_data, visit_record, extra_context=extra_context, all_visits=all_visits)
    return prompt, draft_type, _visit_file_blocks(visit_record)


def _search_scope_for(diagnosis_type: str) -> str:
    """Fuentes mexicanas (COFEPRIS, CENETEC, etc.) solo aplican a medicina tradicional —
    para funcional/longevidad casi no hay guías ni regulación mexicana relevante."""
    return "mx" if diagnosis_type == "traditional" else "global"


@router.post("/{visit_id}/finalize_first/stream")
async def finalize_first_diagnosis_stream(
    visit_id: str,
    body: FinalizeFirstRequest,
    doctor_id: str = Depends(get_doctor_id),
):
    """
    Misma lógica que /finalize_first, pero transmite el texto de la respuesta en vivo
    vía Server-Sent Events, para que el médico vea el diagnóstico apareciendo en pantalla
    en vez de una pantalla de carga ciega durante ~30-45s.
    """
    prompt, draft_type, attachments = _build_finalize_first_prompt(visit_id, body)

    def event_stream():
        chunks = []
        try:
            for delta in call_claude_stream(prompt, diagnostic=True, visit_id=visit_id,
                                             step=f"finalize_{draft_type}", thinking=True,
                                             web_search=_search_scope_for(draft_type),
                                             attachments=attachments):
                chunks.append(delta)
                yield f"data: {json.dumps({'type': 'delta', 'text': delta})}\n\n"
            raw = "".join(chunks)
            try:
                metadata, diagnosis = extract_structured_header(raw)
                conf = metadata.get("confidence", 0)
            except Exception:
                diagnosis, conf = raw, 0
            # Persistir YA el diagnóstico (antes de validar), a prueba de fallos: el reporte
            # depende de esto y no debe perderse aunque el post-proceso falle.
            _safe_update_analysis(visit_id, {f"diagnosis_{draft_type}": diagnosis})
            validation = maybe_validate(get_secondary_validation_prompt(diagnosis), visit_id=visit_id,
                                         step=f"validate_finalize_{draft_type}")
            final = {
                "type": "done", "visit_id": visit_id, "step": draft_type,
                "diagnosis": diagnosis, "validation": validation,
                "confidence": conf,
            }
            yield f"data: {json.dumps(final)}\n\n"
        except HTTPException:
            raise
        except Exception as e:
            # NUNCA dejar el stream sin cerrar: el frontend se colgaría para siempre.
            print(f"[ERROR finalize_first/stream] {e}")
            raw = "".join(chunks)
            if raw.strip():
                # Ya se generó el diagnóstico; entrégalo aunque el post-proceso haya fallado.
                try:
                    metadata, diagnosis = extract_structured_header(raw)
                    conf = metadata.get("confidence", 0)
                except Exception:
                    diagnosis, conf = raw, 0
                yield f"data: {json.dumps({'type': 'done', 'visit_id': visit_id, 'step': draft_type, 'diagnosis': diagnosis, 'validation': None, 'confidence': conf})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'error', 'message': 'No se pudo generar el diagnóstico. Intenta de nuevo.'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/{visit_id}/finalize_first")
async def finalize_first_diagnosis(
    visit_id: str,
    body: FinalizeFirstRequest,
    doctor_id: str = Depends(get_doctor_id),
):
    """
    Cierra el ciclo de la primera pregunta/respuesta del médico. El borrador que se guardó
    en /clarify es LIGERO (hipótesis preliminares, sin explicación/fuentes/estudios) — por
    eso esta pasada SIEMPRE corre completa, con o sin respuestas del médico, para que lo que
    ve el médico sea siempre el diagnóstico completo, nunca el borrador incompleto.

    Se mantiene como fallback no-streaming (ej. si el navegador no soporta SSE bien).
    """
    try:
        prompt, draft_type, attachments = _build_finalize_first_prompt(visit_id, body)
        raw = call_claude(prompt, diagnostic=True, visit_id=visit_id, step=f"finalize_{draft_type}", thinking=True,
                          web_search=_search_scope_for(draft_type), attachments=attachments)
        metadata, diagnosis = extract_structured_header(raw)

        validation = maybe_validate(get_secondary_validation_prompt(diagnosis), visit_id=visit_id, step=f"validate_finalize_{draft_type}")

        return {
            "visit_id": visit_id,
            "step": draft_type,
            "diagnosis": diagnosis,
            "validation": validation,
            "confidence": metadata["confidence"],
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR finalize_first] {str(e)}")
        raise HTTPException(500, str(e))


@router.post("/{visit_id}/traditional")
async def run_traditional(
    visit_id: str,
    patient_data: dict,
    doctor_id: str = Depends(get_doctor_id),
):
    """Genera el diagnóstico de medicina tradicional."""
    try:
        # Extraer respuestas del médico a preguntas de aclaración (si las hay)
        doctor_answers = patient_data.pop("_doctor_answers", None)
        extra_context = ""
        if doctor_answers and doctor_answers.strip():
            extra_context = (
                "RESPUESTAS DEL MÉDICO A PREGUNTAS DE ACLARACIÓN "
                "(tómalas en cuenta — son información adicional directa del paciente):\n"
                + doctor_answers
            )

        # Cargar visita y paciente completos desde Supabase
        visit_record = get_visit(visit_id) or {}
        visit_record = _ensure_labs_extracted(visit_id, visit_record)
        patient_id = patient_data.get("patient_id") or visit_record.get("patient_id", "")
        patient_record = get_patient(patient_id) if patient_id else {}

        # Mezclar lo que venga del frontend con lo de Supabase (Supabase tiene precedencia)
        full_patient = {**patient_data, **patient_record}
        full_visit = visit_record
        all_visits = _all_visits(patient_id)

        # Crear registro en Supabase si aún no existe (puede ya existir desde /clarify)
        if not get_analysis(visit_id):
            insert_analysis({
                "id": f"analysis_{visit_id}",
                "visit_id": visit_id,
                "patient_id": patient_id,
                "doctor_id": doctor_id,
                "status": "in_progress",
                "chat_history": [],
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            })

        extra_context = _biblioteca_para_diagnostico("traditional", full_patient, full_visit, extra_context)
        prompt = get_traditional_diagnosis_prompt(full_patient, full_visit, extra_context=extra_context, all_visits=all_visits)
        raw = call_claude(prompt, diagnostic=True, visit_id=visit_id, step="traditional", thinking=True, web_search="mx",
                          attachments=_visit_file_blocks(full_visit))
        metadata, diagnosis = extract_structured_header(raw)

        validation = maybe_validate(get_secondary_validation_prompt(diagnosis), visit_id=visit_id, step="validate_traditional")

        update_analysis(visit_id, {
            "diagnosis_traditional": diagnosis,
            "validation_traditional": validation,
            "updated_at": datetime.utcnow().isoformat(),
        })

        return {
            "visit_id": visit_id,
            "step": "traditional",
            "diagnosis": diagnosis,
            "validation": validation,
            "confidence": metadata["confidence"],
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] {str(e)}")
        raise HTTPException(500, str(e))


@router.post("/{visit_id}/clarify_functional")
async def get_functional_clarifying_questions(
    visit_id: str,
    body: ClarifyFunctionalRequest,
    doctor_id: str = Depends(get_doctor_id),
):
    """
    Antes de generar el diagnóstico funcional, pregunta hasta 3 cosas puntuales que ayuden
    a ubicar la causa raíz del diagnóstico convencional ya confirmado por el médico.
    """
    import json as json_lib
    try:
        visit_record = get_visit(visit_id) or {}
        visit_record = _ensure_labs_extracted(visit_id, visit_record)
        patient_id = body.patient_id or visit_record.get("patient_id", "")
        patient_record = get_patient(patient_id) if patient_id else {}

        previous_qa = _fmt_previous_qa(body.previous)
        prompt = get_functional_clarifying_questions_prompt(
            patient_record, visit_record, body.doctor_traditional,
            previous_qa=previous_qa, prior_qa=body.prior_qa, es_ultima_ronda=body.es_ultima_ronda,
            all_visits=_all_visits(patient_id))
        # Sin tope artificial: el cuestionario funcional puede ser extenso.
        raw = call_claude(prompt, model=MODEL_CHAT, max_tokens=2500, visit_id=visit_id, step="clarify_functional", cheap=True)

        questions = []
        try:
            m = re.search(r'\{[\s\S]*"questions"[\s\S]*\}', raw)
            if m:
                data = json_lib.loads(m.group())
                questions = [q for q in data.get("questions", []) if q]
        except Exception:
            questions = []

        return {"visit_id": visit_id, "questions": questions}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR clarify_functional] {str(e)}")
        return {"visit_id": visit_id, "questions": []}


@router.post("/{visit_id}/clarify_longevity")
async def get_longevity_clarifying_questions(
    visit_id: str,
    body: ClarifyFunctionalRequest,
    doctor_id: str = Depends(get_doctor_id),
):
    """Cuestionario de longevidad: la IA arma TODAS las preguntas que necesite para el
    análisis de longevidad. Soporta 2ª ronda (body.previous con lo ya preguntado)."""
    _gate_ai(doctor_id, "ia_longevidad")
    import json as json_lib
    try:
        visit_record = get_visit(visit_id) or {}
        visit_record = _ensure_labs_extracted(visit_id, visit_record)
        patient_id = body.patient_id or visit_record.get("patient_id", "")
        patient_record = get_patient(patient_id) if patient_id else {}

        previous_qa = _fmt_previous_qa(body.previous)
        prompt = get_longevity_clarifying_questions_prompt(
            patient_record, visit_record, body.doctor_functional,
            previous_qa=previous_qa, prior_qa=body.prior_qa, es_ultima_ronda=body.es_ultima_ronda,
            all_visits=_all_visits(patient_id))
        raw = call_claude(prompt, model=MODEL_CHAT, max_tokens=2500, visit_id=visit_id, step="clarify_longevity", cheap=True)

        questions = []
        try:
            m = re.search(r'\{[\s\S]*"questions"[\s\S]*\}', raw)
            if m:
                questions = [q for q in json_lib.loads(m.group()).get("questions", []) if q]
        except Exception:
            questions = []
        return {"visit_id": visit_id, "questions": questions}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR clarify_longevity] {str(e)}")
        return {"visit_id": visit_id, "questions": []}


def _ensure_analysis(visit_id: str, patient_id_hint: str, doctor_id: str) -> dict:
    """Devuelve el análisis de la visita, creándolo si aún no existe."""
    analysis = get_analysis(visit_id)
    if analysis:
        return analysis
    visit_record = get_visit(visit_id) or {}
    patient_id = patient_id_hint or visit_record.get("patient_id", "")
    insert_analysis({
        "id": f"analysis_{visit_id}",
        "visit_id": visit_id,
        "patient_id": patient_id,
        "doctor_id": doctor_id,
        "status": "in_progress",
        "chat_history": [],
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })
    return get_analysis(visit_id)


def _build_functional_prompt(visit_id: str, body: FunctionalRequest, doctor_id: str) -> tuple[str, list]:
    """Arma el prompt del diagnóstico funcional. Compartido entre la ruta normal y la de streaming."""
    analysis = _ensure_analysis(visit_id, body.patient_id, doctor_id)
    visit_record = _ensure_labs_extracted(visit_id, get_visit(visit_id) or {})
    patient_id = analysis.get("patient_id")
    patient_data = get_patient(patient_id) if patient_id else {}
    all_visits = _all_visits(patient_id)

    # El interrogatorio funcional ahora lo hace la IA en sus rondas de aclaración (ya no se
    # captura al registro). Si el médico respondió esas preguntas, la entrevista está completa
    # para efectos del diagnóstico (evita el MODO PRELIMINAR heredado del registro).
    if body.doctor_answers and body.doctor_answers.strip():
        patient_data = {**patient_data, "entrevista_funcional_completa": True}

    doctor_context = ""
    if body.doctor_traditional and body.doctor_traditional.strip():
        doctor_context = build_doctor_context(
            body.ai_traditional_original, body.doctor_traditional, "DIAGNÓSTICO TRADICIONAL"
        )
    if body.prior_qa and body.prior_qa.strip():
        doctor_context += (
            "\n\nINTERROGATORIO DIRIGIDO DE LA ETAPA CONVENCIONAL (preguntas que el médico ya le "
            "hizo al paciente y sus respuestas — información en firme, ya la tienes):\n"
            + body.prior_qa
        )
    if body.doctor_answers and body.doctor_answers.strip():
        doctor_context += (
            "\n\nRESPUESTAS DEL MÉDICO A LAS PREGUNTAS DE ACLARACIÓN FUNCIONAL "
            "(tómalas en cuenta — son información adicional directa del paciente):\n"
            + body.doctor_answers
        )
    chat_snippet = _chat_snippet(analysis.get("chat_history", []))
    kb_block = _biblioteca_para_diagnostico("functional", patient_data, visit_record, "")

    prompt = get_functional_medicine_prompt(
        patient_data,
        body.doctor_traditional,
        visit_data=visit_record,
        extra_context=doctor_context + chat_snippet + ("\n\n" + kb_block if kb_block else ""),
        all_visits=all_visits,
        traditional_treatment=body.protocol_traditional,
    )
    return prompt, _visit_file_blocks(visit_record)


@router.post("/{visit_id}/functional/stream")
async def run_functional_stream(
    visit_id: str,
    body: FunctionalRequest,
    doctor_id: str = Depends(get_doctor_id),
):
    """Igual que /functional pero transmite el texto en vivo por SSE, para que el médico
    vea el diagnóstico apareciendo en pantalla en vez de una espera ciega."""
    _gate_ai(doctor_id, "ia_funcional")
    prompt, attachments = _build_functional_prompt(visit_id, body, doctor_id)

    def event_stream():
        chunks = []
        try:
            for delta in call_claude_stream(prompt, diagnostic=True, visit_id=visit_id,
                                             step="functional", thinking=True, web_search="global",
                                             attachments=attachments):
                chunks.append(delta)
                yield f"data: {json.dumps({'type': 'delta', 'text': delta})}\n\n"
            raw = "".join(chunks)
            try:
                metadata, diagnosis = extract_structured_header(raw)
                conf = metadata.get("confidence", 0)
            except Exception:
                diagnosis, conf = raw, 0
            _safe_update_analysis(visit_id, {"diagnosis_functional": diagnosis})
            validation = maybe_validate(get_secondary_validation_prompt(diagnosis),
                                         visit_id=visit_id, step="validate_functional")
            _safe_update_analysis(visit_id, {"validation_functional": validation})
            yield f"data: {json.dumps({'type': 'done', 'visit_id': visit_id, 'step': 'functional', 'diagnosis': diagnosis, 'validation': validation, 'confidence': conf})}\n\n"
        except HTTPException:
            raise
        except Exception as e:
            print(f"[ERROR functional/stream] {e}")
            raw = "".join(chunks)
            if raw.strip():
                try: _m, dx = extract_structured_header(raw); c = _m.get("confidence", 0)
                except Exception: dx, c = raw, 0
                yield f"data: {json.dumps({'type': 'done', 'visit_id': visit_id, 'step': 'functional', 'diagnosis': dx, 'validation': None, 'confidence': c})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'error', 'message': 'No se pudo generar el diagnóstico funcional. Intenta de nuevo.'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/{visit_id}/functional")
async def run_functional(
    visit_id: str,
    body: FunctionalRequest,
    doctor_id: str = Depends(get_doctor_id),
):
    """Genera el diagnóstico funcional. Fallback no-streaming."""
    _gate_ai(doctor_id, "ia_funcional")
    try:
        prompt, attachments = _build_functional_prompt(visit_id, body, doctor_id)
        raw = call_claude(prompt, diagnostic=True, visit_id=visit_id, step="functional",
                          thinking=True, web_search="global", attachments=attachments)
        metadata, diagnosis = extract_structured_header(raw)

        validation = maybe_validate(get_secondary_validation_prompt(diagnosis), visit_id=visit_id, step="validate_functional")

        update_analysis(visit_id, {
            "diagnosis_functional": diagnosis,
            "validation_functional": validation,
            "updated_at": datetime.utcnow().isoformat(),
        })

        return {
            "visit_id": visit_id,
            "step": "functional",
            "diagnosis": diagnosis,
            "validation": validation,
            "confidence": metadata["confidence"],
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] {str(e)}")
        raise HTTPException(500, str(e))


def _build_longevity_prompt(visit_id: str, body: LongevityRequest, doctor_id: str) -> tuple[str, list]:
    """Arma el prompt del diagnóstico de longevidad. Compartido entre ruta normal y streaming."""
    analysis = _ensure_analysis(visit_id, body.patient_id, doctor_id)
    visit_record = _ensure_labs_extracted(visit_id, get_visit(visit_id) or {})
    patient_id = analysis.get("patient_id")
    patient_data = get_patient(patient_id) if patient_id else {}
    all_visits = _all_visits(patient_id)

    # La entrevista de longevidad la hace la IA en sus rondas; si el médico respondió, está
    # completa (evita el MODO PRELIMINAR heredado del registro, que ya no captura esta capa).
    if body.doctor_answers and body.doctor_answers.strip():
        patient_data = {**patient_data, "entrevista_funcional_completa": True}

    ctx_trad = ""
    if body.doctor_traditional and body.doctor_traditional.strip():
        ctx_trad = build_doctor_context(
            body.ai_traditional_original, body.doctor_traditional, "DIAGNÓSTICO TRADICIONAL"
        )
    ctx_func = ""
    if body.doctor_functional and body.doctor_functional.strip():
        ctx_func = build_doctor_context(
            body.ai_functional_original, body.doctor_functional, "DIAGNÓSTICO FUNCIONAL"
        )
    ctx_answers = ""
    if body.prior_qa and body.prior_qa.strip():
        ctx_answers += (
            "\n\nINTERROGATORIO DIRIGIDO DE LAS ETAPAS CONVENCIONAL Y FUNCIONAL (preguntas que el "
            "médico ya le hizo al paciente y sus respuestas — información en firme, ya la tienes):\n"
            + body.prior_qa
        )
    if body.doctor_answers and body.doctor_answers.strip():
        ctx_answers += (
            "\n\nRESPUESTAS DEL MÉDICO A LAS PREGUNTAS DE ACLARACIÓN DE LONGEVIDAD "
            "(tómalas en cuenta — son información adicional directa del paciente):\n"
            + body.doctor_answers
        )
    chat_snippet = _chat_snippet(analysis.get("chat_history", []))
    kb_block = _biblioteca_para_diagnostico("longevity", patient_data, visit_record, "")

    prompt = get_longevity_diagnosis_prompt(
        patient_data,
        body.doctor_functional,
        traditional_diagnosis=body.doctor_traditional,
        visit_data=visit_record,
        extra_context=ctx_trad + ctx_func + ctx_answers + chat_snippet + ("\n\n" + kb_block if kb_block else ""),
        all_visits=all_visits,
        traditional_treatment=body.protocol_traditional,
        functional_treatment=body.protocol_functional,
    )
    return prompt, _visit_file_blocks(visit_record)


@router.post("/{visit_id}/longevity/stream")
async def run_longevity_stream(
    visit_id: str,
    body: LongevityRequest,
    doctor_id: str = Depends(get_doctor_id),
):
    """Igual que /longevity pero transmite el texto en vivo por SSE."""
    _gate_ai(doctor_id, "ia_longevidad")
    prompt, attachments = _build_longevity_prompt(visit_id, body, doctor_id)

    def event_stream():
        chunks = []
        try:
            for delta in call_claude_stream(prompt, diagnostic=True, visit_id=visit_id,
                                             step="longevity", thinking=True, web_search="global",
                                             attachments=attachments):
                chunks.append(delta)
                yield f"data: {json.dumps({'type': 'delta', 'text': delta})}\n\n"
            raw = "".join(chunks)
            try:
                metadata, diagnosis = extract_structured_header(raw)
                conf = metadata.get("confidence", 0)
            except Exception:
                diagnosis, conf = raw, 0
            _safe_update_analysis(visit_id, {"diagnosis_longevity": diagnosis})
            validation = maybe_validate(get_secondary_validation_prompt(diagnosis),
                                         visit_id=visit_id, step="validate_longevity")
            _safe_update_analysis(visit_id, {"validation_longevity": validation})
            yield f"data: {json.dumps({'type': 'done', 'visit_id': visit_id, 'step': 'longevity', 'diagnosis': diagnosis, 'validation': validation, 'confidence': conf})}\n\n"
        except HTTPException:
            raise
        except Exception as e:
            print(f"[ERROR longevity/stream] {e}")
            raw = "".join(chunks)
            if raw.strip():
                try: _m, dx = extract_structured_header(raw); c = _m.get("confidence", 0)
                except Exception: dx, c = raw, 0
                yield f"data: {json.dumps({'type': 'done', 'visit_id': visit_id, 'step': 'longevity', 'diagnosis': dx, 'validation': None, 'confidence': c})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'error', 'message': 'No se pudo generar el diagnóstico de longevidad. Intenta de nuevo.'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/{visit_id}/longevity")
async def run_longevity(
    visit_id: str,
    body: LongevityRequest,
    doctor_id: str = Depends(get_doctor_id),
):
    """Genera el diagnóstico de longevidad. Fallback no-streaming."""
    _gate_ai(doctor_id, "ia_longevidad")
    try:
        prompt, attachments = _build_longevity_prompt(visit_id, body, doctor_id)
        raw = call_claude(prompt, diagnostic=True, visit_id=visit_id, step="longevity",
                          thinking=True, web_search="global", attachments=attachments)
        metadata, diagnosis = extract_structured_header(raw)

        validation = maybe_validate(get_secondary_validation_prompt(diagnosis), visit_id=visit_id, step="validate_longevity")

        update_analysis(visit_id, {
            "diagnosis_longevity": diagnosis,
            "validation_longevity": validation,
            "updated_at": datetime.utcnow().isoformat(),
        })

        return {
            "visit_id": visit_id,
            "step": "longevity",
            "diagnosis": diagnosis,
            "validation": validation,
            "confidence": metadata["confidence"],
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] {str(e)}")
        raise HTTPException(500, str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# VOZ DE CONCIENCIA — el crítico que reta al generador antes de entregar al médico
# ═══════════════════════════════════════════════════════════════════════════════

def _protocol_item_names(protocol_text: str) -> list:
    """Extrae los nombres (genérico + comercial) de los items de un protocolo JSON."""
    data = parse_protocol_json_safe(protocol_text)
    if not data:
        return []
    names = []
    for it in data.get("items", []):
        if isinstance(it, dict):
            for k in ("nombre_generico", "nombre_comercial"):
                v = (it.get(k) or "").strip()
                if v:
                    names.append(v)
    return names


def build_vademecum_context(protocol_text: str) -> str:
    """Consulta el vademécum curado y arma el bloque de referencia para el crítico:
    (a) datos de los fármacos usados, (b) MEJORES VERSIONES disponibles de cada uno.
    Es lo que permite que el crítico responda '¿hay algo mejor?' con un dato duro."""
    names = _protocol_item_names(protocol_text)
    if not names:
        return ""
    upgrades = find_upgrades_for(names)
    known = find_medications(names)

    if not upgrades and not known:
        return ""

    # ENCUADRE ANTI-ANCLAJE: sin esto, el modelo trata el vademécum como un menú del que
    # tiene que escoger (y como es una lista corta, EMPOBRECE la recomendación en vez de
    # mejorarla). Es material de verificación, no un catálogo de opciones.
    blocks = [
        "══ VADEMÉCUM DE REFERENCIA (material de VERIFICACIÓN, NO es un menú) ══\n"
        "CÓMO USAR ESTE BLOQUE — léelo antes de sacar conclusiones:\n"
        "• Esta lista NO es el universo de opciones disponibles. Es un extracto pequeño y "
        "curado que solo sirve para CONTRASTAR lo que ya se recomendó.\n"
        "• NO conviertas lo que aparece aquí en una instrucción. Que un fármaco figure en "
        "esta lista NO significa que haya que usarlo, ni que sea mejor para ESTE paciente.\n"
        "• Si la mejor opción para este caso NO está en esta lista, esa sigue siendo la mejor "
        "opción. La ausencia aquí no es un argumento en contra de nada.\n"
        "• NUNCA objetes un item correcto solo porque el vademécum menciona una alternativa. "
        "Un cambio solo se justifica si es mejor PARA ESTE PACIENTE, con su cuadro, sus "
        "comorbilidades, su severidad y su tratamiento actual."
    ]

    if upgrades:
        lines = []
        for u in upgrades:
            lines.append(
                f"• Para «{u.get('upgrade_de')}» existe documentada la alternativa "
                f"«{u.get('nombre_generico')}» (evidencia: {u.get('nivel_evidencia')}, "
                f"COFEPRIS: {u.get('cofepris')}). {u.get('nota_upgrade') or ''}"
            )
        blocks.append(
            "ALTERNATIVAS DOCUMENTADAS PARA LO QUE YA SE RECOMENDÓ (candidatas a EVALUAR, "
            "no cambios a aplicar):\n" + "\n".join(lines)
            + "\nEVALÚA cada una contra ESTE paciente antes de opinar: ¿le aporta algo real?, "
            "¿está disponible?, ¿su nivel de evidencia y aprobación es mejor o peor que lo "
            "actual?, ¿alguna contraindicación del caso lo impide? Si tras evaluarlo lo "
            "actual sigue siendo lo correcto, NO lo objetes."
        )

    if known:
        lines = []
        for m in known:
            bits = [f"«{m.get('nombre_generico')}»"]
            if m.get("dosis_tipica"):
                bits.append(f"dosis típica: {m['dosis_tipica']}")
            if m.get("contraindicaciones"):
                bits.append(f"contraindicaciones: {m['contraindicaciones']}")
            if m.get("interacciones"):
                bits.append(f"interacciones: {m['interacciones']}")
            if m.get("cofepris"):
                bits.append(f"COFEPRIS: {m['cofepris']}")
            if m.get("notas"):
                bits.append(f"nota: {m['notas']}")
            lines.append("• " + " — ".join(bits))
        blocks.append(
            "FICHAS DE LOS ITEMS QUE EL PROTOCOLO YA USA (para verificar dosis, "
            "contraindicaciones e interacciones — no para sustituirlos):\n" + "\n".join(lines)
        )
    return "\n\n".join(blocks)


CONSCIENCE_SYSTEM = """Eres la VOZ DE CONCIENCIA de un sistema clínico: un médico revisor senior, escéptico y exigente. Tu trabajo NO es aprobar por cortesía — es RETAR el protocolo que otro colega acaba de proponer, para que lo que llegue al médico tratante sea lo mejor posible.

Respondes SIEMPRE con JSON válido, sin texto adicional.

LAS 6 PREGUNTAS QUE DEBES CONTESTAR SOBRE EL PROTOCOLO:
1. ¿ES LA MEJOR VERSIÓN? ¿Existe hoy una opción superior a la que se está recomendando? (ej. semaglutida cuando existe tirzepatida; vitamina D3 sola cuando D3+K2 es mejor; melatonina inmediata cuando el paciente tiene insomnio de mantenimiento). Si el vademécum de abajo señala una mejor versión, es objeción — SALVO que apliques el filtro de la regla A de abajo.
2. ¿SE CONSIDERARON ALTERNATIVAS? ¿Hay otra opción razonable que no se evaluó y que podría ser mejor para ESTE paciente?
3. ¿ES PROPORCIONAL A LA SEVERIDAD? ¿La intensidad de la intervención corresponde a la gravedad real del hallazgo? No mandar un cañonazo cuando basta un balazo: si el hallazgo es leve, aislado o aún no confirmado (ej. UNA sola lectura de presión elevada), lo correcto suele ser la opción más ligera, una medida no farmacológica, o diferir el inicio hasta confirmar. Objeta el sobretratamiento igual que el subtratamiento.
4. ¿SE RESPETÓ LA ESCALERA DE APROBACIÓN? Nunca saltar de algo 100% aprobado a algo experimental/mercado gris sin agotar los escalones intermedios (aprobado local → aprobado en otros países → off-label con evidencia sólida → experimental).
5. ¿HAY INTERACCIONES O DUPLICIDAD INTERNA? ¿Dos items del mismo protocolo chocan entre sí o hacen lo mismo?
6. ¿HAY REDUNDANCIA O CONFLICTO CON LO YA ACEPTADO? ¿Algún item duplica el MECANISMO de algo que el médico ya aceptó en un paso anterior (no solo el mismo nombre — el mismo mecanismo), o interactúa mal con eso?

REGLAS DE JUICIO:
A. NO propongas un "upgrade" que esté PEOR posicionado que lo actual en disponibilidad o evidencia. Si lo que ya se recomienda está aprobado por COFEPRIS y tiene evidencia alta, y la alternativa del vademécum aparece como "desconocido"/"no_aprobado" o con evidencia solo moderada/preliminar, entonces lo actual ES la elección correcta: NO lo objetes. Solo vale la pena mencionar la alternativa emergente si el caso lo justifica clínicamente de forma clara.
A2. EL VADEMÉCUM ES REFERENCIA, NO UN MENÚ. Es una lista corta y parcial: NO es el universo de opciones. Nunca objetes un item correcto solo porque el vademécum menciona una alternativa, y nunca empujes a usar algo únicamente porque aparece ahí. Tu conocimiento médico completo sigue mandando; el vademécum solo aporta datos duros para contrastar. Si la mejor opción para el paciente no figura en la lista, eso no la descalifica en absoluto.
B. El costo NUNCA es argumento para bajar de opción. Si algo es mejor pero caro, se recomienda igual y se ofrece la sustitución como alternativa (con justificación médica, no económica).
C. Sé PARSIMONIOSO: si el protocolo apila varios items sobre el mismo eje, objétalo. El paciente no debe terminar con 15 pastillas.
D. No objetes por objetar: si el protocolo está bien, apruébalo. Una objeción sin fundamento clínico concreto es ruido que le cuesta tiempo al médico.
E. Máximo 3 objeciones, las de mayor impacto clínico real.

FORMATO DE SALIDA (JSON estricto, nada más):
{"veredicto":"aprobado"}
  — o —
{"veredicto":"objeciones","objeciones":[{"item":"nombre del item afectado","problema":"qué está mal, en 1-2 líneas","accion":"qué hacer concretamente (reemplazar por X / eliminar / ajustar dosis a Y / agregar Z)"}]}"""


def run_conscience_review(protocol_text: str, protocol_type: str, previous_protocols: dict,
                          visit_id: str = "") -> list:
    """Corre el crítico sobre el protocolo. Devuelve la lista de objeciones ([] si aprueba)."""
    vademecum = build_vademecum_context(protocol_text)

    prev_lines = []
    for k, v in (previous_protocols or {}).items():
        if v and str(v).strip():
            labels = {"traditional": "CONVENCIONAL", "functional": "FUNCIONAL", "longevity": "LONGEVIDAD"}
            prev_lines.append(f"--- Protocolo {labels.get(k, k.upper())} YA ACEPTADO por el médico ---\n{v}")
    prev_block = "\n\n".join(prev_lines) if prev_lines else "(ninguno todavía)"

    # Pregunta obligada de péptidos, con la lista que le toca a cada voz. Fuerza a CONSIDERARLOS
    # sin forzar a usarlos ("si es que aplican").
    peptidos_q = ""
    if protocol_type in ("functional", "longevity"):
        exp = get_vademecum_by_voice(protocol_type, seccion="experimental")
        nombres = ", ".join(r.get("nombre_generico", "") for r in exp if r.get("nombre_generico"))
        if nombres:
            ambito = ("la causa raíz y los síntomas actuales del paciente"
                      if protocol_type == "functional" else
                      "el healthspan y el envejecimiento del paciente")
            peptidos_q = (
                f"\n\nPREGUNTA OBLIGADA — PÉPTIDOS Y TERAPIAS AVANZADAS ({protocol_type}):\n"
                f"De esta lista, ¿alguno podría ser benéfico para {ambito}, SI ES QUE APLICA?\n"
                f"  {nombres}\n"
                "Contesta con honestidad: si ninguno aporta a este caso concreto, no fuerces "
                "ninguno — es una respuesta perfectamente válida y preferible a recomendar por "
                "recomendar. Si alguno SÍ aplica con claridad, levántalo como objeción de tipo "
                "'falta considerar X', recordando que estos compuestos NO se recetan desde el "
                "sistema: se mencionan como información para que el médico decida por su cuenta."
            )

    prompt = f"""PROTOCOLO A REVISAR (tipo: {protocol_type}):
{protocol_text}{peptidos_q}

TRATAMIENTOS YA ACEPTADOS POR EL MÉDICO EN PASOS ANTERIORES (revisa redundancia de MECANISMO e interacciones contra esto):
{prev_block}

{vademecum if vademecum else "(sin coincidencias en el vademécum para estos items)"}

Contesta las 5 preguntas y responde SOLO con el JSON del veredicto."""

    raw = call_claude(prompt, system=CONSCIENCE_SYSTEM, model=MODEL_VALIDATE, max_tokens=1500,
                      visit_id=visit_id, step=f"conscience_{protocol_type}", temperature=0.2, cheap=True)
    try:
        cleaned = _strip_json_fences(raw)
        start = cleaned.find("{")
        if start < 0:
            return []
        verdict = json.loads(cleaned[start:])
        if (verdict.get("veredicto") or "").lower() == "objeciones":
            objs = verdict.get("objeciones") or []
            return [o for o in objs if isinstance(o, dict) and o.get("problema")]
        return []
    except HTTPException:
        raise
    except Exception as e:
        print(f"[WARN] veredicto del crítico ilegible ({protocol_type}): {e}")
        return []


def apply_conscience_objections(protocol_text: str, objeciones: list, protocol_type: str,
                                visit_id: str = "") -> str:
    """El generador corrige el protocolo según las objeciones del crítico. Usa el mismo
    formato de PATCH del chat (solo los items que cambian) para que sea rápido y barato."""
    if not objeciones:
        return protocol_text
    obj_text = "\n".join(
        f"{i+1}. [{o.get('item','(general)')}] {o.get('problema','')} → ACCIÓN: {o.get('accion','')}"
        for i, o in enumerate(objeciones)
    )
    vademecum = build_vademecum_context(protocol_text)

    system = """Eres el médico que propuso este protocolo. Un colega revisor senior lo auditó y levantó objeciones fundamentadas. Corrige el protocolo aplicando las objeciones que sean clínicamente correctas.

Responde con un PATCH mínimo (solo lo que cambia) entre estas marcas exactas:
<<<PATCH>>>
{"ops":[ ... ]}
<<<FIN_PATCH>>>

Operaciones disponibles:
  {"op":"replace_item","match":"texto que identifica el item actual","item":{...item nuevo COMPLETO con todos sus campos...}}
  {"op":"add_item","item":{...item completo...}}
  {"op":"remove_item","match":"texto que identifica el item"}
  {"op":"update_monitoreo","field":"labs_control","value":"..."}

REGLAS:
- Al reemplazar un item incluye TODOS sus campos (tipo, nombre_generico, nombre_comercial, nivel_evidencia, alerta, presentacion, dosis, via, frecuencia, duracion, indicacion, ajuste_especial, monitoreo, reacciones_adversas, interacciones, mecanismo, cofepris, para_que_sirve), en estilo telegráfico (una línea por campo).
- Si una objeción NO es clínicamente correcta, ignórala (no todas hay que aceptarlas). Defender una decisión bien fundamentada es tan válido como corregirla.
- EL VADEMÉCUM ES REFERENCIA, NO UN MENÚ: no cambies un item por otro solo porque aparece en esa lista. Cambia únicamente si es mejor PARA ESTE PACIENTE en concreto.
- Si ninguna objeción procede, responde exactamente: SIN CAMBIOS"""

    prompt = f"""PROTOCOLO ACTUAL:
{protocol_text}

OBJECIONES DEL REVISOR:
{obj_text}

{vademecum}

Emite el PATCH con las correcciones que procedan."""

    raw = call_claude(prompt, system=system, model=MODEL_PROTOCOL, max_tokens=6000,
                      visit_id=visit_id, step=f"conscience_fix_{protocol_type}", temperature=0.3, cheap=True)
    m = re.search(r"<<<PATCH>>>\s*(\{.*?\})\s*<<<FIN_PATCH>>>", raw or "", re.DOTALL)
    if not m:
        return protocol_text
    try:
        patch = json.loads(m.group(1))
        new_text, summary = apply_chat_patch(protocol_text, patch)
        if summary:
            print(f"[CONCIENCIA] {protocol_type}: {summary}")
            return new_text
    except HTTPException:
        raise
    except Exception as e:
        print(f"[WARN] patch de conciencia inválido ({protocol_type}): {e}")
    return protocol_text


def deliberate_protocol(protocol_text: str, protocol_type: str, previous_protocols: dict,
                        visit_id: str = "") -> tuple[str, list]:
    """Ciclo generador ↔ crítico. Devuelve (protocolo_final, objeciones_no_resueltas).
    Si el crítico aprueba de entrada, no cuesta más que una llamada barata de Haiku."""
    if not ENABLE_CONSCIENCE:
        return protocol_text, []
    current = protocol_text
    for _ in range(CONSCIENCE_MAX_ROUNDS):
        objeciones = run_conscience_review(current, protocol_type, previous_protocols, visit_id=visit_id)
        if not objeciones:
            return current, []
        fixed = apply_conscience_objections(current, objeciones, protocol_type, visit_id=visit_id)
        if fixed == current:
            # El generador no aceptó las objeciones: se entrega igual, pero se reportan
            # al médico como banderas para que él decida.
            return current, objeciones
        current = fixed
    return current, []


def consultar_biblioteca(diagnosis: str, protocol_type: str, extra: str = "") -> str:
    """Busca en la biblioteca los fragmentos relevantes para este caso, filtrando por la voz.
    Envoltura fina sobre el helper compartido del servicio."""
    return _kb_consultar(f"{diagnosis[:900]} {extra[:400]}", area=protocol_type)


def _build_protocol_prompt(visit_id: str, body: ProtocolRequest) -> tuple[str, dict, list]:
    """Arma el prompt completo de protocolo. Devuelve (prompt, previous_protocols, attachments).
    Compartido entre la ruta normal y la de streaming."""
    analysis = get_analysis(visit_id)
    if not analysis:
        raise HTTPException(404, "Análisis no encontrado")

    visit_record = get_visit(visit_id) or {}
    visit_record = _ensure_labs_extracted(visit_id, visit_record)
    patient_id = analysis.get("patient_id")
    patient_data = get_patient(patient_id) if patient_id else {}
    all_visits = _all_visits(patient_id)

    # El sistema se adapta al médico: sus preferencias explícitas y su patrón real de
    # práctica entran al prompt con prioridad sobre el default de la IA.
    doctor_id = analysis.get("doctor_id") or ""
    doctor_prefs = get_doctor_preferences(doctor_id)
    practice_stats = get_prescription_stats(doctor_id)

    diagnosis_map = {
        "traditional": body.doctor_traditional,
        "functional":  body.doctor_functional,
        "longevity":   body.doctor_longevity,
    }
    diagnosis = diagnosis_map.get(body.protocol_type, body.doctor_traditional)

    confirmed_lines = []
    if body.doctor_traditional and body.doctor_traditional.strip():
        confirmed_lines.append(f"• Convencional: {body.doctor_traditional}")
    if body.doctor_functional and body.doctor_functional.strip():
        confirmed_lines.append(f"• Funcional: {body.doctor_functional}")
    if body.doctor_longevity and body.doctor_longevity.strip():
        confirmed_lines.append(f"• Longevidad: {body.doctor_longevity}")

    full_diagnosis = diagnosis
    if confirmed_lines:
        full_diagnosis += "\n\nDIAGNÓSTICOS PREVIOS CONFIRMADOS POR EL MÉDICO:\n" + "\n".join(confirmed_lines)

    previous_protocols = {
        "traditional": analysis.get("protocol_traditional") or "",
        "functional":  analysis.get("protocol_functional") or "",
        "longevity":   analysis.get("protocol_longevity") or "",
    }
    previous_protocols.pop(body.protocol_type, None)

    prompt = get_protocol_prompt(
        patient_data, full_diagnosis, body.protocol_type,
        visit_data=visit_record, previous_protocols=previous_protocols,
        all_visits=all_visits,
        doctor_preferences=doctor_prefs, practice_stats=practice_stats,
        arsenal_rows=get_vademecum_by_voice(body.protocol_type),
        baselines=get_clinical_baselines(body.protocol_type),
        biblioteca=consultar_biblioteca(full_diagnosis, body.protocol_type),
    )
    return prompt, previous_protocols, _visit_file_blocks(visit_record)


@router.post("/{visit_id}/protocol/stream")
async def run_protocol_stream(
    visit_id: str,
    body: ProtocolRequest,
    doctor_id: str = Depends(get_doctor_id),
):
    """
    Misma lógica que /protocol, pero transmite el texto en vivo vía SSE — este es el
    paso más lento del sistema (~90s+ con Opus + thinking generando 9+ items detallados),
    así que es el que más se beneficia de que el médico vea que algo está pasando.
    """
    prompt, previous_protocols, attachments = _build_protocol_prompt(visit_id, body)

    def event_stream():
        chunks = []
        try:
            for delta in call_claude_stream(prompt, diagnostic=True, fallback_model=MODEL_PROTOCOL,
                                             max_tokens=14000, visit_id=visit_id,
                                             step=f"protocol_{body.protocol_type}", thinking=False,
                                             web_search=_search_scope_for(body.protocol_type),
                                             attachments=attachments, temperature=0.4):
                chunks.append(delta)
                yield f"data: {json.dumps({'type': 'delta', 'text': delta})}\n\n"
            protocol = _strip_json_fences("".join(chunks))
            # Persistir YA el protocolo base, antes de la segunda opinión/validación: si esas
            # fallan, el protocolo no se pierde y el reporte/receta se puede armar igual.
            _safe_update_analysis(visit_id, {f"protocol_{body.protocol_type}": protocol})

            # Voz de conciencia: el crítico reta el protocolo contra el vademécum y lo ya aceptado.
            yield f"data: {json.dumps({'type': 'status', 'text': 'Revisión de segunda opinión…'})}\n\n"
            protocol, banderas = deliberate_protocol(protocol, body.protocol_type, previous_protocols,
                                                     visit_id=visit_id)

            if ENABLE_SECONDARY_VALIDATION:
                val_prompt = get_protocol_validation_prompt(protocol, previous_protocols)
                validated = call_claude(val_prompt, model=MODEL_VALIDATE, max_tokens=8000, visit_id=visit_id,
                                         step=f"validate_protocol_{body.protocol_type}", cheap=True)
                validated = _strip_json_fences(validated)
                if parse_protocol_json_safe(validated) is not None:
                    protocol = validated

            _safe_update_analysis(visit_id, {f"protocol_{body.protocol_type}": protocol})
            yield f"data: {json.dumps({'type': 'done', 'visit_id': visit_id, 'step': f'protocol_{body.protocol_type}', 'protocol': protocol, 'banderas': banderas})}\n\n"
        except HTTPException:
            raise
        except Exception as e:
            import traceback; traceback.print_exc()
            print(f"[ERROR protocol/stream] {type(e).__name__}: {e}")
            protocol = _strip_json_fences("".join(chunks))
            if protocol.strip():
                # Ya se generó el protocolo; entrégalo aunque la segunda opinión/guardado fallen.
                yield f"data: {json.dumps({'type': 'done', 'visit_id': visit_id, 'step': f'protocol_{body.protocol_type}', 'protocol': protocol, 'banderas': []})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'error', 'message': 'No se pudo generar el protocolo. Intenta de nuevo.'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/{visit_id}/protocol")
async def run_protocol(
    visit_id: str,
    body: ProtocolRequest,
    doctor_id: str = Depends(get_doctor_id),
):
    """Genera el protocolo. Se mantiene como fallback no-streaming."""
    try:
        prompt, previous_protocols, attachments = _build_protocol_prompt(visit_id, body)
        protocol = call_claude(prompt, diagnostic=True, fallback_model=MODEL_PROTOCOL, max_tokens=14000, visit_id=visit_id, step=f"protocol_{body.protocol_type}", thinking=False, web_search=_search_scope_for(body.protocol_type), attachments=attachments, temperature=0.4)
        protocol = _strip_json_fences(protocol)
        _safe_update_analysis(visit_id, {f"protocol_{body.protocol_type}": protocol})

        # Voz de conciencia: el crítico reta el protocolo contra el vademécum y lo ya aceptado.
        protocol, banderas = deliberate_protocol(protocol, body.protocol_type, previous_protocols,
                                                 visit_id=visit_id)

        if ENABLE_SECONDARY_VALIDATION:
            val_prompt = get_protocol_validation_prompt(protocol, previous_protocols)
            validated = call_claude(val_prompt, model=MODEL_VALIDATE, max_tokens=8000, visit_id=visit_id, step=f"validate_protocol_{body.protocol_type}", cheap=True)
            validated = _strip_json_fences(validated)
            if parse_protocol_json_safe(validated) is not None:
                protocol = validated

        update_analysis(visit_id, {
            f"protocol_{body.protocol_type}": protocol,
            "updated_at": datetime.utcnow().isoformat(),
        })

        return {
            "visit_id": visit_id,
            "step": f"protocol_{body.protocol_type}",
            "protocol": protocol,
            "protocol_type": body.protocol_type,
            "banderas": banderas,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] {str(e)}")
        raise HTTPException(500, str(e))


def _match_index(items: list, match_expr: str, key_field: str) -> int:
    """Resuelve "nombre X contiene 'Y'" o simplemente 'Y' contra la lista, devolviendo el índice
    o -1. Match case-insensitive por substring en el campo indicado (o en cualquier string del item
    si no coincide). Diseñado para tolerar cómo escribe el LLM el match."""
    if not isinstance(items, list) or not match_expr:
        return -1
    expr = str(match_expr).lower()
    # Extrae el término entre comillas si viene como "nombre contiene 'X'"
    q = re.search(r"['\"]([^'\"]+)['\"]", expr)
    needle = (q.group(1) if q else expr).lower().strip()
    if not needle:
        return -1
    for i, it in enumerate(items):
        if not isinstance(it, dict):
            continue
        target = str(it.get(key_field, "")).lower()
        if needle in target:
            return i
        # Fallback: buscar en cualquier string del item
        if any(needle in str(v).lower() for v in it.values() if isinstance(v, (str, int, float))):
            return i
    return -1


def apply_chat_patch(current_report: str, patch: dict) -> tuple[str, str]:
    """Aplica un patch del chat sobre el reporte actual. Devuelve (nuevo_reporte, resumen_ops).
    Si el patch es inaplicable, devuelve (current_report, "") y el llamador debe caer al fallback."""
    kind = (patch or {}).get("kind", "")
    ops = (patch or {}).get("ops", [])
    if not ops:
        return current_report, ""

    # Intentar parsear el reporte como JSON (protocolo y diagnóstico tradicional son JSON).
    # El reporte puede venir como JSON puro o con una línea de metadata al inicio
    # ({"confidence": 90}\n{...reporte...}). Intento varias estrategias.
    parsed = None
    stripped = current_report.strip()
    for candidate in [
        stripped,                                                     # JSON puro
        stripped[stripped.find("\n") + 1:] if "\n" in stripped else "",  # después de la 1ª línea
    ]:
        candidate = candidate.strip()
        if candidate.startswith("{"):
            try:
                parsed = json.loads(candidate)
                break
            except Exception:
                continue
    # Último recurso: buscar la última llave abierta que pueda iniciar el reporte principal.
    if parsed is None and stripped.startswith("{"):
        # Encontrar el inicio del segundo objeto de nivel superior (skip header {})
        depth, header_end = 0, -1
        for i, ch in enumerate(stripped):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    header_end = i + 1
                    break
        if header_end > 0:
            try:
                parsed = json.loads(stripped[header_end:].strip())
            except Exception:
                parsed = None

    applied = []

    if parsed is not None and "items" in parsed:  # PROTOCOLO
        items = parsed.setdefault("items", [])
        for op in ops:
            action = (op.get("op") or "").lower()
            if action == "replace_item":
                idx = _match_index(items, op.get("match", ""), "nombre_generico")
                if idx >= 0 and isinstance(op.get("item"), dict):
                    items[idx] = op["item"]; applied.append(f"reemplazado #{idx+1}")
            elif action == "add_item" and isinstance(op.get("item"), dict):
                items.append(op["item"]); applied.append("item agregado")
            elif action == "remove_item":
                idx = _match_index(items, op.get("match", ""), "nombre_generico")
                if idx >= 0:
                    items.pop(idx); applied.append(f"eliminado #{idx+1}")
            elif action == "update_monitoreo":
                mg = parsed.setdefault("monitoreo_general", {})
                field, value = op.get("field"), op.get("value")
                if field:
                    mg[field] = value; applied.append(f"monitoreo.{field} actualizado")
        return (json.dumps(parsed, ensure_ascii=False), "; ".join(applied)) if applied else (current_report, "")

    if parsed is not None and "diagnosticos" in parsed:  # DIAGNÓSTICO CONVENCIONAL
        diags = parsed.setdefault("diagnosticos", [])
        alertas = parsed.setdefault("alertas_clinicas", [])
        for op in ops:
            action = (op.get("op") or "").lower()
            if action == "replace_diagnostico":
                idx = _match_index(diags, op.get("match", ""), "nombre")
                if idx >= 0 and isinstance(op.get("diagnostico"), dict):
                    diags[idx] = op["diagnostico"]; applied.append(f"dx reemplazado #{idx+1}")
            elif action == "add_diagnostico" and isinstance(op.get("diagnostico"), dict):
                diags.append(op["diagnostico"]); applied.append("dx agregado")
            elif action == "remove_diagnostico":
                idx = _match_index(diags, op.get("match", ""), "nombre")
                if idx >= 0:
                    diags.pop(idx); applied.append(f"dx eliminado #{idx+1}")
            elif action == "add_alerta" and op.get("value"):
                alertas.append(op["value"]); applied.append("alerta agregada")
        return (json.dumps(parsed, ensure_ascii=False), "; ".join(applied)) if applied else (current_report, "")

    # DIAGNÓSTICO FUNCIONAL/LONGEVIDAD (texto con secciones ═══)
    new_text = current_report
    for op in ops:
        action = (op.get("op") or "").lower()
        section = op.get("section", "").strip()
        body = op.get("body", "")
        if not section:
            continue
        # Busca la sección; siguiente sección o fin de texto marca el límite.
        pattern = re.escape(section) + r"\s*\n(.*?)(?=\n═══|\Z)"
        m = re.search(pattern, new_text, re.DOTALL)
        if not m:
            continue
        if action == "replace_section":
            new_text = new_text[:m.start(1)] + body.rstrip() + "\n" + new_text[m.end(1):]
            applied.append(f"sección '{section[:30]}...' reemplazada")
        elif action == "append_to_section":
            current_body = m.group(1).rstrip()
            new_body = current_body + "\n" + body.strip() + "\n"
            new_text = new_text[:m.start(1)] + new_body + new_text[m.end(1):]
            applied.append(f"sección '{section[:30]}...' extendida")
    return (new_text, "; ".join(applied)) if applied else (current_report, "")


def _suggest_preference_from_patch(patch: dict) -> dict:
    """Infiere, desde el patch que el médico acaba de aplicar, una preferencia generalizable
    que se le puede ofrecer recordar ("¿solo esta vez o siempre?"). Sin llamada extra a la IA.
    Devuelve None si el cambio no es generalizable."""
    ops = (patch or {}).get("ops") or []
    for op in ops:
        action = (op.get("op") or "").lower()
        if action == "replace_item":
            de = (op.get("match") or "").strip()
            # Limpia formulaciones tipo "nombre_generico contiene 'X'"
            q = re.search(r"['\"]([^'\"]+)['\"]", de)
            if q:
                de = q.group(1)
            de = re.sub(r"^\s*nombre[_ ]?\w*\s*(contiene|=|:)\s*", "", de, flags=re.I).strip()
            a = ((op.get("item") or {}).get("nombre_generico") or "").strip()
            if de and a:
                return {"tipo": "sustituir", "de_item": de, "a_item": a,
                        "descripcion": f"Usar «{a}» en vez de «{de}»"}
        if action == "add_item":
            a = ((op.get("item") or {}).get("nombre_generico") or "").strip()
            if a:
                return {"tipo": "agregar_siempre", "de_item": "", "a_item": a,
                        "descripcion": f"Incluir «{a}» en casos similares"}
        if action == "remove_item":
            de = (op.get("match") or "").strip()
            q = re.search(r"['\"]([^'\"]+)['\"]", de)
            if q:
                de = q.group(1)
            if de:
                return {"tipo": "evitar", "de_item": de, "a_item": "",
                        "descripcion": f"No sugerir «{de}»"}
    return None


@router.post("/{visit_id}/{step}/chat")
async def chat_step(
    visit_id: str,
    step: str,
    body: ChatRequest,
    doctor_id: str = Depends(get_doctor_id),
):
    """Chat médico-IA sobre el diagnóstico."""
    try:
        analysis = get_analysis(visit_id)
        if not analysis:
            raise HTTPException(404, "Análisis no encontrado")

        history = analysis.get("chat_history", [])

        step_labels = {
            "traditional": "Diagnóstico Tradicional",
            "functional":  "Diagnóstico Funcional",
            "longevity":   "Diagnóstico de Longevidad",
            "protocol_traditional": "Protocolo Tradicional",
            "protocol_functional":  "Protocolo Funcional",
            "protocol_longevity":   "Protocolo de Longevidad",
        }

        # Expediente COMPLETO del paciente — el chat debe poder responder sobre cualquier dato
        # (ciudad/domicilio, exploración, laboratorios transcritos, antecedentes, etc.), no solo
        # sobre lo que aparece en el texto del diagnóstico en pantalla.
        expediente = ""
        visit = get_visit(visit_id)
        if visit and visit.get("patient_id"):
            patient = get_patient(visit["patient_id"])
            if patient:
                expediente = build_patient_context(patient) + "\n\n" + build_visit_context(visit)

        diagnosis_block = body.current_diagnosis.strip() if body.current_diagnosis else ""

        system = f"""Eres APEX, asistente médico IA. Contexto actual: {step_labels.get(step, step)}.

EXPEDIENTE COMPLETO DEL PACIENTE (tienes acceso a TODO esto — úsalo para responder cualquier pregunta del médico sobre el caso, incluidos datos como ciudad/domicilio, ocupación, exploración física y resultados de laboratorio):
{expediente if expediente else "(expediente no disponible)"}

TEXTO ACTUAL DE {step_labels.get(step, step).upper()} (lo que el médico está viendo en pantalla ahora mismo):
{diagnosis_block if diagnosis_block else "(sin contenido aún)"}

REGLAS:
- El médico tiene al paciente enfrente. Sé breve, máximo 3-4 oraciones por respuesta.
- Usa términos médicos — no expliques lo obvio.
- Ya tienes el expediente completo y el texto de arriba — NUNCA digas que no tienes contexto o que no sabes de qué caso se habla. Si un dato puntual genuinamente no está en el expediente, dilo con precisión (ej. "no se registró el domicilio"), sin negar que tienes el resto del caso.
- Si el médico pregunta por qué no se sugirió algo (ej. otro medicamento), responde con base en el texto de arriba: indicación, contraindicaciones o por qué se prefirió la opción actual.
- Si el médico comparte nueva información clínica (síntomas, historia), dile concretamente si cambia el diagnóstico/protocolo y cómo.
- Si NO cambia nada, explica por qué en 1-2 líneas.
- Si el médico PROPONE un cambio pero aún no lo confirma, descríbelo y pregunta si lo aplicas.
- Tono: colega médico, directo, técnico pero amable.
- Este chat es continuo — tienes el historial completo de la conversación.

EDICIÓN DEL REPORTE — USA PATCHES PEQUEÑOS, NO REESCRIBAS EL REPORTE COMPLETO:
Cuando el médico CONFIRME aplicar un cambio ("editalo", "aplícalo", "sí, cambia X por Y", etc.),
primero da UNA línea de confirmación y luego un PATCH pequeño entre marcas — SOLO la parte que
cambia. Prohibido reescribir el reporte completo (es lento y caro).

Formato del patch (JSON) entre estas marcas EXACTAS, cada una en su propia línea:
<<<PATCH>>>
{{"kind":"protocol_ops","ops":[ ... ]}}
<<<FIN_PATCH>>>

TIPOS DE OPERACIÓN (elige las mínimas para el cambio pedido):

Para PROTOCOLO (JSON con items[] y monitoreo_general{{}}):
  {{"op":"replace_item","match":"nombre_generico contiene 'Vitamina D3'","item":{{...item nuevo COMPLETO con todos los campos...}}}}
  {{"op":"add_item","item":{{...item nuevo completo...}}}}
  {{"op":"remove_item","match":"nombre_generico contiene 'X'"}}
  {{"op":"update_monitoreo","field":"labs_control","value":"..."}}

Para DIAGNÓSTICO CONVENCIONAL (JSON con diagnosticos[] y alertas_clinicas[]):
  {{"op":"replace_diagnostico","match":"nombre contiene 'X'","diagnostico":{{...completo...}}}}
  {{"op":"add_diagnostico","diagnostico":{{...}}}}
  {{"op":"remove_diagnostico","match":"nombre contiene 'X'"}}
  {{"op":"add_alerta","value":"..."}}

Para FUNCIONAL/LONGEVIDAD (texto con secciones ═══):
  {{"op":"replace_section","section":"═══ RAÍZ DEL PROBLEMA ═══","body":"...nuevo cuerpo de la sección..."}}
  {{"op":"append_to_section","section":"═══ FACTORES PERPETUANTES ═══","body":"• nueva línea..."}}

REGLAS:
- "match" es una descripción en lenguaje natural del item a modificar; el sistema lo resolverá contra el reporte actual buscando por contenido.
- Al reemplazar un item, incluye TODOS los campos del item nuevo (no omitas presentacion, dosis, etc.), no un diff parcial dentro del item.
- Emite el patch SOLO cuando el médico realmente confirmó aplicar un cambio. Para preguntas, dudas o propuestas no confirmadas, NO lo incluyas."""

        # Fundamentar en la biblioteca del médico, filtrando por la voz de este paso.
        # Los pasos "protocol_xxx" comparten área con su voz (functional/longevity/traditional).
        area_kb = step.replace("protocol_", "") if step.startswith("protocol_") else step
        if area_kb in ("functional", "longevity", "traditional"):
            kb_block = _kb_consultar(f"{body.question} {diagnosis_block[:400]}", area=area_kb)
            if kb_block:
                system += "\n\n" + kb_block

        history.append({"role": "user", "content": body.question})

        # El chat NO regenera el reporte completo, solo emite un patch con las operaciones mínimas
        # del cambio. Rutea a DeepSeek para ahorrar (solo texto, sin adjuntos) con fallback a Sonnet.
        def _mk_chat(cli, mdl):
            return cli.messages.create(model=mdl, max_tokens=4000, system=system, messages=history)
        _ds = _get_deepseek_client()
        try:
            response = _mk_chat(_ds, DEEPSEEK_MODEL) if _ds else _mk_chat(client, MODEL_DRAFT)
        except Exception as e:
            print(f"[FALLBACK] DeepSeek chat falló ({e}); reintento con {MODEL_DRAFT}")
            response = _mk_chat(client, MODEL_DRAFT)
        answer_full = next((b.text for b in response.content if b.type == "text"), "")

        # ¿El chat propuso un patch? Extráelo, aplícalo sobre el reporte actual y devuelve
        # solo el resultado final al frontend.
        updated_report = None
        preferencia_sugerida = None
        answer = answer_full
        m = re.search(r"<<<PATCH>>>\s*(\{.*?\})\s*<<<FIN_PATCH>>>", answer_full, re.DOTALL)
        if m:
            try:
                patch = json.loads(m.group(1))
                new_report, summary = apply_chat_patch(diagnosis_block, patch)
                if summary:
                    updated_report = new_report
                    # El sistema aprende del médico: si el cambio es generalizable, le
                    # ofrecemos recordarlo como preferencia para casos futuros.
                    preferencia_sugerida = _suggest_preference_from_patch(patch)
                # Limpiar el texto conversacional del bloque de patch
                answer = (answer_full[:m.start()] + answer_full[m.end():]).strip()
                if not answer:
                    answer = f"✓ {summary}" if summary else "✓ Cambio aplicado."
                elif summary and "✓" not in answer:
                    answer = f"{answer}\n\n✓ {summary}"
            except json.JSONDecodeError as e:
                print(f"[WARN] Patch inválido del chat: {e}")
                # No aplicamos; el texto conversacional se muestra tal cual.

        # En el historial guardamos solo la parte conversacional (sin el bloque pesado del reporte),
        # para no re-alimentar el JSON completo en cada turno siguiente.
        history.append({"role": "assistant", "content": answer})
        update_analysis(visit_id, {"chat_history": history, "updated_at": datetime.utcnow().isoformat()})

        return {
            "visit_id": visit_id,
            "step": step,
            "question": body.question,
            "answer": answer,
            "updated_report": updated_report,
            "preferencia_sugerida": preferencia_sugerida,
            "turn": len(history) // 2,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] {str(e)}")
        raise HTTPException(500, str(e))


@router.post("/{visit_id}/close")
async def close_visit(
    visit_id: str,
    body: CloseRequest,
    doctor_id: str = Depends(get_doctor_id),
):
    """Cierra la visita y guarda la versión final confirmada por el médico de cada sección."""
    try:
        update_data = {
            "status": "closed",
            "updated_at": datetime.utcnow().isoformat(),
        }
        if body.doctor_traditional and body.doctor_traditional.strip():
            update_data["doctor_traditional"] = body.doctor_traditional
        if body.doctor_functional and body.doctor_functional.strip():
            update_data["doctor_functional"] = body.doctor_functional
        if body.doctor_longevity and body.doctor_longevity.strip():
            update_data["doctor_longevity"] = body.doctor_longevity
        if body.protocol_traditional and body.protocol_traditional.strip():
            update_data["protocol_traditional"] = body.protocol_traditional
        if body.protocol_functional and body.protocol_functional.strip():
            update_data["protocol_functional"] = body.protocol_functional
        if body.protocol_longevity and body.protocol_longevity.strip():
            update_data["protocol_longevity"] = body.protocol_longevity

        update_analysis(visit_id, update_data)
        return {
            "visit_id": visit_id,
            "status": "closed",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/{visit_id}")
async def get_visit_analysis(visit_id: str):
    """Obtiene el diagnóstico y protocolo confirmados por el médico para una visita."""
    try:
        analysis = get_analysis(visit_id)
        if not analysis:
            return {"visit_id": visit_id, "status": None}
        return analysis
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/{visit_id}/logs")
async def get_analysis_logs(visit_id: str):
    """Lista, en orden cronológico, cada llamada a la IA de esta visita (prompt, respuesta,
    modelo y latencia) — para poder verificar exactamente qué información se le mandó."""
    try:
        return {"visit_id": visit_id, "logs": list_ai_call_logs(visit_id)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Documentos de salida de la consulta (receta, reporte, estudios) ──────────────
# Tipos que SÍ pueden ir en la RECETA oficial (farmacia): fármacos aprobados, off-label,
# suplementos, vitaminas y minerales. Los péptidos, PRP, células madre, hormonas bioidénticas
# y terapias IV NO van en la receta (COFEPRIS) — se presentan en el PLAN, no se recetan.
_MED_TYPES = {"fármaco", "farmaco", "off-label", "suplemento", "vitamina", "mineral"}
# Tipos que aparecen en el PLAN pero NUNCA en la receta oficial.
_NO_RECETA_TYPES = {"péptido", "peptido", "prp", "células madre", "celulas madre",
                    "hormona", "terapia iv", "estilo de vida", "ejercicio"}


def _parse_protocol(raw) -> tuple:
    """Devuelve (items_medicamentos, estudios) de un protocolo (texto JSON o dict)."""
    if not raw:
        return [], []
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return [], []
    if not isinstance(data, dict):
        return [], []
    meds = []
    for it in data.get("items", []) or []:
        tipo = (it.get("tipo") or "").strip().lower()
        if tipo in _MED_TYPES:
            meds.append(it)
    estudios = []
    mg = data.get("monitoreo_general") or {}
    if isinstance(mg, dict):
        e = mg.get("estudios")
        if isinstance(e, list):
            estudios = [str(x) for x in e if x]
    return meds, estudios


def _estudios_de_diagnostico(raw) -> list:
    """Estudios sugeridos de UN diagnóstico. El convencional es JSON con
    diagnosticos[].estudios_sugeridos; el funcional/longevidad es texto con una sección
    '═══ ESTUDIOS SUGERIDOS ... ═══' cuyas viñetas son 'Estudio — clasificación — motivo'.
    Devuelve solo los NOMBRES de estudio (lo anterior al primer ' — ')."""
    if not raw:
        return []
    out = []
    # 1) Formato JSON (convencional)
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        data = None
    if isinstance(data, dict):
        for d in (data.get("diagnosticos") or []):
            if not isinstance(d, dict):
                continue
            sug = d.get("estudios_sugeridos") or []
            sel = d.get("estudios_seleccionados")
            if isinstance(sel, list) and len(sel) == len(sug):
                # Respeta la selección del médico: solo los estudios que aceptó.
                for s, chosen in zip(sug, sel):
                    if chosen and s:
                        out.append(str(s).strip())
            else:
                # Sin arreglo de selección (dx no editado): incluye los sugeridos.
                for s in sug:
                    if s:
                        out.append(str(s).strip())
            # Estudios que el médico agregó a mano a este diagnóstico.
            for s in (d.get("estudios_doctor") or []):
                if s:
                    out.append(str(s).strip())
        # Estudios adicionales globales + fallback a nivel raíz.
        for e in (data.get("estudios_adicionales") or []):
            if e:
                out.append(str(e).strip())
        for e in (data.get("estudios_sugeridos") or []):
            if e:
                out.append(str(e).strip())
        return out
    # 2) Formato texto (funcional/longevidad): sección delimitada por ═══ con "ESTUDIO"
    if isinstance(raw, str):
        capturing = False
        for ln in raw.splitlines():
            s = ln.strip()
            if "═══" in s or (s.startswith("===") and s.endswith("===")):
                up = s.upper()
                capturing = ("ESTUDIO" in up or "LABORATORIO" in up)
                continue
            if capturing and s:
                if s.startswith("(") or s.lower().startswith("máximo"):
                    continue
                item = re.sub(r'^[\-•\*\d\.\)\s]+', '', s).strip()
                # "Estudio — clasificación — motivo" → tomar solo el nombre del estudio
                nombre = re.split(r'\s[—–-]\s', item)[0].strip()
                if nombre and len(nombre) <= 120:
                    out.append(nombre)
    return out


def _seccion_delimitada(raw: str, keyword: str) -> str:
    """Extrae el cuerpo de una sección '═══ ... KEYWORD ... ═══' de un diagnóstico en texto."""
    if not raw or not isinstance(raw, str):
        return ""
    cuerpo, capturing = [], False
    for ln in raw.splitlines():
        s = ln.strip()
        if "═══" in s or (s.startswith("===") and s.endswith("===")):
            capturing = keyword.upper() in s.upper()
            continue
        if capturing:
            cuerpo.append(ln)
    return "\n".join(cuerpo).strip()


def _dx_convencional_legible(raw) -> list:
    """Lista estructurada [{nombre, confianza, resumen}] del diagnóstico convencional (JSON)."""
    if not raw:
        return []
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return []
    if not isinstance(data, dict):
        return []
    out = []
    for d in (data.get("diagnosticos") or []):
        if isinstance(d, dict) and d.get("nombre"):
            out.append({
                "nombre": str(d.get("nombre") or "").strip(),
                "confianza": d.get("confianza"),
                "resumen": str(d.get("resumen_breve") or "").strip(),
            })
    return out


@router.get("/{visit_id}/documents")
async def get_documents(visit_id: str, authorization: Optional[str] = Header(None)):
    """Ensambla los datos para los 3 documentos de salida: receta, reporte y estudios.
    Ninguno es obligatorio; el frontend decide cuáles incluir según haya contenido."""
    from auth import get_actor
    from access import require
    require(get_actor(authorization), "doctor")
    analysis = get_analysis(visit_id) or {}
    visit = get_visit(visit_id) or {}
    patient_id = analysis.get("patient_id") or visit.get("patient_id")
    patient = get_patient(patient_id) if patient_id else {}
    doctor_id = analysis.get("doctor_id") or visit.get("doctor_id")
    perfil = get_doctor_profile(doctor_id) if doctor_id else {}
    letterhead = (perfil or {}).get("letterhead") or {}

    # Clasificación de los items del protocolo:
    #  - receta: fármacos/off-label/suplementos/vitaminas/minerales (van en la receta oficial).
    #  - avanzados: péptidos/PRP/células madre/hormonas/terapia IV (van en el PLAN, NO en la receta).
    #  - habitos: estilo de vida / ejercicio.
    receta, habitos, avanzados = [], [], []
    for campo in ("protocol_traditional", "protocol_functional", "protocol_longevity"):
        raw = analysis.get(campo)
        meds, _ = _parse_protocol(raw)
        receta.extend(meds)
        try:
            data = json.loads(raw) if isinstance(raw, str) else raw
        except Exception:
            data = None
        if isinstance(data, dict):
            enfoque = campo.replace("protocol_", "")
            for it in (data.get("items") or []):
                if not isinstance(it, dict):
                    continue
                tipo = (it.get("tipo") or "").strip().lower()
                if tipo in ("estilo de vida", "ejercicio"):
                    habitos.append(it)
                elif tipo in _NO_RECETA_TYPES:
                    avanzados.append({**it, "_enfoque": enfoque})

    # Estudios: se leen del DIAGNÓSTICO de cada enfoque (ahí viven los "estudios_sugeridos"),
    # no del protocolo. Se juntan de los 3 enfoques y se de-duplican.
    estudios = []
    for campo, alt in (("doctor_traditional", "diagnosis_traditional"),
                       ("doctor_functional", "diagnosis_functional"),
                       ("doctor_longevity", "diagnosis_longevity")):
        fuente = (analysis.get(campo) or "").strip() or (analysis.get(alt) or "").strip()
        estudios.extend(_estudios_de_diagnostico(fuente))
    vistos, estudios_u = set(), []
    for e in estudios:
        k = e.lower().strip()
        if k and k not in vistos:
            vistos.add(k); estudios_u.append(e)

    # Diagnósticos legibles para el REPORTE (sin JSON crudo).
    dx_convencional = _dx_convencional_legible(
        (analysis.get("doctor_traditional") or "").strip() or (analysis.get("diagnosis_traditional") or "").strip())
    # Funcional/longevidad vienen en texto; quitamos la línea JSON de confianza que los abre.
    def _sin_confianza(t: str) -> str:
        t = (t or "").strip()
        if t.startswith("{"):
            nl = t.find("\n")
            if nl != -1 and t[:nl].strip().endswith("}"):
                return t[nl + 1:].strip()
        return t
    func_txt = _sin_confianza((analysis.get("doctor_functional") or "").strip() or (analysis.get("diagnosis_functional") or "").strip())
    long_txt = _sin_confianza((analysis.get("doctor_longevity") or "").strip() or (analysis.get("diagnosis_longevity") or "").strip())

    # Explicación al paciente (paso "Tell" del método): la historia en lenguaje llano.
    explicacion_paciente = _seccion_delimitada(func_txt, "HISTORIA DEL PACIENTE")

    # Plan de seguimiento (monitoreo_general del protocolo): próxima revisión, señales de alarma…
    plan = {}
    for campo in ("protocol_traditional", "protocol_functional", "protocol_longevity"):
        raw = analysis.get(campo)
        try:
            data = json.loads(raw) if isinstance(raw, str) else raw
        except Exception:
            data = None
        mg = (data or {}).get("monitoreo_general") if isinstance(data, dict) else None
        if isinstance(mg, dict):
            for k in ("proxima_revision", "criterios_exito", "senales_alarma"):
                if mg.get(k) and not plan.get(k):
                    plan[k] = mg.get(k)
            if isinstance(mg.get("plan_por_fases"), list) and not plan.get("plan_por_fases"):
                plan["plan_por_fases"] = mg.get("plan_por_fases")

    # Reporte sugerido legible (texto plano, SIN JSON) para el textarea editable.
    partes_reporte = []
    if dx_convencional:
        líneas = [f"• {d['nombre']}" + (f" (confianza {d['confianza']}%)" if d.get("confianza") is not None else "")
                  + (f": {d['resumen']}" if d.get("resumen") else "") for d in dx_convencional]
        partes_reporte.append("Diagnóstico:\n" + "\n".join(líneas))
    if func_txt:
        partes_reporte.append("Enfoque funcional:\n" + func_txt)
    if long_txt:
        partes_reporte.append("Enfoque de longevidad:\n" + long_txt)

    # Edad del paciente
    edad = None
    dob = patient.get("date_of_birth") or patient.get("birth_date")
    if dob:
        try:
            from datetime import datetime as _dt
            d = _dt.fromisoformat(str(dob)[:10])
            hoy = _dt.now()
            edad = hoy.year - d.year - ((hoy.month, hoy.day) < (d.month, d.day))
        except Exception:
            edad = None

    return {
        "patient": {
            "id": patient_id, "nombre": patient.get("full_name"),
            "edad": edad, "sexo": patient.get("sexo_biologico"), "email": patient.get("email"),
        },
        "letterhead": letterhead,
        "receta": receta,
        "avanzados": avanzados,
        "habitos": habitos,
        "estudios": estudios_u,
        "diagnosticos": dx_convencional,
        "explicacion_paciente": explicacion_paciente,
        "plan": plan,
        "reporte_sugerido": "\n\n".join(partes_reporte),
        "fecha": None,
        "disponibles": {
            "receta": len(receta) > 0,
            "estudios": len(estudios_u) > 0,
            "reporte": len(partes_reporte) > 0,
        },
    }
