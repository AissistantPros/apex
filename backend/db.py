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
