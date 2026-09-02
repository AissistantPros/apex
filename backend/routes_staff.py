"""
Gestión de equipo (staff): el médico da de alta a su personal con login propio y define
qué puede ver y editar cada quien.

Roles: doctor | receptionist | accounting | nurse | marketing
Permisos por área: { area: 'none' | 'view' | 'edit' }. Cada rol trae permisos por defecto
que el médico puede ajustar por persona.
"""
import re
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from auth import get_actor
from db import supabase

router = APIRouter(prefix="/staff", tags=["staff"])
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Áreas de permiso que se pueden conceder
AREAS = ["pacientes", "cobros", "finanzas", "marketing", "biblioteca", "equipo"]

# Permisos por defecto según rol
DEFAULT_PERMS = {
    "doctor":       {a: "edit" for a in AREAS},
    "receptionist": {"cobros": "edit", "pacientes": "none", "finanzas": "none",
                     "marketing": "none", "biblioteca": "none", "equipo": "none"},
    "accounting":   {"finanzas": "edit", "cobros": "view", "marketing": "view",
                     "pacientes": "none", "biblioteca": "none", "equipo": "none"},
    "nurse":        {"pacientes": "edit", "cobros": "view", "finanzas": "none",
                     "marketing": "none", "biblioteca": "view", "equipo": "none"},
    "marketing":    {"marketing": "edit", "finanzas": "view", "cobros": "none",
                     "pacientes": "none", "biblioteca": "none", "equipo": "none"},
}
ROLES = list(DEFAULT_PERMS.keys())


def perms_para(role: str, override: Optional[dict] = None) -> dict:
    base = dict(DEFAULT_PERMS.get(role, DEFAULT_PERMS["receptionist"]))
    if override:
        for a in AREAS:
            if override.get(a) in ("none", "view", "edit"):
                base[a] = override[a]
    return base


class StaffIn(BaseModel):
    nombre: str
    email: str
    password: str
    role: str = "receptionist"
    permissions: Optional[dict] = None

class PermsIn(BaseModel):
    role: Optional[str] = None
    permissions: dict


def _require_manage(actor: dict):
    if (actor.get("permissions") or {}).get("equipo") != "edit" and actor["role"] != "doctor":
        raise HTTPException(403, "No tienes permiso para gestionar al equipo")


@router.get("")
async def list_staff(authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    _require_manage(actor)
    r = supabase.table("doctor_profiles").select("id, display_name, email, role, permissions, created_at")\
        .eq("parent_doctor_id", actor["doctor_id"]).execute()
    return {"staff": r.data or [], "areas": AREAS, "roles": ROLES}


@router.post("")
async def create_staff(body: StaffIn, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    _require_manage(actor)
    if body.role not in ROLES or body.role == "doctor":
        raise HTTPException(400, "Rol inválido")
    if not _EMAIL_RE.match((body.email or "").strip()):
        raise HTTPException(400, "Correo inválido")
    if len(body.password) < 6:
        raise HTTPException(400, "La contraseña debe tener al menos 6 caracteres")

    try:
        created = supabase.auth.admin.create_user({
            "email": body.email, "password": body.password, "email_confirm": True,
            "user_metadata": {"display_name": body.nombre, "role": body.role},
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
        "id": uid, "display_name": body.nombre, "email": body.email, "role": body.role,
        "parent_doctor_id": actor["doctor_id"], "permissions": perms_para(body.role, body.permissions),
    }).execute()
    return {"ok": True, "id": uid, "email": body.email, "nombre": body.nombre, "role": body.role}


@router.put("/{uid}/permissions")
async def update_perms(uid: str, body: PermsIn, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    _require_manage(actor)
    prof = supabase.table("doctor_profiles").select("id, parent_doctor_id, role")\
        .eq("id", uid).execute().data
    if not prof or prof[0].get("parent_doctor_id") != actor["doctor_id"]:
        raise HTTPException(403, "Ese miembro no pertenece a tu equipo")
    role = body.role if (body.role in ROLES and body.role != "doctor") else prof[0].get("role")
    supabase.table("doctor_profiles").update({
        "role": role, "permissions": perms_para(role, body.permissions),
    }).eq("id", uid).execute()
    return {"ok": True, "role": role, "permissions": perms_para(role, body.permissions)}


@router.delete("/{uid}")
async def delete_staff(uid: str, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    _require_manage(actor)
    prof = supabase.table("doctor_profiles").select("id, parent_doctor_id")\
        .eq("id", uid).execute().data
    if not prof or prof[0].get("parent_doctor_id") != actor["doctor_id"]:
        raise HTTPException(403, "Ese miembro no pertenece a tu equipo")
    try:
        supabase.auth.admin.delete_user(uid)
    except Exception as e:
        print(f"[WARN] no se pudo borrar el auth user {uid}: {e}")
    supabase.table("doctor_profiles").delete().eq("id", uid).execute()
    return {"ok": True}


@router.get("/defaults")
async def defaults():
    """Permisos por defecto de cada rol (para pre-llenar la matriz en el frontend)."""
    return {"areas": AREAS, "roles": ROLES, "defaults": DEFAULT_PERMS}


@router.get("/whoami")
async def whoami(authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    # El médico dueño tiene todos los permisos aunque su perfil no los liste
    if actor["role"] == "doctor" and not actor.get("permissions"):
        actor["permissions"] = {a: "edit" for a in AREAS}
    return actor
