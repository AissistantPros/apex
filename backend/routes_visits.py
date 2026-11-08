from fastapi import APIRouter, HTTPException, Header, Depends
from typing import Optional
from uuid import uuid4
from datetime import datetime
import traceback
from auth import get_doctor_id_from_token, get_actor
from tenant import enforce_tenant, assert_patient, strip_protected
from db import (
    insert_visit,
    get_visit,
    update_visit,
    list_patient_visits as db_list_patient_visits,
)

router = APIRouter(prefix="/visits", tags=["visits"], dependencies=[Depends(enforce_tenant)])

# Campos numéricos de la tabla visits — strings vacíos se convierten a None
NUMERIC_VISIT_FIELDS = {
    "pa_der_sistolica","pa_der_diastolica","pa_izq_sistolica","pa_izq_diastolica",
    "fc","temperatura","glucosa","spo2",
    "peso","talla","imc","circ_abdominal","circ_cintura","circ_cadera",
    "circ_cuello","circ_biceps","circ_muneca",
    "inbody_grasa","inbody_musculo","inbody_agua","inbody_visceral",
    "fuerza_mano_der","fuerza_mano_izq",
    "energia_despertar","energia_tarde","energia_noche",
    "sueno_calidad","animo_val","digestion_val",
    "libido_visita","motivo_intensidad",
    # columnas inglés (legado)
    "heart_rate","temperature","glucose","weight","height",
    "grip_right","grip_left","sleep_quality","sleep_hours","libido",
    "discomfort_intensity",
    # medicina funcional — situación actual
    "bristol_scale","bowel_movements_per_day","stress_level",
    "water_intake_liters","meals_per_day",
    # sitting_hours ya NO es numérico: se captura por rangos con botones ("6–8 h").
}

# Columnas reales soportadas en la tabla 'visits' de Supabase
KNOWN_VISIT_COLUMNS = {
    'abdomen_findings', 'actividad_frecuencia', 'actividad_intensidad', 'actividad_si',
    'actividad_tipo', 'actividades', 'activity_frequency', 'activity_intensity',
    'activity_type', 'animo_otro', 'animo_tags', 'animo_val', 'anxiety_panic',
    'apnea_duration', 'apnea_frequency', 'apnea_observed', 'apnea_pattern',
    'apnea_triggers', 'balance_seconds', 'bedtime', 'bowel_movements_per_day',
    'bristol_scale', 'brittle_nails', 'can_relax', 'circ_abdominal', 'circ_biceps',
    'circ_cadera', 'circ_cintura', 'circ_cuello', 'circ_hip', 'circ_muneca',
    'circ_neck', 'circ_waist', 'circ_wrist', 'cognitive_symptoms', 'cooking_oil',
    'created_at', 'daytime_nap', 'daytime_sleepiness', 'digestion', 'digestion_blood',
    'digestion_onset', 'digestion_otro', 'digestion_pattern', 'digestion_tags',
    'digestion_val', 'discomfort_intensity', 'doctor_id', 'doze_off', 'dx_presuntivo',
    'dynamic_answers', 'ecg_done', 'ecg_interpretation', 'ecg_realizado',
    'energia_despertar', 'energia_noche', 'energia_tarde', 'energy_evening',
    'energy_morning', 'energy_noon', 'equilibrio_seg', 'exploracion_abdomen',
    'exploracion_boca', 'exploracion_extremidades', 'exploracion_general',
    'exploracion_notas', 'exploracion_ojos', 'exploracion_piel', 'exploracion_tiroides',
    'eye_findings', 'fc', 'field_notes', 'first_time', 'food_cravings',
    'fuerza_mano_der', 'fuerza_mano_izq', 'general_inspection', 'glucosa',
    'glucosa_ayuno', 'glucose', 'glucose_fasting_hours', 'grip_left', 'grip_right',
    'hair_loss', 'heart_rate', 'height', 'id', 'imaging_findings', 'imaging_type',
    'imc', 'inbody_agua', 'inbody_fat_pct', 'inbody_grasa', 'inbody_muscle_kg',
    'inbody_musculo', 'inbody_visceral', 'inbody_water_pct', 'labs_extracted',
    'labs_files', 'labs_notas', 'labs_notes', 'labs_pdf_url', 'libido',
    'libido_tendencia', 'libido_visita', 'location_id', 'marcha_4m', 'meals_per_day',
    'medication_adherence', 'medication_changes', 'metas', 'minicog_clock',
    'minicog_done', 'minicog_notes', 'minicog_words', 'mood', 'morning_symptoms',
    'motivo', 'motivo_intensidad', 'mouth_findings', 'neuro_findings',
    'night_awakenings', 'nurse_id', 'nursing_notes', 'nutrition', 'orina_color_manana',
    'orina_color_tarde', 'other_findings', 'pa_brazo_mayor', 'pa_der_diastolica',
    'pa_der_sistolica', 'pa_dominant_arm', 'pa_izq_diastolica', 'pa_izq_sistolica',
    'pain_intensity', 'pain_location', 'pain_today', 'pains', 'patient_goals',
    'patient_id', 'peso', 'plastic_in_microwave', 'probiotics_use', 'racing_mind',
    'recent_antibiotics', 'recent_chemical_exposure', 'recent_tattoo_amalgam',
    'reception_id', 'reception_notes', 'screen_eating', 'self_skin_issues',
    'sentarse_levantarse', 'sit_stand_30s', 'sitting_hours', 'skin_findings',
    'sleep_hours', 'sleep_quality', 'snoring', 'snoring_frequency', 'snoring_intensity',
    'spo2', 'status', 'stress_coping', 'stress_level', 'sueno_calidad',
    'sueno_horas', 'symptom_since', 'symptoms', 'talla', 'temperatura', 'temperature',
    'thyroid_findings', 'ultraprocessed_frequency', 'updated_at', 'urine_color',
    'urine_color_afternoon', 'visit_reason', 'visit_type', 'vo2max', 'wake_time',
    'wakes_rested', 'walk_4m_seconds', 'water_intake_liters', 'water_source',
    'weight', 'work_activity_level', 'work_notes', 'work_setting'
}

