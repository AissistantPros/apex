"""
Registro de uso (para la analítica del Admin proveedor).
No bloquea la respuesta: los inserts se hacen en un pool aparte y cualquier fallo
se ignora (nunca debe romper una petición del usuario).
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Optional

from db import supabase

_POOL = ThreadPoolExecutor(max_workers=2)

# Primer segmento de la ruta → nombre de función legible
FEATURE_BY_PREFIX = {
    "patients": "Pacientes", "visits": "Visitas", "analyze": "Análisis IA",
    "chat": "Chat IA", "appointments": "Agenda", "clinic": "Clínica / finanzas",
    "staff": "Equipo", "marketing": "Marketing", "messages": "Chat del equipo",
    "stats": "Estadísticas", "kb": "Biblioteca", "admin": "Administración",
    "doctor": "Perfil",
}


def feature_for(path: str) -> str:
    seg = path.strip("/").split("/")[0] if path else ""
    return FEATURE_BY_PREFIX.get(seg, seg or "otro")


def _insert(row: dict):
    try:
        supabase.table("usage_events").insert(row).execute()
    except Exception:
        pass


def log_event(user_id: Optional[str], clinic_id: Optional[str], role: Optional[str],
              action: str, feature: Optional[str] = None, ai_tokens: int = 0,
              status: Optional[int] = None, meta: Optional[dict] = None):
    row = {
        "user_id": user_id, "clinic_id": clinic_id, "role": role,
        "action": action, "feature": feature, "ai_tokens": ai_tokens,
        "meta": {**(meta or {}), **({"status": status} if status is not None else {})} or None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _POOL.submit(_insert, row)
