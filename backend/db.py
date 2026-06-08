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
