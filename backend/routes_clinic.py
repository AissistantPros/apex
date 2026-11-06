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
from tenant import assert_patient, assert_visit
from pydantic import BaseModel

from auth import get_actor
from db import supabase

router = APIRouter(prefix="/clinic", tags=["clinic"])
MESES_ES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

import json
from uuid import uuid4

# Canales de publicidad que se miden como "publicidad de pago / online"
CANALES_PAGO = ["Meta", "Google", "Doctoralia", "TikTok"]

ORIGENES_FONDO_LABELS = {
    "caja_consultorio": "Caja chica del consultorio (Efectivo)",
    "tarjeta_consultorio": "Tarjeta del consultorio",
    "transferencia_consultorio": "Transferencia cuenta consultorio",
    "efectivo_doctor": "Efectivo personal del médico",
    "tarjeta_doctor": "Tarjeta personal del médico",
    "transferencia_doctor": "Transferencia personal del médico",
}

TIPOS_INGRESO_LABELS = {
    "consulta": "Consulta médica",
    "procedimiento": "Procedimiento en consultorio",
    "cirugia": "Cirugía / Quirófano",
    "aseguradora": "Pago de aseguradora",
    "estudio": "Estudio / Laboratorio",
    "otro": "Otro ingreso",
}


def _pack_meta(notas: Optional[str], meta: dict) -> Optional[str]:
    clean_meta = {k: v for k, v in meta.items() if v is not None and v != ""}
    if not clean_meta:
        return notas
    payload = {"_apex_meta": clean_meta, "notas": (notas or "").strip()}
    return json.dumps(payload, ensure_ascii=False)


def _unpack_row_meta(row: dict, defaults: Optional[dict] = None) -> dict:
    out = dict(row)
    raw_notas = out.get("notas")
    meta = {}
    if isinstance(raw_notas, str) and raw_notas.startswith("{") and "_apex_meta" in raw_notas:
        try:
            parsed = json.loads(raw_notas)
            if isinstance(parsed, dict) and isinstance(parsed.get("_apex_meta"), dict):
                meta = parsed["_apex_meta"]
                out["notas"] = parsed.get("notas") or ""
        except Exception:
            pass
    if defaults:
        for k, dval in defaults.items():
            out[k] = meta.get(k, out.get(k, dval))
    else:
        for k, v in meta.items():
            out[k] = v
    return out


def _get_clinic_catalogs(clinic_id: Optional[str]) -> dict:
    default_cat = {"proveedores": [], "clientes": [], "conceptos_gasto": []}
    if not clinic_id:
        return default_cat
    try:
        r = supabase.table("clinics").select("brand").eq("id", clinic_id).limit(1).execute().data
        brand = (r[0].get("brand") if r else None) or {}
        if not isinstance(brand, dict):
            return default_cat
        cats = brand.get("catalogs") if isinstance(brand.get("catalogs"), dict) else {}
        return {
            "proveedores": list(cats.get("proveedores") or []),
            "clientes": list(cats.get("clientes") or []),
            "conceptos_gasto": list(cats.get("conceptos_gasto") or []),
        }
    except Exception:
        return default_cat


def _save_clinic_catalogs(clinic_id: Optional[str], catalogs: dict):
    if not clinic_id:
        return
    try:
        r = supabase.table("clinics").select("brand").eq("id", clinic_id).limit(1).execute().data
        brand = dict((r[0].get("brand") if r else None) or {})
        brand["catalogs"] = catalogs
        supabase.table("clinics").update({"brand": brand}).eq("id", clinic_id).execute()
    except Exception as e:
        print(f"[WARN] no se pudo guardar catalogos en clinics.brand: {e}")


# ── Modelos ────────────────────────────────────────────────────────────────────
class ServiceIn(BaseModel):
    nombre: str
    precio: float
    activo: bool = True
    orden: int = 0
    categoria: Optional[str] = None

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
    # Campos ampliados de contabilidad médica (cirugías, procedimientos, aseguradoras, mostrador)
    tipo_ingreso: Optional[str] = "consulta"   # consulta | procedimiento | cirugia | aseguradora | estudio | otro
    lugar: Optional[str] = None                # Consultorio, Hospital, Clínica, Quirófano...
    aseguradora: Optional[str] = None          # GNP, AXA, MetLife, Particular...
    poliza: Optional[str] = None               # Póliza / siniestro / folio
    procedimiento: Optional[str] = None        # Nombre de la cirugía o procedimiento
    proxima_cita: Optional[str] = None         # Indicación de próxima visita para recepción
    indicaciones_mostrador: Optional[str] = None
    fecha_evento: Optional[str] = None
    destino_fondo: Optional[str] = None        # caja_consultorio | banco_consultorio | cuenta_doctor

