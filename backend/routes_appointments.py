"""
Agenda / calendario de citas de la clínica.
Cita: horario, ubicación (obligatoria, con color), doctor, paciente y notas.
Incluye horario de consultas configurable, bloqueos de días/horarios y detección
de choques (no deja guardar si el horario se empalma con otra cita o un bloqueo).
El admin proveedor no participa (no es parte de una clínica).
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


def _can_manage(actor: dict) -> bool:
    """Quién puede editar horarios y crear bloqueos: doctor, asistente (recepción)
    y quien tenga admin local. La asistente es la encargada de las citas por default."""
    return actor["role"] in ("doctor", "receptionist") or bool(actor.get("is_local_admin"))


def _require_manage(authorization: Optional[str]) -> dict:
    actor = _require_agenda(authorization)
    if not _can_manage(actor):
        raise HTTPException(403, "No tienes permiso para ajustar horarios o bloqueos")
    return actor


def _overlap(a_start: str, a_end: str, b_start: str, b_end: str) -> bool:
    return a_start < b_end and a_end > b_start


def _conflict(clinic: str, start_iso: str, end_iso: str,
              location_id: Optional[str], doctor_id: Optional[str],
              exclude_id: Optional[str] = None) -> Optional[str]:
    """Devuelve un texto si el rango choca con otra cita o un bloqueo; None si está libre."""
    # Citas del mismo doctor o misma ubicación (activas)
    appts = supabase.table("appointments").select("id, starts_at, ends_at, doctor_id, location_id, patient_name, status")\
        .eq("clinic_id", clinic).neq("status", "cancelled").execute().data or []
    for a in appts:
        if exclude_id and a["id"] == exclude_id:
            continue
        if not a.get("ends_at"):
            continue
        same = (doctor_id and a.get("doctor_id") == doctor_id) or (location_id and a.get("location_id") == location_id)
        if same and _overlap(start_iso, end_iso, a["starts_at"], a["ends_at"]):
            return f"Choca con la cita de {a.get('patient_name') or 'otro paciente'} a esa hora."
    # Bloqueos (de la clínica o de esa ubicación)
    blocks = supabase.table("appointment_blocks").select("id, starts_at, ends_at, location_id, reason")\
        .eq("clinic_id", clinic).execute().data or []
    for b in blocks:
        if location_id and b.get("location_id") and b["location_id"] != location_id:
            continue
        if _overlap(start_iso, end_iso, b["starts_at"], b["ends_at"]):
            return f"Ese horario está bloqueado{(' (' + b['reason'] + ')') if b.get('reason') else ''}."
    return None


# ─── Modelos ──────────────────────────────────────────────────────────────────
class ApptIn(BaseModel):
    starts_at: str
    ends_at: Optional[str] = None
    location_id: Optional[str] = None
    doctor_id: Optional[str] = None
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    patient_phone: Optional[str] = None
    patient_email: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "scheduled"
    notify_email: Optional[bool] = False
    notify_whatsapp: Optional[bool] = False


class BlockIn(BaseModel):
    starts_at: str
    ends_at: str
    location_id: Optional[str] = None
    doctor_id: Optional[str] = None
    all_day: Optional[bool] = False
    reason: Optional[str] = None


class HoursIn(BaseModel):
    location_id: str
    ranges: list   # [{weekday, open_min, close_min}]


# ─── Contexto: sedes (con color), doctores, horarios ─────────────────────────
@router.get("/context")
async def context(authorization: Optional[str] = Header(None)):
    actor = _require_agenda(authorization)
    clinic = _clinic_of(actor)
    locs = supabase.table("locations").select("id, name, color").eq("clinic_id", clinic)\
        .order("created_at").execute().data or []
    docs = supabase.table("doctor_profiles").select("id, display_name")\
        .eq("clinic_id", clinic).eq("role", "doctor").order("created_at").execute().data or []
    loc_ids = [l["id"] for l in locs]
    hours: dict = {}
    if loc_ids:
        hrows = supabase.table("location_hours").select("location_id, weekday, open_min, close_min")\
            .in_("location_id", loc_ids).execute().data or []
        for h in hrows:
            hours.setdefault(h["location_id"], []).append(
                {"weekday": h["weekday"], "open_min": h["open_min"], "close_min": h["close_min"]})
    return {"locations": locs, "doctors": docs, "me": actor["user_id"], "role": actor["role"],
            "can_manage": _can_manage(actor), "hours": hours}


# ─── Búsqueda de pacientes (para autocompletar) ──────────────────────────────
@router.get("/patient-search")
async def patient_search(q: str, authorization: Optional[str] = Header(None)):
    actor = _require_agenda(authorization)
    q = (q or "").strip()
    if len(q) < 2:
        return {"results": []}
    clinic = _clinic_of(actor)
    rows = supabase.table("patients").select("id, full_name, phone, email, clinic_id, doctor_id")\
        .ilike("full_name", f"%{q}%").limit(20).execute().data or []
    # Solo pacientes de esta clínica
    out = [{"id": r["id"], "full_name": r.get("full_name"), "phone": r.get("phone"), "email": r.get("email")}
           for r in rows if r.get("clinic_id") == clinic or r.get("doctor_id") == clinic][:8]
    return {"results": out}


# ─── Listar citas + bloqueos en un rango ─────────────────────────────────────
@router.get("")
async def list_appointments(desde: str, hasta: str,
                            location_id: Optional[str] = None, doctor_id: Optional[str] = None,
                            authorization: Optional[str] = Header(None)):
    actor = _require_agenda(authorization)
    clinic = _clinic_of(actor)
    q = supabase.table("appointments").select("*").eq("clinic_id", clinic)\
        .gte("starts_at", desde).lte("starts_at", hasta).order("starts_at")
    if location_id:
        q = q.eq("location_id", location_id)
    if doctor_id:
        q = q.eq("doctor_id", doctor_id)
    appts = q.execute().data or []
    bq = supabase.table("appointment_blocks").select("*").eq("clinic_id", clinic)\
        .lte("starts_at", hasta).gte("ends_at", desde).order("starts_at")
    if location_id:
        bq = bq.or_(f"location_id.eq.{location_id},location_id.is.null")
    blocks = bq.execute().data or []
    return {"appointments": appts, "blocks": blocks}


@router.post("")
async def create_appointment(body: ApptIn, authorization: Optional[str] = Header(None)):
    actor = _require_agenda(authorization)
    if not body.starts_at or not body.ends_at:
        raise HTTPException(400, "Falta el horario de la cita")
    if not body.location_id:
        raise HTTPException(400, "Indica la ubicación/sucursal de la cita")
    if not (body.patient_name or body.patient_id):
        raise HTTPException(400, "Indica el paciente")
    clinic = _clinic_of(actor)
    choque = _conflict(clinic, body.starts_at, body.ends_at, body.location_id, body.doctor_id)
    if choque:
        raise HTTPException(409, choque)
    row = {
        "clinic_id": clinic, "location_id": body.location_id, "doctor_id": body.doctor_id,
        "patient_id": body.patient_id, "patient_name": (body.patient_name or "").strip() or None,
        "patient_phone": body.patient_phone, "patient_email": body.patient_email,
        "starts_at": body.starts_at, "ends_at": body.ends_at,
        "status": body.status if body.status in ESTADOS else "scheduled",
        "reason": body.reason, "notes": body.notes,
        "notify_email": bool(body.notify_email), "notify_whatsapp": bool(body.notify_whatsapp),
        "created_by": actor["user_id"], "created_at": datetime.now(timezone.utc).isoformat(),
    }
    r = supabase.table("appointments").insert(row).execute()
    return r.data[0] if r.data else {}


# ─── Bloqueos ────────────────────────────────────────────────────────────────
@router.post("/blocks")
async def create_block(body: BlockIn, authorization: Optional[str] = Header(None)):
    actor = _require_manage(authorization)
    if not body.starts_at or not body.ends_at:
        raise HTTPException(400, "Falta el rango del bloqueo")
    row = {
        "clinic_id": _clinic_of(actor), "location_id": body.location_id, "doctor_id": body.doctor_id,
        "starts_at": body.starts_at, "ends_at": body.ends_at,
        "all_day": bool(body.all_day), "reason": (body.reason or "").strip() or None,
        "created_by": actor["user_id"], "created_at": datetime.now(timezone.utc).isoformat(),
    }
    r = supabase.table("appointment_blocks").insert(row).execute()
    return r.data[0] if r.data else {}


@router.delete("/blocks/{block_id}")
async def delete_block(block_id: str, authorization: Optional[str] = Header(None)):
    actor = _require_manage(authorization)
    cur = supabase.table("appointment_blocks").select("clinic_id").eq("id", block_id).limit(1).execute().data
    if not cur or cur[0].get("clinic_id") != _clinic_of(actor):
        raise HTTPException(404, "Bloqueo no encontrado")
    supabase.table("appointment_blocks").delete().eq("id", block_id).execute()
    return {"ok": True}


# ─── Horario de consultas ────────────────────────────────────────────────────
@router.put("/hours")
async def set_hours(body: HoursIn, authorization: Optional[str] = Header(None)):
    actor = _require_manage(authorization)
    # Verifica que la ubicación sea de la clínica del actor
    loc = supabase.table("locations").select("clinic_id").eq("id", body.location_id).limit(1).execute().data
    if not loc or loc[0].get("clinic_id") != _clinic_of(actor):
        raise HTTPException(404, "Ubicación no encontrada")
    supabase.table("location_hours").delete().eq("location_id", body.location_id).execute()
    rows = []
    for r in (body.ranges or []):
        try:
            wd, o, c = int(r["weekday"]), int(r["open_min"]), int(r["close_min"])
        except Exception:
            continue
        if 0 <= wd <= 6 and 0 <= o < c <= 1440:
            rows.append({"location_id": body.location_id, "weekday": wd, "open_min": o, "close_min": c})
    if rows:
        supabase.table("location_hours").insert(rows).execute()
    return {"ok": True, "count": len(rows)}


# ─── Editar / cancelar una cita (rutas dinámicas AL FINAL, para no “tragarse”
#     las rutas estáticas como /hours o /blocks) ────────────────────────────────
@router.put("/{appt_id}")
async def update_appointment(appt_id: str, body: dict, authorization: Optional[str] = Header(None)):
    actor = _require_agenda(authorization)
    clinic = _clinic_of(actor)
    cur = supabase.table("appointments").select("*").eq("id", appt_id).limit(1).execute().data
    if not cur or cur[0].get("clinic_id") != clinic:
        raise HTTPException(404, "Cita no encontrada")
    campos = {"starts_at", "ends_at", "location_id", "doctor_id", "patient_id", "patient_name",
              "patient_phone", "patient_email", "reason", "notes", "status",
              "notify_email", "notify_whatsapp"}
    patch = {k: v for k, v in (body or {}).items() if k in campos}
    if "status" in patch and patch["status"] not in ESTADOS:
        patch.pop("status")
    # Si cambia el horario/lugar y no es cancelación, revalida choques.
    if patch.get("status") != "cancelled" and any(k in patch for k in ("starts_at", "ends_at", "location_id", "doctor_id")):
        merged = {**cur[0], **patch}
        if merged.get("starts_at") and merged.get("ends_at"):
            choque = _conflict(clinic, merged["starts_at"], merged["ends_at"],
                               merged.get("location_id"), merged.get("doctor_id"), exclude_id=appt_id)
            if choque:
                raise HTTPException(409, choque)
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
    supabase.table("appointments").update({"status": "cancelled",
        "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", appt_id).execute()
    return {"ok": True}
