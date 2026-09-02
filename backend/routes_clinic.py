"""
Módulo de administración de la clínica: servicios cobrables, ventas/cobros, gastos,
balance financiero y ROI de marketing.

Flujo de cobro (handoff): el médico crea una venta 'pendiente' con los conceptos a cobrar;
recepción la ve en su cola, aplica método de pago / descuento y la marca 'cobrado'.

Un recepcionista opera sobre la clínica de su médico (auth.get_actor resuelve el doctor_id
efectivo), así que todos los endpoints usan ese doctor_id.
"""
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from auth import get_actor
from db import supabase

router = APIRouter(prefix="/clinic", tags=["clinic"])
MESES_ES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

# Canales de publicidad que se miden como "publicidad de pago / online"
CANALES_PAGO = ["Meta", "Google", "Doctoralia", "TikTok"]


# ── Modelos ────────────────────────────────────────────────────────────────────
class ServiceIn(BaseModel):
    nombre: str
    precio: float
    activo: bool = True
    orden: int = 0

class SaleItem(BaseModel):
    concepto: str
    precio: float
    cantidad: int = 1

class SaleIn(BaseModel):
    patient_id: Optional[str] = None
    visit_id: Optional[str] = None
    items: list[SaleItem]
    descuento: float = 0
    descuento_motivo: Optional[str] = None
    cortesia: bool = False
    facturada: bool = False
    metodo_pago: Optional[str] = None
    estado: str = "pendiente"     # 'pendiente' (handoff) | 'cobrado' (venta directa)
    notas: Optional[str] = None

class ChargeIn(BaseModel):
    metodo_pago: str
    facturada: bool = False
    descuento: Optional[float] = None
    descuento_motivo: Optional[str] = None
    cortesia: Optional[bool] = None

class ExpenseIn(BaseModel):
    categoria: str
    canal: Optional[str] = None
    concepto: Optional[str] = None
    monto: float
    proveedor: Optional[str] = None
    fecha: Optional[str] = None
    recurrente: bool = False
    notas: Optional[str] = None


def _totales(items: list, descuento: float, cortesia: bool):
    subtotal = sum((i.get("precio", 0) or 0) * (i.get("cantidad", 1) or 1) for i in items)
    total = 0 if cortesia else max(subtotal - (descuento or 0), 0)
    return round(subtotal, 2), round(total, 2)


def _mes(row) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(str(row["created_at"]).replace("Z", "+00:00"))
    except Exception:
        return None


def _canal_paciente(p: dict) -> str:
    """Mapea el origen del paciente a un canal de marketing."""
    red = (p.get("social_network") or "").lower()
    if red in ("facebook", "instagram"):
        return "Meta"
    if red == "youtube":
        return "Google"
    if red == "tiktok":
        return "TikTok"
    fuentes = p.get("sources_of_contact") or []
    if isinstance(fuentes, str):
        fuentes = [fuentes]
    s = " ".join(fuentes).lower()
    if "doctoralia" in s:
        return "Doctoralia"
    if "redes" in s:
        return "Meta"
    if "google" in s or "internet" in s or "web" in s or "página" in s or "pagina" in s:
        return "Google"
    if "recomend" in s:
        return "Referido"
    return "Otro"


# ── Servicios configurables ─────────────────────────────────────────────────────
@router.get("/services")
async def list_services(authorization: Optional[str] = Header(None)):
    did = get_actor(authorization)["doctor_id"]
    r = supabase.table("clinic_services").select("*").eq("doctor_id", did)\
        .order("orden").execute()
    return {"services": r.data or []}

