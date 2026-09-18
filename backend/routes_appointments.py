"""
Agenda / calendario de citas de la clínica.
Una cita tiene: horario, ubicación, doctor, paciente (o nombre suelto) y notas.
Se comparte por toda la clínica (todas las sedes); se filtra por rango de fechas,
ubicación y doctor. El admin proveedor no participa (no es parte de una clínica).
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from auth import get_actor
from db import supabase

router = APIRouter(prefix="/appointments", tags=["agenda"])

ROLES_AGENDA = {"doctor", "receptionist", "nurse"}
ESTADOS = {"scheduled", "confirmed", "arrived", "done", "cancelled", "no_show"}


def _clinic_of(actor: dict) -> str:
    return actor.get("clinic_id") or actor.get("doctor_id")


def _require_agenda(authorization: Optional[str]) -> dict:
    actor = get_actor(authorization)
    if actor["role"] not in ROLES_AGENDA:
        raise HTTPException(403, "Tu rol no puede usar la agenda")
    if not _clinic_of(actor):
        raise HTTPException(400, "Tu cuenta no está asociada a una clínica")
    return actor


class ApptIn(BaseModel):
    starts_at: str                       # ISO 8601
    ends_at: Optional[str] = None
    location_id: Optional[str] = None
    doctor_id: Optional[str] = None
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    patient_phone: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "scheduled"


@router.get("/context")
async def context(authorization: Optional[str] = Header(None)):
    """Ubicaciones y doctores de la clínica, para poblar los filtros y el formulario."""
    actor = _require_agenda(authorization)
    clinic = _clinic_of(actor)
    locs = supabase.table("locations").select("id, name").eq("clinic_id", clinic)\
        .order("created_at").execute().data or []
    docs = supabase.table("doctor_profiles").select("id, display_name")\
        .eq("clinic_id", clinic).eq("role", "doctor").order("created_at").execute().data or []
    return {"locations": locs, "doctors": docs, "me": actor["user_id"], "role": actor["role"]}


@router.get("")
async def list_appointments(desde: str, hasta: str,
                            location_id: Optional[str] = None, doctor_id: Optional[str] = None,
                            authorization: Optional[str] = Header(None)):
    actor = _require_agenda(authorization)
    q = supabase.table("appointments").select("*")\
        .eq("clinic_id", _clinic_of(actor))\
        .gte("starts_at", desde).lte("starts_at", hasta)\
        .order("starts_at")
    if location_id:
        q = q.eq("location_id", location_id)
    if doctor_id:
        q = q.eq("doctor_id", doctor_id)
    return {"appointments": q.execute().data or []}


@router.post("")
async def create_appointment(body: ApptIn, authorization: Optional[str] = Header(None)):
    actor = _require_agenda(authorization)
    if not body.starts_at:
        raise HTTPException(400, "Falta la fecha/hora de la cita")
    if not (body.patient_name or body.patient_id):
        raise HTTPException(400, "Indica el paciente (nombre o expediente)")
    row = {
        "clinic_id": _clinic_of(actor),
        "location_id": body.location_id, "doctor_id": body.doctor_id,
        "patient_id": body.patient_id, "patient_name": (body.patient_name or "").strip() or None,
        "patient_phone": body.patient_phone, "starts_at": body.starts_at, "ends_at": body.ends_at,
        "status": body.status if body.status in ESTADOS else "scheduled",
        "reason": body.reason, "notes": body.notes,
        "created_by": actor["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    r = supabase.table("appointments").insert(row).execute()
    return r.data[0] if r.data else {}


@router.put("/{appt_id}")
async def update_appointment(appt_id: str, body: dict, authorization: Optional[str] = Header(None)):
    actor = _require_agenda(authorization)
    cur = supabase.table("appointments").select("clinic_id").eq("id", appt_id).limit(1).execute().data
    if not cur or cur[0].get("clinic_id") != _clinic_of(actor):
        raise HTTPException(404, "Cita no encontrada")
    campos = {"starts_at", "ends_at", "location_id", "doctor_id", "patient_id",
              "patient_name", "patient_phone", "reason", "notes", "status"}
    patch = {k: v for k, v in (body or {}).items() if k in campos}
    if "status" in patch and patch["status"] not in ESTADOS:
        patch.pop("status")
    if patch:
        patch["updated_at"] = datetime.now(timezone.utc).isoformat()
        supabase.table("appointments").update(patch).eq("id", appt_id).execute()
    return {"ok": True, **patch}


@router.delete("/{appt_id}")
async def cancel_appointment(appt_id: str, authorization: Optional[str] = Header(None)):
    actor = _require_agenda(authorization)
    cur = supabase.table("appointments").select("clinic_id").eq("id", appt_id).limit(1).execute().data
    if not cur or cur[0].get("clinic_id") != _clinic_of(actor):
        raise HTTPException(404, "Cita no encontrada")
    # Cancelar (no borrar) para conservar el registro.
    supabase.table("appointments").update({"status": "cancelled",
        "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", appt_id).execute()
    return {"ok": True}
