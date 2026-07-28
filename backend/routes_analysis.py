"""
Análisis clínico — flujo secuencial con input del médico entre cada paso.
El médico es el jefe. La IA propone, el médico decide.
Cada paso recibe la versión CONFIRMADA por el médico del paso anterior.
"""

from fastapi import APIRouter, HTTPException, Depends, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import json, re, time
from anthropic import Anthropic
from db import insert_analysis, get_analysis, update_analysis, get_visit, get_patient, insert_ai_call_log, list_ai_call_logs, list_patient_visits

from services.system_prompt import (
    get_traditional_diagnosis_prompt,
    get_functional_medicine_prompt,
    get_longevity_diagnosis_prompt,
    get_protocol_prompt,
    get_protocol_validation_prompt,
    get_secondary_validation_prompt,
    get_functional_clarifying_questions_prompt,
    get_lean_draft_prompt,
)

router = APIRouter(prefix="/analyze", tags=["analysis"])
client = Anthropic()

# Modelos por tarea (costo vs calidad)
MODEL_DIAGNOSE  = "claude-opus-4-8"    # diagnóstico final, protocolos — máxima profundidad de razonamiento
MODEL_DRAFT     = "claude-sonnet-4-6"  # borrador ligero — tarea estructuralmente simple, prioriza velocidad
MODEL_VALIDATE  = "claude-haiku-4-5"
MODEL_CHAT      = "claude-haiku-4-5"

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
    },
    "mx": {
        "type": "web_search_20260209",
        "name": "web_search",
        "allowed_domains": ALLOWED_MEDICAL_DOMAINS + ALLOWED_MEXICO_MEDICAL_DOMAINS,
    },
}

# Validación secundaria (chequeo de alucinaciones/seguridad) — desactivada temporalmente
# durante pruebas para acelerar el flujo. Reactivar antes de producción.
ENABLE_SECONDARY_VALIDATION = False


async def get_doctor_id(authorization: Optional[str] = Header(None)) -> str:
    return "550e8400-e29b-41d4-a716-446655440000"


class FunctionalRequest(BaseModel):
    doctor_traditional: str = ""
    ai_traditional_original: str = ""
    protocol_traditional: str = ""
    doctor_answers: str = ""
    patient_id: str = ""


class LongevityRequest(BaseModel):
    doctor_traditional: str = ""
    doctor_functional: str = ""
    ai_traditional_original: str = ""
    ai_functional_original: str = ""
    protocol_traditional: str = ""
    protocol_functional: str = ""
    doctor_answers: str = ""
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
    patient_id: str = ""


def build_diagnosis_prompt(diagnosis_type: str, full_patient: dict, full_visit: dict, extra_context: str = "",
                            all_visits: list = None) -> str:
    """Genera el prompt de diagnóstico correspondiente sin depender de un diagnóstico previo."""
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


