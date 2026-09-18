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
    "ia_reportes", "ia_consulta", "ia_funcional", "ia_longevidad", "ia_estudios",
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
    "ia_reportes": "IA para reportes / backend",
    "ia_consulta": "IA de consulta (referencia, por créditos)",
    "ia_funcional": "IA medicina funcional",
    "ia_longevidad": "IA longevidad",
    "ia_estudios": "IA análisis de estudios / labs",
}

# Base = administración sólida sin IA fuerte (Apex)
_BASE = {"agenda", "pacientes", "consulta", "contabilidad", "documentos", "chat_equipo",
         "ia_reportes", "ia_consulta", "marketing"}

PLAN_PRESETS = {
    "apex":            set(_BASE),
    "apex_funcional":  _BASE | {"biblioteca", "sala_espera", "ia_funcional"},
    "apex_longevidad": _BASE | {"biblioteca", "sala_espera", "ia_longevidad"},
    "apex_full":       _BASE | {"biblioteca", "sala_espera", "ia_funcional", "ia_longevidad", "ia_estudios"},
}

PLAN_LABELS = {
    "apex": "Apex (administración)",
    "apex_funcional": "Apex Pro · Funcional",
    "apex_longevidad": "Apex Pro · Longevidad",
    "apex_full": "Apex Pro · Funcional + Longevidad",
}

DEFAULT_LIMITS = {
    "apex":            {"max_users": 5,  "max_locations": 1},
    "apex_funcional":  {"max_users": 10, "max_locations": 3},
    "apex_longevidad": {"max_users": 10, "max_locations": 3},
    "apex_full":       {"max_users": 20, "max_locations": 5},
}


def preset_features(plan: str) -> dict:
    on = PLAN_PRESETS.get(plan, PLAN_PRESETS["apex"])
    return {f: (f in on) for f in FEATURES}


def entitlements_for_clinic(clinic: dict) -> dict:
    """Entitlements efectivos de una clínica (features + limits + créditos)."""
    plan = clinic.get("plan") or "apex"
    features = clinic.get("features")
    if not isinstance(features, dict) or not features:
        features = preset_features(plan)
    else:
        # Completa llaves faltantes con el preset (por si se agregaron funciones nuevas)
        base = preset_features(plan)
        features = {f: bool(features.get(f, base[f])) for f in FEATURES}
    limits = clinic.get("limits") if isinstance(clinic.get("limits"), dict) else DEFAULT_LIMITS.get(plan, {})
    return {
        "plan": plan, "features": features, "limits": limits,
        "ai_credits": clinic.get("ai_credits") or 0,
        "ai_credits_used": clinic.get("ai_credits_used") or 0,
    }


def get_entitlements(clinic_id: Optional[str]) -> dict:
    if not clinic_id:
        return {"plan": "apex", "features": preset_features("apex"), "limits": DEFAULT_LIMITS["apex"],
                "ai_credits": 0, "ai_credits_used": 0}
    r = supabase.table("clinics").select("plan, features, limits, ai_credits, ai_credits_used")\
        .eq("id", clinic_id).limit(1).execute().data
    if not r:
        return {"plan": "apex", "features": preset_features("apex"), "limits": DEFAULT_LIMITS["apex"],
                "ai_credits": 0, "ai_credits_used": 0}
    return entitlements_for_clinic(r[0])


def has_feature(clinic_id: Optional[str], feature: str) -> bool:
    return bool(get_entitlements(clinic_id)["features"].get(feature))
