from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from uuid import uuid4
from datetime import datetime
from db import (
    insert_visit,
    get_visit,
    update_visit,
    list_patient_visits,
)

router = APIRouter(prefix="/visits", tags=["visits"])


async def get_doctor_id(authorization: Optional[str] = Header(None)) -> str:
    """Extrae doctor_id del header"""
    return "550e8400-e29b-41d4-a716-446655440000"


@router.post("/{patient_id}")
async def create_visit(
    patient_id: str,
    visit_data: dict,
    doctor_id: str = None,
):
    """Crear nueva visita para paciente"""
    try:
        if not doctor_id:
            doctor_id = await get_doctor_id()

        visit_id = str(uuid4())

        save_data = {
            "id": visit_id,
            "patient_id": patient_id,
            "doctor_id": doctor_id,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            **visit_data,
        }

        result = insert_visit(save_data)

        if not result:
            raise HTTPException(500, "Error al guardar visita")

        return {
            "id": result.get("id"),
            "patient_id": result.get("patient_id"),
            "created_at": result.get("created_at"),
        }

    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/{patient_id}")
async def list_patient_visits(
    patient_id: str,
    doctor_id: str = None,
):
    """Listar visitas de un paciente"""
    try:
        if not doctor_id:
            doctor_id = await get_doctor_id()

        visits = list_patient_visits(patient_id)

        return {
            "total": len(visits),
            "visits": visits,
        }

    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/{visit_id}/detail")
async def get_visit_detail(
    visit_id: str,
    doctor_id: str = None,
):
    """Obtener detalles de una visita"""
    try:
        if not doctor_id:
            doctor_id = await get_doctor_id()

        visit = get_visit(visit_id)

        if not visit:
            raise HTTPException(404, "Visita no encontrada")

        return visit

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
