"""
Resultados mensuales de marketing.

En lugar de un reporte mensual aparte, la agencia llena cada mes los resultados por plataforma
(orgánico y de pago). Alimenta el dashboard de marketing y el ROI.
"""
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from auth import get_actor
from db import supabase

router = APIRouter(prefix="/marketing", tags=["marketing"])

PLATAFORMAS = ["Facebook", "Instagram", "TikTok", "YouTube", "Doctoralia", "Web", "GoogleNegocio"]
PLAT_LABELS = {"Facebook": "Facebook", "Instagram": "Instagram", "TikTok": "TikTok",
               "YouTube": "YouTube", "Doctoralia": "Doctoralia", "Web": "Página web",
               "GoogleNegocio": "Google Mi Negocio"}
CAMPOS = ["seguidores", "alcance", "vistas", "likes", "comentarios", "compartidos",
          "ads_inversion", "ads_alcance", "ads_clics", "ads_leads"]


class ResultIn(BaseModel):
    anio: int
    mes: int
    plataforma: str
    seguidores: int = 0
    alcance: int = 0
    vistas: int = 0
    likes: int = 0
    comentarios: int = 0
    compartidos: int = 0
    ads_inversion: float = 0
    ads_alcance: int = 0
    ads_clics: int = 0
    ads_leads: int = 0
    notas: Optional[str] = None


def _puede(actor: dict, area: str, nivel: str = "view") -> bool:
    if actor["role"] == "doctor":
        return True
    p = (actor.get("permissions") or {}).get(area)
    return p == "edit" or (nivel == "view" and p in ("view", "edit"))


@router.get("/meta")
async def meta():
    return {"plataformas": PLATAFORMAS, "labels": PLAT_LABELS, "campos": CAMPOS}


@router.get("/results")
async def results(anio: int, mes: int, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if not (_puede(actor, "marketing_captura") or _puede(actor, "marketing")):
        raise HTTPException(403, "Sin permiso de marketing")
    rows = supabase.table("marketing_results").select("*")\
        .eq("doctor_id", actor["doctor_id"]).eq("anio", anio).eq("mes", mes).execute().data or []
    por_plat = {r["plataforma"]: r for r in rows}
    return {"anio": anio, "mes": mes, "plataformas": PLATAFORMAS, "labels": PLAT_LABELS,
            "resultados": por_plat}


@router.post("/results")
async def upsert_result(body: ResultIn, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if not _puede(actor, "marketing_captura", "edit"):
        raise HTTPException(403, "No tienes permiso para capturar resultados de marketing")
    if body.plataforma not in PLATAFORMAS:
        raise HTTPException(400, "Plataforma inválida")
    row = body.model_dump()
    row["doctor_id"] = actor["doctor_id"]
    row["created_by"] = actor["user_id"]
    from datetime import datetime, timezone
    row["updated_at"] = datetime.now(timezone.utc).isoformat()
    # upsert por (doctor, anio, mes, plataforma)
    supabase.table("marketing_results").upsert(row, on_conflict="doctor_id,anio,mes,plataforma").execute()
    return {"ok": True}


@router.get("/summary")
async def summary(authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if not (_puede(actor, "marketing") or _puede(actor, "marketing_captura") or _puede(actor, "finanzas")):
        raise HTTPException(403, "Sin permiso de marketing")
    rows = supabase.table("marketing_results").select("*")\
        .eq("doctor_id", actor["doctor_id"]).order("anio").order("mes").execute().data or []

    # Totales por plataforma (orgánico + ads) y meses con datos
    por_plat = {}
    meses = set()
    for r in rows:
        meses.add((r["anio"], r["mes"]))
        p = por_plat.setdefault(r["plataforma"], {k: 0 for k in
              ["seguidores", "alcance", "vistas", "likes", "comentarios", "ads_inversion", "ads_clics", "ads_leads"]})
        # seguidores = último valor; el resto se acumula
        p["seguidores"] = r.get("seguidores") or p["seguidores"]
        for k in ["alcance", "vistas", "likes", "comentarios", "ads_clics", "ads_leads"]:
            p[k] += r.get(k) or 0
        p["ads_inversion"] += r.get("ads_inversion") or 0

    plataformas = [{"plataforma": k, "label": PLAT_LABELS.get(k, k), **v} for k, v in por_plat.items()]
    plataformas.sort(key=lambda x: -(x["vistas"] + x["alcance"]))
    return {"plataformas": plataformas, "meses_con_datos": len(meses)}
