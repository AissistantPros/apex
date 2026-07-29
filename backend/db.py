"""
Supabase client y helpers para APEX
"""
import os
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# Cliente con service role (puede escribir en cualquier tabla)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def get_supabase() -> Client:
    """Retorna el cliente Supabase"""
    return supabase

# Helpers para operaciones comunes
def insert_patient(patient_data: dict) -> dict:
    """Inserta un paciente y retorna el resultado"""
    result = supabase.table("patients").insert(patient_data).execute()
    return result.data[0] if result.data else None

def check_duplicate_patients(first_name: str, last_name: str, date_of_birth: str) -> list:
    """Busca pacientes con mismo nombre y fecha de nacimiento (case-insensitive)"""
    fn = first_name.strip().lower()
    ln = last_name.strip().lower()
    result = supabase.table("patients").select(
        "id, full_name, first_name, last_name, date_of_birth, birth_date, registration_phase, created_at"
    ).ilike("first_name", fn).ilike("last_name", ln).execute()
    if not result.data:
        return []
    # Filtrar por fecha de nacimiento
    matches = [
        p for p in result.data
        if (p.get("date_of_birth") or p.get("birth_date") or "").startswith(date_of_birth)
    ]
    return matches

def list_patients(doctor_id: str = None, limit: int = 50) -> list:
    """Lista todos los pacientes"""
    query = supabase.table("patients").select("id, full_name, first_name, last_name, date_of_birth, birth_date, email, phone, created_at").order("created_at", desc=True).limit(limit)
    result = query.execute()
    return result.data if result.data else []

def get_patient(patient_id: str) -> dict:
    """Obtiene un paciente por ID"""
    result = supabase.table("patients").select("*").eq("id", patient_id).execute()
    return result.data[0] if result.data else None

def update_patient(patient_id: str, data: dict) -> dict:
    """Actualiza un paciente"""
    result = supabase.table("patients").update(data).eq("id", patient_id).execute()
    return result.data[0] if result.data else None

def list_patient_visits(patient_id: str) -> list:
    """Lista todas las visitas de un paciente"""
    result = supabase.table("visits").select("*").eq("patient_id", patient_id).order("created_at", desc=True).execute()
    return result.data if result.data else []

def insert_visit(visit_data: dict) -> dict:
    """Inserta una visita"""
    result = supabase.table("visits").insert(visit_data).execute()
    return result.data[0] if result.data else None

def get_visit(visit_id: str) -> dict:
    """Obtiene una visita por ID"""
    result = supabase.table("visits").select("*").eq("id", visit_id).execute()
    return result.data[0] if result.data else None

def update_visit(visit_id: str, data: dict) -> dict:
    """Actualiza una visita"""
    result = supabase.table("visits").update(data).eq("id", visit_id).execute()
    return result.data[0] if result.data else None

def get_doctor_profile(doctor_id: str) -> dict:
    result = supabase.table("doctor_profiles").select("*").eq("id", doctor_id).execute()
    return result.data[0] if result.data else None

def upsert_doctor_profile(doctor_id: str, data: dict) -> dict:
    data["id"] = doctor_id
    data["updated_at"] = __import__('datetime').datetime.utcnow().isoformat()
    result = supabase.table("doctor_profiles").upsert(data).execute()
    return result.data[0] if result.data else None

def add_patient_note(patient_id: str, visit_id: str | None, author_role: str, author_name: str, content: str) -> dict:
    """Agrega una nota con timestamp y autor"""
    import uuid
    from datetime import datetime
    data = {
        "id": uuid.uuid4().hex,
        "patient_id": patient_id,
        "visit_id": visit_id,
        "author_role": author_role,
        "author_name": author_name,
        "content": content,
        "created_at": datetime.utcnow().isoformat(),
    }
    result = supabase.table("patient_notes").insert(data).execute()
    return result.data[0] if result.data else None

def get_patient_notes(patient_id: str) -> list:
    """Lista todas las notas de un paciente, en orden cronológico"""
    result = supabase.table("patient_notes").select("*").eq("patient_id", patient_id).order("created_at", desc=False).execute()
    return result.data if result.data else []

def delete_patient_note(note_id: str) -> bool:
    """Elimina una nota por ID"""
    supabase.table("patient_notes").delete().eq("id", note_id).execute()
    return True

def insert_analysis(analysis_data: dict) -> dict:
    """Inserta un análisis"""
    result = supabase.table("analyses").insert(analysis_data).execute()
    return result.data[0] if result.data else None

def get_analysis(visit_id: str) -> dict:
    """Obtiene el análisis de una visita"""
    result = supabase.table("analyses").select("*").eq("visit_id", visit_id).execute()
    return result.data[0] if result.data else None

def update_analysis(visit_id: str, data: dict) -> dict:
    """Actualiza un análisis"""
    result = supabase.table("analyses").update(data).eq("visit_id", visit_id).execute()
    return result.data[0] if result.data else None

