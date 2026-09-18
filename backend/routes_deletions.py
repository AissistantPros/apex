"""
Borrado de expedientes de paciente CON APROBACIÓN DEL DOCTOR.

Por ley el expediente debe conservarse, así que no se borra a la ligera:
1. Alguien del equipo (recepción, enfermería o el propio doctor) SOLICITA la baja
   con un motivo. No se borra nada: queda una solicitud pendiente.
2. Al doctor le llega el aviso en su plataforma. SOLO el doctor puede aprobar o
   rechazar (ni un admin local, ni el proveedor). El doctor es super-admin local.
3. Al aprobar, se elimina el expediente y todo lo asociado, y queda registro de
   quién lo solicitó y quién lo aprobó.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from auth import get_actor
from db import supabase

router = APIRouter(prefix="/deletions", tags=["bajas-expediente"])

ROLES_SOLICITAN = {"doctor", "receptionist", "nurse"}


def _clinic_of(actor: dict) -> str:
    return actor.get("clinic_id") or actor.get("doctor_id")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class RequestIn(BaseModel):
    patient_id: str
    reason: Optional[str] = None


def _cascade_delete_patient(pid: str):
    """Elimina el paciente y todo lo asociado (visitas, análisis, notas, cobros, citas, logs)."""
    visits = supabase.table("visits").select("id").eq("patient_id", pid).execute().data or []
    vids = [v["id"] for v in visits]
    for vid in vids:
        for tbl in ("ai_call_logs", "prescription_log"):
            try: supabase.table(tbl).delete().eq("visit_id", vid).execute()
            except Exception: pass
    for tbl in ("analyses", "patient_notes", "sales", "appointments"):
        try: supabase.table(tbl).delete().eq("patient_id", pid).execute()
        except Exception: pass
    try: supabase.table("visits").delete().eq("patient_id", pid).execute()
    except Exception: pass
    supabase.table("patients").delete().eq("id", pid).execute()


@router.post("/request")
async def request_deletion(body: RequestIn, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if actor["role"] not in ROLES_SOLICITAN:
        raise HTTPException(403, "Tu rol no puede solicitar la baja de expedientes")
    clinic = _clinic_of(actor)
    pat = supabase.table("patients").select("id, full_name, doctor_id, clinic_id")\
        .eq("id", body.patient_id).limit(1).execute().data
    if not pat:
        raise HTTPException(404, "Paciente no encontrado")
    p = pat[0]
    if p.get("clinic_id") not in (clinic, None) and p.get("doctor_id") != clinic:
        raise HTTPException(403, "Ese paciente no pertenece a tu clínica")
    # Evita solicitudes duplicadas
    dup = supabase.table("deletion_requests").select("id")\
        .eq("patient_id", body.patient_id).eq("status", "pending").execute().data
    if dup:
        raise HTTPException(409, "Ya hay una solicitud de baja pendiente para este expediente")
    row = {
        "clinic_id": clinic, "patient_id": body.patient_id,
        "requested_by": actor["user_id"], "reason": (body.reason or "").strip() or None,
        "status": "pending", "created_at": _now(),
    }
    r = supabase.table("deletion_requests").insert(row).execute()
    return {"ok": True, "request": r.data[0] if r.data else {},
            "aviso": "La solicitud se envió al doctor para su aprobación."}


@router.get("/for-patient/{patient_id}")
async def pending_for_patient(patient_id: str, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if actor["role"] not in ROLES_SOLICITAN:
        return {"pending": False}
    r = supabase.table("deletion_requests").select("id, reason, created_at")\
        .eq("patient_id", patient_id).eq("status", "pending").limit(1).execute().data
    return {"pending": bool(r), "request": (r[0] if r else None)}


@router.get("/pending")
async def pending_list(authorization: Optional[str] = Header(None)):
    """Bandeja del doctor: solicitudes pendientes de su clínica."""
    actor = get_actor(authorization)
    if actor["role"] != "doctor":
        raise HTTPException(403, "Solo el doctor puede revisar las bajas de expediente")
    clinic = _clinic_of(actor)
    reqs = supabase.table("deletion_requests").select("*").eq("clinic_id", clinic)\
        .eq("status", "pending").order("created_at", desc=True).execute().data or []
    pids = list({r["patient_id"] for r in reqs if r.get("patient_id")})
    uids = list({r["requested_by"] for r in reqs if r.get("requested_by")})
    pmap, umap = {}, {}
    if pids:
        ps = supabase.table("patients").select("id, full_name").in_("id", pids).execute().data or []
        pmap = {p["id"]: p.get("full_name") for p in ps}
    if uids:
        us = supabase.table("doctor_profiles").select("id, display_name, role").in_("id", uids).execute().data or []
        umap = {u["id"]: u for u in us}
    for r in reqs:
        r["patient_name"] = pmap.get(r.get("patient_id"), "(expediente eliminado)")
        u = umap.get(r.get("requested_by")) or {}
        r["requested_by_name"] = u.get("display_name") or "—"
        r["requested_by_role"] = u.get("role")
    return {"requests": reqs}


@router.get("/pending/count")
async def pending_count(authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if actor["role"] != "doctor":
        return {"count": 0}
    clinic = _clinic_of(actor)
    r = supabase.table("deletion_requests").select("id", count="exact")\
        .eq("clinic_id", clinic).eq("status", "pending").execute()
    return {"count": r.count or 0}


def _load_own_pending(req_id: str, actor: dict) -> dict:
    if actor["role"] != "doctor":
        raise HTTPException(403, "Solo el doctor puede aprobar o rechazar una baja")
    r = supabase.table("deletion_requests").select("*").eq("id", req_id).limit(1).execute().data
    if not r or r[0].get("clinic_id") != _clinic_of(actor):
        raise HTTPException(404, "Solicitud no encontrada")
    if r[0].get("status") != "pending":
        raise HTTPException(409, "Esa solicitud ya fue resuelta")
    return r[0]


@router.post("/{req_id}/approve")
async def approve(req_id: str, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    req = _load_own_pending(req_id, actor)
    _cascade_delete_patient(req["patient_id"])
    supabase.table("deletion_requests").update({
        "status": "approved", "decided_by": actor["user_id"], "decided_at": _now()}).eq("id", req_id).execute()
    return {"ok": True, "deleted_patient_id": req["patient_id"]}


@router.post("/{req_id}/reject")
async def reject(req_id: str, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    _load_own_pending(req_id, actor)
    supabase.table("deletion_requests").update({
        "status": "rejected", "decided_by": actor["user_id"], "decided_at": _now()}).eq("id", req_id).execute()
    return {"ok": True}