def call_claude(prompt: str, system: str = "", model: str = MODEL_DIAGNOSE, max_tokens: int = 2000,
                 visit_id: str = "", step: str = "", thinking: bool = False, web_search: str = "") -> str:
    """web_search: "" (sin búsqueda), "global" (fuentes internacionales) o "mx"
    (internacionales + mexicanas — solo medicina tradicional)."""
    kwargs = {
        "model": model,
        "max_tokens": max(max_tokens, 4096) if thinking else max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        kwargs["system"] = system
    if thinking:
        kwargs["thinking"] = {"type": "adaptive"}
    if web_search:
        kwargs["tools"] = [WEB_SEARCH_TOOLS[web_search]]
    start = time.monotonic()
    response = client.messages.create(**kwargs)
    # Con thinking activado, el primer bloque de contenido es el razonamiento, no la
    # respuesta — hay que buscar el primer bloque de tipo "text". Con web_search puede
    # haber bloques server_tool_use/web_search_tool_result antes del texto también.
    text = next((b.text for b in response.content if b.type == "text"), "")
    if visit_id:
        latency_ms = int((time.monotonic() - start) * 1000)
        try:
            insert_ai_call_log({
                "visit_id": visit_id,
                "step": step,
                "model": model,
                "prompt": prompt,
                "response": text,
                "latency_ms": latency_ms,
                "created_at": datetime.utcnow().isoformat(),
            })
        except Exception as e:
            # El logging nunca debe tumbar el flujo de diagnóstico
            print(f"[WARN] no se pudo guardar ai_call_log ({step}): {e}")
    return text


def call_claude_stream(prompt: str, model: str = MODEL_DIAGNOSE, max_tokens: int = 2000,
                        visit_id: str = "", step: str = "", thinking: bool = False, web_search: str = ""):
    """
    Igual que call_claude, pero yield-ea el texto de la respuesta en deltas conforme
    llegan (para mostrarlo en vivo al médico en vez de una espera ciega). text_stream
    ya filtra los deltas de thinking — solo entrega texto de la respuesta final.
    Al agotarse el generador, ya se guardó el log en ai_call_logs con el texto completo.
    web_search: "" / "global" / "mx" — ver call_claude().
    """
    kwargs = {
        "model": model,
        "max_tokens": max(max_tokens, 4096) if thinking else max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if thinking:
        kwargs["thinking"] = {"type": "adaptive"}
    if web_search:
        kwargs["tools"] = [WEB_SEARCH_TOOLS[web_search]]
    start = time.monotonic()
    chunks = []
    with client.messages.stream(**kwargs) as stream:
        for delta in stream.text_stream:
            chunks.append(delta)
            yield delta
    text = "".join(chunks)
    if visit_id:
        latency_ms = int((time.monotonic() - start) * 1000)
        try:
            insert_ai_call_log({
                "visit_id": visit_id,
                "step": step,
                "model": model,
                "prompt": prompt,
                "response": text,
                "latency_ms": latency_ms,
                "created_at": datetime.utcnow().isoformat(),
            })
        except Exception as e:
            print(f"[WARN] no se pudo guardar ai_call_log ({step}): {e}")


def maybe_validate(prompt_text: str, visit_id: str = "", step: str = "") -> str:
    """Corre la validación secundaria (chequeo de alucinaciones) solo si está activada."""
    if not ENABLE_SECONDARY_VALIDATION:
        return ""
    return call_claude(prompt_text, model=MODEL_VALIDATE, max_tokens=800, visit_id=visit_id, step=step)


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
        patient_id = body.patient_data.get("patient_id") or visit_record.get("patient_id", "")
        patient_record = get_patient(patient_id) if patient_id else {}

        full_patient = {**body.patient_data, **patient_record}
        full_visit = visit_record
        all_visits = list_patient_visits(patient_id) if patient_id else []
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
        raw_draft = call_claude(draft_prompt, model=MODEL_DRAFT, visit_id=visit_id, step=f"draft_{diagnosis_type}")
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

        questions = [q["pregunta"] for q in lean_draft["preguntas"] if q.get("pregunta")][:4]

        return {"visit_id": visit_id, "questions": questions}
    except Exception as e:
        print(f"[ERROR clarify] {str(e)}")
        # No bloquear el flujo si falla
        return {"visit_id": visit_id, "questions": []}


def _build_finalize_first_prompt(visit_id: str, body: FinalizeFirstRequest) -> tuple[str, str]:
    """Arma el prompt completo de finalize_first. Devuelve (prompt, draft_type).
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
    patient_id = analysis.get("patient_id")
    patient_data = get_patient(patient_id) if patient_id else {}
    all_visits = list_patient_visits(patient_id) if patient_id else []

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
    return prompt, draft_type


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
    prompt, draft_type = _build_finalize_first_prompt(visit_id, body)

    def event_stream():
        chunks = []
        for delta in call_claude_stream(prompt, model=MODEL_DIAGNOSE, visit_id=visit_id,
                                         step=f"finalize_{draft_type}", thinking=True,
                                         web_search=_search_scope_for(draft_type)):
            chunks.append(delta)
            yield f"data: {json.dumps({'type': 'delta', 'text': delta})}\n\n"
        raw = "".join(chunks)
        metadata, diagnosis = extract_structured_header(raw)
        validation = maybe_validate(get_secondary_validation_prompt(diagnosis), visit_id=visit_id,
                                     step=f"validate_finalize_{draft_type}")
        final = {
            "type": "done",
            "visit_id": visit_id,
            "step": draft_type,
            "diagnosis": diagnosis,
            "validation": validation,
            "confidence": metadata["confidence"],
        }
        yield f"data: {json.dumps(final)}\n\n"

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
        prompt, draft_type = _build_finalize_first_prompt(visit_id, body)
        raw = call_claude(prompt, model=MODEL_DIAGNOSE, visit_id=visit_id, step=f"finalize_{draft_type}", thinking=True, web_search=_search_scope_for(draft_type))
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
        patient_id = patient_data.get("patient_id") or visit_record.get("patient_id", "")
        patient_record = get_patient(patient_id) if patient_id else {}

        # Mezclar lo que venga del frontend con lo de Supabase (Supabase tiene precedencia)
        full_patient = {**patient_data, **patient_record}
        full_visit = visit_record
        all_visits = list_patient_visits(patient_id) if patient_id else []

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

        prompt = get_traditional_diagnosis_prompt(full_patient, full_visit, extra_context=extra_context, all_visits=all_visits)
        raw = call_claude(prompt, model=MODEL_DIAGNOSE, visit_id=visit_id, step="traditional", thinking=True, web_search="mx")
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
        patient_id = body.patient_id or visit_record.get("patient_id", "")
        patient_record = get_patient(patient_id) if patient_id else {}

        prompt = get_functional_clarifying_questions_prompt(patient_record, visit_record, body.doctor_traditional)
        raw = call_claude(prompt, model=MODEL_CHAT, max_tokens=400, visit_id=visit_id, step="clarify_functional")

        questions = []
        try:
            m = re.search(r'\{[\s\S]*?"questions"[\s\S]*?\}', raw)
            if m:
                data = json_lib.loads(m.group())
                questions = [q for q in data.get("questions", []) if q][:3]
        except Exception:
            questions = []

        return {"visit_id": visit_id, "questions": questions}
    except Exception as e:
        print(f"[ERROR clarify_functional] {str(e)}")
        return {"visit_id": visit_id, "questions": []}


@router.post("/{visit_id}/functional")
async def run_functional(
    visit_id: str,
    body: FunctionalRequest,
    doctor_id: str = Depends(get_doctor_id),
):
    """Genera el diagnóstico funcional."""
    try:
        analysis = get_analysis(visit_id)
        if not analysis:
            visit_record = get_visit(visit_id) or {}
            patient_id = body.patient_id or visit_record.get("patient_id", "")
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
            analysis = get_analysis(visit_id)

        visit_record = get_visit(visit_id) or {}
        patient_id = analysis.get("patient_id")
        patient_data = get_patient(patient_id) if patient_id else {}
        all_visits = list_patient_visits(patient_id) if patient_id else []

        doctor_context = ""
        if body.doctor_traditional and body.doctor_traditional.strip():
            doctor_context = build_doctor_context(
                body.ai_traditional_original,
                body.doctor_traditional,
                "DIAGNÓSTICO TRADICIONAL"
            )
        if body.doctor_answers and body.doctor_answers.strip():
            doctor_context += (
                "\n\nRESPUESTAS DEL MÉDICO A PREGUNTAS DE ACLARACIÓN "
                "(tómalas en cuenta — son información adicional directa del paciente):\n"
                + body.doctor_answers
            )
        chat_snippet = _chat_snippet(analysis.get("chat_history", []))

        prompt = get_functional_medicine_prompt(
            patient_data,
            body.doctor_traditional,
            visit_data=visit_record,
            extra_context=doctor_context + chat_snippet,
            all_visits=all_visits,
            traditional_treatment=body.protocol_traditional,
        )
        raw = call_claude(prompt, model=MODEL_DIAGNOSE, visit_id=visit_id, step="functional", thinking=True, web_search="global")
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

    except Exception as e:
        print(f"[ERROR] {str(e)}")
        raise HTTPException(500, str(e))


@router.post("/{visit_id}/longevity")
async def run_longevity(
    visit_id: str,
    body: LongevityRequest,
    doctor_id: str = Depends(get_doctor_id),
):
    """Genera el diagnóstico de longevidad."""
    try:
        analysis = get_analysis(visit_id)
        if not analysis:
            visit_record = get_visit(visit_id) or {}
            patient_id = body.patient_id or visit_record.get("patient_id", "")
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
            analysis = get_analysis(visit_id)

        visit_record = get_visit(visit_id) or {}
        patient_id = analysis.get("patient_id")
        patient_data = get_patient(patient_id) if patient_id else {}
        all_visits = list_patient_visits(patient_id) if patient_id else []

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
        if body.doctor_answers and body.doctor_answers.strip():
            ctx_answers = (
                "\n\nRESPUESTAS DEL MÉDICO A PREGUNTAS DE ACLARACIÓN "
                "(tómalas en cuenta — son información adicional directa del paciente):\n"
                + body.doctor_answers
            )
        chat_snippet = _chat_snippet(analysis.get("chat_history", []))

        prompt = get_longevity_diagnosis_prompt(
            patient_data,
            body.doctor_functional,
            traditional_diagnosis=body.doctor_traditional,
            visit_data=visit_record,
            extra_context=ctx_trad + ctx_func + ctx_answers + chat_snippet,
            all_visits=all_visits,
            traditional_treatment=body.protocol_traditional,
            functional_treatment=body.protocol_functional,
        )
        raw = call_claude(prompt, model=MODEL_DIAGNOSE, visit_id=visit_id, step="longevity", thinking=True, web_search="global")
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

    except Exception as e:
        print(f"[ERROR] {str(e)}")
        raise HTTPException(500, str(e))


def _build_protocol_prompt(visit_id: str, body: ProtocolRequest) -> tuple[str, dict]:
    """Arma el prompt completo de protocolo. Devuelve (prompt, previous_protocols).
    Compartido entre la ruta normal y la de streaming."""
    analysis = get_analysis(visit_id)
    if not analysis:
        raise HTTPException(404, "Análisis no encontrado")

    visit_record = get_visit(visit_id) or {}
    patient_id = analysis.get("patient_id")
    patient_data = get_patient(patient_id) if patient_id else {}
    all_visits = list_patient_visits(patient_id) if patient_id else []

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
    )
    return prompt, previous_protocols


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
    prompt, previous_protocols = _build_protocol_prompt(visit_id, body)

    def event_stream():
        chunks = []
        for delta in call_claude_stream(prompt, model=MODEL_DIAGNOSE, max_tokens=8000, visit_id=visit_id,
                                         step=f"protocol_{body.protocol_type}", thinking=True,
                                         web_search=_search_scope_for(body.protocol_type)):
            chunks.append(delta)
            yield f"data: {json.dumps({'type': 'delta', 'text': delta})}\n\n"
        protocol = _strip_json_fences("".join(chunks))

        if ENABLE_SECONDARY_VALIDATION:
            val_prompt = get_protocol_validation_prompt(protocol, previous_protocols)
            validated = call_claude(val_prompt, model=MODEL_VALIDATE, max_tokens=8000, visit_id=visit_id,
                                     step=f"validate_protocol_{body.protocol_type}")
            validated = _strip_json_fences(validated)
            if parse_protocol_json_safe(validated) is not None:
                protocol = validated

        update_analysis(visit_id, {
            f"protocol_{body.protocol_type}": protocol,
            "updated_at": datetime.utcnow().isoformat(),
        })

        final = {
            "type": "done",
            "visit_id": visit_id,
            "step": f"protocol_{body.protocol_type}",
            "protocol": protocol,
        }
        yield f"data: {json.dumps(final)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/{visit_id}/protocol")
async def run_protocol(
    visit_id: str,
    body: ProtocolRequest,
    doctor_id: str = Depends(get_doctor_id),
):
    """Genera el protocolo. Se mantiene como fallback no-streaming."""
    try:
        prompt, previous_protocols = _build_protocol_prompt(visit_id, body)
        protocol = call_claude(prompt, model=MODEL_DIAGNOSE, max_tokens=8000, visit_id=visit_id, step=f"protocol_{body.protocol_type}", thinking=True, web_search=_search_scope_for(body.protocol_type))
        protocol = _strip_json_fences(protocol)

        if ENABLE_SECONDARY_VALIDATION:
            val_prompt = get_protocol_validation_prompt(protocol, previous_protocols)
            validated = call_claude(val_prompt, model=MODEL_VALIDATE, max_tokens=8000, visit_id=visit_id, step=f"validate_protocol_{body.protocol_type}")
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
        }

    except Exception as e:
        print(f"[ERROR] {str(e)}")
        raise HTTPException(500, str(e))


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

        # Identidad básica del paciente — para que la IA sepa de quién se habla
        patient_line = ""
        visit = get_visit(visit_id)
        if visit and visit.get("patient_id"):
            patient = get_patient(visit["patient_id"])
            if patient:
                name = patient.get("full_name") or f"{patient.get('first_name','')} {patient.get('last_name','')}".strip()
                patient_line = f"\nPaciente: {name} — {patient.get('sex','')}".strip()

        diagnosis_block = body.current_diagnosis.strip() if body.current_diagnosis else ""

        system = f"""Eres APEX, asistente médico IA. Contexto actual: {step_labels.get(step, step)}.{patient_line}

TEXTO ACTUAL DE {step_labels.get(step, step).upper()} (lo que el médico está viendo en pantalla ahora mismo):
{diagnosis_block if diagnosis_block else "(sin contenido aún)"}

REGLAS:
- El médico tiene al paciente enfrente. Sé breve, máximo 3-4 oraciones por respuesta.
- Usa términos médicos — no expliques lo obvio.
- Ya conoces el texto de arriba — NUNCA digas que no tienes contexto o que no sabes de qué caso se habla.
- Si el médico pregunta por qué no se sugirió algo (ej. otro medicamento), responde con base en el texto de arriba: indicación, contraindicaciones o por qué se prefirió la opción actual.
- Si el médico comparte nueva información clínica (síntomas, historia), dile concretamente si cambia el diagnóstico/protocolo y cómo.
- Si NO cambia nada, explica por qué en 1-2 líneas.
- Si cambia algo, di: "Esto modifica el [diagnóstico/protocolo]: [qué cambia]. Te recomiendo editar el texto antes de continuar."
- Tono: colega médico, directo, técnico pero amable.
- Este chat es continuo — tienes el historial completo de la conversación."""

        history.append({"role": "user", "content": body.question})

        response = client.messages.create(
            model=MODEL_CHAT,
            max_tokens=600,
            system=system,
            messages=history,
        )
        answer = response.content[0].text

        history.append({"role": "assistant", "content": answer})
        update_analysis(visit_id, {"chat_history": history, "updated_at": datetime.utcnow().isoformat()})

        return {
            "visit_id": visit_id,
            "step": step,
            "question": body.question,
            "answer": answer,
            "turn": len(history) // 2,
        }

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
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/{visit_id}/logs")
async def get_analysis_logs(visit_id: str):
    """Lista, en orden cronológico, cada llamada a la IA de esta visita (prompt, respuesta,
    modelo y latencia) — para poder verificar exactamente qué información se le mandó."""
    try:
        return {"visit_id": visit_id, "logs": list_ai_call_logs(visit_id)}
    except Exception as e:
        raise HTTPException(500, str(e))
