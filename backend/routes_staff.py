"""
Gestión de equipo (staff): el médico da de alta a su personal con acceso propio y define
qué puede ver y editar cada quien.

Seguridad de credenciales: al crear una cuenta se genera un usuario (a partir del nombre) y
una contraseña ALEATORIA segura. La contraseña se muestra UNA sola vez y no se guarda de forma
legible; después solo se puede REGENERAR (nunca ver la anterior).

Roles: doctor | receptionist | nurse | accounting | marketing
Permisos por área: { area: 'none' | 'view' | 'edit' }.
"""
import re
import secrets
import unicodedata
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from auth import get_actor
from db import supabase

router = APIRouter(prefix="/staff", tags=["staff"])
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Áreas de permiso
AREAS = ["pacientes", "historial", "enfermeria", "prescripcion",
         "cobros", "gastos", "finanzas", "marketing", "marketing_captura",
         "biblioteca", "equipo"]

# Permisos por defecto según rol
_N = {a: "none" for a in AREAS}
DEFAULT_PERMS = {
    "doctor":       {a: "edit" for a in AREAS},
    "receptionist": {**_N, "pacientes": "edit", "prescripcion": "edit",
                     "cobros": "edit", "gastos": "edit"},
    "nurse":        {**_N, "enfermeria": "edit", "pacientes": "view"},
    "accounting":   {**_N, "finanzas": "edit", "gastos": "edit",
                     "cobros": "view", "marketing": "view"},
    "marketing":    {**_N, "marketing": "edit", "marketing_captura": "edit", "finanzas": "view"},
}
ROLES = list(DEFAULT_PERMS.keys())
PW_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def perms_para(role: str, override: Optional[dict] = None) -> dict:
    base = dict(DEFAULT_PERMS.get(role, DEFAULT_PERMS["receptionist"]))
    if override:
        for a in AREAS:
            if override.get(a) in ("none", "view", "edit"):
                base[a] = override[a]
        # Config extra (p.ej. alcance de ingresos para contabilidad)
        if isinstance(override.get("ingresos_scope"), dict):
            base["ingresos_scope"] = override["ingresos_scope"]
    return base


def _slug(nombre: str) -> str:
    s = unicodedata.normalize("NFKD", nombre or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", ".", s).strip(".").lower()
    return s or "usuario"


def _gen_password(n: int = 12) -> str:
    return "".join(secrets.choice(PW_ALPHABET) for _ in range(n))


class StaffIn(BaseModel):
    nombre: str
    email: Optional[str] = None       # opcional; si falta se genera un usuario con el nombre
    role: str = "receptionist"
    permissions: Optional[dict] = None

class PermsIn(BaseModel):
    role: Optional[str] = None
    permissions: dict


def _require_manage(actor: dict):
    """Pueden administrar staff: el admin proveedor, el doctor (super-admin local) y
    quien el doc haya designado como admin local (is_local_admin o permiso 'equipo'=edit)."""
    if (actor["role"] in ("doctor", "admin")
            or actor.get("is_local_admin")
            or (actor.get("permissions") or {}).get("equipo") == "edit"):
        return
    raise HTTPException(403, "No tienes permiso para gestionar al equipo")


def _es_doctor_principal(uid: str, clinic_owner: str) -> bool:
    """El doctor principal es el dueño de la clínica (parent de todos). Intocable:
    sin él se pierde el acceso a los pacientes. Solo el proveedor puede removerlo,
    y solo tras exportar la DB (flujo aparte)."""
    return bool(uid) and uid == clinic_owner


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

    # Usuario: correo real si lo dieron, o uno generado con el nombre
    email = (body.email or "").strip()
    if email and not _EMAIL_RE.match(email):
        raise HTTPException(400, "Correo inválido")
    if not email:
        email = f"{_slug(body.nombre)}.{secrets.randbelow(900) + 100}@staff.apex.mx"

    password = _gen_password()   # aleatoria, segura, se muestra una sola vez
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

    supabase.table("doctor_profiles").upsert({
        "id": uid, "display_name": body.nombre, "email": email, "role": body.role,
        "parent_doctor_id": actor["doctor_id"], "permissions": perms_para(body.role, body.permissions),
    }).execute()

    # La contraseña se devuelve UNA vez; no se guarda de forma legible.
    return {"ok": True, "id": uid, "usuario": email, "password": password,
            "nombre": body.nombre, "role": body.role}


@router.post("/{uid}/password")
async def regenerate_password(uid: str, authorization: Optional[str] = Header(None)):
    """Genera una NUEVA contraseña. La anterior no se puede recuperar."""
    actor = get_actor(authorization)
    _require_manage(actor)
    prof = supabase.table("doctor_profiles").select("id, parent_doctor_id, email")\
        .eq("id", uid).execute().data
    if not prof or prof[0].get("parent_doctor_id") != actor["doctor_id"]:
        raise HTTPException(403, "Ese miembro no pertenece a tu equipo")
    password = _gen_password()
    try:
        supabase.auth.admin.update_user_by_id(uid, {"password": password})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"No se pudo regenerar: {str(e)[:200]}")
    return {"ok": True, "usuario": prof[0].get("email"), "password": password}


