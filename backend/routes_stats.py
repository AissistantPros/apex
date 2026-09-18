"""
Estadísticas de la práctica del médico.

Agrega los datos reales de pacientes, visitas y recetas (prescription_log) en métricas
para el dashboard. Todo se computa en Python porque el volumen es pequeño; si crece, se
puede mover a funciones SQL. Respeta la privacidad: no expone identificadores de pacientes,
solo agregados clínicos y demográficos gruesos.
"""
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header
from auth import get_doctor_id_from_token
from db import supabase

router = APIRouter(prefix="/stats", tags=["stats"])

MESES_ES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]


def _edad(dob: str) -> Optional[int]:
    if not dob:
        return None
    try:
        d = datetime.fromisoformat(str(dob)[:10])
        hoy = datetime.now()
        return hoy.year - d.year - ((hoy.month, hoy.day) < (d.month, d.day))
    except Exception:
        return None


def _rango_edad(edad: Optional[int]) -> str:
    if edad is None:
        return "N/D"
    if edad < 30: return "18-29"
    if edad < 40: return "30-39"
    if edad < 50: return "40-49"
    if edad < 60: return "50-59"
    if edad < 70: return "60-69"
    return "70+"


def _top(contador: Counter, n: int) -> list:
    return [{"nombre": k, "valor": v} for k, v in contador.most_common(n)]


@router.get("/overview")
async def overview(authorization: Optional[str] = Header(None)):
    # Estadísticas clínicas: solo médico/admin.
    from auth import get_actor
    from access import require
    require(get_actor(authorization), "doctor")
    doctor_id = get_doctor_id_from_token(authorization)

    pacientes = (supabase.table("patients").select(
        "id, sexo_biologico, date_of_birth, birth_date, city, chronic_diseases, surgeries, created_at"
    ).eq("doctor_id", doctor_id).execute().data) or []

    visitas = (supabase.table("visits").select(
        "id, motivo, dx_presuntivo, visit_type, imc, glucosa, pa_der_sistolica, created_at"
    ).eq("doctor_id", doctor_id).execute().data) or []

    recetas = (supabase.table("prescription_log").select(
        "item_nombre, item_tipo, accion, protocolo_tipo, created_at"
    ).eq("doctor_id", doctor_id).execute().data) or []

    # ── KPIs ──────────────────────────────────────────────────────────────────
    edades = [e for e in (_edad(p.get("date_of_birth") or p.get("birth_date")) for p in pacientes) if e]
    imcs = [v["imc"] for v in visitas if v.get("imc")]
    glucosas = [v["glucosa"] for v in visitas if v.get("glucosa")]
    con_cirugia = sum(1 for p in pacientes if (p.get("surgeries") or "").strip())

    ahora = datetime.now(timezone.utc)
    def _mes_de(row):
        try:
            return datetime.fromisoformat(str(row["created_at"]).replace("Z", "+00:00"))
        except Exception:
            return None
    visitas_mes_actual = sum(
        1 for v in visitas
        if (d := _mes_de(v)) and d.year == ahora.year and d.month == ahora.month
    )

    kpis = {
        "total_pacientes": len(pacientes),
        "total_visitas": len(visitas),
        "visitas_mes_actual": visitas_mes_actual,
        "recetas_emitidas": sum(1 for r in recetas if r.get("accion") != "eliminado_doctor"),
        "edad_promedio": round(sum(edades) / len(edades)) if edades else 0,
        "imc_promedio": round(sum(imcs) / len(imcs), 1) if imcs else 0,
        "glucosa_promedio": round(sum(glucosas) / len(glucosas)) if glucosas else 0,
        "pacientes_con_cirugia": con_cirugia,
    }

    # ── Visitas por mes (últimos 8 meses, en orden) ─────────────────────────────
    por_mes = defaultdict(int)
    for v in visitas:
        d = _mes_de(v)
        if d:
            por_mes[(d.year, d.month)] += 1
    serie_meses = []
    y, m = ahora.year, ahora.month
    claves = []
    for _ in range(8):
        claves.append((y, m))
        m -= 1
        if m == 0:
            m = 12; y -= 1
    for (yy, mm) in reversed(claves):
        serie_meses.append({"nombre": f"{MESES_ES[mm]} {str(yy)[2:]}", "valor": por_mes.get((yy, mm), 0)})

    # ── Distribuciones y tops ───────────────────────────────────────────────────
    sexos = Counter((p.get("sexo_biologico") or "N/D") for p in pacientes)
    rangos = Counter(_rango_edad(e) for e in
                     (_edad(p.get("date_of_birth") or p.get("birth_date")) for p in pacientes))
    orden_rangos = ["18-29", "30-39", "40-49", "50-59", "60-69", "70+", "N/D"]

    top_sintomas = Counter(v["motivo"] for v in visitas if v.get("motivo"))
    top_dx = Counter(v["dx_presuntivo"] for v in visitas if v.get("dx_presuntivo"))
    meds = Counter(r["item_nombre"] for r in recetas
                   if r.get("item_nombre") and r.get("accion") != "eliminado_doctor")
    protocolos = Counter(r.get("protocolo_tipo") or "N/D" for r in recetas
                         if r.get("accion") != "eliminado_doctor")
    proto_labels = {"traditional": "Convencional", "functional": "Funcional", "longevity": "Longevidad"}

    # Cirugías: prevalencia de antecedentes quirúrgicos
    cirugias = Counter()
    for p in pacientes:
        s = (p.get("surgeries") or "").strip()
        if s:
            # primera cirugía listada como etiqueta principal
            cirugias[s.split("(")[0].split(",")[0].strip()] += 1

    return {
        "kpis": kpis,
        "visitas_por_mes": serie_meses,
        "distribucion_sexo": [{"nombre": k, "valor": v} for k, v in sexos.items()],
        "distribucion_edad": [{"nombre": r, "valor": rangos.get(r, 0)}
                              for r in orden_rangos if rangos.get(r, 0) > 0],
        "top_sintomas": _top(top_sintomas, 8),
        "top_diagnosticos": _top(top_dx, 8),
        "top_medicamentos": _top(meds, 10),
        "distribucion_protocolo": [{"nombre": proto_labels.get(k, k), "valor": v}
                                   for k, v in protocolos.most_common()],
        "cirugias": _top(cirugias, 8),
    }
