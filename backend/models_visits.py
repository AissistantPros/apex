from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime
from uuid import UUID

class VisitCreate(BaseModel):
    """Nueva visita - todos los 7 bloques"""

    model_config = {"extra": "allow"}  # acepta cualquier campo nuevo del frontend

    # BLOQUE A: Motivo
    visit_reason: Optional[str] = None
    discomfort_intensity: Optional[Any] = None
    first_time: Optional[Any] = None        # puede ser bool o str ('si'/'no'/'episodios')

    # BLOQUE B: Signos Vitales
    pa_right: Optional[Any] = None
    pa_left: Optional[Any] = None
    heart_rate: Optional[Any] = None
    temperature: Optional[Any] = None
    spo2: Optional[Any] = None
    glucose: Optional[Any] = None
    glucose_fasting_hours: Optional[Any] = None
    ecg_notes: Optional[str] = None

    # BLOQUE C: Composición Corporal
    weight: Optional[Any] = None
    height: Optional[Any] = None
    imc: Optional[Any] = None
    circumference_abdominal: Optional[Any] = None
    circumference_waist: Optional[Any] = None
    circumference_hip: Optional[Any] = None
    circumference_neck: Optional[Any] = None
    circumference_biceps: Optional[Any] = None
    inbody_fat_percent: Optional[Any] = None
    inbody_muscle_mass: Optional[Any] = None
    inbody_water: Optional[Any] = None
    inbody_visceral_fat: Optional[Any] = None

    # BLOQUE D: Pruebas Funcionales
    grip_strength_left: Optional[Any] = None
    grip_strength_right: Optional[Any] = None
    walk_speed_4m: Optional[Any] = None
    sit_stand_30s: Optional[Any] = None
    balance_monopodal_seconds: Optional[Any] = None
    vo2_max: Optional[Any] = None

    # BLOQUE E: Reporte Subjetivo
    energy_morning: Optional[Any] = None
    energy_noon: Optional[Any] = None
    energy_evening: Optional[Any] = None
    sleep_quality: Optional[Any] = None
    sleep_hours: Optional[Any] = None
    wakes_rested: Optional[Any] = None
    mood: Optional[Any] = None
    libido: Optional[Any] = None
    digestion: Optional[Any] = None
    urine_color: Optional[str] = None
    pain_location: Optional[str] = None
    pain_intensity: Optional[Any] = None
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
    model_config = {"extra": "allow"}
    id: str
    patient_id: str
    doctor_id: str
    created_at: Any
    updated_at: Any


class VisitListResponse(BaseModel):
    """Lista de visitas del paciente"""
    total: int
    visits: list[VisitResponse]
