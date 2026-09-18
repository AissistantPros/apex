"""
Plataforma del ADMIN proveedor (nosotros). Módulo separable: a futuro puede vivir en
un sistema aparte interconectado que controle a TODOS los clientes.

El admin NO ve pacientes, historial, cobranza ni finanzas de ninguna clínica. Solo:
- da de alta clínicas → ubicaciones → personal (doctores y staff),
- otorga/quita permisos, regenera contraseñas,
- ve logs de uso y tickets de soporte.

Todo aquí exige rol 'admin' (proveedor global).
"""
import re
import secrets
import unicodedata
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from auth import get_actor
from db import supabase

router = APIRouter(prefix="/admin", tags=["admin-proveedor"])

PW_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
STAFF_ROLES = {"doctor", "receptionist", "nurse", "accounting", "marketing"}
AREAS = ["pacientes", "historial", "enfermeria", "prescripcion", "cobros", "gastos",
         "finanzas", "marketing", "marketing_captura", "biblioteca", "equipo"]


def _require_admin(authorization: Optional[str]) -> dict:
    actor = get_actor(authorization)
    if actor.get("role") != "admin":
        raise HTTPException(403, "Solo el administrador del proveedor puede acceder aquí")
    return actor


def _gen_password(n: int = 12) -> str:
    return "".join(secrets.choice(PW_ALPHABET) for _ in range(n))


