"""
Tickets de soporte: el doctor (o un admin local) contacta al proveedor para pedir
una función, reportar algo o hacer una consulta. El proveedor responde desde su
plataforma de admin (ver routes_admin). Un hilo de mensajes por ticket.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from auth import get_actor
from db import supabase

router = APIRouter(prefix="/support", tags=["soporte"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _actor_clinic(authorization: Optional[str]):
    actor = get_actor(authorization)
    if actor["role"] != "doctor" and not actor.get("is_local_admin"):
        raise HTTPException(403, "Solo el doctor o un admin local puede usar soporte")
    clinic = actor.get("clinic_id") or actor.get("doctor_id")
    if not clinic:
        raise HTTPException(400, "Tu cuenta no está asociada a una clínica")
    return actor, clinic


class TicketIn(BaseModel):
    subject: str
    body: str
    kind: Optional[str] = "question"    # feature | bug | question | other


class MsgIn(BaseModel):
    body: str


@router.get("/tickets")
async def my_tickets(authorization: Optional[str] = Header(None)):
    actor, clinic = _actor_clinic(authorization)
    rows = supabase.table("support_tickets").select("*").eq("clinic_id", clinic)\
        .order("updated_at", desc=True).execute().data or []
    return {"tickets": rows}


@router.post("/tickets")
async def create_ticket(body: TicketIn, authorization: Optional[str] = Header(None)):
    actor, clinic = _actor_clinic(authorization)
    if not body.subject.strip() or not body.body.strip():
        raise HTTPException(400, "El asunto y el mensaje son requeridos")
    row = {
        "clinic_id": clinic, "created_by": actor["user_id"], "role": actor["role"],
        "subject": body.subject.strip(), "body": body.body.strip(),
        "kind": body.kind or "question", "status": "open",
        "created_at": _now(), "updated_at": _now(),
    }
    r = supabase.table("support_tickets").insert(row).execute()
    return r.data[0] if r.data else {}


@router.get("/tickets/{tid}")
async def ticket_detail(tid: str, authorization: Optional[str] = Header(None)):
    actor, clinic = _actor_clinic(authorization)
    t = supabase.table("support_tickets").select("*").eq("id", tid).limit(1).execute().data
    if not t or t[0].get("clinic_id") != clinic:
        raise HTTPException(404, "Ticket no encontrado")
    msgs = supabase.table("support_ticket_messages").select("*").eq("ticket_id", tid)\
        .order("created_at").execute().data or []
    return {"ticket": t[0], "messages": msgs}


@router.post("/tickets/{tid}/messages")
async def add_message(tid: str, body: MsgIn, authorization: Optional[str] = Header(None)):
    actor, clinic = _actor_clinic(authorization)
    t = supabase.table("support_tickets").select("clinic_id").eq("id", tid).limit(1).execute().data
    if not t or t[0].get("clinic_id") != clinic:
        raise HTTPException(404, "Ticket no encontrado")
    if not body.body.strip():
        raise HTTPException(400, "Mensaje vacío")
    supabase.table("support_ticket_messages").insert({
        "ticket_id": tid, "author_id": actor["user_id"], "author_side": "clinic",
        "body": body.body.strip(), "created_at": _now()}).execute()
    supabase.table("support_tickets").update({"status": "open", "updated_at": _now()}).eq("id", tid).execute()
    return {"ok": True}
