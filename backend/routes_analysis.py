from fastapi import APIRouter, HTTPException, Depends, Header
from typing import Optional
from uuid import UUID
import os
from anthropic import Anthropic

router = APIRouter(prefix="/analysis", tags=["analysis"])

client = Anthropic()

SYSTEM_PROMPT = """Eres un médico especialista en medicina funcional y longevidad.
Analiza los datos clínicos del paciente y proporciona:

1. DIAGNÓSTICO (medicina tradicional)
2. DIAGNÓSTICO (medicina funcional - raíz del problema)
3. DIAGNÓSTICO (longevidad - edad biológica estimada)
4. PROTOCOLO recomendado

Sé conciso, profesional y basado en evidencia.
Usa primera persona: "encontré", "me di cuenta que"."""


async def get_doctor_id(authorization: Optional[str] = Header(None)) -> str:
    return "550e8400-e29b-41d4-a716-446655440000"


@router.post("/{visit_id}")
async def analyze_visit(
    visit_id: UUID,
    visit_data: dict,
    doctor_id: str = Depends(get_doctor_id),
):
    """Analizar visita con Claude API"""

    try:
        # Preparar datos para Claude
        prompt = f"""
Paciente: {visit_data.get('visit_reason')}

SIGNOS VITALES:
- PA: {visit_data.get('pa_right')}/{visit_data.get('pa_left')} mmHg
- FC: {visit_data.get('heart_rate')} lpm
- Glucosa: {visit_data.get('glucose')} mg/dL
- SpO2: {visit_data.get('spo2')}%

COMPOSICIÓN:
- Peso: {visit_data.get('weight')} kg
- Altura: {visit_data.get('height')} m

SUBJETIVO:
- Energía: {visit_data.get('energy_morning')}/10
- Sueño: {visit_data.get('sleep_quality')}/10
- Ánimo: {visit_data.get('mood')}

Proporciona análisis clínico completo.
"""

        # Llamar a Claude
        message = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        analysis_text = message.content[0].text

        return {
            "status": "success",
            "visit_id": str(visit_id),
            "analysis": analysis_text,
            "diagnosis_traditional": "Ver análisis completo",
            "diagnosis_functional": "Ver análisis completo",
            "diagnosis_longevity": "Ver análisis completo",
            "protocol": "Ver análisis completo",
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{visit_id}/pdf")
async def generate_pdfs(
    visit_id: UUID,
    pdf_type: str,  # "recipe", "report", "studies"
    doctor_id: str = Depends(get_doctor_id),
):
    """Generar PDFs: receta, reporte, solicitud estudios"""

    pdf_content = {
        "recipe": "RECETA MÉDICA\n\nPaciente: [nombre]\nFecha: [fecha]\n\nMedicamentos: [protocolo]",
        "report": "REPORTE DEL PACIENTE\n\nDiagnóstico: [diagnóstico]\nEdad Biológica: [edad]\n\nProtocolo: [protocolo]",
        "studies": "SOLICITUD DE ESTUDIOS\n\nEstudios Recomendados:\n- [estudio 1]\n- [estudio 2]",
    }

    return {
        "status": "success",
        "pdf_type": pdf_type,
        "content": pdf_content.get(pdf_type, "PDF no disponible"),
        "download_url": f"http://localhost:8000/download/{visit_id}/{pdf_type}.pdf",
    }
