from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import date, datetime
from uuid import UUID

# ==========================================
# ETAPA 1: RECEPCIONISTA (Datos Generales)
# ==========================================

class PatientStage1Create(BaseModel):
    """Recepcionista: Datos generales del paciente"""
    model_config = {"extra": "allow"}
    full_name: str
    birth_date: Optional[Any] = None
    sex: Optional[str] = None
    occupation: Optional[str] = None
    photo_url: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_email: Optional[str] = None
    emergency_contact_relationship: Optional[str] = None
    source_of_contact: Optional[str] = None
    referred_by: Optional[str] = None
    reviewed_social_media: Any = False
    reviewed_website: Any = False
    reviewed_google_maps: Any = False


class PatientStage1Response(PatientStage1Create):
    """Response con ID del paciente"""
    model_config = {"extra": "allow", "from_attributes": True}
    id: str
    doctor_id: str
    created_at: Any
    updated_at: Any


# ==========================================
# ETAPA 2: ENFERMERA (Antecedentes Clínicos)
# ==========================================

class FamilyHistoryCreate(BaseModel):
    """Antecedentes familiares"""
    model_config = {"extra": "allow"}
    family_member: str
    has_diabetes: Any = False
    has_hypertension: Any = False
    has_cancer: Any = False
    has_heart_disease: Any = False
    has_dementia: Any = False
    has_autoimmune: Any = False
    has_depression: Any = False
    has_obesity: Any = False
    cause_of_death: Optional[str] = None
    notes: Optional[str] = None


class PastMedicalHistoryCreate(BaseModel):
    """Antecedentes personales patológicos"""
    model_config = {"extra": "allow"}
    chronic_diseases: Optional[str] = None
    chronic_diseases_notes: Optional[str] = None
    hospitalizations: Optional[str] = None
    surgeries: Optional[str] = None
    surgeries_notes: Optional[str] = None
    fractures: Optional[str] = None
    fractures_notes: Optional[str] = None
    transfusions: Any = False
    transfusions_notes: Optional[str] = None
    allergies: Optional[str] = None
    childhood_diseases: Optional[str] = None


class MedicationCreate(BaseModel):
    """Medicamentos actuales"""
    medication_name: str
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    start_date: Optional[date] = None
    notes: Optional[str] = None


class PatientStage2Response(BaseModel):
    """Response de etapa 2 (completo)"""
    patient: PatientStage1Response
    family_history: list[FamilyHistoryCreate]
    past_medical_history: Optional[PastMedicalHistoryCreate]
    medications: list[MedicationCreate]


# ==========================================
# ETAPA 3: MÉDICO (Datos Privados)
# ==========================================

class PrivateInfoCreate(BaseModel):
    """Datos privados y datos médicos iniciales"""
    model_config = {"extra": "allow"}
    smoking_status: Optional[str] = None
    smoking_count_per_day: Optional[Any] = None
    smoking_count: Optional[str] = None
    smoking_since_year: Optional[Any] = None
    smoking_since: Optional[str] = None
    alcohol_frequency: Optional[str] = None
    alcohol_status: Optional[str] = None
    alcohol_type: Optional[str] = None
    recreational_drugs: Optional[str] = None
    physical_activity_type: Optional[str] = None
    physical_activity_frequency: Optional[str] = None
    physical_activity_intensity: Optional[str] = None
    physical_activity: Optional[str] = None
    sleep_hours: Optional[Any] = None
    stress_level: Optional[Any] = None
    menarche_age: Optional[Any] = None
    menarca_age: Optional[str] = None
    menstrual_cycles_regular: Optional[Any] = None
    menstrual_cycles: Optional[str] = None
    pregnancies_count: Optional[Any] = None
    pregnancies: Optional[str] = None
    births_count: Optional[Any] = None
    births: Optional[str] = None
    miscarriages_count: Optional[Any] = None
    miscarriages: Optional[str] = None
    menopausal: Optional[Any] = None
    menopausal_age: Optional[str] = None
    contraceptive_method: Optional[str] = None
    contraceptive: Optional[str] = None
    reproductivity_sex: Optional[str] = None
    erectile_dysfunction: Optional[str] = None
    testosterone_use: Optional[str] = None
    previous_testosterone_use: Optional[Any] = None
    children: Optional[str] = None
    psa: Optional[str] = None


class PatientStage3Response(BaseModel):
    """Response de etapa 3 (completo + privado)"""
    patient: PatientStage1Response
    family_history: list[FamilyHistoryCreate]
    past_medical_history: Optional[PastMedicalHistoryCreate]
    medications: list[MedicationCreate]
    private_info: Optional[PrivateInfoCreate]


class PatientSearchResponse(BaseModel):
    """Response para búsqueda de pacientes"""
    id: str  # Cambiar a str para ID legible
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    created_at: datetime


class PatientListResponse(BaseModel):
    """Response para listar pacientes"""
    total: int
    patients: list[PatientSearchResponse]


class PatientCompleteCreate(BaseModel):
    """Crear paciente completo con todas las fases de una vez"""
    model_config = {"extra": "allow"}
    # FASE 1: Recepcionista
    first_name: str
    last_name: str
    full_name: str
    date_of_birth: Optional[Any] = None
    birth_date: Optional[Any] = None
    sex: Optional[str] = None
    occupation: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_email: Optional[str] = None
    emergency_contact_relationship: Optional[str] = None
    source_of_contact: Optional[str] = None
    referred_by: Optional[str] = None
    reviewed_social_media: Any = False
    reviewed_website: Any = False
    reviewed_google_maps: Any = False

    # FASE 2: Enfermera
    family_history: Optional[str] = None
    chronic_diseases: Optional[str] = None
    surgeries: Optional[str] = None
    hospitalizations: Optional[str] = None
    fractures: Optional[str] = None
    allergies_medications: Optional[str] = None
    allergies_foods: Optional[str] = None
    allergies_environmental: Optional[str] = None
    transfusions: Optional[str] = None
    childhood_diseases: Optional[str] = None

    # FASE 3: Doctor
    smoking_status: Optional[str] = None
    smoking_count: Optional[str] = None
    smoking_since: Optional[str] = None
    alcohol_status: Optional[str] = None
    alcohol_type: Optional[str] = None
    recreational_drugs: Optional[str] = None
    physical_activity: Optional[str] = None
    stress_level: Optional[Any] = None
    reproductivity_sex: Optional[str] = None

    # Ginecológico (si reproductivity_sex == 'Femenino')
    menarca_age: Optional[str] = None
    menstrual_cycles: Optional[str] = None
    pregnancies: Optional[str] = None
    births: Optional[str] = None
    miscarriages: Optional[str] = None
    menopausal: Any = False
    menopausal_age: Optional[str] = None
    contraceptive: Optional[str] = None

    # Masculino (si reproductivity_sex == 'Masculino')
    erectile_dysfunction: Optional[str] = None
    testosterone_use: Optional[str] = None
    children: Optional[str] = None
    psa: Optional[str] = None

    # Control de fases
    phases_completed: Any = []
