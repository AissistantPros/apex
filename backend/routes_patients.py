from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from datetime import datetime
from auth import get_doctor_id_from_token
from db import (
    insert_patient,
    get_patient,
    update_patient,
    list_patients,
    list_patient_visits,
    get_doctor_profile,
    upsert_doctor_profile,
    add_patient_note,
    get_patient_notes,
    delete_patient_note,
)

router = APIRouter(prefix="/patients", tags=["patients"])

# Campos de tipo date en patients — strings vacíos causan error
DATE_PATIENT_FIELDS = {"date_of_birth", "birth_date"}

def clean_patient_data(data: dict) -> dict:
    """Convierte strings vacíos en campos date a None."""
    cleaned = {}
    for k, v in data.items():
        if k in DATE_PATIENT_FIELDS and v == "":
            cleaned[k] = None
        else:
            cleaned[k] = v
    return cleaned

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
    """Extrae doctor_id del JWT de Supabase."""
    return get_doctor_id_from_token(authorization)


@router.get("/")
async def get_all_patients(
    limit: int = 50,
    authorization: Optional[str] = Header(None),
):
    """Listar todos los pacientes"""
    try:
        patients = list_patients(limit=limit)
        return {
            "total": len(patients),
            "patients": patients,
        }
    except Exception as e:
        raise HTTPException(500, str(e))


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

        result = insert_patient(clean_patient_data(save_data))

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
        result = update_patient(patient_id, clean_patient_data(data))

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


@router.get("/{patient_id}/notes")
async def get_notes(patient_id: str, authorization: Optional[str] = Header(None)):
    """Listar todas las notas de un paciente"""
    try:
        notes = get_patient_notes(patient_id)
        return {"notes": notes}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/{patient_id}/notes")
async def create_note(patient_id: str, data: dict, authorization: Optional[str] = Header(None)):
    """Agregar nota con autor y timestamp"""
    try:
        content = data.get("content", "").strip()
        if not content:
            raise HTTPException(400, "El contenido de la nota no puede estar vacío")
        note = add_patient_note(
            patient_id=patient_id,
            visit_id=data.get("visit_id"),
            author_role=data.get("author_role", "doctor"),
            author_name=data.get("author_name", ""),
            content=content,
        )
        return note
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.delete("/{patient_id}/notes/{note_id}")
async def remove_note(patient_id: str, note_id: str, authorization: Optional[str] = Header(None)):
    """Eliminar una nota"""
    try:
        delete_patient_note(note_id)
        return {"deleted": True, "id": note_id}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.delete("/{patient_id}")
async def delete_patient(
    patient_id: str,
    authorization: Optional[str] = Header(None),
):
    """Eliminar paciente permanentemente"""
    try:
        from db import supabase
        supabase.table("patients").delete().eq("id", patient_id).execute()
        return {"deleted": True, "id": patient_id}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Doctor profile ──────────────────────────────────────

doctor_profile_router = APIRouter(prefix="/doctor", tags=["doctor"])

@doctor_profile_router.get("/profile")
async def get_profile(authorization: Optional[str] = Header(None)):
    doctor_id = get_doctor_id_from_token(authorization)
    profile = get_doctor_profile(doctor_id) or {}
    return profile

@doctor_profile_router.put("/profile")
async def save_profile(data: dict, authorization: Optional[str] = Header(None)):
    doctor_id = get_doctor_id_from_token(authorization)
    result = upsert_doctor_profile(doctor_id, data)
    return result or {"ok": True}