class ChargeIn(BaseModel):
    metodo_pago: str
    facturada: bool = False
    descuento: Optional[float] = None
    descuento_motivo: Optional[str] = None
    cortesia: Optional[bool] = None
    destino_fondo: Optional[str] = None

class ExpenseIn(BaseModel):
    categoria: str
    canal: Optional[str] = None
    concepto: Optional[str] = None
    monto: float
    proveedor: Optional[str] = None
    fecha: Optional[str] = None
    recurrente: bool = False
    notas: Optional[str] = None
    origen_fondo: Optional[str] = "caja_consultorio"  # caja_consultorio | tarjeta_consultorio | transferencia_consultorio | efectivo_doctor | tarjeta_doctor | transferencia_doctor
    metodo_pago: Optional[str] = "efectivo"
    guardar_concepto: bool = False
    guardar_proveedor: bool = False

class CatalogItemIn(BaseModel):
    kind: str                     # proveedores | clientes | conceptos_gasto
    nombre: str
    tipo: Optional[str] = None    # aseguradora | hospital | cliente | proveedor | insumo
    categoria: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    rfc: Optional[str] = None
    monto_sugerido: Optional[float] = None
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


# ── Catálogos del consultorio (proveedores, clientes/aseguradoras, conceptos frecuentes) ──
@router.get("/catalogs")
async def get_catalogs(authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    cats = _get_clinic_catalogs(actor.get("clinic_id"))
    svcs = supabase.table("clinic_services").select("*").eq("doctor_id", actor["doctor_id"])\
        .order("orden").execute().data or []
    return {
        **cats,
        "services": svcs,
        "origenes_fondo": [{"id": k, "label": v} for k, v in ORIGENES_FONDO_LABELS.items()],
        "tipos_ingreso": [{"id": k, "label": v} for k, v in TIPOS_INGRESO_LABELS.items()],
    }


@router.post("/catalogs/item")
async def add_catalog_item(body: CatalogItemIn, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if body.kind not in ("proveedores", "clientes", "conceptos_gasto"):
        raise HTTPException(400, "Tipo de catálogo inválido")
    nombre = (body.nombre or "").strip()
    if not nombre:
        raise HTTPException(400, "El nombre es obligatorio")
    clinic_id = actor.get("clinic_id")
    cats = _get_clinic_catalogs(clinic_id)
    lista = list(cats.get(body.kind) or [])
    # Evitar duplicados por nombre (actualiza si ya existe)
    existing = next((x for x in lista if (x.get("nombre") or "").strip().lower() == nombre.lower()), None)
    if existing:
        existing.update({
            "nombre": nombre,
            "tipo": body.tipo or existing.get("tipo"),
            "categoria": body.categoria or existing.get("categoria"),
            "telefono": body.telefono if body.telefono is not None else existing.get("telefono"),
            "email": body.email if body.email is not None else existing.get("email"),
            "rfc": body.rfc if body.rfc is not None else existing.get("rfc"),
            "monto_sugerido": body.monto_sugerido if body.monto_sugerido is not None else existing.get("monto_sugerido"),
            "notas": body.notas if body.notas is not None else existing.get("notas"),
        })
        item = existing
    else:
        item = {
            "id": str(uuid4()),
            "nombre": nombre,
            "tipo": body.tipo or ("aseguradora" if body.kind == "clientes" else "general"),
            "categoria": body.categoria or "insumos",
            "telefono": body.telefono or "",
            "email": body.email or "",
            "rfc": body.rfc or "",
            "monto_sugerido": body.monto_sugerido,
            "notas": body.notas or "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        lista.append(item)
    cats[body.kind] = lista
    _save_clinic_catalogs(clinic_id, cats)
    return {"ok": True, "item": item, "catalogs": cats}


@router.delete("/catalogs/item/{kind}/{item_id}")
async def remove_catalog_item(kind: str, item_id: str, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if kind not in ("proveedores", "clientes", "conceptos_gasto"):
        raise HTTPException(400, "Tipo de catálogo inválido")
    clinic_id = actor.get("clinic_id")
    cats = _get_clinic_catalogs(clinic_id)
    cats[kind] = [x for x in (cats.get(kind) or []) if x.get("id") != item_id]
    _save_clinic_catalogs(clinic_id, cats)
    return {"ok": True, "catalogs": cats}


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
SALE_META_DEFAULTS = {
    "tipo_ingreso": "consulta",
    "lugar": "Consultorio",
    "aseguradora": "",
    "poliza": "",
    "procedimiento": "",
    "proxima_cita": "",
    "indicaciones_mostrador": "",
    "fecha_evento": "",
    "destino_fondo": "caja_consultorio",
}

EXPENSE_META_DEFAULTS = {
    "origen_fondo": "caja_consultorio",
    "metodo_pago": "efectivo",
}


def _nombre_pacientes(did: str) -> dict:
    r = supabase.table("patients").select("id, full_name").eq("doctor_id", did).execute()
    return {p["id"]: p.get("full_name") for p in (r.data or [])}

@router.get("/sales")
async def list_sales(estado: Optional[str] = None, limit: int = 150,
                     authorization: Optional[str] = Header(None)):
    did = get_actor(authorization)["doctor_id"]
    q = supabase.table("sales").select("*").eq("doctor_id", did)\
        .order("created_at", desc=True).limit(limit)
    if estado:
        q = q.eq("estado", estado)
    ventas = q.execute().data or []
    nombres = _nombre_pacientes(did)
    out = []
    for v in ventas:
        u = _unpack_row_meta(v, SALE_META_DEFAULTS)
        u["patient_name"] = nombres.get(v.get("patient_id"))
        out.append(u)
    return {"sales": out}

@router.get("/pending")
async def pending_charges(authorization: Optional[str] = Header(None)):
    """Cola de recepción: cobros pendientes con nombre del paciente e indicaciones del médico."""
    did = get_actor(authorization)["doctor_id"]
    ventas = supabase.table("sales").select("*").eq("doctor_id", did)\
        .eq("estado", "pendiente").order("created_at").execute().data or []
    nombres = _nombre_pacientes(did)
    out = []
    for v in ventas:
        u = _unpack_row_meta(v, SALE_META_DEFAULTS)
        u["patient_name"] = nombres.get(v.get("patient_id"))
        out.append(u)
    return {"pending": out}

@router.post("/sales")
async def create_sale(body: SaleIn, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if body.patient_id:
        assert_patient(actor, body.patient_id)   # el cobro solo se liga a pacientes de la clínica
    if body.visit_id:
        assert_visit(actor, body.visit_id)
    items = [i.model_dump() for i in body.items]
    if not items:
        raise HTTPException(400, "La venta no tiene conceptos")
    subtotal, total = _totales(items, body.descuento, body.cortesia)
    packed_notas = _pack_meta(body.notas, {
        "tipo_ingreso": body.tipo_ingreso or "consulta",
        "lugar": body.lugar,
        "aseguradora": body.aseguradora,
        "poliza": body.poliza,
        "procedimiento": body.procedimiento,
        "proxima_cita": body.proxima_cita,
        "indicaciones_mostrador": body.indicaciones_mostrador,
        "fecha_evento": body.fecha_evento,
        "destino_fondo": body.destino_fondo or (
            "caja_consultorio" if body.metodo_pago == "efectivo" else "banco_consultorio"
        ),
    })
    row = {
        "doctor_id": actor["doctor_id"], "patient_id": body.patient_id, "visit_id": body.visit_id,
        "items": items, "subtotal": subtotal, "descuento": body.descuento or 0, "total": total,
        "descuento_motivo": body.descuento_motivo, "cortesia": body.cortesia,
        "facturada": body.facturada, "metodo_pago": body.metodo_pago,
        "estado": body.estado, "notas": packed_notas, "created_by": actor["user_id"],
    }
    if body.estado == "cobrado":
        row["charged_by"] = actor["user_id"]
        row["charged_at"] = datetime.now(timezone.utc).isoformat()
    r = supabase.table("sales").insert(row).execute()
    created = r.data[0] if r.data else {}
    return _unpack_row_meta(created, SALE_META_DEFAULTS) if created else {}

@router.post("/sales/{sid}/charge")
async def charge_sale(sid: str, body: ChargeIn, authorization: Optional[str] = Header(None)):
    """Recepción cobra un pendiente."""
    actor = get_actor(authorization)
    venta = supabase.table("sales").select("*").eq("id", sid)\
        .eq("doctor_id", actor["doctor_id"]).execute().data
    if not venta:
        raise HTTPException(404, "Venta no encontrada")
    venta = venta[0]
    unpacked = _unpack_row_meta(venta, SALE_META_DEFAULTS)
    descuento = body.descuento if body.descuento is not None else (venta.get("descuento") or 0)
    cortesia = body.cortesia if body.cortesia is not None else venta.get("cortesia", False)
    subtotal, total = _totales(venta.get("items") or [], descuento, cortesia)
    destino = body.destino_fondo or (
        "caja_consultorio" if body.metodo_pago == "efectivo" else "banco_consultorio"
    )
    packed_notas = _pack_meta(unpacked.get("notas"), {
        "tipo_ingreso": unpacked.get("tipo_ingreso"),
        "lugar": unpacked.get("lugar"),
        "aseguradora": unpacked.get("aseguradora"),
        "poliza": unpacked.get("poliza"),
        "procedimiento": unpacked.get("procedimiento"),
        "proxima_cita": unpacked.get("proxima_cita"),
        "indicaciones_mostrador": unpacked.get("indicaciones_mostrador"),
        "fecha_evento": unpacked.get("fecha_evento"),
        "destino_fondo": destino,
    })
    supabase.table("sales").update({
        "estado": "cobrado", "metodo_pago": body.metodo_pago, "facturada": body.facturada,
        "descuento": descuento, "descuento_motivo": body.descuento_motivo or venta.get("descuento_motivo"),
        "cortesia": cortesia, "total": total, "notas": packed_notas,
        "charged_by": actor["user_id"],
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
async def list_expenses(limit: int = 250, authorization: Optional[str] = Header(None)):
    from access import require
    actor = get_actor(authorization)
    require(actor, "doctor", "accounting", "receptionist")
    did = actor["doctor_id"]
    r = supabase.table("expenses").select("*").eq("doctor_id", did)\
        .order("fecha", desc=True).limit(limit).execute()
    out = [_unpack_row_meta(g, EXPENSE_META_DEFAULTS) for g in (r.data or [])]
    return {"expenses": out}

@router.post("/expenses")
async def create_expense(body: ExpenseIn, authorization: Optional[str] = Header(None)):
    from access import require
    actor = get_actor(authorization)
    require(actor, "doctor", "accounting", "receptionist")
    origen = body.origen_fondo or "caja_consultorio"
    metodo = body.metodo_pago or (
        "efectivo" if "caja" in origen or "efectivo" in origen
        else "tarjeta" if "tarjeta" in origen
        else "transferencia"
    )
    packed_notas = _pack_meta(body.notas, {
        "origen_fondo": origen,
        "metodo_pago": metodo,
    })
    row = {
        "doctor_id": actor["doctor_id"],
        "created_by": actor["user_id"],
        "categoria": body.categoria or "otros",
        "canal": body.canal,
        "concepto": (body.concepto or "").strip() or body.categoria,
        "monto": body.monto,
        "proveedor": (body.proveedor or "").strip() or None,
        "recurrente": body.recurrente,
        "notas": packed_notas,
    }
    if body.fecha:
        row["fecha"] = body.fecha

    r = supabase.table("expenses").insert(row).execute()
    created = r.data[0] if r.data else {}

    # Si pidió guardar el concepto o el proveedor para más adelante, actualizar catálogos
    if body.guardar_concepto or body.guardar_proveedor:
        clinic_id = actor.get("clinic_id")
        cats = _get_clinic_catalogs(clinic_id)
        changed = False
        if body.guardar_concepto and (body.concepto or "").strip():
            c_txt = body.concepto.strip()
            lista_c = list(cats.get("conceptos_gasto") or [])
            if not any((x.get("nombre") or "").strip().lower() == c_txt.lower() for x in lista_c):
                lista_c.append({
                    "id": str(uuid4()),
                    "nombre": c_txt,
                    "categoria": body.categoria or "insumos",
                    "monto_sugerido": body.monto,
                    "notas": body.proveedor or "",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
                cats["conceptos_gasto"] = lista_c
                changed = True
        if body.guardar_proveedor and (body.proveedor or "").strip():
            p_txt = body.proveedor.strip()
            lista_p = list(cats.get("proveedores") or [])
            if not any((x.get("nombre") or "").strip().lower() == p_txt.lower() for x in lista_p):
                lista_p.append({
                    "id": str(uuid4()),
                    "nombre": p_txt,
                    "categoria": body.categoria or "insumos",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
                cats["proveedores"] = lista_p
                changed = True
        if changed:
            _save_clinic_catalogs(clinic_id, cats)

    return _unpack_row_meta(created, EXPENSE_META_DEFAULTS) if created else {}

@router.delete("/expenses/{eid}")
async def delete_expense(eid: str, authorization: Optional[str] = Header(None)):
    did = get_actor(authorization)["doctor_id"]
    supabase.table("expenses").delete().eq("id", eid).eq("doctor_id", did).execute()
    return {"ok": True}


# ── Dashboard financiero + Flujo de fondos + ROI de marketing ───────────────────
def _build_financial_overview(actor: dict) -> dict:
    did = actor["doctor_id"]
    raw_ventas = supabase.table("sales").select("*").eq("doctor_id", did).execute().data or []
    raw_gastos = supabase.table("expenses").select("*").eq("doctor_id", did).execute().data or []
    pacientes = supabase.table("patients").select("id, full_name, sources_of_contact, social_network")\
        .eq("doctor_id", did).execute().data or []

    ventas = [_unpack_row_meta(v, SALE_META_DEFAULTS) for v in raw_ventas]
    gastos = [_unpack_row_meta(g, EXPENSE_META_DEFAULTS) for g in raw_gastos]

    cobradas = [v for v in ventas if v.get("estado") == "cobrado"]
    scope = (actor.get("permissions") or {}).get("ingresos_scope") or {}
    if scope:
        if scope.get("solo_facturado"):
            cobradas = [v for v in cobradas if v.get("facturada")]
        metodos = scope.get("metodos")
        if metodos and metodos != "todos" and isinstance(metodos, list):
            cobradas = [v for v in cobradas if v.get("metodo_pago") in metodos]

    ingreso = sum(v.get("total") or 0 for v in cobradas)
    gasto_total = sum(g.get("monto") or 0 for g in gastos)
    ahora = datetime.now(timezone.utc)

    # Series por mes completas
    ing_por_mes, gas_por_mes = defaultdict(float), defaultdict(float)
    ventas_por_mes, gastos_cnt_por_mes = defaultdict(int), defaultdict(int)
    for v in cobradas:
        d = _mes(v)
        if d:
            ing_por_mes[(d.year, d.month)] += v.get("total") or 0
            ventas_por_mes[(d.year, d.month)] += 1
    for g in gastos:
        try:
            d = datetime.fromisoformat(str(g.get("fecha") or g.get("created_at") or "")[:10])
            gas_por_mes[(d.year, d.month)] += g.get("monto") or 0
            gastos_cnt_por_mes[(d.year, d.month)] += 1
        except Exception:
            pass

    # Mes actual y mes anterior
    cur_key = (ahora.year, ahora.month)
    prev_m = ahora.month - 1 if ahora.month > 1 else 12
    prev_y = ahora.year if ahora.month > 1 else ahora.year - 1
    prev_key = (prev_y, prev_m)

    ing_mes = round(ing_por_mes.get(cur_key, 0))
    gas_mes = round(gas_por_mes.get(cur_key, 0))
    bal_mes = ing_mes - gas_mes
    cnt_mes = ventas_por_mes.get(cur_key, 0)

    ing_mes_ant = round(ing_por_mes.get(prev_key, 0))
    gas_mes_ant = round(gas_por_mes.get(prev_key, 0))

    # Promedio mensual real (sobre los meses que tienen al menos un movimiento, o mínimo 1)
    active_months = sorted(set(ing_por_mes.keys()) | set(gas_por_mes.keys()))
    n_months = max(len(active_months), 1)
    prom_ingreso = round(ingreso / n_months)
    prom_gasto = round(gasto_total / n_months)
    prom_balance = prom_ingreso - prom_gasto

    mes_actual = {
        "nombre": f"{MESES_ES[ahora.month]} {ahora.year}",
        "anio": ahora.year,
        "mes": ahora.month,
        "ingreso": ing_mes,
        "gasto": gas_mes,
        "balance": bal_mes,
        "ventas_count": cnt_mes,
        "gastos_count": gastos_cnt_por_mes.get(cur_key, 0),
        "ticket_promedio": round(ing_mes / cnt_mes) if cnt_mes else 0,
        "ingreso_mes_anterior": ing_mes_ant,
        "gasto_mes_anterior": gas_mes_ant,
        "variacion_ingreso_pct": round(100 * (ing_mes - ing_mes_ant) / ing_mes_ant, 1) if ing_mes_ant else None,
    }

    promedios = {
        "ingreso_mensual": prom_ingreso,
        "gasto_mensual": prom_gasto,
        "balance_mensual": prom_balance,
        "meses_con_actividad": len(active_months),
    }

    gasto_pub = sum(g.get("monto") or 0 for g in gastos if g.get("categoria") == "publicidad")
    kpis = {
        "ingreso_total": round(ingreso),
        "gasto_total": round(gasto_total),
        "balance": round(ingreso - gasto_total),
        "ingreso_mes": ing_mes,
        "gasto_mes": gas_mes,
        "balance_mes": bal_mes,
        "promedio_mensual_ingreso": prom_ingreso,
        "promedio_mensual_gasto": prom_gasto,
        "promedio_mensual_balance": prom_balance,
        "ventas_totales": len(cobradas),
        "ticket_promedio": round(ingreso / len(cobradas)) if cobradas else 0,
        "gasto_publicidad": round(gasto_pub),
        "cobros_pendientes": sum(1 for v in ventas if v.get("estado") == "pendiente"),
        "monto_pendiente": round(sum(v.get("total") or 0 for v in ventas if v.get("estado") == "pendiente")),
        "facturadas_pct": round(100 * sum(1 for v in cobradas if v.get("facturada")) / len(cobradas)) if cobradas else 0,
    }

    # Serie de 12 meses (para comparativa histórica mes a mes)
    y, m, claves_12 = ahora.year, ahora.month, []
    for _ in range(12):
        claves_12.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    serie_12 = [
        {
            "nombre": f"{MESES_ES[mm]} {str(yy)[2:]}",
            "anio": yy,
            "mes": mm,
            "ingreso": round(ing_por_mes.get((yy, mm), 0)),
            "gasto": round(gas_por_mes.get((yy, mm), 0)),
            "balance": round(ing_por_mes.get((yy, mm), 0) - gas_por_mes.get((yy, mm), 0)),
            "ventas": ventas_por_mes.get((yy, mm), 0),
        }
        for (yy, mm) in reversed(claves_12)
    ]

    # Comparativa por año (año actual vs año anterior)
    ing_anio_actual = round(sum(v for (yy, _), v in ing_por_mes.items() if yy == ahora.year))
    gas_anio_actual = round(sum(v for (yy, _), v in gas_por_mes.items() if yy == ahora.year))
    ing_anio_ant = round(sum(v for (yy, _), v in ing_por_mes.items() if yy == ahora.year - 1))
    gas_anio_ant = round(sum(v for (yy, _), v in gas_por_mes.items() if yy == ahora.year - 1))
    comparativa_anual = {
        "anio_actual": {
            "anio": ahora.year,
            "ingreso": ing_anio_actual,
            "gasto": gas_anio_actual,
            "balance": ing_anio_actual - gas_anio_actual,
        },
        "anio_anterior": {
            "anio": ahora.year - 1,
            "ingreso": ing_anio_ant,
            "gasto": gas_anio_ant,
            "balance": ing_anio_ant - gas_anio_ant,
        },
    }

    # ── Flujo de fondos (¿En dónde está el dinero?) ───────────────────────────
    ing_efectivo = sum(v.get("total") or 0 for v in cobradas if (v.get("metodo_pago") or "").lower() == "efectivo")
    ing_banco = sum(v.get("total") or 0 for v in cobradas if (v.get("metodo_pago") or "").lower() != "efectivo")

    gasto_por_origen = defaultdict(float)
    for g in gastos:
        orig = g.get("origen_fondo") or "caja_consultorio"
        gasto_por_origen[orig] += g.get("monto") or 0

    gasto_caja = gasto_por_origen.get("caja_consultorio", 0)
    gasto_banco_cons = gasto_por_origen.get("tarjeta_consultorio", 0) + gasto_por_origen.get("transferencia_consultorio", 0)
    gasto_bolsa_doctor = (
        gasto_por_origen.get("efectivo_doctor", 0)
        + gasto_por_origen.get("tarjeta_doctor", 0)
        + gasto_por_origen.get("transferencia_doctor", 0)
    )

    flujo_fondos = {
        "caja_consultorio": {
            "entradas_efectivo": round(ing_efectivo),
            "salidas_caja": round(gasto_caja),
            "saldo_caja": round(ing_efectivo - gasto_caja),
        },
        "banco_consultorio": {
            "entradas_tarjeta_transferencia": round(ing_banco),
            "salidas_tarjeta_transferencia": round(gasto_banco_cons),
            "saldo_banco": round(ing_banco - gasto_banco_cons),
        },
        "pagado_por_doctor": {
            "efectivo_doctor": round(gasto_por_origen.get("efectivo_doctor", 0)),
            "tarjeta_doctor": round(gasto_por_origen.get("tarjeta_doctor", 0)),
            "transferencia_doctor": round(gasto_por_origen.get("transferencia_doctor", 0)),
            "total_aportado_doctor": round(gasto_bolsa_doctor),
        },
        "desglose_origen_gastos": [
            {"origen": k, "nombre": ORIGENES_FONDO_LABELS.get(k, k), "valor": round(val)}
            for k, val in sorted(gasto_por_origen.items(), key=lambda x: -x[1]) if val > 0
        ],
    }

    # Desglose de ingresos por tipo (consulta, cirugía, procedimiento, aseguradora...), lugar y aseguradora
    por_tipo_ing = defaultdict(float)
    por_lugar_ing = defaultdict(float)
    por_aseg_ing = defaultdict(float)
    for v in cobradas:
        t = v.get("tipo_ingreso") or "consulta"
        por_tipo_ing[t] += v.get("total") or 0
        lug = (v.get("lugar") or "Consultorio").strip()
        por_lugar_ing[lug] += v.get("total") or 0
        aseg = (v.get("aseguradora") or "").strip()
        if aseg:
            por_aseg_ing[aseg] += v.get("total") or 0

    ingresos_por_tipo = [
        {"tipo": k, "nombre": TIPOS_INGRESO_LABELS.get(k, k.title()), "valor": round(val)}
        for k, val in sorted(por_tipo_ing.items(), key=lambda x: -x[1]) if val > 0
    ]
    ingresos_por_lugar = [
        {"nombre": k, "valor": round(val)}
        for k, val in sorted(por_lugar_ing.items(), key=lambda x: -x[1]) if val > 0
    ]
    ingresos_por_aseguradora = [
        {"nombre": k, "valor": round(val)}
        for k, val in sorted(por_aseg_ing.items(), key=lambda x: -x[1]) if val > 0
    ]

    # Facturado vs no facturado
    fact = sum(v.get("total") or 0 for v in cobradas if v.get("facturada"))
    facturacion = [
        {"nombre": "Con factura", "valor": round(fact)},
        {"nombre": "Sin factura", "valor": round(ingreso - fact)},
    ]

    # Gasto por categoría
    por_cat = defaultdict(float)
    for g in gastos:
        por_cat[g.get("categoria") or "otros"] += g.get("monto") or 0
    cat_labels = {
        "publicidad": "Publicidad", "sueldos": "Sueldos / Nómina", "renta": "Renta / Consultorio",
        "internet": "Internet / Servicios", "seguros": "Seguros", "insumos": "Insumos médicos",
        "equipo": "Equipo médico", "laboratorio": "Laboratorio / Estudios",
        "hospital_quirofano": "Hospital / Quirófano", "impuestos": "Impuestos / Contabilidad",
        "otros": "Otros",
    }
    gasto_categorias = sorted(
        [{"nombre": cat_labels.get(k, k.title()), "valor": round(v)} for k, v in por_cat.items()],
        key=lambda x: -x["valor"]
    )

    pub_por_canal = defaultdict(float)
    for g in gastos:
        if g.get("categoria") == "publicidad":
            pub_por_canal[g.get("canal") or "Otro"] += g.get("monto") or 0

    # ── ROI de marketing ────────────────────────────────────────────────────────
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
            "roas": round(ing / inv, 1) if inv else None,
            "ganancia": ing - inv,
        })

    pagos = sum(pac_por_canal.get(c, 0) for c in CANALES_PAGO)
    total_pac = len(pacientes)
    origen_pacientes = sorted(
        [{"nombre": k, "valor": v} for k, v in pac_por_canal.items() if v > 0],
        key=lambda x: -x["valor"]
    )

    return {
        "mes_actual": mes_actual,
        "promedios": promedios,
        "comparativa_anual": comparativa_anual,
        "flujo_fondos": flujo_fondos,
        "ingresos_por_tipo": ingresos_por_tipo,
        "ingresos_por_lugar": ingresos_por_lugar,
        "ingresos_por_aseguradora": ingresos_por_aseguradora,
        "kpis": kpis,
        "serie_mensual": serie_12[-8:],
        "historico_12m": serie_12,
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


@router.get("/overview")
async def overview(authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    from access import require
    require(actor, "doctor", "accounting")
    return _build_financial_overview(actor)


class FinancialAiIn(BaseModel):
    question: Optional[str] = None


@router.post("/ai-analysis")
async def clinic_ai_analysis(body: FinancialAiIn, authorization: Optional[str] = Header(None)):
    """Analiza la contabilidad del consultorio con IA: ingresos del mes vs promedio,
    flujo de efectivo y dónde está el dinero (caja vs banco vs desembolsos del médico),
    aseguradoras, procedimientos/cirugías, gastos y recomendaciones."""
    import os
    import anthropic
    from access import require
    from services.plans import require_ai_lite_or_pro
    from services.usage import log_event

    actor = get_actor(authorization)
    require(actor, "doctor", "accounting")
    ent = require_ai_lite_or_pro(actor.get("clinic_id"), "ia_lite")

    ov = _build_financial_overview(actor)
    q_extra = (body.question or "").strip()

    prompt = f"""Eres el asesor financiero y contable médico de este consultorio en APEX.
Analiza los datos reales del consultorio y entrega un diagnóstico claro, ejecutivo y accionable.

DATOS FINANCIEROS DEL CONSULTORIO:
- Mes actual ({ov['mes_actual']['nombre']}): Ingresos=${ov['mes_actual']['ingreso']:,} MXN | Gastos=${ov['mes_actual']['gasto']:,} MXN | Balance=${ov['mes_actual']['balance']:,} MXN | Consultas/eventos cobrados={ov['mes_actual']['ventas_count']}
- Mes anterior: Ingresos=${ov['mes_actual']['ingreso_mes_anterior']:,} MXN | Gastos=${ov['mes_actual']['gasto_mes_anterior']:,} MXN
- Promedio mensual histórico ({ov['promedios']['meses_con_actividad']} meses con actividad): Ingreso prom=${ov['promedios']['ingreso_mensual']:,} MXN | Gasto prom=${ov['promedios']['gasto_mensual']:,} MXN | Balance prom=${ov['promedios']['balance_mensual']:,} MXN
- Comparativa anual: {json.dumps(ov['comparativa_anual'], ensure_ascii=False)}
- ¿Dónde está el dinero? (Flujo de fondos): {json.dumps(ov['flujo_fondos'], ensure_ascii=False)}
- Ingresos por tipo (consultas, cirugías, procedimientos, aseguradoras): {json.dumps(ov['ingresos_por_tipo'], ensure_ascii=False)}
- Ingresos por sede/hospital: {json.dumps(ov['ingresos_por_lugar'], ensure_ascii=False)}
- Ingresos por aseguradora/cliente: {json.dumps(ov['ingresos_por_aseguradora'], ensure_ascii=False)}
- Gastos por categoría: {json.dumps(ov['gasto_categorias'], ensure_ascii=False)}
- Serie últimos 12 meses: {json.dumps(ov['historico_12m'], ensure_ascii=False)}
{f'PREGUNTA ESPECÍFICA DEL MÉDICO: {q_extra}' if q_extra else ''}

Responde en español con formato claro (viñetas y negritas):
1. **Desempeño del Mes Actual vs Promedio Mensual y Año Anterior**.
2. **¿Dónde está el dinero? (Caja del consultorio, Banco y Reembolsos pendientes al Médico si pagó gastos de su bolsillo)**.
3. **Rentabilidad por Tipo de Ingreso (Consultas, Cirugías, Procedimientos, Aseguradoras) y Control de Gastos**.
4. **3 Recomendaciones Concretas para optimizar flujo de caja y margen este mes**."""

    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1100,
        messages=[{"role": "user", "content": prompt}],
    )
    analysis_text = "".join(b.text for b in msg.content if hasattr(b, "text")).strip()
    tokens_in = getattr(msg.usage, "input_tokens", 0)
    tokens_out = getattr(msg.usage, "output_tokens", 0)

    log_event(
        actor["user_id"],
        actor.get("clinic_id"),
        actor["role"],
        "clinic.ai_analysis",
        "Finanzas IA",
        ai_tokens=tokens_in + tokens_out,
        input_tokens=tokens_in,
        output_tokens=tokens_out,
        model="claude-haiku-4-5-20251001",
    )

    daily_used = (ent.get("ai_daily_used") or 0) + 1
    daily_limit = ent.get("ai_daily_limit") or 50
    return {
        "ok": True,
        "analysis": analysis_text,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "daily_used": daily_used,
        "daily_limit": daily_limit,
        "daily_remaining": max(0, daily_limit - daily_used),
    }
