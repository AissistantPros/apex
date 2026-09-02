"""
Gestión de staff: el médico da de alta recepcionistas con su propio login y permisos
limitados (solo cobros, no ven diagnósticos).

Un recepcionista es un usuario de Supabase Auth con un perfil role='receptionist' y
parent_doctor_id apuntando a su médico. La creación usa la Admin API (service key).
"""
from typing import Optional

import re

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from auth import get_actor
from db import supabase

router = APIRouter(prefix="/staff", tags=["staff"])
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ReceptionistIn(BaseModel):
    nombre: str
    email: str
    password: str


@router.get("")
async def list_staff(authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if actor["role"] == "receptionist":
        raise HTTPException(403, "No autorizado")
    r = supabase.table("doctor_profiles").select("id, display_name, email, role, created_at")\
        .eq("parent_doctor_id", actor["doctor_id"]).eq("role", "receptionist").execute()
    return {"staff": r.data or []}


@router.post("")
async def create_receptionist(body: ReceptionistIn, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if actor["role"] == "receptionist":
        raise HTTPException(403, "Recepción no puede dar de alta personal")
    if not _EMAIL_RE.match((body.email or "").strip()):
        raise HTTPException(400, "Correo inválido")
    if len(body.password) < 6:
        raise HTTPException(400, "La contraseña debe tener al menos 6 caracteres")

    # Crear el usuario en Supabase Auth (confirmado, para que pueda entrar de inmediato)
    try:
        created = supabase.auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
            "user_metadata": {"display_name": body.nombre, "role": "receptionist"},
        })
    except Exception as e:
        msg = str(e)
        if "already" in msg.lower() or "registered" in msg.lower():
            raise HTTPException(409, "Ya existe una cuenta con ese correo")
        raise HTTPException(500, f"No se pudo crear la cuenta: {msg[:200]}")

    new_user = getattr(created, "user", None) or created
    uid = getattr(new_user, "id", None) or (new_user.get("id") if isinstance(new_user, dict) else None)
    if not uid:
        raise HTTPException(500, "No se obtuvo el id del nuevo usuario")

    supabase.table("doctor_profiles").upsert({
        "id": uid, "display_name": body.nombre, "email": body.email,
        "role": "receptionist", "parent_doctor_id": actor["doctor_id"],
    }).execute()

    return {"ok": True, "id": uid, "email": body.email, "nombre": body.nombre}


@router.delete("/{uid}")
async def delete_receptionist(uid: str, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if actor["role"] == "receptionist":
        raise HTTPException(403, "No autorizado")
    # Verificar que el recepcionista pertenece a este médico antes de borrar
    prof = supabase.table("doctor_profiles").select("id, parent_doctor_id")\
        .eq("id", uid).execute().data
    if not prof or prof[0].get("parent_doctor_id") != actor["doctor_id"]:
        raise HTTPException(403, "Ese recepcionista no pertenece a tu clínica")
    try:
        supabase.auth.admin.delete_user(uid)
    except Exception as e:
        print(f"[WARN] no se pudo borrar el auth user {uid}: {e}")
    supabase.table("doctor_profiles").delete().eq("id", uid).execute()
    return {"ok": True}


@router.get("/whoami")
async def whoami(authorization: Optional[str] = Header(None)):
    """El frontend lo usa para saber el rol y enrutar/gating."""
    return get_actor(authorization)
