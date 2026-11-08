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
import unicodedata
from uuid import uuid4

CATALOG_KINDS = ("proveedores", "clientes", "conceptos_gasto", "lugares")


def _norm(txt) -> str:
    """Minúsculas y sin acentos, para comparar nombres ('Clínica' == 'clinica')."""
    t = unicodedata.normalize("NFD", str(txt or "").strip().lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


_REGLAS_CATEGORIA = (
    ("publicidad", ("doctoralia", "meta", "facebook", "instagram", "google", "publicidad", "ads", "tiktok", "anuncio")),
    ("renta", ("renta", "alquiler", "arrendamiento")),
    ("sueldos", ("sueldo", "nomina", "salario", "honorarios")),
    ("internet", ("luz", "cfe", "agua", "internet", "celular", "telefono", "telcel", "at&t", "izzi", "megacable", "software")),
    ("insumos", ("insumo", "material", "farmacia", "papeleria", "medicamento", "limpieza")),
)
_CANALES_PUBLICIDAD = (("Doctoralia", "doctoralia"), ("Meta", "meta"), ("Meta", "facebook"), ("Meta", "instagram"),
                       ("Google", "google"), ("TikTok", "tiktok"))


def _inferir_categoria(concepto: str, proveedor: str = "") -> str:
    """Categoría de un gasto a partir de lo que se escribió (el formulario ya no la pide)."""
    t = _norm(f"{concepto} {proveedor}")
    for cat, palabras in _REGLAS_CATEGORIA:
        if any(w in t for w in palabras):
            return cat
    return "otros"


def _inferir_canal(concepto: str, proveedor: str = "") -> Optional[str]:
    t = _norm(f"{concepto} {proveedor}")
    return next((canal for canal, w in _CANALES_PUBLICIDAD if w in t), None)


def _catalog_add(cats: dict, kind: str, nombre: str, **extra) -> bool:
    """Agrega `nombre` al catálogo si no existe (sin importar mayúsculas ni acentos)."""
    nombre = (nombre or "").strip()
    if not nombre:
        return False
    lista = list(cats.get(kind) or [])
    if any(_norm(x.get("nombre")) == _norm(nombre) for x in lista):
        return False
    lista.append({"id": str(uuid4()), "nombre": nombre,
                  "created_at": datetime.now(timezone.utc).isoformat(), **extra})
    cats[kind] = lista
    return True

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
    default_cat = {"proveedores": [], "clientes": [], "conceptos_gasto": [], "lugares": []}
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
            "lugares": list(cats.get("lugares") or []),
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
    precio: float = 0.0
    precio_tipo: str = "fijo"                  # 'fijo' | 'variable' (abierto al momento de cobrar/operar)
    categoria: str = "consulta"                # consulta | estudio | cirugia | producto | otro
    precios_convenio: Optional[dict[str, float]] = None  # { 'GNP': 1900, 'AXA': 2100 }
    descripcion: Optional[str] = None
    activo: bool = True
    orden: int = 0

class SaleItem(BaseModel):
    concepto: str
    precio: float
    cantidad: int = 1
    service_id: Optional[str] = None
    categoria: Optional[str] = None
    precio_tipo: Optional[str] = "fijo"

class SaleIn(BaseModel):
    patient_id: Optional[str] = None
    visit_id: Optional[str] = None
    items: list[SaleItem]
    descuento: float = 0
    descuento_motivo: Optional[str] = None
    cortesia: bool = False
    facturada: bool = False
    metodo_pago: Optional[str] = None
    estado: str = "pendiente"     # 'pendiente' (mostrador) | 'cobrado' (liquidado) | 'en_tramite' (por cobrar aseguradora)
    notas: Optional[str] = None
    # Campos ampliados de contabilidad médica (cirugías, procedimientos, aseguradoras, mostrador)
    tipo_ingreso: Optional[str] = "consulta"   # consulta | procedimiento | cirugia | aseguradora | estudio | producto | otro
    lugar: Optional[str] = None                # Consultorio, Hospital, Clínica, Quirófano...
    aseguradora: Optional[str] = None          # GNP, AXA, MetLife, Particular...
    poliza: Optional[str] = None               # Póliza / siniestro / folio
    procedimiento: Optional[str] = None        # Nombre de la cirugía o procedimiento
    proxima_cita: Optional[str] = None         # Indicación de próxima visita para recepción
    indicaciones_mostrador: Optional[str] = None
    fecha_evento: Optional[str] = None
    destino_fondo: Optional[str] = None        # caja_consultorio | banco_consultorio | cuenta_doctor
    guardar_cliente: bool = False              # guarda `aseguradora` (quien paga) en el catálogo de clientes
    guardar_lugar: bool = False                # guarda `lugar` en el catálogo de lugares
    tarjeta_nombre: Optional[str] = None

class ChargeIn(BaseModel):
    metodo_pago: str
    facturada: bool = False
    descuento: Optional[float] = None
    descuento_motivo: Optional[str] = None
    cortesia: Optional[bool] = None
    destino_fondo: Optional[str] = None
    tarjeta_nombre: Optional[str] = None

class ExpenseIn(BaseModel):
    categoria: Optional[str] = None
    canal: Optional[str] = None
    concepto: Optional[str] = None
    monto: float
    proveedor: Optional[str] = None
    fecha: Optional[str] = None
    recurrente: bool = False
    notas: Optional[str] = None
    origen_fondo: Optional[str] = "caja_consultorio"  # caja_consultorio | tarjeta_consultorio | transferencia_consultorio | efectivo_doctor | tarjeta_doctor | transferencia_doctor
    metodo_pago: Optional[str] = "efectivo"
    facturado: bool = False
    tarjeta_nombre: Optional[str] = None
    guardar_concepto: bool = False
    guardar_proveedor: bool = False

class CatalogItemIn(BaseModel):
    kind: str                     # proveedores | clientes | conceptos_gasto | lugares
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
def get_catalogs(authorization: Optional[str] = Header(None)):
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
def add_catalog_item(body: CatalogItemIn, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if body.kind not in CATALOG_KINDS:
        raise HTTPException(400, "Tipo de catálogo inválido")
    nombre = (body.nombre or "").strip()
    if not nombre:
        raise HTTPException(400, "El nombre es obligatorio")
    clinic_id = actor.get("clinic_id")
    cats = _get_clinic_catalogs(clinic_id)
    lista = list(cats.get(body.kind) or [])
    # Evitar duplicados por nombre (actualiza si ya existe)
    existing = next((x for x in lista if _norm(x.get("nombre")) == _norm(nombre)), None)
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
def remove_catalog_item(kind: str, item_id: str, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if kind not in CATALOG_KINDS:
        raise HTTPException(400, "Tipo de catálogo inválido")
    clinic_id = actor.get("clinic_id")
    cats = _get_clinic_catalogs(clinic_id)
    cats[kind] = [x for x in (cats.get(kind) or []) if x.get("id") != item_id]
    _save_clinic_catalogs(clinic_id, cats)
    return {"ok": True, "catalogs": cats}


# ── Servicios y Prestaciones (Consultas, Estudios, Cirugías, Productos) ────────
@router.get("/services")
def list_services(authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    did = actor["doctor_id"]
    r = supabase.table("clinic_services").select("*").eq("doctor_id", did)\
        .order("orden").execute()
    rows = r.data or []
    clinic_id = actor.get("clinic_id")
    cats = _get_clinic_catalogs(clinic_id)
    services_meta = cats.get("services_meta") if isinstance(cats.get("services_meta"), dict) else {}

    out = []
    for s in rows:
        sid = s.get("id")
        meta = services_meta.get(sid) or {}
        # Auto-detectar si es precio variable si el precio es 0 o si se configuró explícito
        precio_val = float(s.get("precio") or 0)
        p_tipo = meta.get("precio_tipo") or ("variable" if precio_val <= 0 else "fijo")
        cat_val = meta.get("categoria") or s.get("categoria") or "consulta"
        out.append({
            **s,
            "precio": precio_val,
            "precio_tipo": p_tipo,
            "categoria": cat_val,
            "precios_convenio": meta.get("precios_convenio") or {},
            "descripcion": meta.get("descripcion") or "",
        })
    return {"services": out}

@router.post("/services")
def create_service(body: ServiceIn, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if actor["role"] == "receptionist":
        raise HTTPException(403, "Recepción no puede configurar servicios")
    precio_final = 0.0 if body.precio_tipo == "variable" else float(body.precio or 0)
    r = supabase.table("clinic_services").insert({
        "doctor_id": actor["doctor_id"],
        "nombre": body.nombre.strip(),
        "precio": precio_final,
        "activo": body.activo,
        "orden": body.orden,
    }).execute()
    created = r.data[0] if r.data else {}
    sid = created.get("id")

    # Guardar metadatos enriquecidos en clinics.brand.catalogs
    clinic_id = actor.get("clinic_id")
    cats = _get_clinic_catalogs(clinic_id)
    services_meta = dict(cats.get("services_meta") or {})
    services_meta[sid] = {
        "precio_tipo": body.precio_tipo,
        "categoria": body.categoria,
        "precios_convenio": body.precios_convenio or {},
        "descripcion": (body.descripcion or "").strip(),
    }
    cats["services_meta"] = services_meta
    _save_clinic_catalogs(clinic_id, cats)

    return {
        **created,
        "precio_tipo": body.precio_tipo,
        "categoria": body.categoria,
        "precios_convenio": body.precios_convenio or {},
        "descripcion": body.descripcion or "",
    }

@router.put("/services/{sid}")
def update_service(sid: str, body: ServiceIn, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if actor["role"] == "receptionist":
        raise HTTPException(403, "Recepción no puede configurar servicios")
    precio_final = 0.0 if body.precio_tipo == "variable" else float(body.precio or 0)
    supabase.table("clinic_services").update({
        "nombre": body.nombre.strip(),
        "precio": precio_final,
        "activo": body.activo,
        "orden": body.orden,
    }).eq("id", sid).eq("doctor_id", actor["doctor_id"]).execute()

    clinic_id = actor.get("clinic_id")
    cats = _get_clinic_catalogs(clinic_id)
    services_meta = dict(cats.get("services_meta") or {})
    services_meta[sid] = {
        "precio_tipo": body.precio_tipo,
        "categoria": body.categoria,
        "precios_convenio": body.precios_convenio or {},
        "descripcion": (body.descripcion or "").strip(),
    }
    cats["services_meta"] = services_meta
    _save_clinic_catalogs(clinic_id, cats)
    return {"ok": True}

@router.delete("/services/{sid}")
def delete_service(sid: str, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    if actor["role"] == "receptionist":
        raise HTTPException(403, "Recepción no puede configurar servicios")
    supabase.table("clinic_services").delete().eq("id", sid).eq("doctor_id", actor["doctor_id"]).execute()

    clinic_id = actor.get("clinic_id")
    cats = _get_clinic_catalogs(clinic_id)
    services_meta = dict(cats.get("services_meta") or {})
    services_meta.pop(sid, None)
    cats["services_meta"] = services_meta
    _save_clinic_catalogs(clinic_id, cats)
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
    "tarjeta_nombre": "",
}

EXPENSE_META_DEFAULTS = {
    "origen_fondo": "caja_consultorio",
    "metodo_pago": "efectivo",
    "facturado": False,
    "tarjeta_nombre": "",
}


def _nombre_pacientes(did: str) -> dict:
    r = supabase.table("patients").select("id, full_name").eq("doctor_id", did).execute()
    return {p["id"]: p.get("full_name") for p in (r.data or [])}

@router.get("/sales")
def list_sales(estado: Optional[str] = None, patient_id: Optional[str] = None, limit: int = 150,
               authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    did = actor["doctor_id"]
    q = supabase.table("sales").select("*").eq("doctor_id", did)\
        .order("created_at", desc=True).limit(limit)
    if estado:
        q = q.eq("estado", estado)
    if patient_id:
        q = q.eq("patient_id", patient_id)
    if actor.get("role") == "receptionist":
        # Recepcionista solo ve sus cobros / ingresos dados de alta o cobrados por ella
        q = q.or_(f"created_by.eq.{actor['user_id']},charged_by.eq.{actor['user_id']}")
    ventas = q.execute().data or []
    nombres = _nombre_pacientes(did)
    out = []
    for v in ventas:
        u = _unpack_row_meta(v, SALE_META_DEFAULTS)
        u["patient_name"] = nombres.get(v.get("patient_id"))
        out.append(u)
    return {"sales": out}

@router.get("/pending")
def pending_charges(authorization: Optional[str] = Header(None)):
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
def create_sale(body: SaleIn, authorization: Optional[str] = Header(None)):
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
        "tarjeta_nombre": body.tarjeta_nombre or "",
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

    # Guardar en los catálogos lo que el usuario pidió (quien paga y/o el lugar)
    if body.guardar_cliente or body.guardar_lugar:
        clinic_id = actor.get("clinic_id")
        cats = _get_clinic_catalogs(clinic_id)
        changed = False
        if body.guardar_cliente and not body.patient_id:
            changed |= _catalog_add(cats, "clientes", body.aseguradora or "", categoria="Aseguradora / cliente")
        if body.guardar_lugar:
            changed |= _catalog_add(cats, "lugares", body.lugar or "")
        if changed:
            _save_clinic_catalogs(clinic_id, cats)

    return _unpack_row_meta(created, SALE_META_DEFAULTS) if created else {}

@router.post("/sales/{sid}/charge")
def charge_sale(sid: str, body: ChargeIn, authorization: Optional[str] = Header(None)):
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
        "tarjeta_nombre": body.tarjeta_nombre or unpacked.get("tarjeta_nombre") or "",
    })
    supabase.table("sales").update({
        "estado": "cobrado", "metodo_pago": body.metodo_pago, "facturada": body.facturada,
        "descuento": descuento, "descuento_motivo": body.descuento_motivo or venta.get("descuento_motivo"),
        "cortesia": cortesia, "total": total, "notas": packed_notas,
        "charged_by": actor["user_id"],
        "charged_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", sid).execute()
    return {"ok": True, "total": total}

@router.post("/sales/{sid}/liquidate-insurance")
def liquidate_insurance_sale(sid: str, authorization: Optional[str] = Header(None)):
    """Liquida en 1 clic un cobro que estaba en trámite con aseguradora/hospital."""
    actor = get_actor(authorization)
    venta = supabase.table("sales").select("*").eq("id", sid)\
        .eq("doctor_id", actor["doctor_id"]).execute().data
    if not venta:
        raise HTTPException(404, "Venta no encontrada")
    v = venta[0]
    unpacked = _unpack_row_meta(v, SALE_META_DEFAULTS)
    packed_notas = _pack_meta(unpacked.get("notas"), {
        "tipo_ingreso": unpacked.get("tipo_ingreso") or "aseguradora",
        "lugar": unpacked.get("lugar"),
        "aseguradora": unpacked.get("aseguradora"),
        "poliza": unpacked.get("poliza"),
        "procedimiento": unpacked.get("procedimiento"),
        "proxima_cita": unpacked.get("proxima_cita"),
        "fecha_evento": unpacked.get("fecha_evento"),
        "destino_fondo": "banco_consultorio",
    })
    supabase.table("sales").update({
        "estado": "cobrado",
        "metodo_pago": "aseguradora",
        "notas": packed_notas,
        "charged_by": actor["user_id"],
        "charged_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", sid).execute()
    return {"ok": True, "total": v.get("total")}


@router.post("/reimburse-doctor")
def reimburse_doctor(body: dict, authorization: Optional[str] = Header(None)):
    """Registra la liquidación / reembolso de gastos que el médico pagó de su propio dinero."""
    actor = get_actor(authorization)
    monto = float(body.get("monto") or 0)
    if monto <= 0:
        raise HTTPException(400, "Monto inválido para reembolso")
    fuente = body.get("fuente") or "caja_consultorio"  # de dónde se le reembolsa: caja chica o banco
    concepto = body.get("concepto") or f"Reembolso de gastos al Dr. ({fuente.replace('_', ' ')})"
    packed_notas = _pack_meta(body.get("notas"), {
        "origen_fondo": fuente,
        "metodo_pago": "efectivo" if "caja" in fuente else "transferencia",
        "tipo_egreso": "reembolso_medico",
    })
    row = {
        "doctor_id": actor["doctor_id"],
        "created_by": actor["user_id"],
        "categoria": "otros",
        "concepto": concepto,
        "monto": monto,
        "proveedor": "Reembolso Dr.",
        "fecha": body.get("fecha") or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "recurrente": False,
        "notas": packed_notas,
    }
    r = supabase.table("expenses").insert(row).execute()
    return {"ok": True, "expense": r.data[0] if r.data else {}}


@router.post("/sales/{sid}/cancel")
def cancel_sale(sid: str, authorization: Optional[str] = Header(None)):
    did = get_actor(authorization)["doctor_id"]
    supabase.table("sales").update({"estado": "cancelado"}).eq("id", sid).eq("doctor_id", did).execute()
    return {"ok": True}


# ── Gastos ───────────────────────────────────────────────────────────────────────
@router.get("/expenses")
def list_expenses(limit: int = 250, authorization: Optional[str] = Header(None)):
    from access import require
    actor = get_actor(authorization)
    require(actor, "doctor", "accounting", "receptionist")
    did = actor["doctor_id"]
    q = supabase.table("expenses").select("*").eq("doctor_id", did)\
        .order("fecha", desc=True).limit(limit)
    if actor.get("role") == "receptionist":
        # Recepcionista solo ve los gastos que ella dio de alta
        q = q.eq("created_by", actor["user_id"])
    r = q.execute()
    out = [_unpack_row_meta(g, EXPENSE_META_DEFAULTS) for g in (r.data or [])]
    return {"expenses": out}

@router.post("/expenses")
def create_expense(body: ExpenseIn, authorization: Optional[str] = Header(None)):
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
        "facturado": body.facturado,
        "tarjeta_nombre": body.tarjeta_nombre or "",
    })
    categoria = body.categoria or _inferir_categoria(body.concepto or "", body.proveedor or "")
    row = {
        "doctor_id": actor["doctor_id"],
        "created_by": actor["user_id"],
        "categoria": categoria,
        "canal": body.canal or (_inferir_canal(body.concepto or "", body.proveedor or "") if categoria == "publicidad" else None),
        "concepto": (body.concepto or "").strip() or categoria,
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
        if body.guardar_concepto:
            changed |= _catalog_add(cats, "conceptos_gasto", body.concepto or "",
                                    categoria=categoria, monto_sugerido=body.monto,
                                    notas=body.proveedor or "")
        if body.guardar_proveedor:
            changed |= _catalog_add(cats, "proveedores", body.proveedor or "", categoria=categoria)
        if changed:
            _save_clinic_catalogs(clinic_id, cats)

    return _unpack_row_meta(created, EXPENSE_META_DEFAULTS) if created else {}

@router.delete("/expenses/{eid}")
def delete_expense(eid: str, authorization: Optional[str] = Header(None)):
    did = get_actor(authorization)["doctor_id"]
    supabase.table("expenses").delete().eq("id", eid).eq("doctor_id", did).execute()
    return {"ok": True}


# ── Dashboard financiero + Flujo de fondos + ROI de marketing ───────────────────
def _build_financial_overview(actor: dict) -> dict:
    did = actor["doctor_id"]
    raw_ventas = supabase.table("sales").select("*").eq("doctor_id", did).execute().data or []
    raw_gastos = supabase.table("expenses").select("*").eq("doctor_id", did).execute().data or []
    pacientes = supabase.table("patients").select("id, full_name, sources_of_contact, social_network, prev_redes, prev_web, prev_gmaps, created_at")\
        .eq("doctor_id", did).execute().data or []
    raw_visitas = supabase.table("visits").select("id, patient_id, created_at").eq("doctor_id", did).execute().data or []

    # Conteo de visitas por paciente para saber primera vez vs seguimiento
    visitas_paciente = defaultdict(int)
    for vi in raw_visitas:
        pid = vi.get("patient_id")
        if pid:
            visitas_paciente[pid] += 1

    total_pac = len(pacientes)
    primera_vez_cnt = sum(1 for p in pacientes if visitas_paciente.get(p["id"], 0) <= 1)
    seguimiento_cnt = max(0, total_pac - primera_vez_cnt)

    # Validación previa digital (Google Maps, Web, Redes)
    gmaps_cnt = sum(1 for p in pacientes if p.get("prev_gmaps") or "gmaps" in str(p.get("sources_of_contact") or "").lower() or "google maps" in str(p.get("sources_of_contact") or "").lower())
    web_cnt = sum(1 for p in pacientes if p.get("prev_web") or "web" in str(p.get("sources_of_contact") or "").lower() or "pagina" in str(p.get("sources_of_contact") or "").lower())
    redes_cnt = sum(1 for p in pacientes if p.get("prev_redes") or p.get("social_network") or "redes" in str(p.get("sources_of_contact") or "").lower())

    rec_cnt = sum(1 for p in pacientes if "recomend" in str(p.get("sources_of_contact") or "").lower() or _canal_paciente(p) == "Referido")
    rec_val_cnt = sum(1 for p in pacientes if ("recomend" in str(p.get("sources_of_contact") or "").lower() or _canal_paciente(p) == "Referido") and (p.get("prev_gmaps") or p.get("prev_web") or p.get("prev_redes")))

    patient_journey = {
        "total_pacientes": total_pac,
        "primera_vez_count": primera_vez_cnt,
        "seguimiento_count": seguimiento_cnt,
        "pct_primera_vez": round(100 * primera_vez_cnt / max(total_pac, 1)),
        "pct_seguimiento": round(100 * seguimiento_cnt / max(total_pac, 1)),
        "revisaron_gmaps": gmaps_cnt,
        "pct_revisaron_gmaps": round(100 * gmaps_cnt / max(total_pac, 1)),
        "revisaron_web": web_cnt,
        "pct_revisaron_web": round(100 * web_cnt / max(total_pac, 1)),
        "revisaron_redes": redes_cnt,
        "pct_revisaron_redes": round(100 * redes_cnt / max(total_pac, 1)),
        "recomendados_count": rec_cnt,
        "pct_recomendados": round(100 * rec_cnt / max(total_pac, 1)),
        "recomendados_que_validaron_digital": rec_val_cnt,
        "pct_recomendados_que_validaron_digital": round(100 * rec_val_cnt / max(rec_cnt, 1)),
    }

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

    # Cuentas por cobrar / En trámite con Pacientes, Aseguradoras y Hospitales
    nombres_pac = _nombre_pacientes(did)
    todas_por_cobrar = []
    por_cobrar_aseg = []
    total_vendido = round(sum(v.get("total") or 0 for v in ventas if v.get("estado") != "cancelado"))
    total_cobrado = round(ingreso)
    total_por_cobrar = 0.0

    for v in ventas:
        est = v.get("estado")
        if est in ("pendiente", "en_tramite"):
            d_crea = _mes(v)
            dias = (ahora - d_crea).days if d_crea else 0
            deudor = v.get("aseguradora") or nombres_pac.get(v.get("patient_id")) or "Particular / Mostrador"
            tot = float(v.get("total") or 0)
            total_por_cobrar += tot
            item_cpc = {
                "id": v.get("id"),
                "patient_id": v.get("patient_id"),
                "paciente": nombres_pac.get(v.get("patient_id")) or "Paciente",
                "deudor": deudor,
                "tipo_deudor": "aseguradora" if v.get("aseguradora") else "paciente",
                "aseguradora": v.get("aseguradora") or "",
                "poliza": v.get("poliza") or "",
                "procedimiento": v.get("procedimiento") or (v.get("items") or [{}])[0].get("concepto") or "Consulta",
                "lugar": v.get("lugar") or "Consultorio",
                "total": tot,
                "dias": dias,
                "dias_antiguedad": dias,
                "estado": est,
                "fecha": (v.get("fecha_evento") or str(v.get("created_at") or ""))[:10],
            }
            todas_por_cobrar.append(item_cpc)
            if est == "en_tramite" or v.get("tipo_ingreso") == "aseguradora" or bool(v.get("aseguradora")):
                por_cobrar_aseg.append(item_cpc)

    todas_por_cobrar.sort(key=lambda x: -x["dias_antiguedad"])
    total_por_cobrar = round(total_por_cobrar)
    total_por_cobrar_aseg = round(sum(item["total"] for item in por_cobrar_aseg))

    # ── Qué se vende más (en cantidad y en ingresos) ───────────────────────────
    conceptos_stats = defaultdict(lambda: {"cantidad": 0, "total": 0.0, "categoria": "consulta"})
    for v in ventas:
        if v.get("estado") == "cancelado":
            continue
        for item in (v.get("items") or []):
            nombre_c = (item.get("concepto") or "Servicio").strip()
            cat_c = item.get("categoria") or v.get("tipo_ingreso") or "consulta"
            cant_c = int(item.get("cantidad") or 1)
            precio_c = float(item.get("precio") or 0) * cant_c
            conceptos_stats[nombre_c]["cantidad"] += cant_c
            conceptos_stats[nombre_c]["total"] += precio_c
            conceptos_stats[nombre_c]["categoria"] = cat_c

    top_por_cantidad = sorted(
        [{"concepto": k, "cantidad": val["cantidad"], "total": round(val["total"]), "categoria": val["categoria"]} for k, val in conceptos_stats.items()],
        key=lambda x: -x["cantidad"]
    )
    top_por_ingreso = sorted(
        [{"concepto": k, "cantidad": val["cantidad"], "total": round(val["total"]), "categoria": val["categoria"]} for k, val in conceptos_stats.items()],
        key=lambda x: -x["total"]
    )

    # ── Análisis por lugar físico / sedes / hospitales ─────────────────────────
    lugares_stats = defaultdict(lambda: {"total_ingreso": 0.0, "total_por_cobrar": 0.0, "cantidad": 0})
    for v in ventas:
        if v.get("estado") == "cancelado":
            continue
        lug = (v.get("lugar") or "Consultorio").strip()
        tot = float(v.get("total") or 0)
        lugares_stats[lug]["cantidad"] += 1
        if v.get("estado") == "cobrado":
            lugares_stats[lug]["total_ingreso"] += tot
        else:
            lugares_stats[lug]["total_por_cobrar"] += tot

    analisis_sedes = []
    total_ing_general = max(ingreso, 1.0)
    for lug, st in sorted(lugares_stats.items(), key=lambda x: -x[1]["total_ingreso"]):
        pct = round(100 * st["total_ingreso"] / total_ing_general)
        t_prom = round(st["total_ingreso"] / max(st["cantidad"], 1))
        # Evaluación de negocio para sedes
        eval_negocio = "Sede principal con alta rentabilidad" if pct >= 40 else (
            "Centro quirúrgico / hospital de alto ticket" if t_prom >= 8000 else (
                "Bajo volumen: evaluar si el costo de traslado compensa" if st["cantidad"] < 8 else "Sede secundaria estable"
            )
        )
        analisis_sedes.append({
            "lugar": lug,
            "total_ingreso": round(st["total_ingreso"]),
            "total_por_cobrar": round(st["total_por_cobrar"]),
            "cantidad": st["cantidad"],
            "ticket_promedio": t_prom,
            "pct_ingreso": pct,
            "evaluacion": eval_negocio,
        })

    # ── Análisis detallado de gastos, gastos hormiga y fugas ────────────────────
    gastos_hormiga_items = [g for g in gastos if float(g.get("monto") or 0) <= 1500 and g.get("categoria") not in ("renta", "sueldos")]
    total_hormiga = round(sum(float(g.get("monto") or 0) for g in gastos_hormiga_items))

    fugas = []
    if total_hormiga > 0:
        fugas.append(f"Se detectaron {len(gastos_hormiga_items)} gastos menores a $1,500 MXN que acumulan ${total_hormiga:,} MXN en consumos menores no consolidados.")
    plat_gastos = [g for g in gastos if (g.get("categoria") or "") in ("publicidad", "internet", "servicios") or any(w in str(g.get("concepto") or "").lower() for w in ("doctoralia", "meta", "google", "software", "celular", "telcel", "at&t"))]
    tot_plat = round(sum(float(g.get("monto") or 0) for g in plat_gastos))
    if tot_plat > 0:
        fugas.append(f"Gasto en plataformas digitales, Doctoralia, software y telefonía: ${tot_plat:,} MXN. Audita suscripciones duplicadas o desuso.")

    var_mes_pct = round(100 * (ing_mes - ing_mes_ant) / ing_mes_ant, 1) if ing_mes_ant > 0 else None
    var_anio_pct = round(100 * (ing_anio_actual - ing_anio_ant) / ing_anio_ant, 1) if ing_anio_ant > 0 else None

    return {
        "mes_actual": mes_actual,
        "promedios": promedios,
        "comparativa_anual": comparativa_anual,
        "flujo_fondos": flujo_fondos,
        "ingresos_por_tipo": ingresos_por_tipo,
        "ingresos_por_lugar": ingresos_por_lugar,
        "ingresos_por_aseguradora": ingresos_por_aseguradora,
        "resumen_ventas": {
            "total_vendido": total_vendido,
            "total_cobrado": total_cobrado,
            "total_por_cobrar": total_por_cobrar,
            "variacion_mes_pct": var_mes_pct,
            "variacion_anio_pct": var_anio_pct,
            "ingreso_mes_actual": ing_mes,
            "ingreso_mes_anterior": ing_mes_ant,
            "ingreso_anio_actual": ing_anio_actual,
            "ingreso_anio_anterior": ing_anio_ant,
        },
        "top_vendidos": {
            "por_cantidad": top_por_cantidad[:12],
            "por_ingreso": top_por_ingreso[:12],
        },
        "analisis_sedes": analisis_sedes,
        "cuentas_por_cobrar": todas_por_cobrar,
        "gastos_analisis": {
            "total_gastado": round(gasto_total),
            "categorias": gasto_categorias,
            "gastos_hormiga": {
                "total": total_hormiga,
                "conteo": len(gastos_hormiga_items),
                "items": gastos_hormiga_items[:15],
            },
            "fugas_detectadas": fugas,
        },
        "kpis": {
            **kpis,
            "total_vendido": total_vendido,
            "total_cobrado": total_cobrado,
            "total_por_cobrar": total_por_cobrar,
            "por_cobrar_aseguradoras_total": total_por_cobrar_aseg,
            "por_cobrar_aseguradoras_count": len(por_cobrar_aseg),
            "cuentas_por_cobrar_count": len(todas_por_cobrar),
        },
        "aseguradoras_por_cobrar": por_cobrar_aseg,
        "patient_journey": patient_journey,
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
def overview(authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    from access import require
    require(actor, "doctor", "accounting")
    return _build_financial_overview(actor)


class FinancialAiIn(BaseModel):
    question: Optional[str] = None


@router.post("/ai-analysis")
def clinic_ai_analysis(body: FinancialAiIn, authorization: Optional[str] = Header(None)):
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

    tot_vend = ov.get("resumen_ventas", {}).get("total_vendido", 0)
    tot_gas = ov.get("gastos_analisis", {}).get("total_gastado", 0)

    # Si no hay registros aún y el médico no hizo una pregunta específica, responder con calma y sin alarmas
    if tot_vend == 0 and tot_gas == 0 and not q_extra:
        return {
            "ok": True,
            "analysis": "Hola, doctor. Por ahora no tienes ingresos o gastos registrados este mes.\n\nEn cuanto comiences a registrar tus cobros y egresos en las pestañas de Ingresos y Gastos, aquí te compartiré un resumen sereno y concreto sobre la marcha de tu consultorio y tus sedes.",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "daily_used": ent.get("ai_daily_used") or 0,
            "daily_limit": ent.get("ai_daily_limit") or 50,
            "daily_remaining": max(0, (ent.get("ai_daily_limit") or 50) - (ent.get("ai_daily_used") or 0)),
        }

    prompt = f"""Eres el asesor de negocio y finanzas de este consultorio médico en APEX.
Hablas directamente con el médico de forma cercana, serena, breve y tranquila.

REGLAS ESTRICTAS DE ESTILO:
- MÁXIMO 100 A 130 PALABRAS EN TOTAL. Sé muy conciso.
- Tono: Tranquilo, humano, constructivo y claro. Cero tecnicismos contables innecesarios.
- PROHIBIDO: Emojis de alarma (como ❌, ⚠️, 🚨, 🔴), mayúsculas para gritar, palabras como "CRÍTICO", "OBLIGATORIO" o "URGENTE".
- PROHIBIDO pedir plantillas de datos o formatos de texto. Trabaja con lo que haya de forma natural.
- Enfoque: 100% sobre los números del negocio (ingresos, gastos, sedes o cirugías). No des consejos clínicos.
- Formato: Máximo 2 párrafos breves o 3 viñetas cortas.

DATOS DISPONIBLES DEL CONSULTORIO:
- Vendido: ${ov['resumen_ventas']['total_vendido']:,} MXN | Cobrado: ${ov['resumen_ventas']['total_cobrado']:,} MXN | Por cobrar: ${ov['resumen_ventas']['total_por_cobrar']:,} MXN
- Gastos registrados: ${ov['gastos_analisis']['total_gastado']:,} MXN
- Sedes: {json.dumps([{'lugar': s['lugar'], 'ingreso': s['total_ingreso'], 'evaluacion': s['evaluacion']} for s in ov['analisis_sedes'][:4]], ensure_ascii=False)}
- Servicios destacados: {json.dumps([x['concepto'] for x in ov['top_vendidos']['por_ingreso'][:3]], ensure_ascii=False)}
- Gastos menores acumulados: ${ov['gastos_analisis']['gastos_hormiga']['total']:,} MXN

{f'Pregunta del médico: {q_extra}' if q_extra else 'Da un resumen sereno de 2 párrafos sobre cómo va la práctica este mes y una recomendación práctica.'}"""

    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=250,
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