@router.put("/{uid}/permissions")
async def update_perms(uid: str, body: PermsIn, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    _require_manage(actor)
    prof = supabase.table("doctor_profiles").select("id, parent_doctor_id, role")\
        .eq("id", uid).execute().data
    if not prof or prof[0].get("parent_doctor_id") != actor["doctor_id"]:
        raise HTTPException(403, "Ese miembro no pertenece a tu equipo")
    role = body.role if (body.role in ROLES and body.role != "doctor") else prof[0].get("role")
    nuevos = perms_para(role, body.permissions)
    supabase.table("doctor_profiles").update({"role": role, "permissions": nuevos}).eq("id", uid).execute()
    return {"ok": True, "role": role, "permissions": nuevos}


@router.delete("/{uid}")
async def delete_staff(uid: str, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    _require_manage(actor)
    # El doctor principal es intocable: nadie (ni un admin local) lo puede quitar, porque sin
    # él se pierde el acceso a los pacientes. Solo el proveedor puede, y por un flujo aparte
    # que exige exportar la DB primero.
    if _es_doctor_principal(uid, actor["doctor_id"]):
        raise HTTPException(403, "El doctor principal no se puede eliminar. Contacta al proveedor "
                                 "(requiere exportar y resguardar la base de pacientes primero).")
    prof = supabase.table("doctor_profiles").select("id, parent_doctor_id")\
        .eq("id", uid).execute().data
    if not prof or prof[0].get("parent_doctor_id") != actor["doctor_id"]:
        raise HTTPException(403, "Ese miembro no pertenece a tu equipo")
    try:
        supabase.auth.admin.delete_user(uid)
    except HTTPException:
        raise
    except Exception as e:
        print(f"[WARN] no se pudo borrar el auth user {uid}: {e}")
    supabase.table("doctor_profiles").delete().eq("id", uid).execute()
    return {"ok": True}


@router.get("/defaults")
async def defaults():
    return {"areas": AREAS, "roles": ROLES, "defaults": DEFAULT_PERMS}


@router.get("/whoami")
async def whoami(authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if actor["role"] in ("doctor", "admin") and not actor.get("permissions"):
        actor["permissions"] = {a: "edit" for a in AREAS}
    # Servicios contratados (para que el menú/UI muestre solo lo habilitado)
    try:
        from services.plans import get_entitlements
        actor["entitlements"] = get_entitlements(actor.get("clinic_id"))
    except Exception:
        actor["entitlements"] = None
    return actor


@router.get("/entitlements")
async def entitlements(authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    from services.plans import get_entitlements
    return get_entitlements(actor.get("clinic_id"))


# ── Perfil personal (cada quien edita SU propia identidad) ──────────────────────
# Campos que un miembro puede editar de sí mismo. Nunca role/permissions/parent.
_ME_EDITABLE = {"display_name", "photo_url", "phone", "ai_name_preference"}


@router.get("/me")
async def my_profile(authorization: Optional[str] = Header(None)):
    """Identidad propia del usuario en sesión (su fila, no la del consultorio)."""
    actor = get_actor(authorization)
    r = supabase.table("doctor_profiles").select(
        "id, display_name, email, phone, photo_url, role, ai_name_preference"
    ).eq("id", actor["user_id"]).limit(1).execute().data
    prof = r[0] if r else {"id": actor["user_id"], "role": actor["role"]}
    prof["role"] = actor["role"]
    return prof


@router.put("/me")
async def update_my_profile(body: dict, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    patch = {k: v for k, v in (body or {}).items() if k in _ME_EDITABLE}
    if not patch:
        raise HTTPException(400, "Sin cambios válidos")
    exists = supabase.table("doctor_profiles").select("id").eq("id", actor["user_id"]).limit(1).execute().data
    if exists:
        supabase.table("doctor_profiles").update(patch).eq("id", actor["user_id"]).execute()
    else:
        # Fila mínima si aún no existe (p.ej. el propio doctor recién creado)
        supabase.table("doctor_profiles").insert({"id": actor["user_id"], "role": actor["role"], **patch}).execute()
    return {"ok": True, **patch}
