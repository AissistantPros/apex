"""
Costo de IA de LA PROPIA clínica (para el doctor / admin local).
Distinto de /admin/cost/* (proveedor global). Aquí SIEMPRE se filtra por la clínica
del usuario autenticado (ai_call_logs.clinic_id), porque el backend usa service role
y RLS no aplica: el scoping lo impone este código.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Header, HTTPException

from auth import get_actor
from db import supabase

router = APIRouter(prefix="/cost", tags=["costos"])


@router.get("/mine")
async def my_cost(days: int = 30, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if actor.get("role") != "doctor" and not actor.get("is_local_admin"):
        raise HTTPException(403, "No tienes permiso para ver el costo de IA de la clínica")
    clinic = actor.get("clinic_id") or actor.get("doctor_id")
    if not clinic:
        raise HTTPException(400, "Tu cuenta no está asociada a una clínica")
    from services.costs import cost_usd, PRECIOS_VERSION
    desde = (datetime.now(timezone.utc) - timedelta(days=max(1, days))).isoformat()
    rows = supabase.table("ai_call_logs").select(
        "visit_id, step, model, input_tokens, output_tokens"
    ).eq("clinic_id", clinic).gte("created_at", desde).execute().data or []
    por_visita, por_step, total, sin_tokens = {}, {}, 0.0, 0
    for r in rows:
        it, ot = r.get("input_tokens"), r.get("output_tokens")
        if it is None or ot is None:
            sin_tokens += 1
            continue
        c = cost_usd(r["model"], it, ot); total += c
        por_visita[r.get("visit_id")] = por_visita.get(r.get("visit_id"), 0.0) + c
        s = por_step.setdefault(r["step"], {"llamadas": 0, "input": 0, "output": 0, "costo": 0.0})
        s["llamadas"] += 1; s["input"] += it; s["output"] += ot; s["costo"] += c
    visitas = len(por_visita)
    return {"clinic_id": clinic, "dias": days, "visitas_medidas": visitas,
            "costo_total_usd": round(total, 4),
            "costo_promedio_por_visita_usd": round(total / visitas, 4) if visitas else 0,
            "por_step": {k: {**v, "costo": round(v["costo"], 4)} for k, v in por_step.items()},
            "filas_sin_tokens_excluidas": sin_tokens,
            "precios_version": PRECIOS_VERSION}