@router.post("/services")
async def create_service(body: ServiceIn, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if actor["role"] == "receptionist":
        raise HTTPException(403, "Recepción no puede configurar servicios")
    r = supabase.table("clinic_services").insert({
        "doctor_id": actor["doctor_id"], "nombre": body.nombre, "precio": body.precio,
        "activo": body.activo, "orden": body.orden,
    }).execute()
    return r.data[0] if r.data else {}

@router.put("/services/{sid}")
async def update_service(sid: str, body: ServiceIn, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if actor["role"] == "receptionist":
        raise HTTPException(403, "Recepción no puede configurar servicios")
    supabase.table("clinic_services").update({
        "nombre": body.nombre, "precio": body.precio, "activo": body.activo, "orden": body.orden,
    }).eq("id", sid).eq("doctor_id", actor["doctor_id"]).execute()
    return {"ok": True}

@router.delete("/services/{sid}")
async def delete_service(sid: str, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if actor["role"] == "receptionist":
        raise HTTPException(403, "Recepción no puede configurar servicios")
    supabase.table("clinic_services").delete().eq("id", sid).eq("doctor_id", actor["doctor_id"]).execute()
    return {"ok": True}


# ── Ventas / cobros ──────────────────────────────────────────────────────────────
def _nombre_pacientes(did: str) -> dict:
    r = supabase.table("patients").select("id, full_name").eq("doctor_id", did).execute()
    return {p["id"]: p.get("full_name") for p in (r.data or [])}

@router.get("/sales")
async def list_sales(estado: Optional[str] = None, limit: int = 100,
                     authorization: Optional[str] = Header(None)):
    did = get_actor(authorization)["doctor_id"]
    q = supabase.table("sales").select("*").eq("doctor_id", did)\
        .order("created_at", desc=True).limit(limit)
    if estado:
        q = q.eq("estado", estado)
    ventas = q.execute().data or []
    nombres = _nombre_pacientes(did)
    for v in ventas:
        v["patient_name"] = nombres.get(v.get("patient_id"))
    return {"sales": ventas}

@router.get("/pending")
async def pending_charges(authorization: Optional[str] = Header(None)):
    """Cola de recepción: cobros pendientes con nombre del paciente."""
    did = get_actor(authorization)["doctor_id"]
    ventas = supabase.table("sales").select("*").eq("doctor_id", did)\
        .eq("estado", "pendiente").order("created_at").execute().data or []
    nombres = _nombre_pacientes(did)
    for v in ventas:
        v["patient_name"] = nombres.get(v.get("patient_id"))
    return {"pending": ventas}

@router.post("/sales")
async def create_sale(body: SaleIn, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    items = [i.model_dump() for i in body.items]
    if not items:
        raise HTTPException(400, "La venta no tiene conceptos")
    subtotal, total = _totales(items, body.descuento, body.cortesia)
    row = {
        "doctor_id": actor["doctor_id"], "patient_id": body.patient_id, "visit_id": body.visit_id,
        "items": items, "subtotal": subtotal, "descuento": body.descuento or 0, "total": total,
        "descuento_motivo": body.descuento_motivo, "cortesia": body.cortesia,
        "facturada": body.facturada, "metodo_pago": body.metodo_pago,
        "estado": body.estado, "notas": body.notas, "created_by": actor["user_id"],
    }
    if body.estado == "cobrado":
        row["charged_by"] = actor["user_id"]
        row["charged_at"] = datetime.now(timezone.utc).isoformat()
    r = supabase.table("sales").insert(row).execute()
    return r.data[0] if r.data else {}

@router.post("/sales/{sid}/charge")
async def charge_sale(sid: str, body: ChargeIn, authorization: Optional[str] = Header(None)):
    """Recepción cobra un pendiente."""
    actor = get_actor(authorization)
    venta = supabase.table("sales").select("*").eq("id", sid)\
        .eq("doctor_id", actor["doctor_id"]).execute().data
    if not venta:
        raise HTTPException(404, "Venta no encontrada")
    venta = venta[0]
    descuento = body.descuento if body.descuento is not None else (venta.get("descuento") or 0)
    cortesia = body.cortesia if body.cortesia is not None else venta.get("cortesia", False)
    subtotal, total = _totales(venta.get("items") or [], descuento, cortesia)
    supabase.table("sales").update({
        "estado": "cobrado", "metodo_pago": body.metodo_pago, "facturada": body.facturada,
        "descuento": descuento, "descuento_motivo": body.descuento_motivo or venta.get("descuento_motivo"),
        "cortesia": cortesia, "total": total, "charged_by": actor["user_id"],
        "charged_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", sid).execute()
    return {"ok": True, "total": total}

@router.post("/sales/{sid}/cancel")
async def cancel_sale(sid: str, authorization: Optional[str] = Header(None)):
    did = get_actor(authorization)["doctor_id"]
    supabase.table("sales").update({"estado": "cancelado"}).eq("id", sid).eq("doctor_id", did).execute()
    return {"ok": True}


# ── Gastos ───────────────────────────────────────────────────────────────────────
@router.get("/expenses")
async def list_expenses(limit: int = 200, authorization: Optional[str] = Header(None)):
    did = get_actor(authorization)["doctor_id"]
    r = supabase.table("expenses").select("*").eq("doctor_id", did)\
        .order("fecha", desc=True).limit(limit).execute()
    return {"expenses": r.data or []}

@router.post("/expenses")
async def create_expense(body: ExpenseIn, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    row = body.model_dump()
    row["doctor_id"] = actor["doctor_id"]
    row["created_by"] = actor["user_id"]
    if not row.get("fecha"):
        row.pop("fecha", None)
    r = supabase.table("expenses").insert(row).execute()
    return r.data[0] if r.data else {}

@router.delete("/expenses/{eid}")
async def delete_expense(eid: str, authorization: Optional[str] = Header(None)):
    did = get_actor(authorization)["doctor_id"]
    supabase.table("expenses").delete().eq("id", eid).eq("doctor_id", did).execute()
    return {"ok": True}


# ── Dashboard financiero + ROI de marketing ───────────────────────────────────────
@router.get("/overview")
async def overview(authorization: Optional[str] = Header(None)):
    did = get_actor(authorization)["doctor_id"]
    ventas = supabase.table("sales").select("*").eq("doctor_id", did).execute().data or []
    gastos = supabase.table("expenses").select("*").eq("doctor_id", did).execute().data or []
    pacientes = supabase.table("patients").select("id, full_name, sources_of_contact, social_network")\
        .eq("doctor_id", did).execute().data or []

    cobradas = [v for v in ventas if v.get("estado") == "cobrado"]
    ingreso = sum(v.get("total") or 0 for v in cobradas)
    gasto_total = sum(g.get("monto") or 0 for g in gastos)
    ahora = datetime.now(timezone.utc)

    # KPIs
    ing_mes = sum(v.get("total") or 0 for v in cobradas
                  if (d := _mes(v)) and d.year == ahora.year and d.month == ahora.month)
    gasto_pub = sum(g.get("monto") or 0 for g in gastos if g.get("categoria") == "publicidad")
    kpis = {
        "ingreso_total": round(ingreso), "gasto_total": round(gasto_total),
        "balance": round(ingreso - gasto_total), "ingreso_mes": round(ing_mes),
        "ventas_totales": len(cobradas),
        "ticket_promedio": round(ingreso / len(cobradas)) if cobradas else 0,
        "gasto_publicidad": round(gasto_pub),
        "cobros_pendientes": sum(1 for v in ventas if v.get("estado") == "pendiente"),
        "facturadas_pct": round(100 * sum(1 for v in cobradas if v.get("facturada")) / len(cobradas)) if cobradas else 0,
    }

    # Series por mes (últimos 8)
    ing_por_mes, gas_por_mes = defaultdict(float), defaultdict(float)
    for v in cobradas:
        d = _mes(v)
        if d: ing_por_mes[(d.year, d.month)] += v.get("total") or 0
    for g in gastos:
        try:
            d = datetime.fromisoformat(str(g.get("fecha"))[:10])
            gas_por_mes[(d.year, d.month)] += g.get("monto") or 0
        except Exception:
            pass
    y, m, claves = ahora.year, ahora.month, []
    for _ in range(8):
        claves.append((y, m)); m -= 1
        if m == 0: m = 12; y -= 1
    serie = [{"nombre": f"{MESES_ES[mm]} {str(yy)[2:]}",
              "ingreso": round(ing_por_mes.get((yy, mm), 0)),
              "gasto": round(gas_por_mes.get((yy, mm), 0)),
              "balance": round(ing_por_mes.get((yy, mm), 0) - gas_por_mes.get((yy, mm), 0))}
             for (yy, mm) in reversed(claves)]

    # Facturado vs no facturado
    fact = sum(v.get("total") or 0 for v in cobradas if v.get("facturada"))
    facturacion = [
        {"nombre": "Con factura", "valor": round(fact)},
        {"nombre": "Sin factura", "valor": round(ingreso - fact)},
    ]

    # Gasto por categoría y publicidad por canal
    por_cat = defaultdict(float)
    for g in gastos:
        por_cat[g.get("categoria") or "otros"] += g.get("monto") or 0
    cat_labels = {"publicidad": "Publicidad", "sueldos": "Sueldos", "renta": "Renta",
                  "internet": "Internet", "seguros": "Seguros", "insumos": "Insumos", "otros": "Otros"}
    gasto_categorias = sorted(
        [{"nombre": cat_labels.get(k, k.title()), "valor": round(v)} for k, v in por_cat.items()],
        key=lambda x: -x["valor"])

    pub_por_canal = defaultdict(float)
    for g in gastos:
        if g.get("categoria") == "publicidad":
            pub_por_canal[g.get("canal") or "Otro"] += g.get("monto") or 0

    # ── ROI de marketing ────────────────────────────────────────────────────────
    # Atribución: cada paciente → un canal; ingreso atribuido = sus ventas cobradas.
    canal_de = {p["id"]: _canal_paciente(p) for p in pacientes}
    ingreso_por_canal, pac_por_canal = defaultdict(float), defaultdict(int)
    for p in pacientes:
        pac_por_canal[canal_de[p["id"]]] += 1
    for v in cobradas:
        c = canal_de.get(v.get("patient_id"))
        if c:
            ingreso_por_canal[c] += v.get("total") or 0

    roi = []
    for canal in CANALES_PAGO:
        inv = round(pub_por_canal.get(canal, 0))
        ing = round(ingreso_por_canal.get(canal, 0))
        roi.append({
            "canal": canal, "pacientes": pac_por_canal.get(canal, 0),
            "inversion": inv, "ingreso": ing,
            "roas": round(ing / inv, 1) if inv else None,   # retorno por peso invertido
            "ganancia": ing - inv,
        })

    # Pacientes que reportan haber visto publicidad (canales de pago) vs orgánico
    pagos = sum(pac_por_canal.get(c, 0) for c in CANALES_PAGO)
    total_pac = len(pacientes)
    origen_pacientes = sorted(
        [{"nombre": k, "valor": v} for k, v in pac_por_canal.items() if v > 0],
        key=lambda x: -x["valor"])

    return {
        "kpis": kpis,
        "serie_mensual": serie,
        "facturacion": facturacion,
        "gasto_categorias": gasto_categorias,
        "roi_marketing": roi,
        "origen_pacientes": origen_pacientes,
        "publicidad": {
            "pacientes_por_publicidad": pagos,
            "pacientes_total": total_pac,
            "pct_publicidad": round(100 * pagos / total_pac) if total_pac else 0,
            "inversion_total": round(sum(pub_por_canal.values())),
            "ingreso_atribuido": round(sum(ingreso_por_canal.get(c, 0) for c in CANALES_PAGO)),
        },
    }
