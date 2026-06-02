from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime
from uuid import UUID

# ==========================================
# ETAPA 1: RECEPCIONISTA (Datos Generales)
# ==========================================

class PatientStage1Create(BaseModel):
    """Recepcionista: Datos generales del paciente"""
    full_name: str
    birth_date: Optional[date] = None
    sex: Optional[str] = None  # 'M', 'F'
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
    reviewed_social_media: bool = False
    reviewed_website: bool = False
    reviewed_google_maps: bool = False


class PatientStage1Response(PatientStage1Create):
    """Response con ID del paciente"""
    id: UUID
    doctor_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==========================================
# ETAPA 2: ENFERMERA (Antecedentes Clínicos)
# ==========================================

class FamilyHistoryCreate(BaseModel):
    """Antecedentes familiares"""
    family_member: str  # father, mother, paternal_grandfather, etc.
    has_diabetes: bool = False
    has_hypertension: bool = False
    has_cancer: bool = False
    has_heart_disease: bool = False
    has_dementia: bool = False
    has_autoimmune: bool = False
    has_depression: bool = False
    has_obesity: bool = False
    cause_of_death: Optional[str] = None
    notes: Optional[str] = None


class PastMedicalHistoryCreate(BaseModel):
    """Antecedentes personales patológicos"""
    chronic_diseases: Optional[str] = None
    chronic_diseases_notes: Optional[str] = None
    hospitalizations: Optional[str] = None
    surgeries: Optional[str] = None
    surgeries_notes: Optional[str] = None
    fractures: Optional[str] = None
    fractures_notes: Optional[str] = None
    transfusions: bool = False
    transfusions_notes: Optional[str] = None
    allergies: Optional[str] = None  # JSON string
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
    smoking_status: Optional[str] = None  # never, former, active
    smoking_count_per_day: Optional[int] = None
    smoking_since_year: Optional[int] = None
    alcohol_frequency: Optional[str] = None  # never, occasional, frequent, daily
    alcohol_type: Optional[str] = None
    recreational_drugs: Optional[str] = None
    physical_activity_type: Optional[str] = None
    physical_activity_frequency: Optional[str] = None
    physical_activity_intensity: Optional[str] = None
    sleep_hours: Optional[float] = None
    stress_level: Optional[int] = Field(None, ge=1, le=10)
    menarche_age: Optional[int] = None
    menstrual_cycles_regular: Optional[bool] = None
    pregnancies_count: Optional[int] = None
    births_count: Optional[int] = None
    miscarriages_count: Optional[int] = None
    menopausal: Optional[bool] = None
    contraceptive_method: Optional[str] = None
    erectile_dysfunction: Optional[bool] = None
    previous_testosterone_use: Optional[bool] = None


class PatientStage3Response(BaseModel):
    """Response de etapa 3 (completo + privado)"""
    patient: PatientStage1Response
    family_history: list[FamilyHistoryCreate]
    past_medical_history: Optional[PastMedicalHistoryCreate]
    medications: list[MedicationCreate]
    private_info: Optional[PrivateInfoCreate]


class PatientSearchResponse(BaseModel):
    """Response para búsqueda de pacientes"""
    id: UUID
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    created_at: datetime


class PatientListResponse(BaseModel):
    """Response para listar pacientes"""
    total: int
    patients: list[PatientSearchResponse]
