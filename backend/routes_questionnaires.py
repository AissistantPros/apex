"""
Banco de preguntas configurable (reemplazo dinámico de la captura).

- El PROVEEDOR (admin) mantiene presets por especialidad y edita el cuestionario de
  cada clínica por bloque (convencional, consulta, ...).
- Cada pregunta tiene una `key` estable, para quedar perfectamente mapeada entre el
  formulario, la DB (respuestas en JSON por bloque) y el prompt de la IA.

Módulo separable: solo depende de auth + db.
"""
import re
import unicodedata
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from auth import get_actor
from db import supabase

router = APIRouter(prefix="/questionnaires", tags=["banco-preguntas"])

BLOCKS = ["convencional", "consulta", "funcional", "longevidad"]
ALLOWED_TYPES = {"number", "text", "textarea", "select", "multiselect", "boolean", "scale"}


def _require_admin(authorization: Optional[str]) -> dict:
    actor = get_actor(authorization)
    if actor.get("role") != "admin":
        raise HTTPException(403, "Solo el administrador del proveedor puede gestionar el banco de preguntas")
    return actor


def _slug_key(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "_", s).strip("_").lower()
    return s or "campo"


def _norm_questions(raw) -> list:
    """Normaliza y valida la lista de preguntas: keys únicas, tipos válidos, orden."""
    out, seen = [], set()
    for i, q in enumerate(raw or []):
        if not isinstance(q, dict):
            continue
        label = (q.get("label") or "").strip()
        if not label:
            continue
        key = _slug_key(q.get("key") or label)
        base, n = key, 2
        while key in seen:
            key = f"{base}_{n}"; n += 1
        seen.add(key)
        t = q.get("type") if q.get("type") in ALLOWED_TYPES else "text"
        item = {"key": key, "label": label, "type": t, "order": i + 1}
        if q.get("unit"):
            item["unit"] = str(q["unit"])[:20]
        if q.get("required"):
            item["required"] = True
        if q.get("help"):
            item["help"] = str(q["help"])[:300]
        if t in ("select", "multiselect"):
            item["options"] = [str(o).strip() for o in (q.get("options") or []) if str(o).strip()]
        out.append(item)
    return out


class BlockIn(BaseModel):
    questions: list
    specialty: Optional[str] = None


class ApplyPresetIn(BaseModel):
    specialty: str


# ─── Presets (catálogo del proveedor) ────────────────────────────────────────
@router.get("/presets")
async def list_presets(authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    rows = supabase.table("question_presets").select("specialty, specialty_label, block, questions")\
        .execute().data or []
    by_spec: dict = {}
    for r in rows:
        s = by_spec.setdefault(r["specialty"], {"specialty": r["specialty"],
                                                "label": r.get("specialty_label") or r["specialty"], "blocks": {}})
        s["blocks"][r["block"]] = r.get("questions") or []
    return {"specialties": list(by_spec.values()), "blocks": BLOCKS}


# ─── Cuestionario de una clínica (admin) ─────────────────────────────────────
@router.get("/clinic/{clinic_id}")
async def clinic_questionnaires(clinic_id: str, authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    rows = supabase.table("clinic_questionnaires").select("block, specialty, questions")\
        .eq("clinic_id", clinic_id).execute().data or []
    data = {r["block"]: {"questions": r.get("questions") or [], "specialty": r.get("specialty")} for r in rows}
    return {"blocks": BLOCKS, "questionnaires": data}


@router.put("/clinic/{clinic_id}/{block}")
async def set_clinic_block(clinic_id: str, block: str, body: BlockIn, authorization: Optional[str] = Header(None)):
    _require_admin(authorization)
    if block not in BLOCKS:
        raise HTTPException(400, "Bloque inválido")
    questions = _norm_questions(body.questions)
    from datetime import datetime, timezone
    supabase.table("clinic_questionnaires").upsert({
        "clinic_id": clinic_id, "block": block, "specialty": body.specialty,
        "questions": questions, "updated_at": datetime.now(timezone.utc).isoformat(),
    }, on_conflict="clinic_id,block").execute()
    return {"ok": True, "block": block, "count": len(questions), "questions": questions}


@router.post("/clinic/{clinic_id}/apply-preset")
async def apply_preset(clinic_id: str, body: ApplyPresetIn, authorization: Optional[str] = Header(None)):
    """Copia las preguntas del preset de una especialidad al cuestionario de la clínica."""
    _require_admin(authorization)
    rows = supabase.table("question_presets").select("block, questions")\
        .eq("specialty", body.specialty).execute().data or []
    if not rows:
        raise HTTPException(404, "Especialidad no encontrada")
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    for r in rows:
        supabase.table("clinic_questionnaires").upsert({
            "clinic_id": clinic_id, "block": r["block"], "specialty": body.specialty,
            "questions": _norm_questions(r.get("questions")), "updated_at": now,
        }, on_conflict="clinic_id,block").execute()
    return {"ok": True, "applied": [r["block"] for r in rows]}


# ─── Cuestionario activo de MI clínica (para los formularios) ────────────────
@router.get("/mine/{block}")
async def my_block(block: str, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    clinic = actor.get("clinic_id") or actor.get("doctor_id")
    if block not in BLOCKS:
        raise HTTPException(400, "Bloque inválido")
    r = supabase.table("clinic_questionnaires").select("questions, specialty")\
        .eq("clinic_id", clinic).eq("block", block).limit(1).execute().data
    if r and r[0].get("questions"):
        return {"block": block, "questions": r[0]["questions"], "specialty": r[0].get("specialty"), "source": "clinic"}
    # Fallback: preset general
    p = supabase.table("question_presets").select("questions")\
        .eq("specialty", "general").eq("block", block).limit(1).execute().data
    return {"block": block, "questions": (p[0]["questions"] if p else []), "specialty": "general", "source": "preset"}
