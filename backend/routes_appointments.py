"""
Agenda / calendario de citas de la clínica.
Cita: horario, ubicación (obligatoria, con color), doctor, paciente y notas.
Incluye horario de consultas configurable, bloqueos de días/horarios y detección
de choques (no deja guardar si el horario se empalma con otra cita o un bloqueo).
El admin proveedor no participa (no es parte de una clínica).
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from auth import get_actor
from db import supabase

router = APIRouter(prefix="/appointments", tags=["agenda"])

ROLES_AGENDA = {"doctor", "receptionist", "nurse"}
ESTADOS = {"scheduled", "confirmed", "arrived", "done", "cancelled", "no_show"}


def _clinic_of(actor: dict) -> str:
    return actor.get("clinic_id") or actor.get("doctor_id")


def _require_agenda(authorization: Optional[str]) -> dict:
    actor = get_actor(authorization)
    if actor["role"] not in ROLES_AGENDA:
        raise HTTPException(403, "Tu rol no puede usar la agenda")
    if not _clinic_of(actor):
        raise HTTPException(400, "Tu cuenta no está asociada a una clínica")
    return actor


def _can_manage(actor: dict) -> bool:
    """Quién puede editar horarios y crear bloqueos: doctor, asistente (recepción)
    y quien tenga admin local. La asistente es la encargada de las citas por default."""
    return actor["role"] in ("doctor", "receptionist") or bool(actor.get("is_local_admin"))


def _require_manage(authorization: Optional[str]) -> dict:
    actor = _require_agenda(authorization)
    if not _can_manage(actor):
        raise HTTPException(403, "No tienes permiso para ajustar horarios o bloqueos")
    return actor


def _overlap(a_start: str, a_end: str, b_start: str, b_end: str) -> bool:
    return a_start < b_end and a_end > b_start


def _conflict(clinic: str, start_iso: str, end_iso: str,
              location_id: Optional[str], doctor_id: Optional[str],
              exclude_id: Optional[str] = None) -> Optional[str]:
    """Devuelve un texto si el rango choca con otra cita o un bloqueo; None si está libre."""
    # Citas del mismo doctor o misma ubicación (activas)
    appts = supabase.table("appointments").select("id, starts_at, ends_at, doctor_id, location_id, patient_name, status")\
        .eq("clinic_id", clinic).neq("status", "cancelled").execute().data or []
    for a in appts:
        if exclude_id and a["id"] == exclude_id:
            continue
        if not a.get("ends_at"):
            continue
        same = (doctor_id and a.get("doctor_id") == doctor_id) or (location_id and a.get("location_id") == location_id)
        if same and _overlap(start_iso, end_iso, a["starts_at"], a["ends_at"]):
            return f"Choca con la cita de {a.get('patient_name') or 'otro paciente'} a esa hora."
    # Bloqueos (de la clínica o de esa ubicación)
    blocks = supabase.table("appointment_blocks").select("id, starts_at, ends_at, location_id, reason")\
        .eq("clinic_id", clinic).execute().data or []
    for b in blocks:
        if location_id and b.get("location_id") and b["location_id"] != location_id:
            continue
        if _overlap(start_iso, end_iso, b["starts_at"], b["ends_at"]):
            return f"Ese horario está bloqueado{(' (' + b['reason'] + ')') if b.get('reason') else ''}."
    return None


# ─── Modelos ──────────────────────────────────────────────────────────────────
class ApptIn(BaseModel):
    starts_at: str
    ends_at: Optional[str] = None
    location_id: Optional[str] = None
    doctor_id: Optional[str] = None
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    patient_phone: Optional[str] = None
    patient_email: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "scheduled"
    notify_email: Optional[bool] = False
    notify_whatsapp: Optional[bool] = False


class BlockIn(BaseModel):
    starts_at: str
    ends_at: str
    location_id: Optional[str] = None
    doctor_id: Optional[str] = None
    all_day: Optional[bool] = False
    reason: Optional[str] = None


class HoursIn(BaseModel):
    location_id: str
    ranges: list   # [{weekday, open_min, close_min}]


# ─── Contexto: sedes (con color), doctores, horarios ─────────────────────────
@router.get("/context")
async def context(authorization: Optional[str] = Header(None)):
    actor = _require_agenda(authorization)
    clinic = _clinic_of(actor)
    locs = supabase.table("locations").select("id, name, color").eq("clinic_id", clinic)\
        .order("created_at").execute().data or []
    docs = supabase.table("doctor_profiles").select("id, display_name")\
        .eq("clinic_id", clinic).eq("role", "doctor").order("created_at").execute().data or []
    loc_ids = [l["id"] for l in locs]
    hours: dict = {}
    if loc_ids:
        hrows = supabase.table("location_hours").select("location_id, weekday, open_min, close_min")\
            .in_("location_id", loc_ids).execute().data or []
        for h in hrows:
            hours.setdefault(h["location_id"], []).append(
                {"weekday": h["weekday"], "open_min": h["open_min"], "close_min": h["close_min"]})
    return {"locations": locs, "doctors": docs, "me": actor["user_id"], "role": actor["role"],
            "can_manage": _can_manage(actor), "hours": hours}


# ─── Búsqueda de pacientes (para autocompletar) ──────────────────────────────
@router.get("/patient-search")
async def patient_search(q: str, authorization: Optional[str] = Header(None)):
    actor = _require_agenda(authorization)
    q = (q or "").strip()
    if len(q) < 2:
        return {"results": []}
    clinic = _clinic_of(actor)
    rows = supabase.table("patients").select("id, full_name, phone, email, clinic_id, doctor_id")\
        .ilike("full_name", f"%{q}%").limit(20).execute().data or []
    # Solo pacientes de esta clínica
    out = [{"id": r["id"], "full_name": r.get("full_name"), "phone": r.get("phone"), "email": r.get("email")}
           for r in rows if r.get("clinic_id") == clinic or r.get("doctor_id") == clinic][:8]
    return {"results": out}


# ─── Sala de espera del doctor: próximos pacientes + resumen con IA ───────────
def _edad(p: dict) -> Optional[int]:
    from datetime import date
    dob = p.get("date_of_birth") or p.get("birth_date")
    if not dob:
        return None
    try:
        y, m, d = str(dob)[:10].split("-")
        today = date.today()
        return today.year - int(y) - ((today.month, today.day) < (int(m), int(d)))
    except Exception:
        return None


@router.get("/upcoming")
async def upcoming(authorization: Optional[str] = Header(None)):
    """Próximas citas (ventana de -2h a +24h) para que el doctor vea quién sigue."""
    actor = _require_agenda(authorization)
    if actor["role"] != "doctor":
        raise HTTPException(403, "Solo el doctor ve la sala de espera")
    clinic = _clinic_of(actor)
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    desde = (now - timedelta(hours=2)).isoformat()
    hasta = (now + timedelta(hours=24)).isoformat()
    appts = supabase.table("appointments").select("*").eq("clinic_id", clinic)\
        .gte("starts_at", desde).lte("starts_at", hasta)\
        .in_("status", ["scheduled", "confirmed", "arrived"]).order("starts_at").execute().data or []
    # Solo las del propio doctor o sin asignar
    appts = [a for a in appts if not a.get("doctor_id") or a.get("doctor_id") == actor["user_id"]]
    pids = list({a["patient_id"] for a in appts if a.get("patient_id")})
    facts = {}
    if pids:
        ps = supabase.table("patients").select("id, full_name, surgeries, chronic_diseases, medications, date_of_birth, birth_date")\
            .in_("id", pids).execute().data or []
        vs = supabase.table("visits").select("patient_id, created_at").in_("patient_id", pids).execute().data or []
        last_visit = {}
        for v in vs:
            pid = v["patient_id"]
            if pid not in last_visit or (v.get("created_at") or "") > last_visit[pid]:
                last_visit[pid] = v.get("created_at") or ""
        for p in ps:
            surg = p.get("surgeries")
            facts[p["id"]] = {
                "edad": _edad(p),
                "ultima_consulta": last_visit.get(p["id"]),
                "tiene_cirugia": bool(surg) and str(surg).strip() not in ("", "[]", "{}", "Ninguna", "ninguna"),
                "cronicas": p.get("chronic_diseases"),
            }
    for a in appts:
        a["facts"] = facts.get(a.get("patient_id")) if a.get("patient_id") else None
    return {"appointments": appts}


def _resumen_ia(p: dict, visits: list, analyses: list, clinic_id: str = None) -> str:
    """Resumen breve del paciente para el doctor antes de que entre. Best-effort."""
    ctx = {
        "nombre": p.get("full_name"), "edad": _edad(p), "sexo": p.get("sexo_biologico"),
        "enfermedades_cronicas": p.get("chronic_diseases"), "cirugias": p.get("surgeries"),
        "alergias": {k: p.get(k) for k in ("allergies_medications", "allergies_foods", "allergies_environmental") if p.get(k)},
        "medicamentos_actuales": p.get("medications"),
        "ultimas_visitas": [{"fecha": v.get("created_at"), "motivo": v.get("motivo") or v.get("visit_reason"),
                              "dx": v.get("dx_presuntivo")} for v in visits[:3]],
        "ultima_prescripcion": ({"protocolo": (analyses[0].get("protocol_traditional") or "")[:1200],
                                 "notas_doctor": (analyses[0].get("doctor_traditional") or "")[:800]} if analyses else None),
    }
    import json as _json
    prompt = (
        "Eres un asistente clínico. Resume en español, en 4-6 líneas y en viñetas, lo que el "
        "médico debe saber de este paciente ANTES de que entre a consulta: última vez que vino, "
        "medicamentos que se le mandaron, instrucciones/plan previo, cirugías previas y alertas "
        "(alergias, crónicas). Sé conciso y clínico. Si falta información, dilo brevemente.\n\n"
        "DATOS DEL PACIENTE (JSON):\n" + _json.dumps(ctx, ensure_ascii=False, default=str)
    )
    try:
        from anthropic import Anthropic
        from services.deepseek import get_deepseek_client, DEEPSEEK_MODEL
        # Resumen de solo texto → DeepSeek para ahorrar, con fallback a Sonnet.
        _ds = get_deepseek_client()
        _model = DEEPSEEK_MODEL if _ds else "claude-sonnet-4-6"
        _cli = _ds or Anthropic()
        try:
            resp = _cli.messages.create(
                model=_model, max_tokens=500,
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as e:
            print(f"[FALLBACK] DeepSeek brief falló ({e}); reintento con Sonnet")
            _model = "claude-sonnet-4-6"
            resp = Anthropic().messages.create(
                model=_model, max_tokens=500,
                messages=[{"role": "user", "content": prompt}],
            )
        texto = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        try:
            from services.usage import log_event
            from services.plans import consume_credits
            tok = (resp.usage.input_tokens or 0) + (resp.usage.output_tokens or 0)
            consume_credits(clinic_id, tok)
            log_event(None, clinic_id, "doctor", "brief.summary", "Sala de espera",
                      ai_tokens=tok, model=_model)
        except Exception:
            pass
        return texto.strip() or "Sin resumen disponible."
    except Exception:
        # Fallback sin IA
        partes = []
        if visits:
            partes.append(f"• Última consulta: {str(visits[0].get('created_at'))[:10]}")
        if p.get("medications"):
            partes.append(f"• Medicamentos: {p.get('medications')}")
        if p.get("surgeries"):
            partes.append(f"• Cirugías previas: {p.get('surgeries')}")
        if p.get("chronic_diseases"):
            partes.append(f"• Crónicas: {p.get('chronic_diseases')}")
        return "\n".join(partes) or "Sin información previa registrada."


@router.get("/patient-brief/{pid}")
async def patient_brief(pid: str, authorization: Optional[str] = Header(None)):
    actor = _require_agenda(authorization)
    if actor["role"] != "doctor":
        raise HTTPException(403, "Solo el doctor puede ver el resumen clínico")
    clinic = _clinic_of(actor)
    pr = supabase.table("patients").select("*").eq("id", pid).limit(1).execute().data
    if not pr:
        raise HTTPException(404, "Paciente no encontrado")
    p = pr[0]
    if p.get("clinic_id") not in (clinic, None) and p.get("doctor_id") != clinic:
        raise HTTPException(403, "Ese paciente no pertenece a tu clínica")
    from services.plans import require_ai
    require_ai(clinic, "sala_espera")   # servicio contratado + créditos
    visits = supabase.table("visits").select("*").eq("patient_id", pid)\
        .order("created_at", desc=True).limit(3).execute().data or []
    analyses = supabase.table("analyses").select(
        "protocol_traditional, doctor_traditional, updated_at").eq("patient_id", pid)\
        .order("updated_at", desc=True).limit(1).execute().data or []
    notes = supabase.table("patient_notes").select("*").eq("patient_id", pid)\
        .order("created_at", desc=True).limit(30).execute().data or []
    resumen = _resumen_ia(p, visits, analyses, clinic_id=clinic)
    return {
        "patient": {"id": p["id"], "full_name": p.get("full_name"), "edad": _edad(p),
                    "sexo": p.get("sexo_biologico"), "chronic_diseases": p.get("chronic_diseases"),
                    "surgeries": p.get("surgeries"), "medications": p.get("medications"),
                    "allergies_medications": p.get("allergies_medications")},
        "ultima_consulta": (visits[0].get("created_at") if visits else None),
        "resumen_ia": resumen,
        "notas": [{"content": n.get("content"), "author_role": n.get("author_role"),
                   "audiencia": n.get("audiencia"), "created_at": n.get("created_at")} for n in notes],
    }


# ─── Sala de espera EN VIVO (flujo recepción → enfermería → doctor) ──────────
# Distinta de /upcoming (que es por agenda/citas). Aquí van los pacientes que están
# siendo atendidos AHORA y esperan la siguiente etapa. registration_phase marca la
# última etapa COMPLETADA: 'reception' = espera enfermería, 'nursing' = espera doctor.
_PHASE_BY_STAGE = {"nursing": "reception", "doctor": "nursing"}
_STAGE_BY_PHASE = {v: k for k, v in _PHASE_BY_STAGE.items()}


def _clinic_has_role(clinic: str, role_name: str) -> bool:
    rows = supabase.table("doctor_profiles").select("id")\
        .eq("clinic_id", clinic).eq("role", role_name).limit(1).execute().data
    return bool(rows)


def _stages_for(actor: dict, clinic: str) -> set:
    """Qué etapas de la sala de espera atiende este usuario, con absorción de roles:
    - enfermera → espera de enfermería.
    - doctor → espera de doctor; y si NO hay enfermera en la clínica, absorbe la de enfermería.
    - recepción → no espera a nadie (ella alimenta la lista)."""
    role = actor.get("role")
    if role == "nurse":
        return {"nursing"}
    if role == "doctor":
        stages = {"doctor"}
        if not _clinic_has_role(clinic, "nurse"):
            stages.add("nursing")
        return stages
    return set()


def _waitroom_rows(clinic: str, stages: set) -> list:
    if not stages:
        return []
    wanted = [_PHASE_BY_STAGE[s] for s in stages]
    from datetime import timedelta
    desde = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    cols = ("id, full_name, date_of_birth, birth_date, care_type, registration_phase, "
            "updated_at, created_at, allergies_medications, allergies_foods, clinic_id, doctor_id")
    # El paciente puede estar anclado por clinic_id (multi-tenant) o, en cuentas de
    # doctor solo, por doctor_id — se aceptan ambos, igual que patient_brief.
    rows = supabase.table("patients").select(cols)\
        .or_(f"clinic_id.eq.{clinic},doctor_id.eq.{clinic}")\
        .in_("registration_phase", wanted)\
        .gte("updated_at", desde).order("updated_at", desc=False).execute().data or []
    return rows


@router.get("/waitroom")
async def waitroom(authorization: Optional[str] = Header(None)):
    actor = _require_agenda(authorization)
    clinic = _clinic_of(actor)
    stages = _stages_for(actor, clinic)
    rows = _waitroom_rows(clinic, stages)
    pids = [r["id"] for r in rows]
    notes_by_pid: dict = {}
    if pids:
        ns = supabase.table("patient_notes").select(
            "patient_id, content, author_role, author_name, created_at")\
            .in_("patient_id", pids).order("created_at", desc=True).execute().data or []
        for n in ns:
            notes_by_pid.setdefault(n["patient_id"], []).append(n)

    def _alergias(r: dict) -> str:
        vals = []
        for k in ("allergies_medications", "allergies_foods"):
            v = (r.get(k) or "").strip() if isinstance(r.get(k), str) else r.get(k)
            if v and str(v).strip().lower() not in ("", "no", "ninguna", "ninguno", "no refiere"):
                vals.append(str(v).strip())
        return " · ".join(vals)

    waiting = []
    for r in rows:
        nota_recepcion = next((x.get("content") for x in notes_by_pid.get(r["id"], [])
                               if (x.get("author_role") == "receptionist")), None)
        waiting.append({
            "id": r["id"], "full_name": r.get("full_name"), "edad": _edad(r),
            "care_type": r.get("care_type"),
            "stage": _STAGE_BY_PHASE.get(r.get("registration_phase")),
            "esperando_desde": r.get("updated_at") or r.get("created_at"),
            "alergias": _alergias(r),
            "nota_recepcion": nota_recepcion,
        })
    return {"waiting": waiting, "stages": sorted(stages)}


@router.get("/waitroom/count")
async def waitroom_count(authorization: Optional[str] = Header(None)):
    actor = _require_agenda(authorization)
    clinic = _clinic_of(actor)
    stages = _stages_for(actor, clinic)
    return {"count": len(_waitroom_rows(clinic, stages))}


# ─── Listar citas + bloqueos en un rango ─────────────────────────────────────
@router.get("")
async def list_appointments(desde: str, hasta: str,
                            location_id: Optional[str] = None, doctor_id: Optional[str] = None,
                            authorization: Optional[str] = Header(None)):
    actor = _require_agenda(authorization)
    clinic = _clinic_of(actor)
    q = supabase.table("appointments").select("*").eq("clinic_id", clinic)\
        .gte("starts_at", desde).lte("starts_at", hasta).order("starts_at")
    if location_id:
        q = q.eq("location_id", location_id)
    if doctor_id:
        q = q.eq("doctor_id", doctor_id)
    appts = q.execute().data or []
    bq = supabase.table("appointment_blocks").select("*").eq("clinic_id", clinic)\
        .lte("starts_at", hasta).gte("ends_at", desde).order("starts_at")
    if location_id:
        bq = bq.or_(f"location_id.eq.{location_id},location_id.is.null")
    blocks = bq.execute().data or []
    return {"appointments": appts, "blocks": blocks}


@router.post("")
async def create_appointment(body: ApptIn, authorization: Optional[str] = Header(None)):
    actor = _require_agenda(authorization)
    if not body.starts_at or not body.ends_at:
        raise HTTPException(400, "Falta el horario de la cita")
    if not body.location_id:
        raise HTTPException(400, "Indica la ubicación/sucursal de la cita")
    if not (body.patient_name or body.patient_id):
        raise HTTPException(400, "Indica el paciente")
    clinic = _clinic_of(actor)
    choque = _conflict(clinic, body.starts_at, body.ends_at, body.location_id, body.doctor_id)
    if choque:
        raise HTTPException(409, choque)
    row = {
        "clinic_id": clinic, "location_id": body.location_id, "doctor_id": body.doctor_id,
        "patient_id": body.patient_id, "patient_name": (body.patient_name or "").strip() or None,
        "patient_phone": body.patient_phone, "patient_email": body.patient_email,
        "starts_at": body.starts_at, "ends_at": body.ends_at,
        "status": body.status if body.status in ESTADOS else "scheduled",
        "reason": body.reason, "notes": body.notes,
        "notify_email": bool(body.notify_email), "notify_whatsapp": bool(body.notify_whatsapp),
        "created_by": actor["user_id"], "created_at": datetime.now(timezone.utc).isoformat(),
    }
    r = supabase.table("appointments").insert(row).execute()
    return r.data[0] if r.data else {}


# ─── Bloqueos ────────────────────────────────────────────────────────────────
@router.post("/blocks")
async def create_block(body: BlockIn, authorization: Optional[str] = Header(None)):
    actor = _require_manage(authorization)
    if not body.starts_at or not body.ends_at:
        raise HTTPException(400, "Falta el rango del bloqueo")
    row = {
        "clinic_id": _clinic_of(actor), "location_id": body.location_id, "doctor_id": body.doctor_id,
        "starts_at": body.starts_at, "ends_at": body.ends_at,
        "all_day": bool(body.all_day), "reason": (body.reason or "").strip() or None,
        "created_by": actor["user_id"], "created_at": datetime.now(timezone.utc).isoformat(),
    }
    r = supabase.table("appointment_blocks").insert(row).execute()
    return r.data[0] if r.data else {}


@router.delete("/blocks/{block_id}")
async def delete_block(block_id: str, authorization: Optional[str] = Header(None)):
    actor = _require_manage(authorization)
    cur = supabase.table("appointment_blocks").select("clinic_id").eq("id", block_id).limit(1).execute().data
    if not cur or cur[0].get("clinic_id") != _clinic_of(actor):
        raise HTTPException(404, "Bloqueo no encontrado")
    supabase.table("appointment_blocks").delete().eq("id", block_id).execute()
    return {"ok": True}


# ─── Horario de consultas ────────────────────────────────────────────────────
@router.put("/hours")
async def set_hours(body: HoursIn, authorization: Optional[str] = Header(None)):
    actor = _require_manage(authorization)
    # Verifica que la ubicación sea de la clínica del actor
    loc = supabase.table("locations").select("clinic_id").eq("id", body.location_id).limit(1).execute().data
    if not loc or loc[0].get("clinic_id") != _clinic_of(actor):
        raise HTTPException(404, "Ubicación no encontrada")
    supabase.table("location_hours").delete().eq("location_id", body.location_id).execute()
    rows = []
    for r in (body.ranges or []):
        try:
            wd, o, c = int(r["weekday"]), int(r["open_min"]), int(r["close_min"])
        except Exception:
            continue
        if 0 <= wd <= 6 and 0 <= o < c <= 1440:
            rows.append({"location_id": body.location_id, "weekday": wd, "open_min": o, "close_min": c})
    if rows:
        supabase.table("location_hours").insert(rows).execute()
    return {"ok": True, "count": len(rows)}


# ─── Editar / cancelar una cita (rutas dinámicas AL FINAL, para no “tragarse”
#     las rutas estáticas como /hours o /blocks) ────────────────────────────────
@router.put("/{appt_id}")
async def update_appointment(appt_id: str, body: dict, authorization: Optional[str] = Header(None)):
    actor = _require_agenda(authorization)
    clinic = _clinic_of(actor)
    cur = supabase.table("appointments").select("*").eq("id", appt_id).limit(1).execute().data
    if not cur or cur[0].get("clinic_id") != clinic:
        raise HTTPException(404, "Cita no encontrada")
    campos = {"starts_at", "ends_at", "location_id", "doctor_id", "patient_id", "patient_name",
              "patient_phone", "patient_email", "reason", "notes", "status",
              "notify_email", "notify_whatsapp"}
    patch = {k: v for k, v in (body or {}).items() if k in campos}
    if "status" in patch and patch["status"] not in ESTADOS:
        patch.pop("status")
    # Si cambia el horario/lugar y no es cancelación, revalida choques.
    if patch.get("status") != "cancelled" and any(k in patch for k in ("starts_at", "ends_at", "location_id", "doctor_id")):
        merged = {**cur[0], **patch}
        if merged.get("starts_at") and merged.get("ends_at"):
            choque = _conflict(clinic, merged["starts_at"], merged["ends_at"],
                               merged.get("location_id"), merged.get("doctor_id"), exclude_id=appt_id)
            if choque:
                raise HTTPException(409, choque)
    if patch:
        patch["updated_at"] = datetime.now(timezone.utc).isoformat()
        supabase.table("appointments").update(patch).eq("id", appt_id).execute()
    return {"ok": True, **patch}


@router.delete("/{appt_id}")
async def cancel_appointment(appt_id: str, authorization: Optional[str] = Header(None)):
    actor = _require_agenda(authorization)
    cur = supabase.table("appointments").select("clinic_id").eq("id", appt_id).limit(1).execute().data
    if not cur or cur[0].get("clinic_id") != _clinic_of(actor):
        raise HTTPException(404, "Cita no encontrada")
    supabase.table("appointments").update({"status": "cancelled",
        "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", appt_id).execute()
    return {"ok": True}
