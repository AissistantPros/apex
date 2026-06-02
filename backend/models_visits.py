from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID

class VisitCreate(BaseModel):
    """Nueva visita - todos los 7 bloques"""

    # BLOQUE A: Motivo
    visit_reason: Optional[str] = None
    discomfort_intensity: Optional[int] = Field(None, ge=1, le=10)
    first_time: Optional[bool] = None

    # BLOQUE B: Signos Vitales
    pa_right: Optional[int] = None
    pa_left: Optional[int] = None
    heart_rate: Optional[int] = None
    temperature: Optional[float] = None
    spo2: Optional[int] = None
    glucose: Optional[int] = None
    glucose_fasting_hours: Optional[int] = None
    ecg_notes: Optional[str] = None

    # BLOQUE C: Composición Corporal
    weight: Optional[float] = None
    height: Optional[float] = None
    imc: Optional[float] = None
    circumference_abdominal: Optional[float] = None
    circumference_waist: Optional[float] = None
    circumference_hip: Optional[float] = None
    circumference_neck: Optional[float] = None
    circumference_biceps: Optional[float] = None
    inbody_fat_percent: Optional[float] = None
    inbody_muscle_mass: Optional[float] = None
    inbody_water: Optional[float] = None
    inbody_visceral_fat: Optional[float] = None

    # BLOQUE D: Pruebas Funcionales
    grip_strength_left: Optional[float] = None
    grip_strength_right: Optional[float] = None
    walk_speed_4m: Optional[float] = None
    sit_stand_30s: Optional[int] = None
    balance_monopodal_seconds: Optional[int] = None
    vo2_max: Optional[float] = None

    # BLOQUE E: Reporte Subjetivo
    energy_morning: Optional[int] = Field(None, ge=1, le=10)
    energy_noon: Optional[int] = Field(None, ge=1, le=10)
    energy_evening: Optional[int] = Field(None, ge=1, le=10)
    sleep_quality: Optional[int] = Field(None, ge=1, le=10)
    sleep_hours: Optional[float] = None
    wakes_rested: Optional[bool] = None
    mood: Optional[str] = None
    libido: Optional[int] = Field(None, ge=1, le=10)
    digestion: Optional[str] = None
    urine_color: Optional[str] = None
    pain_location: Optional[str] = None
    pain_intensity: Optional[int] = Field(None, ge=1, le=10)
    patient_goals: Optional[str] = None

    # BLOQUE F: Observaciones Clínicas
    general_inspection: Optional[str] = None
    skin_mucous: Optional[str] = None
    eyes: Optional[str] = None
    mouth: Optional[str] = None
    thyroid: Optional[str] = None
    abdomen: Optional[str] = None
    neurological: Optional[str] = None
    additional_notes: Optional[str] = None

    # BLOQUE G: Labs
    labs_pdf_url: Optional[str] = None


class VisitResponse(VisitCreate):
    """Response con metadata"""
    id: UUID
    patient_id: UUID
    doctor_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class VisitListResponse(BaseModel):
    """Lista de visitas del paciente"""
    total: int
    visits: list[VisitResponse]
