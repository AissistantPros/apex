"""
Análisis clínico — flujo secuencial con input del médico entre cada paso.
El médico es el jefe. La IA propone, el médico decide.
Cada paso recibe la versión CONFIRMADA por el médico del paso anterior.
"""

from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import json, re
from anthropic import Anthropic
from db import insert_analysis, get_analysis, update_analysis, get_visit, get_patient

from services.system_prompt import (
    get_traditional_diagnosis_prompt,
    get_functional_medicine_prompt,
    get_longevity_diagnosis_prompt,
    get_protocol_prompt,
    get_secondary_validation_prompt,
)

router = APIRouter(prefix="/analyze", tags=["analysis"])
client = Anthropic()

# Modelos por tarea (costo vs calidad)
MODEL_DIAGNOSE  = "claude-sonnet-4-5"
MODEL_VALIDATE  = "claude-haiku-4-5"
MODEL_CHAT      = "claude-haiku-4-5"


async def get_doctor_id(authorization: Optional[str] = Header(None)) -> str:
    return "550e8400-e29b-41d4-a716-446655440000"


class FunctionalRequest(BaseModel):
    doctor_traditional: str = ""
    ai_traditional_original: str = ""
    doctor_answers: str = ""
    patient_id: str = ""


class LongevityRequest(BaseModel):
    doctor_traditional: str = ""
    doctor_functional: str = ""
    ai_traditional_original: str = ""
    ai_functional_original: str = ""
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


class ChatRequest(BaseModel):
    question: str
    current_diagnosis: str


class ClarifyRequest(BaseModel):
    patient_data: dict = {}
    selected_type: str = "traditional"


class FinalizeFirstRequest(BaseModel):
    doctor_answers: str = ""


def build_diagnosis_prompt(diagnosis_type: str, full_patient: dict, full_visit: dict, extra_context: str = "") -> str:
    """Genera el prompt de diagnóstico correspondiente sin depender de un diagnóstico previo."""
    if diagnosis_type == "functional":
        return get_functional_medicine_prompt(full_patient, "", visit_data=full_visit, extra_context=extra_context)
    if diagnosis_type == "longevity":
        return get_longevity_diagnosis_prompt(full_patient, "", visit_data=full_visit, extra_context=extra_context)
    return get_traditional_diagnosis_prompt(full_patient, full_visit, extra_context=extra_context)


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
    """Quita ```json ... ``` si el modelo envuelve el JSON en un bloque de código."""
    t = text.strip()
    m = re.match(r'^```(?:json)?\s*([\s\S]*?)\s*```$', t)
    return m.group(1).strip() if m else t


def call_claude(prompt: str, system: str = "", model: str = MODEL_DIAGNOSE, max_tokens: int = 2000) -> str:
    kwargs = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        kwargs["system"] = system
    response = client.messages.create(**kwargs)
    return response.content[0].text


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
    Analiza el caso completo PRIMERO (borrador silencioso, no se muestra al médico),
    y luego genera hasta 3 preguntas de aclaración basadas en lo que ese borrador
    encontró menos certero. El borrador se guarda en el registro de análisis para
    usarse en /finalize_first sin tener que repetir el análisis.
    """
    import json as json_lib
    try:
        visit_record = get_visit(visit_id) or {}
        patient_id = body.patient_data.get("patient_id") or visit_record.get("patient_id", "")
        patient_record = get_patient(patient_id) if patient_id else {}

        full_patient = {**body.patient_data, **patient_record}
        full_visit = visit_record
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

        # 1) Analiza el caso completo y guarda el borrador (no se muestra aún al médico)
        draft_prompt = build_diagnosis_prompt(diagnosis_type, full_patient, full_visit)
        raw_draft = call_claude(draft_prompt, model=MODEL_DIAGNOSE)
        draft_metadata, draft_diagnosis = extract_structured_header(raw_draft)

        val_prompt = get_secondary_validation_prompt(draft_diagnosis)
        draft_validation = call_claude(val_prompt, model=MODEL_VALIDATE, max_tokens=800)

        update_analysis(visit_id, {
            "draft_diagnosis": draft_diagnosis,
            "draft_confidence": draft_metadata["confidence"],
            "draft_validation": draft_validation,
            "draft_type": diagnosis_type,
            "updated_at": datetime.utcnow().isoformat(),
        })

        # 2) Con el borrador ya generado, identifica si hace falta preguntar algo al paciente
        from services.system_prompt import get_clarifying_questions_prompt
        prompt = get_clarifying_questions_prompt(full_patient, full_visit, draft_diagnosis=draft_diagnosis)
        raw = call_claude(prompt, model=MODEL_CHAT, max_tokens=400)

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
        print(f"[ERROR clarify] {str(e)}")
        # No bloquear el flujo si falla
        return {"visit_id": visit_id, "questions": []}


@router.post("/{visit_id}/finalize_first")
async def finalize_first_diagnosis(
    visit_id: str,
    body: FinalizeFirstRequest,
    doctor_id: str = Depends(get_doctor_id),
):
    """
    Cierra el ciclo de la primera pregunta/respuesta del médico:
    - Si el médico no respondió nada, usa el borrador tal cual (sin gastar otra llamada a la IA).
    - Si respondió, cruza las respuestas con el borrador y solo ajusta el diagnóstico/certeza
      si las respuestas cambian algo materialmente.
    """
    try:
        analysis = get_analysis(visit_id)
        if not analysis:
            raise HTTPException(404, "Análisis no encontrado")

        draft_diagnosis = analysis.get("draft_diagnosis") or ""
        draft_type = analysis.get("draft_type") or "traditional"
        draft_confidence = analysis.get("draft_confidence", 75)
        draft_validation = analysis.get("draft_validation") or ""

        if not draft_diagnosis:
            raise HTTPException(404, "No hay un borrador de diagnóstico para esta visita")

        doctor_answers = (body.doctor_answers or "").strip()

        if not doctor_answers:
            # El médico no agregó nada nuevo — usamos el borrador sin volver a llamar a la IA
            return {
                "visit_id": visit_id,
                "step": draft_type,
                "diagnosis": draft_diagnosis,
                "validation": draft_validation,
                "confidence": draft_confidence,
            }

        visit_record = get_visit(visit_id) or {}
        patient_id = analysis.get("patient_id")
        patient_data = get_patient(patient_id) if patient_id else {}

        extra_context = f"""
