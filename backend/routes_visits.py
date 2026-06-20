from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from uuid import uuid4
from datetime import datetime
import traceback
from auth import get_doctor_id_from_token
from db import (
    insert_visit,
    get_visit,
    update_visit,
    list_patient_visits as db_list_patient_visits,
)

router = APIRouter(prefix="/visits", tags=["visits"])

# Campos numéricos de la tabla visits — strings vacíos se convierten a None
NUMERIC_VISIT_FIELDS = {
    "pa_der_sistolica","pa_der_diastolica","pa_izq_sistolica","pa_izq_diastolica",
    "fc","temperatura","glucosa","spo2",
    "peso","talla","imc","circ_abdominal","circ_cintura","circ_cadera",
    "circ_cuello","circ_biceps","circ_muneca",
    "inbody_grasa","inbody_musculo","inbody_agua","inbody_visceral",
    "fuerza_mano_der","fuerza_mano_izq",
    "energia_despertar","energia_tarde","energia_noche",
    "sueno_calidad","animo_val","digestion_val",
    "libido_visita","motivo_intensidad",
    # columnas inglés (legado)
    "heart_rate","temperature","glucose","weight","height",
    "grip_right","grip_left","sleep_quality","sleep_hours","libido",
    "discomfort_intensity",
    # medicina funcional — situación actual
    "bristol_scale","bowel_movements_per_day","stress_level",
    "sitting_hours","water_intake_liters","meals_per_day",
}

def clean_visit_data(data: dict) -> dict:
    """Convierte strings vacíos a None en campos numéricos y normaliza alias de columnas."""
    # Alias: el frontend puede enviar nombres en español; la DB usa inglés
    ALIASES = {
        "talla":     "height",
        "peso":      "weight",
        "fc":        "heart_rate",
        "temperatura": "temperature",
        "glucosa":   "glucose",
    }
    # Normalizar alias antes de limpiar
    normalized = {}
    for k, v in data.items():
        normalized[ALIASES.get(k, k)] = v

    cleaned = {}
    for k, v in normalized.items():
        if k in NUMERIC_VISIT_FIELDS:
            if v == "" or v is None:
                cleaned[k] = None
            else:
                try:
                    cleaned[k] = float(v)
                except (ValueError, TypeError):
                    cleaned[k] = None
        else:
            cleaned[k] = v
    return cleaned


@router.post("/")
async def create_visit_root(
    visit_data: dict,
    authorization: Optional[str] = Header(None),
):
    """Crear visita con patient_id en el body (usado en flujo de nuevo paciente)"""
    patient_id = visit_data.get("patient_id")
    if not patient_id:
        raise HTTPException(400, "patient_id requerido")
    # Pasar doctor_id ya resuelto para evitar bug de FieldInfo en llamada directa
    doctor_id = get_doctor_id_from_token(authorization)
    return await create_visit(patient_id, visit_data, doctor_id=doctor_id)


@router.post("/{patient_id}")
async def create_visit(
    patient_id: str,
    visit_data: dict,
    doctor_id: str = None,
    authorization: Optional[str] = Header(None),
):
    """Crear nueva visita para paciente"""
    try:
        if not doctor_id:
            # Llamada directa desde FastAPI (no desde create_visit_root)
            doctor_id = get_doctor_id_from_token(
                authorization if isinstance(authorization, (str, type(None))) else None
            )

        visit_id = str(uuid4())

        raw_data = {
            "id": visit_id,
            "patient_id": patient_id,
            "doctor_id": doctor_id,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            **visit_data,
        }
        save_data = clean_visit_data(raw_data)

        result = insert_visit(save_data)

        if not result:
            raise HTTPException(500, "Error al guardar visita")

        return {
            "id": result.get("id"),
            "patient_id": result.get("patient_id"),
            "created_at": result.get("created_at"),
        }

    except HTTPException:
        raise
    except Exception as e:
        detail = f"Error creando visita: {str(e)}\n{traceback.format_exc()}"
        print(detail)
        raise HTTPException(500, str(e))


@router.get("/{patient_id}")
async def list_patient_visits(
    patient_id: str,
):
    """Listar visitas de un paciente"""
    try:
        visits = db_list_patient_visits(patient_id)

        return {
            "total": len(visits),
            "visits": visits,
        }

    except Exception as e:
        raise HTTPException(500, str(e))


@router.put("/{visit_id}")
async def update_visit_data(
    visit_id: str,
    data: dict,
    authorization: Optional[str] = Header(None),
):
    """Actualizar datos de una visita (Fase 3: exploración médica)"""
    try:
        data["updated_at"] = datetime.utcnow().isoformat()
        data = clean_visit_data(data)
        result = update_visit(visit_id, data)
        if not result:
            raise HTTPException(404, "Visita no encontrada")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/{visit_id}/detail")
async def get_visit_detail(
    visit_id: str,
):
    """Obtener detalles de una visita"""
    try:
        visit = get_visit(visit_id)

        if not visit:
            raise HTTPException(404, "Visita no encontrada")

        return visit

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
