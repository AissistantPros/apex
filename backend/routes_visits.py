from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from uuid import uuid4
from datetime import datetime
from db import (
    insert_visit,
    get_visit,
    update_visit,
    list_patient_visits as db_list_patient_visits,
)

router = APIRouter(prefix="/visits", tags=["visits"])


async def get_doctor_id(authorization: Optional[str] = Header(None)) -> str:
    """Extrae doctor_id del header"""
    return "550e8400-e29b-41d4-a716-446655440000"


@router.post("/")
async def create_visit_root(
    visit_data: dict,
    authorization: Optional[str] = Header(None),
):
    """Crear visita con patient_id en el body (usado en flujo de nuevo paciente)"""
    patient_id = visit_data.get("patient_id")
    if not patient_id:
        raise HTTPException(400, "patient_id requerido")
    return await create_visit(patient_id, visit_data)


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
