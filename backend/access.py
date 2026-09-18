"""
Control de acceso por rol (RBAC) — la barrera de seguridad REAL del sistema.

Roles:
  admin        → el PROVEEDOR (nosotros). Administra la estructura (clínicas, ubicaciones,
                 personal, permisos), la biblioteca y ve logs/tickets. NUNCA ve datos de
                 pacientes, historial clínico, cobranza ni finanzas de una clínica.
  doctor       → super-admin LOCAL de su clínica. Único que ve el HISTORIAL clínico. Absorbe
                 enfermería/recepción si esos roles no existen. No controla el sistema.
  receptionist → solo lo que ella captura (datos generales, contacto, facturación, encuesta de
                 entrada) y el historial de cobros. Nada médico. Puede ENVIAR el reporte al
                 paciente pero no verlo.
  nurse        → solo los datos de enfermería (antecedentes clínicos). No ve contacto, RFC,
                 facturación ni cobranza.
  accounting   → finanzas, gastos e ingresos (ver/descargar). No datos clínicos.
  marketing    → ROI y captura de marketing. Nada clínico ni cobros.

REGLAS DURAS:
- Solo los médicos ven el HISTORIAL clínico (ni el admin proveedor, ni un admin local no-médico).
- El admin proveedor NO ve datos de pacientes de ninguna clínica.
- `is_local_admin` (asistente/enfermera designada por el doc) puede administrar staff, pero
  NUNCA ve el historial clínico.
"""
from typing import Optional
from fastapi import HTTPException

# Solo estos roles ven el historial/ficha clínica completa. Regla dura.
HISTORIAL_ROLES = {"doctor"}
# El admin es el proveedor: administra, pero no ve datos clínicos ni de pacientes.
PROVIDER_ROLES = {"admin"}
# Compat: "ve todo lo clínico" = solo el doctor.
VE_TODO = HISTORIAL_ROLES

# ── Campos del paciente que puede ver/editar cada rol ────────────────────────────
# Recepción: datos generales, contacto, facturación, origen/marketing, clasificación.
RECEPTION_FIELDS = {
    "id", "doctor_id", "first_name", "last_name", "full_name", "date_of_birth", "birth_date",
    "occupation", "city", "email", "phone", "phone_landline",
    "emergency_contact_name", "emergency_contact_phone", "emergency_contact_email",
    "emergency_contact_relationship", "referred_by", "referred_type", "referred_other",
    "sources_of_contact", "prev_redes", "prev_web", "prev_gmaps", "social_network",
    "billing", "care_type", "registration_phase", "phases_completed",
    "created_at", "updated_at", "notes_reception", "photo_url",
}
# Enfermería: antecedentes clínicos. NO contacto, NO facturación, NO cobranza.
NURSING_FIELDS = {
    "id", "first_name", "last_name", "full_name", "date_of_birth", "birth_date",
    "sexo_biologico", "genero_identidad", "registration_phase", "phases_completed",
    "chronic_diseases", "surgeries", "hospitalizations", "fractures", "transfusions",
    "childhood_diseases", "childhood_infections", "childhood_antibiotics",
    "allergies_medications", "allergies_foods", "allergies_environmental", "med_notas",
    "medications", "smoking_status", "smoking_count", "smoking_since", "smoking_until",
    "smoking_years", "alcohol_status", "alcohol_type", "alcohol_amount", "alcohol_tipo",
    "alcohol_cantidad", "sust_recreativas", "dx_psiquiatrico", "med_psiquiatrica",
    "trauma_relevante", "menarca_age", "ciclos_regulares", "pregnancies", "births",
    "miscarriages", "menopausal", "menopausal_age", "menopausal_tipo", "contraceptive",
    "pap_ultimo", "masto_ultima", "colpo_ultima", "erectile_dysfunction", "testosterone_use",
    "testosterone_detalle", "children", "psa_ultimo", "psa_valor", "libido_basal",
    "salud_sexual_notas", "family_history_table", "toxic_exposure_occupational",
    "dental_amalgams", "tattoos_piercings", "childhood_residence_exposure",
    "secondhand_smoke_exposure", "notes_nurse",
}

PATIENT_FIELDS_BY_ROLE = {
    "receptionist": RECEPTION_FIELDS,
    "nurse": NURSING_FIELDS,
}


def require(actor: dict, *roles: str):
    """Aborta con 403 si el rol del actor no está permitido."""
    if actor.get("role") not in roles:
        raise HTTPException(403, "No tienes permiso para esta acción")


def is_admin(actor: dict) -> bool:
    """Admin proveedor (global)."""
    return actor.get("role") == "admin"


def is_local_admin(actor: dict) -> bool:
    """Puede administrar staff en su clínica: el doctor (super-admin local) o quien el
    doc haya designado con is_local_admin. NO implica acceso clínico."""
    return actor.get("role") == "doctor" or bool(actor.get("is_local_admin"))


def puede_ver_historial(role: str) -> bool:
    return role in HISTORIAL_ROLES


def ve_todo(actor: dict) -> bool:
    return actor.get("role") in HISTORIAL_ROLES


def filter_patient(patient: dict, role: str) -> dict:
    """Devuelve solo los campos del paciente que ese rol puede ver."""
    if not patient:
        return patient
    if role in HISTORIAL_ROLES:          # doctor: ve todo
        return patient
    if role in PROVIDER_ROLES:           # admin proveedor: NO ve pacientes
        return {}
    allowed = PATIENT_FIELDS_BY_ROLE.get(role)
    if allowed is None:
        # accounting / marketing no ven fichas de paciente
        return {k: patient.get(k) for k in ("id", "full_name")}
    return {k: v for k, v in patient.items() if k in allowed}


def allowed_write_fields(role: str) -> Optional[set]:
    """Campos que ese rol puede escribir. None = todos (solo doctor)."""
    if role in HISTORIAL_ROLES:
        return None
    if role in PROVIDER_ROLES:           # admin proveedor no escribe fichas
        return set()
    return PATIENT_FIELDS_BY_ROLE.get(role, set())


def filter_write(data: dict, role: str) -> dict:
    """Limita un update a los campos que el rol puede escribir."""
    allowed = allowed_write_fields(role)
    if allowed is None:
        return data
    return {k: v for k, v in data.items() if k in allowed}
