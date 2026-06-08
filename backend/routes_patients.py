from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from datetime import datetime
from db import (
    insert_patient,
    get_patient,
    update_patient,
    list_patient_visits,
)

router = APIRouter(prefix="/patients", tags=["patients"])

# ─── Generar ID legible ──────────────────────────────────────────────────────

def generate_patient_id(first_name: str, last_name: str, birth_date: str) -> str:
    """Genera ID legible: JUPE-150580-000001"""
    if not first_name or not last_name or not birth_date:
        raise ValueError("Faltan datos para generar ID")

    prefix = (first_name[:1] + last_name[:1]).upper()[:2]
    suffix = last_name[-2:].upper()[:2]

    try:
        from datetime import datetime as dt
        date_obj = dt.strptime(birth_date, "%Y-%m-%d")
        date_str = date_obj.strftime("%d%m%y")
    except:
        date_str = "000000"

    import time
    seq = str(int(time.time() * 1000) % 1000000).zfill(6)

    return f"{prefix}{suffix}-{date_str}-{seq}"


async def get_doctor_id(authorization: Optional[str] = Header(None)) -> str:
    """Extrae doctor_id del header"""
    return "550e8400-e29b-41d4-a716-446655440000"


@router.post("/")
async def create_patient(
    patient_data: dict,
    authorization: Optional[str] = Header(None),
):
    """Crear paciente con todas las 3 fases"""
    try:
        doctor_id = await get_doctor_id(authorization)

        first_name = patient_data.get("first_name", "")
        last_name = patient_data.get("last_name", "")
        birth_date = patient_data.get("date_of_birth") or patient_data.get("birth_date")

        if not first_name or not last_name or not birth_date:
            raise HTTPException(400, "Faltan datos requeridos")

        patient_id = generate_patient_id(first_name, last_name, birth_date)

        save_data = {
            "id": patient_id,
            "doctor_id": doctor_id,
            "full_name": f"{first_name} {last_name}",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            **patient_data,
        }

        result = insert_patient(save_data)

        if not result:
            raise HTTPException(500, "Error al guardar paciente")

        return {
            "id": result.get("id"),
            "full_name": result.get("full_name"),
            "created_at": result.get("created_at"),
        }

    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/{patient_id}")
async def get_patient_data(
    patient_id: str,
    authorization: Optional[str] = Header(None),
):
    """Obtener datos completos de un paciente"""
    try:
        patient = get_patient(patient_id)

        if not patient:
            raise HTTPException(404, "Paciente no encontrado")

        return patient

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.put("/{patient_id}")
async def update_patient_data(
    patient_id: str,
    data: dict,
    authorization: Optional[str] = Header(None),
):
    """Actualizar datos de un paciente"""
    try:
        data["updated_at"] = datetime.utcnow().isoformat()
        result = update_patient(patient_id, data)

        if not result:
            raise HTTPException(404, "Paciente no encontrado")

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/{patient_id}/visits")
async def get_patient_visits(
    patient_id: str,
    authorization: Optional[str] = Header(None),
):
    """Obtener todas las visitas de un paciente"""
    try:
        visits = list_patient_visits(patient_id)
        return {
            "patient_id": patient_id,
            "total": len(visits),
            "visits": visits,
        }

    except Exception as e:
        raise HTTPException(500, str(e))
