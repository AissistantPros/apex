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
    color: Optional[str] = None

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
    from services.plans import PLAN_LABELS
    for c in clinics:
        c["locations_count"] = sum(1 for l in locs if l.get("clinic_id") == c["id"])
        c["users_count"] = sum(1 for u in users if u.get("clinic_id") == c["id"])
        c["plan_label"] = PLAN_LABELS.get(c.get("plan") or "apex", c.get("plan"))
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
    from services.plans import entitlements_for_clinic, FEATURES, FEATURE_LABELS, PLAN_LABELS
    ent = entitlements_for_clinic(c[0])
    return {"clinic": c[0], "locations": locations, "users": users,
            "entitlements": ent, "feature_list": FEATURES,
            "feature_labels": FEATURE_LABELS, "plan_labels": PLAN_LABELS}


@router.put("/clinics/{clinic_id}")
async def update_clinic(clinic_id: str, body: ClinicIn, authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    supabase.table("clinics").update({**body.dict(), "name": body.name.strip()})\
        .eq("id", clinic_id).execute()
    return {"ok": True}


@router.put("/clinics/{clinic_id}/plan")
async def set_plan(clinic_id: str, body: dict, authorization: Optional[str] = Header(None)):
    """Fija el plan (preset), los servicios (features), límites y créditos de IA."""
    _require_admin(authorization)
    from services.plans import PLAN_PRESETS, preset_features, FEATURES
    patch: dict = {}
    plan = body.get("plan")
    if plan in PLAN_PRESETS:
        patch["plan"] = plan
        # Si no mandan features explícitas, aplica el preset del plan
        if not isinstance(body.get("features"), dict):
            patch["features"] = preset_features(plan)
    if isinstance(body.get("features"), dict):
        patch["features"] = {f: bool(body["features"].get(f)) for f in FEATURES}
    if isinstance(body.get("limits"), dict):
        lim = {}
        for k in ("max_users", "max_locations"):
            if body["limits"].get(k) is not None:
                try: lim[k] = int(body["limits"][k])
                except Exception: pass
        patch["limits"] = lim
    if body.get("ai_credits") is not None:
        try: patch["ai_credits"] = int(body["ai_credits"])
        except Exception: pass
    if not patch:
        raise HTTPException(400, "Sin cambios")
    supabase.table("clinics").update(patch).eq("id", clinic_id).execute()
    from services.plans import get_entitlements
    return {"ok": True, "entitlements": get_entitlements(clinic_id)}


@router.post("/clinics/{clinic_id}/recharge")
async def recharge_credits(clinic_id: str, body: dict, authorization: Optional[str] = Header(None)):
    """Recarga créditos de IA: suma `amount` al saldo (ai_credits). Opcional `reset_used`
    para poner el consumo en 0. Solo el proveedor (admin)."""
    _require_admin(authorization)
    try:
        amount = int(body.get("amount") or 0)
    except Exception:
        raise HTTPException(400, "Monto inválido")
    if amount <= 0 and not body.get("reset_used"):
        raise HTTPException(400, "Indica un monto a recargar")
    cur = supabase.table("clinics").select("ai_credits, ai_credits_used").eq("id", clinic_id)\
        .limit(1).execute().data
    if not cur:
        raise HTTPException(404, "Clínica no encontrada")
    patch = {"ai_credits": (cur[0].get("ai_credits") or 0) + amount}
    if body.get("reset_used"):
        patch["ai_credits_used"] = 0
    supabase.table("clinics").update(patch).eq("id", clinic_id).execute()
    from services.plans import get_entitlements
    return {"ok": True, "entitlements": get_entitlements(clinic_id)}


# ─── Ubicaciones ──────────────────────────────────────────────────────────────
def _limit_of(clinic_id: str, key: str) -> Optional[int]:
    from services.plans import get_entitlements
    v = (get_entitlements(clinic_id).get("limits") or {}).get(key)
    return v if isinstance(v, int) and v > 0 else None


@router.post("/clinics/{clinic_id}/locations")
async def add_location(clinic_id: str, body: LocationIn, authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    if not body.name.strip():
        raise HTTPException(400, "El nombre de la ubicación es requerido")
    lim = _limit_of(clinic_id, "max_locations")
    if lim is not None:
        cur = supabase.table("locations").select("id", count="exact").eq("clinic_id", clinic_id).execute()
        if (cur.count or 0) >= lim:
            raise HTTPException(403, f"El plan permite hasta {lim} ubicaciones. Sube el plan o el límite para agregar más.")
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
    lim = _limit_of(clinic_id, "max_users")
    if lim is not None:
        cur = supabase.table("doctor_profiles").select("id", count="exact").eq("clinic_id", clinic_id).execute()
        if (cur.count or 0) >= lim:
            raise HTTPException(403, f"El plan permite hasta {lim} usuarios. Sube el plan o el límite para agregar más.")

    # El doctor es dueño (sin parent). El resto del staff cuelga del doctor principal.
    parent = None
    if body.role != "doctor":
        parent = _principal_doctor(clinic_id)
        if not parent:
            raise HTTPException(400, "Primero da de alta al doctor de esta clínica")

    email = (body.email or "").strip()
    if not email:
        email = f"{_slug(body.nombre)}.{secrets.randbelow(900) + 100}@staff.apex.mx"
    from routes_staff import _unique_username
    username = _unique_username(body.nombre)
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
    if isinstance(body.get("display_name"), str) and body["display_name"].strip():
        patch["display_name"] = body["display_name"].strip()
    if isinstance(body.get("username"), str) and body["username"].strip():
        from routes_staff import _unique_username
        patch["username"] = _unique_username(body["username"], exclude_id=uid)
    if isinstance(body.get("phone"), str):
        patch["phone"] = body["phone"].strip()
    if isinstance(body.get("photo_url"), str):
        patch["photo_url"] = body["photo_url"]
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
async def logs(limit: int = 150, clinic_id: Optional[str] = None,
               authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    q = supabase.table("usage_events").select("*").order("created_at", desc=True).limit(limit)
    if clinic_id:
        q = q.eq("clinic_id", clinic_id)
    events = q.execute().data or []
    # Resolver nombres de usuario
    uids = list({e.get("user_id") for e in events if e.get("user_id")})
    names = {}
    if uids:
        profs = supabase.table("doctor_profiles").select("id, display_name, role")\
            .in_("id", uids).execute().data or []
        names = {p["id"]: p for p in profs}
    for e in events:
        p = names.get(e.get("user_id")) or {}
        e["user_name"] = p.get("display_name") or "—"
        e["user_role"] = e.get("role") or p.get("role")
    return {"events": events}


@router.get("/usage-summary")
async def usage_summary(clinic_id: Optional[str] = None, authorization: Optional[str] = Header(None)):
    """Resumen: qué funciones se usan más/menos, total de eventos y tokens de IA."""
    _require_admin(authorization)
    q = supabase.table("usage_events").select("feature, ai_tokens, user_id").limit(5000)
    if clinic_id:
        q = q.eq("clinic_id", clinic_id)
    rows = q.execute().data or []
    by_feature: dict = {}
    tokens = 0
    users = set()
    for r in rows:
        f = r.get("feature") or "otro"
        by_feature[f] = by_feature.get(f, 0) + 1
        tokens += r.get("ai_tokens") or 0
        if r.get("user_id"):
            users.add(r["user_id"])
    ranked = sorted(by_feature.items(), key=lambda x: x[1], reverse=True)
    return {"total_events": len(rows), "ai_tokens": tokens, "active_users": len(users),
            "by_feature": [{"feature": k, "count": v} for k, v in ranked]}


@router.get("/tickets")
async def admin_tickets(status: Optional[str] = None, authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    q = supabase.table("support_tickets").select("*").order("updated_at", desc=True).limit(200)
    if status:
        q = q.eq("status", status)
    rows = q.execute().data or []
    cids = list({r.get("clinic_id") for r in rows if r.get("clinic_id")})
    cmap = {}
    if cids:
        cs = supabase.table("clinics").select("id, name").in_("id", cids).execute().data or []
        cmap = {c["id"]: c["name"] for c in cs}
    for r in rows:
        r["clinic_name"] = cmap.get(r.get("clinic_id"), "—")
    return {"tickets": rows}


@router.get("/tickets/{tid}")
async def admin_ticket_detail(tid: str, authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    t = supabase.table("support_tickets").select("*").eq("id", tid).limit(1).execute().data
    if not t:
        raise HTTPException(404, "Ticket no encontrado")
    msgs = supabase.table("support_ticket_messages").select("*").eq("ticket_id", tid)\
        .order("created_at").execute().data or []
    return {"ticket": t[0], "messages": msgs}


@router.post("/tickets/{tid}/reply")
async def admin_ticket_reply(tid: str, body: dict, authorization: Optional[str] = Header(None)):
    actor = _require_admin(authorization)
    from datetime import datetime, timezone
    text = (body.get("body") or "").strip()
    if not text:
        raise HTTPException(400, "Mensaje vacío")
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("support_ticket_messages").insert({
        "ticket_id": tid, "author_id": actor["user_id"], "author_side": "provider",
        "body": text, "created_at": now}).execute()
    supabase.table("support_tickets").update({"status": "in_progress", "updated_at": now}).eq("id", tid).execute()
    return {"ok": True}


@router.put("/tickets/{tid}")
async def admin_ticket_status(tid: str, body: dict, authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    from datetime import datetime, timezone
    st = body.get("status")
    if st in ("open", "in_progress", "closed"):
        supabase.table("support_tickets").update({"status": st,
            "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", tid).execute()
    return {"ok": True}


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