def insert_ai_call_log(data: dict) -> dict:
    """Registra una llamada a la IA (prompt/respuesta/latencia) para poder auditarla después"""
    result = supabase.table("ai_call_logs").insert(data).execute()
    return result.data[0] if result.data else None

def list_ai_call_logs(visit_id: str) -> list:
    """Lista las llamadas a la IA de una visita, en orden cronológico"""
    result = supabase.table("ai_call_logs").select("*").eq("visit_id", visit_id).order("created_at", desc=False).execute()
    return result.data if result.data else []


# ── Vademécum (medications_db) ────────────────────────────────────────────────
# Fuente de verdad curada para que la voz de conciencia pueda responder
# "¿hay una mejor versión de lo que estás mandando?" con un dato duro, no con opinión.

import re as _re
import time as _time

_VADEMECUM_CACHE = {"data": None, "ts": 0.0}
_VADEMECUM_TTL = 600  # 10 min


def _load_vademecum() -> list:
    """Carga (y cachea) el vademécum completo. Es una tabla chica: traerla entera y hacer
    el match en Python es más robusto que armar filtros ILIKE, porque los nombres reales
    vienen con calificadores ('Vitamina D3 (colecalciferol)') que rompen el match por
    substring en una sola dirección."""
    now = _time.time()
    if _VADEMECUM_CACHE["data"] is not None and (now - _VADEMECUM_CACHE["ts"]) < _VADEMECUM_TTL:
        return _VADEMECUM_CACHE["data"]
    try:
        result = supabase.table("medications_db").select("*").execute()
        data = result.data if result.data else []
        _VADEMECUM_CACHE["data"] = data
        _VADEMECUM_CACHE["ts"] = now
        return data
    except Exception as e:
        print(f"[WARN] no se pudo cargar el vademécum: {e}")
        return _VADEMECUM_CACHE["data"] or []


def _norm(s: str) -> str:
    """Normaliza para comparar: minúsculas, sin paréntesis, sin acentos comunes, sin dobles espacios."""
    s = (s or "").lower()
    s = _re.sub(r"\([^)]*\)", " ", s)            # quita "(colecalciferol)", "(MK-7)", etc.
    for a, b in (("á","a"),("é","e"),("í","i"),("ó","o"),("ú","u"),("ü","u")):
        s = s.replace(a, b)
    s = _re.sub(r"[^a-z0-9+ ]", " ", s)          # conserva el '+' de "D3 + K2"
    return _re.sub(r"\s+", " ", s).strip()


def _matches(entry_name: str, query_names: list) -> bool:
    """True si el nombre del vademécum y alguno de los nombres del protocolo se refieren
    a lo mismo. Compara en AMBAS direcciones (el nombre del protocolo suele traer
    calificadores extra que el del vademécum no tiene)."""
    e = _norm(entry_name)
    if not e or len(e) < 3:
        return False
    for q in query_names:
        qn = _norm(q)
        if not qn or len(qn) < 3:
            continue
        if e in qn or qn in e:
            return True
    return False


def find_medications(names: list) -> list:
    """Fichas del vademécum para los items del protocolo (match en ambas direcciones)."""
    if not names:
        return []
    out = []
    for row in _load_vademecum():
        if _matches(row.get("nombre_generico", ""), names) or _matches(row.get("sinonimos", ""), names):
            out.append(row)
    return out


def _already_present(entry_name: str, query_names: list) -> bool:
    """True solo si alguno de los items del protocolo YA ES esa entrada. Check DIRECCIONAL:
    el nombre del item debe contener el nombre completo de la entrada. Así 'Vitamina D3'
    NO cuenta como que ya trae 'Vitamina D3 + K2' (aunque sea su prefijo), pero
    'Vitamina D3 + K2 (MK-7)' sí."""
    e = _norm(entry_name)
    if not e or len(e) < 3:
        return False
    return any(e in _norm(q) for q in query_names)


def find_upgrades_for(names: list) -> list:
    """Entradas que son una MEJOR VERSIÓN de alguno de los items del protocolo.
    Es el corazón del chequeo '¿hay algo mejor de lo que estás mandando?'."""
    if not names:
        return []
    out = []
    for row in _load_vademecum():
        up = row.get("upgrade_de")
        if not up:
            continue
        # Si el protocolo YA trae la versión mejorada, no hay nada que sugerir.
        # (ej. si ya mandó "Vitamina D3 + K2", no sugerir cambiar D3 por D3+K2)
        if _already_present(row.get("nombre_generico", ""), names):
            continue
        # ¿el item que trae el protocolo ES aquello que esta entrada supera?
        if _matches(up, names):
            out.append({
                "nombre_generico": row.get("nombre_generico"),
                "upgrade_de": up,
                "nota_upgrade": row.get("nota_upgrade"),
                "cofepris": row.get("cofepris"),
                "nivel_evidencia": row.get("nivel_evidencia"),
                "dosis_tipica": row.get("dosis_tipica"),
                "categoria": row.get("categoria"),
            })
    return out
