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
    doctor_traditional: str
    ai_traditional_original: str = ""


class LongevityRequest(BaseModel):
    doctor_traditional: str
    doctor_functional: str
    ai_traditional_original: str = ""
    ai_functional_original: str = ""


class ProtocolRequest(BaseModel):
    protocol_type: str
    doctor_traditional: str
    doctor_functional: str
    doctor_longevity: str
    ai_traditional_original: str = ""
    ai_functional_original: str = ""
    ai_longevity_original: str = ""


class ChatRequest(BaseModel):
    question: str
    current_diagnosis: str


def build_doctor_context(ai_original: str, doctor_version: str, label: str) -> str:
    """Genera texto de contexto explicando qué cambió el médico vs lo que propuso la IA."""
    if not ai_original or ai_original.strip() == doctor_version.strip():
        return f"\n{label} (aceptado sin cambios por el médico):\n{doctor_version}"
    return f"""
{label}:
- Lo que la IA propuso: {ai_original[:600]}{'...' if len(ai_original) > 600 else ''}
- Lo que el MÉDICO confirmó (versión final, puede tener cambios): {doctor_version}
NOTA: Si hay diferencias, el médico tiene razón. Su versión es la verdad clínica para este paciente.
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
    metadata = {"confidence": int, "question": str|None}
    """
    metadata = {"confidence": 75, "question": None}
    text = raw_text.strip()
    # Buscar la primera línea que sea JSON válido
    first_line_end = text.find('\n')
    if first_line_end > 0:
        first_line = text[:first_line_end].strip()
        try:
            parsed = json.loads(first_line)
            if "confidence" in parsed:
                metadata["confidence"] = int(parsed.get("confidence", 75))
                q = parsed.get("question")
                metadata["question"] = q if q and q != "null" else None
                return metadata, text[first_line_end:].strip()
        except Exception:
            pass
    # También buscar JSON inline con regex
    m = re.search(r'\{[^}]*"confidence"\s*:\s*\d+[^}]*\}', text)
    if m:
        try:
            parsed = json.loads(m.group())
            metadata["confidence"] = int(parsed.get("confidence", 75))
            q = parsed.get("question")
            metadata["question"] = q if q and q != "null" else None
            cleaned = text[:m.start()].strip() + "\n" + text[m.end():].strip()
            return metadata, cleaned.strip()
        except Exception:
            pass
    return metadata, text


@router.post("/{visit_id}/traditional")
async def run_traditional(
    visit_id: str,
    patient_data: dict,
    doctor_id: str = Depends(get_doctor_id),
):
    """Genera el diagnóstico de medicina tradicional."""
    try:
        # Cargar visita y paciente completos desde Supabase
        visit_record = get_visit(visit_id) or {}
        patient_id = patient_data.get("patient_id") or visit_record.get("patient_id", "")
        patient_record = get_patient(patient_id) if patient_id else {}

        # Mezclar lo que venga del frontend con lo de Supabase (Supabase tiene precedencia)
        full_patient = {**patient_data, **patient_record}
        full_visit = visit_record

        # Crear registro en Supabase
        analysis_record = {
            "id": f"analysis_{visit_id}",
            "visit_id": visit_id,
            "patient_id": patient_id,
            "doctor_id": doctor_id,
            "status": "in_progress",
            "chat_history": [],
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }

        insert_analysis(analysis_record)

        prompt = get_traditional_diagnosis_prompt(full_patient, full_visit)
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
            "ai_question": metadata["question"],
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
            raise HTTPException(404, "Análisis no encontrado")

        visit_record = get_visit(visit_id) or {}
        patient_id = analysis.get("patient_id")
        patient_data = get_patient(patient_id) if patient_id else {}

        doctor_context = build_doctor_context(
            body.ai_traditional_original,
            body.doctor_traditional,
            "DIAGNÓSTICO TRADICIONAL"
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
            "ai_question": metadata["question"],
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
            raise HTTPException(404, "Análisis no encontrado")

        visit_record = get_visit(visit_id) or {}
        patient_id = analysis.get("patient_id")
        patient_data = get_patient(patient_id) if patient_id else {}

        ctx_trad = build_doctor_context(
            body.ai_traditional_original, body.doctor_traditional, "DIAGNÓSTICO TRADICIONAL"
        )
        ctx_func = build_doctor_context(
            body.ai_functional_original, body.doctor_functional, "DIAGNÓSTICO FUNCIONAL"
        )
        chat_snippet = _chat_snippet(analysis.get("chat_history", []))

        prompt = get_longevity_diagnosis_prompt(
            patient_data,
            body.doctor_functional,
            visit_data=visit_record,
            extra_context=ctx_trad + ctx_func + chat_snippet
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
            "ai_question": metadata["question"],
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

        full_diagnosis = f"""{diagnosis}

DIAGNÓSTICOS PREVIOS CONFIRMADOS POR EL MÉDICO:
• Tradicional: {body.doctor_traditional}
• Funcional: {body.doctor_functional}
• Longevidad: {body.doctor_longevity}"""

        prompt = get_protocol_prompt(patient_data, full_diagnosis, body.protocol_type, visit_data=visit_record)
        protocol = call_claude(prompt, model=MODEL_DIAGNOSE)

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

        system = f"""Eres APEX, asistente médico IA. Contexto actual: {step_labels.get(step, step)}.

REGLAS:
- El médico tiene al paciente enfrente. Sé breve, máximo 3-4 oraciones por respuesta.
- Usa términos médicos — no expliques lo obvio.
- Si el médico comparte nueva información clínica (síntomas, historia), dile concretamente si cambia el diagnóstico y cómo.
- Si NO cambia el diagnóstico, explica por qué en 1-2 líneas.
- Si cambia el diagnóstico, di: "Esto modifica el diagnóstico: [nuevo dx]. Te recomiendo editar el texto antes de continuar."
- Tono: colega médico, directo, técnico pero amable.
- Este chat es continuo — tienes contexto de toda la sesión."""

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
