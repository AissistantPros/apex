"""
Planes y entitlements por clínica. El plan define QUÉ servicios tiene un cliente.
Los presets solo PRECARGAN los toggles; el proveedor puede encender/apagar cada
función por clínica desde el panel de admin (clinics.features / clinics.limits).
"""
from typing import Optional
from db import supabase

# Todas las funciones que se pueden poner/quitar
FEATURES = [
    "agenda", "pacientes", "consulta", "contabilidad", "documentos", "chat_equipo",
    "marketing", "biblioteca", "sala_espera",
    "ia_lite", "ia_reportes", "ia_consulta", "ia_funcional", "ia_longevidad", "ia_estudios",
]

FEATURE_LABELS = {
    "agenda": "Agenda / citas",
    "pacientes": "Pacientes y registro",
    "consulta": "Consulta (signos, notas, prescripción)",
    "contabilidad": "Contabilidad / finanzas",
    "documentos": "Documentos (receta, reporte, estudios)",
    "chat_equipo": "Chat del equipo",
    "marketing": "Marketing y ROI",
    "biblioteca": "Biblioteca propia (subir libros + chat)",
    "sala_espera": "Sala de espera con resumen IA",
    "ia_lite": "IA Lite (chat médico, resumen de paciente y finanzas, 50/día)",
    "ia_reportes": "IA para reportes / backend",
    "ia_consulta": "IA de consulta (diagnóstico y protocolo asistido)",
    "ia_funcional": "IA medicina funcional",
    "ia_longevidad": "IA longevidad",
    "ia_estudios": "IA análisis de estudios / labs",
}

# Base = administración sólida sin IA fuerte (Apex)
_BASE = {"agenda", "pacientes", "consulta", "contabilidad", "documentos", "chat_equipo",
         "ia_lite", "ia_reportes", "ia_consulta", "marketing"}

# Lite = control del consultorio + chat interno + IA Lite (chat médico, resumen de paciente
# y análisis financiero con tope diario de 50 consultas). Sin generación de diagnóstico/receta por IA.
_LITE = {"agenda", "pacientes", "consulta", "contabilidad", "documentos", "chat_equipo", "ia_lite"}

PLAN_PRESETS = {
    "apex_lite":       set(_LITE),
    "apex":            set(_BASE),
    "apex_funcional":  _BASE | {"biblioteca", "sala_espera", "ia_funcional"},
    "apex_longevidad": _BASE | {"biblioteca", "sala_espera", "ia_longevidad"},
    "apex_full":       _BASE | {"biblioteca", "sala_espera", "ia_funcional", "ia_longevidad", "ia_estudios"},
}

PLAN_LABELS = {
    "apex_lite": "Apex Lite (control de consultorio)",
    "apex": "Apex (administración)",
    "apex_funcional": "Apex Pro · Funcional",
    "apex_longevidad": "Apex Pro · Longevidad",
    "apex_full": "Apex Pro · Funcional + Longevidad",
}

DEFAULT_LIMITS = {
    "apex_lite":       {"max_users": 3,  "max_locations": 1, "daily_ai_messages": 50},
    "apex":            {"max_users": 5,  "max_locations": 1, "daily_ai_messages": 200},
    "apex_funcional":  {"max_users": 10, "max_locations": 3},
    "apex_longevidad": {"max_users": 10, "max_locations": 3},
    "apex_full":       {"max_users": 20, "max_locations": 5},
}

DAILY_AI_ACTIONS = ("ia.chat", "patient.ai_summary", "clinic.ai_analysis", "brief.summary")


def count_daily_ai_usage(clinic_id: Optional[str]) -> int:
    """Cuenta cuántas consultas de IA ha hecho hoy la clínica (UTC día actual)."""
    if not clinic_id:
        return 0
    try:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        r = supabase.table("usage_events").select("id", count="exact")\
            .eq("clinic_id", clinic_id)\
            .in_("action", list(DAILY_AI_ACTIONS))\
            .gte("created_at", start_of_day).execute()
        return r.count or 0
    except Exception:
        return 0

# Umbral para avisar "créditos bajos" (en tokens de IA). ~una corrida de análisis de margen.
LOW_CREDITS_THRESHOLD = 150000


def preset_features(plan: str) -> dict:
    on = PLAN_PRESETS.get(plan, PLAN_PRESETS["apex"])
    return {f: (f in on) for f in FEATURES}


def entitlements_for_clinic(clinic: dict, include_daily_usage: bool = False) -> dict:
    """Entitlements efectivos de una clínica (features + limits + créditos)."""
    plan = clinic.get("plan") or "apex"
    features = clinic.get("features")
    if not isinstance(features, dict) or not features:
        features = preset_features(plan)
    else:
        # Completa llaves faltantes con el preset (por si se agregaron funciones nuevas)
        base = preset_features(plan)
        features = {f: bool(features.get(f, base[f])) for f in FEATURES}
    # En plan Lite siempre incluimos chat_equipo e ia_lite por defecto
    if plan == "apex_lite":
        features["chat_equipo"] = True
        features["ia_lite"] = True
    raw_limits = clinic.get("limits") if isinstance(clinic.get("limits"), dict) else {}
    default_lim = DEFAULT_LIMITS.get(plan, {})
    limits = {**default_lim, **raw_limits}
    credits = clinic.get("ai_credits") or 0
    used = clinic.get("ai_credits_used") or 0
    remaining = credits - used
    daily_limit = limits.get("daily_ai_messages") or (50 if plan == "apex_lite" else 0)
    daily_used = count_daily_ai_usage(clinic.get("id")) if (include_daily_usage and clinic.get("id") and daily_limit) else 0
    daily_remaining = max(0, daily_limit - daily_used) if daily_limit else 0
    return {
        "plan": plan, "features": features, "limits": limits,
        "ai_credits": credits,
        "ai_credits_used": used,
        "ai_credits_remaining": remaining,
        # Aviso de créditos bajos: ~una corrida de análisis de margen (draft+clarify+protocolo).
        "ai_credits_low": credits > 0 and remaining <= LOW_CREDITS_THRESHOLD,
        "ai_credits_empty": remaining <= 0 and not (plan == "apex_lite" or features.get("ia_lite")),
        "ai_daily_limit": daily_limit,
        "ai_daily_used": daily_used,
        "ai_daily_remaining": daily_remaining,
    }