BORRADOR DE DIAGNÓSTICO GENERADO ANTES DE LAS PREGUNTAS DE ACLARACIÓN:
{draft_diagnosis}

RESPUESTAS DEL MÉDICO A LAS PREGUNTAS DE ACLARACIÓN:
{doctor_answers}

INSTRUCCIÓN: Si estas respuestas NO cambian el diagnóstico de forma material, repite el mismo
diagnóstico y los mismos porcentajes de certeza del borrador. Si SÍ cambian algo, ajusta el
diagnóstico y/o los porcentajes de certeza en consecuencia.
"""

        prompt = build_diagnosis_prompt(draft_type, patient_data, visit_record, extra_context=extra_context)
        raw = call_claude(prompt, model=MODEL_DIAGNOSE)
        metadata, diagnosis = extract_structured_header(raw)

        val_prompt = get_secondary_validation_prompt(diagnosis)
        validation = call_claude(val_prompt, model=MODEL_VALIDATE, max_tokens=800)

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

        prompt = get_traditional_diagnosis_prompt(full_patient, full_visit, extra_context=extra_context)
        raw = call_claude(prompt, model=MODEL_DIAGNOSE)
        metadata, diagnosis = extract_structured_header(raw)

        val_prompt = get_secondary_validation_prompt(diagnosis)
        validation = call_claude(val_prompt, model=MODEL_VALIDATE, max_tokens=800)

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
            extra_context=doctor_context + chat_snippet
        )
        raw = call_claude(prompt, model=MODEL_DIAGNOSE)
        metadata, diagnosis = extract_structured_header(raw)

        val_prompt = get_secondary_validation_prompt(diagnosis)
        validation = call_claude(val_prompt, model=MODEL_VALIDATE, max_tokens=800)

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
            visit_data=visit_record,
            extra_context=ctx_trad + ctx_func + ctx_answers + chat_snippet
        )
        raw = call_claude(prompt, model=MODEL_DIAGNOSE)
        metadata, diagnosis = extract_structured_header(raw)

        val_prompt = get_secondary_validation_prompt(diagnosis)
        validation = call_claude(val_prompt, model=MODEL_VALIDATE, max_tokens=800)

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


@router.post("/{visit_id}/protocol")
async def run_protocol(
    visit_id: str,
    body: ProtocolRequest,
    doctor_id: str = Depends(get_doctor_id),
):
    """Genera el protocolo."""
    try:
        analysis = get_analysis(visit_id)
        if not analysis:
            raise HTTPException(404, "Análisis no encontrado")

        visit_record = get_visit(visit_id) or {}
        patient_id = analysis.get("patient_id")
        patient_data = get_patient(patient_id) if patient_id else {}

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

        prompt = get_protocol_prompt(patient_data, full_diagnosis, body.protocol_type, visit_data=visit_record)
        protocol = call_claude(prompt, model=MODEL_DIAGNOSE, max_tokens=4000)
        protocol = _strip_json_fences(protocol)

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
    doctor_id: str = Depends(get_doctor_id),
):
    """Cierra la visita."""
    try:
        update_analysis(visit_id, {
            "status": "closed",
            "updated_at": datetime.utcnow().isoformat()
        })
        return {
            "visit_id": visit_id,
            "status": "closed",
        }
    except Exception as e:
        raise HTTPException(500, str(e))