def clean_visit_data(data: dict) -> dict:
    """Convierte strings vacíos a None en campos numéricos, normaliza alias y filtra columnas contra el esquema."""
    # Alias: el frontend puede enviar nombres en español; la DB usa inglés u otros nombres
    ALIASES = {
        "talla":         "height",
        "peso":          "weight",
        "fc":            "heart_rate",
        "temperatura":   "temperature",
        "glucosa":       "glucose",
        "motivo_visita": "motivo",
    }
    # Normalizar alias antes de limpiar
    normalized = {}
    for k, v in data.items():
        normalized[ALIASES.get(k, k)] = v

    # Asegurar sincronía entre motivo (ES) y visit_reason (EN)
    if "motivo" in normalized and not normalized.get("visit_reason"):
        normalized["visit_reason"] = normalized["motivo"]
    elif "visit_reason" in normalized and not normalized.get("motivo"):
        normalized["motivo"] = normalized["visit_reason"]

    cleaned = {}
    for k, v in normalized.items():
        if k not in KNOWN_VISIT_COLUMNS:
            continue
        if k in NUMERIC_VISIT_FIELDS:
            if v == "" or v is None:
                cleaned[k] = None
            else:
                try:
                    cleaned[k] = float(v)
                except (ValueError, TypeError):
                    cleaned[k] = None
        else:
            cleaned[k] = v
    return cleaned


@router.post("/")
async def create_visit_root(
    visit_data: dict,
    authorization: Optional[str] = Header(None),
):
    """Crear visita con patient_id en el body (usado en flujo de nuevo paciente)"""
    patient_id = visit_data.get("patient_id")
    if not patient_id:
        raise HTTPException(400, "patient_id requerido")
    # El id viene en el cuerpo (no en la ruta): se valida aquí que sea de tu clínica.
    assert_patient(get_actor(authorization), patient_id)
    # Pasar doctor_id ya resuelto para evitar bug de FieldInfo en llamada directa
    doctor_id = get_doctor_id_from_token(authorization)
    return await create_visit(patient_id, visit_data, doctor_id=doctor_id)


@router.post("/{patient_id}")
async def create_visit(
    patient_id: str,
    visit_data: dict,
    doctor_id: str = None,
    authorization: Optional[str] = Header(None),
):
    """Crear nueva visita para paciente"""
    try:
        if not doctor_id:
            # Llamada directa desde FastAPI (no desde create_visit_root)
            doctor_id = get_doctor_id_from_token(
                authorization if isinstance(authorization, (str, type(None))) else None
            )

        visit_id = str(uuid4())

        # Lo que manda el cliente va primero; las anclas van después para que NO puedan
        # sobrescribirse (antes un patient_id/doctor_id en el cuerpo ganaba).
        raw_data = {
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            **strip_protected(visit_data),
            "id": visit_id,
            "patient_id": patient_id,
            "doctor_id": doctor_id,
        }
        save_data = clean_visit_data(raw_data)

        result = insert_visit(save_data)

        if not result:
            raise HTTPException(500, "Error al guardar visita")

        return {
            "id": result.get("id"),
            "patient_id": result.get("patient_id"),
            "created_at": result.get("created_at"),
        }

    except HTTPException:
        raise
    except Exception as e:
        detail = f"Error creando visita: {str(e)}\n{traceback.format_exc()}"
        print(detail)
        raise HTTPException(500, str(e))


@router.get("/{patient_id}")
async def list_patient_visits(
    patient_id: str,
    authorization: Optional[str] = Header(None),
):
    """Listar visitas de un paciente"""
    try:
        actor = get_actor(authorization)
        if actor.get("role") == "receptionist":
            return {"total": 0, "visits": []}
        visits = db_list_patient_visits(patient_id)

        return {
            "total": len(visits),
            "visits": visits,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.put("/{visit_id}")
async def update_visit_data(
    visit_id: str,
    data: dict,
    authorization: Optional[str] = Header(None),
):
    """Actualizar datos de una visita (Fase 3: exploración médica)"""
    try:
        data["updated_at"] = datetime.utcnow().isoformat()
        data = clean_visit_data(strip_protected(data))   # no se mueve una visita de paciente/clínica
        result = update_visit(visit_id, data)
        if not result:
            raise HTTPException(404, "Visita no encontrada")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/{visit_id}/detail")
async def get_visit_detail(
    visit_id: str,
    authorization: Optional[str] = Header(None),
):
    """Obtener detalles de una visita"""
    try:
        actor = get_actor(authorization)
        if actor.get("role") == "receptionist":
            raise HTTPException(403, "Recepción no tiene acceso al historial clínico")
        visit = get_visit(visit_id)

        if not visit:
            raise HTTPException(404, "Visita no encontrada")

        return visit

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
