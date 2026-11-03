"""
Aislamiento entre clínicas (multi-tenant).

El backend usa la llave de servicio de Supabase, que ignora RLS: la separación entre
clínicas depende SOLO de este código. Aquí vive la regla en un único lugar:

  patient_belongs(actor, paciente)  →  ¿este paciente es de la clínica de quien pregunta?
  assert_patient / assert_visit     →  404 si no existe O es de otra clínica (no se revela
                                       que existe).
  enforce_tenant                    →  dependencia de router: cualquier ruta con
                                       {patient_id}, {pid} o {visit_id} exige sesión válida
                                       y que el recurso sea de la clínica del actor.

Regla de pertenencia de un paciente:
  - Si el paciente y el actor tienen clinic_id, deben coincidir.
  - Si falta alguno (cuentas antiguas), el paciente debe estar anclado al mismo
    doctor (patients.doctor_id == actor.doctor_id).
  - Nunca se acepta un paciente sin ancla (clinic_id y doctor_id vacíos).
  - El admin proveedor nunca ve pacientes.
"""
from typing import Optional

from fastapi import Header, HTTPException, Request

import db
from auth import get_actor

PATIENT_PARAMS = ("patient_id", "pid")
VISIT_PARAMS = ("visit_id",)

# Campos que un cliente nunca debe poder escribir en el cuerpo de una petición:
# anclan el registro a una clínica/paciente o son del sistema.
PROTECTED_FIELDS = {"id", "patient_id", "doctor_id", "clinic_id", "created_at"}


def patient_belongs(actor: dict, patient: Optional[dict]) -> bool:
    """¿Pertenece este paciente a la clínica del actor?"""
    if not patient or actor.get("role") == "admin":
        return False
    p_clinic, a_clinic = patient.get("clinic_id"), actor.get("clinic_id")
    if p_clinic and a_clinic:
        return p_clinic == a_clinic
    p_doctor = patient.get("doctor_id")
    return bool(p_doctor) and p_doctor == actor.get("doctor_id")


def strip_protected(data: dict) -> dict:
    """Quita de un cuerpo los campos que anclan el registro (no se pueden reasignar)."""
    return {k: v for k, v in (data or {}).items() if k not in PROTECTED_FIELDS}


def _patient_anchor(patient_id: str) -> Optional[dict]:
    r = db.supabase.table("patients").select("id, clinic_id, doctor_id")\
        .eq("id", patient_id).limit(1).execute().data
    return r[0] if r else None


def assert_patient(actor: dict, patient_id: str) -> dict:
    """Devuelve el ancla del paciente o aborta con 404 (no existe o es de otra clínica)."""
    row = _patient_anchor(patient_id)
    if not row or not patient_belongs(actor, row):
        raise HTTPException(404, "Paciente no encontrado")
    return row


def assert_visit(actor: dict, visit_id: str) -> dict:
    """Devuelve la visita o aborta con 404 si no existe o su paciente es de otra clínica."""
    r = db.supabase.table("visits").select("id, patient_id, doctor_id")\
        .eq("id", visit_id).limit(1).execute().data
    if not r:
        raise HTTPException(404, "Visita no encontrada")
    visit = r[0]
    if visit.get("patient_id"):
        anchor = _patient_anchor(visit["patient_id"])
        if not anchor or not patient_belongs(actor, anchor):
            raise HTTPException(404, "Visita no encontrada")
    elif not (visit.get("doctor_id") and visit["doctor_id"] == actor.get("doctor_id")
              and actor.get("role") != "admin"):
        raise HTTPException(404, "Visita no encontrada")
    return visit


async def enforce_tenant(request: Request, authorization: Optional[str] = Header(None)):
    """Dependencia de router. Solo actúa en rutas con {patient_id}, {pid} o {visit_id};
    en las demás no hace nada (cada una valida lo suyo)."""
    params = request.path_params
    patient_ids = [params[k] for k in PATIENT_PARAMS if k in params]
    visit_ids = [params[k] for k in VISIT_PARAMS if k in params]
    if not patient_ids and not visit_ids:
        return
    actor = get_actor(authorization)          # 401 si no hay sesión válida
    for pid in patient_ids:
        assert_patient(actor, pid)
    for vid in visit_ids:
        assert_visit(actor, vid)