def _slug(nombre: str) -> str:
    s = unicodedata.normalize("NFKD", nombre or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", ".", s).strip(".").lower()
    return s or "usuario"


# ─── Modelos ──────────────────────────────────────────────────────────────────
class ClinicIn(BaseModel):
    name: str
    website: Optional[str] = None
    logo_url: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None

class LocationIn(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    image_url: Optional[str] = None

class UserIn(BaseModel):
    nombre: str
    role: str = "doctor"
    email: Optional[str] = None
    permissions: Optional[dict] = None
    is_local_admin: bool = False
    location_ids: Optional[list] = None


# ─── Clínicas ─────────────────────────────────────────────────────────────────
@router.get("/clinics")
async def list_clinics(authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    clinics = supabase.table("clinics").select("*").order("created_at").execute().data or []
    # Conteos por clínica (ubicaciones y usuarios)
    locs = supabase.table("locations").select("id, clinic_id").execute().data or []
    users = supabase.table("doctor_profiles").select("id, clinic_id, role").execute().data or []
    for c in clinics:
        c["locations_count"] = sum(1 for l in locs if l.get("clinic_id") == c["id"])
        c["users_count"] = sum(1 for u in users if u.get("clinic_id") == c["id"])
    return {"clinics": clinics}


@router.post("/clinics")
async def create_clinic(body: ClinicIn, authorization: Optional[str] = Header(None)):
    actor = _require_admin(authorization)
    if not body.name.strip():
        raise HTTPException(400, "El nombre de la clínica es requerido")
    row = {**body.dict(), "name": body.name.strip(), "created_by": actor["user_id"]}
    r = supabase.table("clinics").insert(row).execute()
    return r.data[0] if r.data else {}


@router.get("/clinics/{clinic_id}")
async def clinic_detail(clinic_id: str, authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    c = supabase.table("clinics").select("*").eq("id", clinic_id).limit(1).execute().data
    if not c:
        raise HTTPException(404, "Clínica no encontrada")
    locations = supabase.table("locations").select("*").eq("clinic_id", clinic_id)\
        .order("created_at").execute().data or []
    users = supabase.table("doctor_profiles").select(
        "id, display_name, email, username, role, is_local_admin, permissions, parent_doctor_id, created_at"
    ).eq("clinic_id", clinic_id).order("created_at").execute().data or []
    ul = supabase.table("user_locations").select("user_id, location_id").execute().data or []
    by_user = {}
    for row in ul:
        by_user.setdefault(row["user_id"], []).append(row["location_id"])
    for u in users:
        u["location_ids"] = by_user.get(u["id"], [])
    return {"clinic": c[0], "locations": locations, "users": users}


@router.put("/clinics/{clinic_id}")
async def update_clinic(clinic_id: str, body: ClinicIn, authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    supabase.table("clinics").update({**body.dict(), "name": body.name.strip()})\
        .eq("id", clinic_id).execute()
    return {"ok": True}


# ─── Ubicaciones ──────────────────────────────────────────────────────────────
@router.post("/clinics/{clinic_id}/locations")
async def add_location(clinic_id: str, body: LocationIn, authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    if not body.name.strip():
        raise HTTPException(400, "El nombre de la ubicación es requerido")
    row = {**body.dict(), "name": body.name.strip(), "clinic_id": clinic_id}
    r = supabase.table("locations").insert(row).execute()
    return r.data[0] if r.data else {}


@router.put("/locations/{location_id}")
async def update_location(location_id: str, body: LocationIn, authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    supabase.table("locations").update({**body.dict(), "name": body.name.strip()})\
        .eq("id", location_id).execute()
    return {"ok": True}


@router.delete("/locations/{location_id}")
async def delete_location(location_id: str, authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    supabase.table("locations").delete().eq("id", location_id).execute()
    return {"ok": True}


# ─── Usuarios (doctores y staff) de una clínica ──────────────────────────────
def _principal_doctor(clinic_id: str) -> Optional[str]:
    """El doctor principal de la clínica (dueño: role=doctor sin parent)."""
    r = supabase.table("doctor_profiles").select("id")\
        .eq("clinic_id", clinic_id).eq("role", "doctor").is_("parent_doctor_id", "null")\
        .order("created_at").limit(1).execute().data
    return r[0]["id"] if r else None


@router.post("/clinics/{clinic_id}/users")
async def create_user(clinic_id: str, body: UserIn, authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    if body.role not in STAFF_ROLES:
        raise HTTPException(400, "Rol inválido")
    if not body.nombre.strip():
        raise HTTPException(400, "El nombre es requerido")

    # El doctor es dueño (sin parent). El resto del staff cuelga del doctor principal.
    parent = None
    if body.role != "doctor":
        parent = _principal_doctor(clinic_id)
        if not parent:
            raise HTTPException(400, "Primero da de alta al doctor de esta clínica")

    email = (body.email or "").strip()
    if not email:
        email = f"{_slug(body.nombre)}.{secrets.randbelow(900) + 100}@staff.apex.mx"
    username = _slug(body.nombre)
    password = _gen_password()

    try:
        created = supabase.auth.admin.create_user({
            "email": email, "password": password, "email_confirm": True,
            "user_metadata": {"display_name": body.nombre, "role": body.role},
        })
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e)
        if "already" in msg.lower() or "registered" in msg.lower():
            raise HTTPException(409, "Ya existe una cuenta con ese usuario/correo")
        raise HTTPException(500, f"No se pudo crear la cuenta: {msg[:200]}")

    new_user = getattr(created, "user", None) or created
    uid = getattr(new_user, "id", None) or (new_user.get("id") if isinstance(new_user, dict) else None)
    if not uid:
        raise HTTPException(500, "No se obtuvo el id del nuevo usuario")

    # Permisos: los que manden o los de por defecto del rol (para que el staff quede funcional).
    try:
        from routes_staff import perms_para
        perms = perms_para(body.role, body.permissions)
    except Exception:
        perms = body.permissions or {}
    supabase.table("doctor_profiles").upsert({
        "id": uid, "display_name": body.nombre, "email": email, "username": username,
        "role": body.role, "clinic_id": clinic_id, "parent_doctor_id": parent,
        "is_local_admin": bool(body.is_local_admin),
        "permissions": perms,
    }).execute()

    # Asignar ubicaciones
    for lid in (body.location_ids or []):
        try:
            supabase.table("user_locations").upsert({"user_id": uid, "location_id": lid}).execute()
        except Exception:
            pass

    return {"ok": True, "id": uid, "usuario": username, "email": email,
            "password": password, "nombre": body.nombre, "role": body.role}


@router.post("/users/{uid}/password")
async def regenerate_password(uid: str, authorization: Optional[str] = Header(None)):
    """Regenera la contraseña de cualquier usuario (recuperación sin correo)."""
    _require_admin(authorization)
    password = _gen_password()
    try:
        supabase.auth.admin.update_user_by_id(uid, {"password": password})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"No se pudo regenerar: {str(e)[:200]}")
    prof = supabase.table("doctor_profiles").select("username, email").eq("id", uid).execute().data
    usuario = (prof[0].get("username") or prof[0].get("email")) if prof else uid
    return {"ok": True, "usuario": usuario, "password": password}


@router.put("/users/{uid}")
async def update_user(uid: str, body: dict, authorization: Optional[str] = Header(None)):
    """Actualiza rol, permisos, admin local y ubicaciones de un usuario."""
    _require_admin(authorization)
    patch = {}
    if body.get("role") in STAFF_ROLES:
        patch["role"] = body["role"]
    if isinstance(body.get("permissions"), dict):
        patch["permissions"] = body["permissions"]
    if "is_local_admin" in body:
        patch["is_local_admin"] = bool(body["is_local_admin"])
    if patch:
        supabase.table("doctor_profiles").update(patch).eq("id", uid).execute()
    if isinstance(body.get("location_ids"), list):
        supabase.table("user_locations").delete().eq("user_id", uid).execute()
        for lid in body["location_ids"]:
            try:
                supabase.table("user_locations").upsert({"user_id": uid, "location_id": lid}).execute()
            except Exception:
                pass
    return {"ok": True}


# ─── Logs de uso (analítica del proveedor) ───────────────────────────────────
@router.get("/logs")
async def logs(limit: int = 100, clinic_id: Optional[str] = None,
               authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    q = supabase.table("usage_events").select("*").order("created_at", desc=True).limit(limit)
    if clinic_id:
        q = q.eq("clinic_id", clinic_id)
    events = q.execute().data or []
    return {"events": events}


@router.get("/overview")
async def overview(authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    clinics = supabase.table("clinics").select("id", count="exact").execute()
    locs = supabase.table("locations").select("id", count="exact").execute()
    users = supabase.table("doctor_profiles").select("id, role", count="exact").execute()
    tickets = supabase.table("support_tickets").select("id", count="exact")\
        .eq("status", "open").execute()
    return {
        "clinics": clinics.count or 0,
        "locations": locs.count or 0,
        "users": users.count or 0,
        "open_tickets": tickets.count or 0,
    }
