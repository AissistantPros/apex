"""
Chat en vivo del equipo de la clínica: recepción, enfermería y médico.
Canales: general (los tres) + uno directo por área. Un chat por clínica.
Tiempo casi real por polling (GET con ?after=<iso>).
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from auth import get_actor
from db import supabase

router = APIRouter(prefix="/messages", tags=["team-chat"])

CANALES = ["general", "recepcion", "enfermeria", "medico"]
# Roles que participan en el chat del equipo (nada más — los tres pidió el médico)
ROLES_CHAT = {"doctor", "receptionist", "nurse"}


class MsgIn(BaseModel):
    canal: str = "general"
    content: str


def _puede_chat(actor: dict) -> bool:
    return actor["role"] in ROLES_CHAT


@router.get("")
async def list_messages(canal: str = "general", after: Optional[str] = None, limit: int = 100,
                        authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if not _puede_chat(actor):
        raise HTTPException(403, "Tu rol no participa en el chat del equipo")
    if canal not in CANALES:
        raise HTTPException(400, "Canal inválido")
    q = supabase.table("team_messages").select("*")\
        .eq("clinic_id", actor["doctor_id"]).eq("canal", canal)\
        .order("created_at").limit(limit)
    if after:
        q = q.gt("created_at", after)
    msgs = q.execute().data or []
    return {"messages": msgs, "me": actor["user_id"], "role": actor["role"]}


@router.get("/unread")
async def unread(after: str, authorization: Optional[str] = Header(None)):
    """Cuántos mensajes nuevos hay por canal desde un timestamp (para el badge)."""
    actor = get_actor(authorization)
    if not _puede_chat(actor):
        return {"counts": {}}
    counts = {}
    for c in CANALES:
        r = supabase.table("team_messages").select("id", count="exact")\
            .eq("clinic_id", actor["doctor_id"]).eq("canal", c).gt("created_at", after)\
            .neq("author_id", actor["user_id"]).execute()
        counts[c] = r.count or 0
    return {"counts": counts}


@router.post("")
async def send_message(body: MsgIn, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if not _puede_chat(actor):
        raise HTTPException(403, "Tu rol no participa en el chat del equipo")
    if body.canal not in CANALES:
        raise HTTPException(400, "Canal inválido")
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(400, "Mensaje vacío")
    row = {
        "clinic_id": actor["doctor_id"], "canal": body.canal,
        "author_id": actor["user_id"], "author_role": actor["role"],
        "author_name": None, "content": content[:2000],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    # Nombre para mostrar (del perfil)
    try:
        prof = supabase.table("doctor_profiles").select("display_name").eq("id", actor["user_id"]).execute().data
        if prof:
            row["author_name"] = prof[0].get("display_name")
    except Exception:
        pass
    r = supabase.table("team_messages").insert(row).execute()
    return r.data[0] if r.data else {}