def get_entitlements(clinic_id: Optional[str], include_daily_usage: bool = False) -> dict:
    if not clinic_id:
        return {"plan": "apex", "features": preset_features("apex"), "limits": DEFAULT_LIMITS["apex"],
                "ai_credits": 0, "ai_credits_used": 0, "ai_daily_limit": 0, "ai_daily_used": 0, "ai_daily_remaining": 0}
    r = supabase.table("clinics").select("id, plan, features, limits, ai_credits, ai_credits_used")\
        .eq("id", clinic_id).limit(1).execute().data
    if not r:
        return {"plan": "apex", "features": preset_features("apex"), "limits": DEFAULT_LIMITS["apex"],
                "ai_credits": 0, "ai_credits_used": 0, "ai_daily_limit": 0, "ai_daily_used": 0, "ai_daily_remaining": 0}
    return entitlements_for_clinic(r[0], include_daily_usage=include_daily_usage)


def has_feature(clinic_id: Optional[str], feature: str) -> bool:
    return bool(get_entitlements(clinic_id)["features"].get(feature))


def require_ai(clinic_id: Optional[str], feature: Optional[str] = None) -> dict:
    """Verifica que el servicio de IA esté contratado y que queden créditos.
    Lanza HTTPException si no. Devuelve los entitlements."""
    from fastapi import HTTPException
    ent = get_entitlements(clinic_id)
    if feature and not ent["features"].get(feature):
        raise HTTPException(403, "Este servicio de IA no está incluido en el plan de la clínica. "
                                 "Contacta al proveedor para activarlo.")
    if (ent.get("ai_credits") or 0) <= (ent.get("ai_credits_used") or 0):
        raise HTTPException(402, "Se agotaron los créditos de IA de la clínica. "
                                 "Recarga créditos para seguir usando la IA.")
    return ent


def require_ai_lite_or_pro(clinic_id: Optional[str], feature: Optional[str] = None) -> dict:
    """Permite usar funciones de IA Lite (chat médico, resumen de paciente con IA,
    análisis financiero con IA) tanto en clínicas Pro (con bolsa de créditos o tope diario)
    como en clínicas Lite (con tope de 50 preguntas/consultas al día)."""
    from fastapi import HTTPException
    ent = get_entitlements(clinic_id, include_daily_usage=True)
    plan = ent.get("plan") or "apex"
    feats = ent.get("features") or {}
    daily_limit = (ent.get("limits") or {}).get("daily_ai_messages") or (50 if plan == "apex_lite" else 0)

    if plan == "apex_lite" or (feats.get("ia_lite") and (ent.get("ai_credits_remaining") or 0) <= 0):
        if not feats.get("ia_lite") and plan != "apex_lite":
            raise HTTPException(403, "Este servicio de IA no está activo para la clínica.")
        limit_val = daily_limit or 50
        used_today = ent.get("ai_daily_used") or count_daily_ai_usage(clinic_id)
        if used_today >= limit_val:
            raise HTTPException(
                429,
                f"Alcanzaste el límite de {limit_val} consultas de IA incluidas por día en tu plan Lite. "
                "Tu contador se renueva mañana o puedes actualizar a Apex Pro para capacidad ampliada."
            )
        ent["ai_daily_limit"] = limit_val
        ent["ai_daily_used"] = used_today
        ent["ai_daily_remaining"] = max(0, limit_val - used_today)
        return ent

    # Planes Pro / Base con bolsa de créditos o tope diario
    if feature and not feats.get(feature) and not feats.get("ia_lite"):
        raise HTTPException(403, "Este servicio de IA no está incluido en el plan de la clínica.")
    if (ent.get("ai_credits") or 0) <= (ent.get("ai_credits_used") or 0):
        if daily_limit and (ent.get("ai_daily_used") or 0) < daily_limit:
            return ent
        raise HTTPException(402, "Se agotaron los créditos de IA de la clínica. "
                                 "Recarga créditos para seguir usando la IA.")
    return ent


def consume_credits(clinic_id: Optional[str], tokens: int):
    """Descuenta tokens de la bolsa de créditos (best-effort, no bloquea la respuesta)."""
    if not clinic_id or not tokens:
        return
    try:
        r = supabase.table("clinics").select("ai_credits_used").eq("id", clinic_id).limit(1).execute().data
        used = (r[0].get("ai_credits_used") or 0) if r else 0
        supabase.table("clinics").update({"ai_credits_used": used + int(tokens)}).eq("id", clinic_id).execute()
    except Exception:
        pass
