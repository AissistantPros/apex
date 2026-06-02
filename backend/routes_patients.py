from fastapi import APIRouter, HTTPException, Depends, Header
from typing import Optional
from uuid import UUID
import httpx
import os
from models import (
    PatientStage1Create,
    PatientStage1Response,
    PatientStage2Response,
    PatientStage3Response,
    FamilyHistoryCreate,
    PastMedicalHistoryCreate,
    MedicationCreate,
    PrivateInfoCreate,
    PatientListResponse,
    PatientSearchResponse,
)

router = APIRouter(prefix="/patients", tags=["patients"])

# Supabase credentials
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

async def get_doctor_id(authorization: Optional[str] = Header(None)) -> str:
    """Extract doctor_id from JWT token"""
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization header")
    # TODO: Verify JWT and extract doctor_id
    # For now, return a dummy value (in production, verify against Supabase)
    return "dummy-doctor-id"


# ==========================================
# ETAPA 1: CREAR PACIENTE (RECEPCIONISTA)
# ==========================================

@router.post("/", response_model=PatientStage1Response)
async def create_patient(
    patient: PatientStage1Create,
    doctor_id: str = Depends(get_doctor_id),
):
    """Crear nuevo paciente - ETAPA 1 (Recepcionista)"""

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{SUPABASE_URL}/rest/v1/patients",
            json={
                "doctor_id": doctor_id,
                **patient.dict(exclude_unset=True),
            },
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "apikey": SUPABASE_SERVICE_KEY,
                "Content-Type": "application/json",
            },
        )

        if response.status_code not in [200, 201]:
            raise HTTPException(status_code=400, detail=f"Error creating patient: {response.text}")

        return response.json()[0]


# ==========================================
# ETAPA 2: ACTUALIZAR ANTECEDENTES (ENFERMERA)
# ==========================================

@router.post("/{patient_id}/family-history", response_model=dict)
async def add_family_history(
    patient_id: UUID,
    family_history: FamilyHistoryCreate,
    doctor_id: str = Depends(get_doctor_id),
):
    """Agregar antecedentes familiares - ETAPA 2 (Enfermera)"""

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{SUPABASE_URL}/rest/v1/patient_family_history",
            json={
                "patient_id": str(patient_id),
                "doctor_id": doctor_id,
                **family_history.dict(exclude_unset=True),
            },
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "apikey": SUPABASE_SERVICE_KEY,
                "Content-Type": "application/json",
            },
        )

        if response.status_code not in [200, 201]:
            raise HTTPException(status_code=400, detail="Error saving family history")

        return {"status": "success"}


@router.post("/{patient_id}/medical-history", response_model=dict)
async def add_past_medical_history(
    patient_id: UUID,
    medical_history: PastMedicalHistoryCreate,
    doctor_id: str = Depends(get_doctor_id),
):
    """Agregar antecedentes personales - ETAPA 2 (Enfermera)"""

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{SUPABASE_URL}/rest/v1/patient_past_medical_history",
            json={
                "patient_id": str(patient_id),
                "doctor_id": doctor_id,
                **medical_history.dict(exclude_unset=True),
            },
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "apikey": SUPABASE_SERVICE_KEY,
                "Content-Type": "application/json",
            },
        )

        if response.status_code not in [200, 201]:
            raise HTTPException(status_code=400, detail="Error saving medical history")

        return {"status": "success"}


@router.post("/{patient_id}/medications", response_model=dict)
async def add_medication(
    patient_id: UUID,
    medication: MedicationCreate,
    doctor_id: str = Depends(get_doctor_id),
):
    """Agregar medicamento - ETAPA 2 (Enfermera)"""

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{SUPABASE_URL}/rest/v1/patient_medications",
            json={
                "patient_id": str(patient_id),
                "doctor_id": doctor_id,
                **medication.dict(exclude_unset=True),
            },
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "apikey": SUPABASE_SERVICE_KEY,
                "Content-Type": "application/json",
            },
        )

        if response.status_code not in [200, 201]:
            raise HTTPException(status_code=400, detail="Error saving medication")

        return {"status": "success"}


# ==========================================
# ETAPA 3: DATOS PRIVADOS (MÉDICO)
# ==========================================

@router.post("/{patient_id}/private-info", response_model=dict)
async def add_private_info(
    patient_id: UUID,
    private_info: PrivateInfoCreate,
    doctor_id: str = Depends(get_doctor_id),
):
    """Agregar datos privados - ETAPA 3 (Médico)"""

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{SUPABASE_URL}/rest/v1/patient_private_info",
            json={
                "patient_id": str(patient_id),
                "doctor_id": doctor_id,
                **private_info.dict(exclude_unset=True),
            },
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "apikey": SUPABASE_SERVICE_KEY,
                "Content-Type": "application/json",
            },
        )

        if response.status_code not in [200, 201]:
            raise HTTPException(status_code=400, detail="Error saving private info")

        return {"status": "success"}


# ==========================================
# BÚSQUEDA Y RECUPERACIÓN
# ==========================================

@router.get("/", response_model=PatientListResponse)
async def list_patients(
    skip: int = 0,
    limit: int = 10,
    search: Optional[str] = None,
    doctor_id: str = Depends(get_doctor_id),
):
    """Listar pacientes del médico"""

    async with httpx.AsyncClient() as client:
        # Construir query
        query = f"select id, full_name, email, phone, created_at from patients where doctor_id=eq.{doctor_id}"
        if search:
            query += f" and (full_name.ilike.%{search}% or email.ilike.%{search}%)"
        query += f" order by created_at desc offset {skip} limit {limit}"

        response = await client.get(
            f"{SUPABASE_URL}/rest/v1/patients",
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "apikey": SUPABASE_SERVICE_KEY,
            },
            params={
                "select": "id,full_name,email,phone,created_at",
                "doctor_id": f"eq.{doctor_id}",
                "order": "created_at.desc",
                "offset": skip,
                "limit": limit,
            },
        )

        if response.status_code != 200:
            raise HTTPException(status_code=400, detail="Error fetching patients")

        patients = response.json()
        return {
            "total": len(patients),
            "patients": [PatientSearchResponse(**p) for p in patients],
        }


@router.get("/{patient_id}", response_model=PatientStage1Response)
async def get_patient(
    patient_id: UUID,
    doctor_id: str = Depends(get_doctor_id),
):
    """Obtener detalles del paciente"""

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{SUPABASE_URL}/rest/v1/patients",
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "apikey": SUPABASE_SERVICE_KEY,
            },
            params={
                "id": f"eq.{patient_id}",
                "doctor_id": f"eq.{doctor_id}",
            },
        )

        if response.status_code != 200 or not response.json():
            raise HTTPException(status_code=404, detail="Patient not found")

        return response.json()[0]


@router.put("/{patient_id}", response_model=dict)
async def update_patient(
    patient_id: UUID,
    patient: PatientStage1Create,
    doctor_id: str = Depends(get_doctor_id),
):
    """Actualizar datos del paciente"""

    async with httpx.AsyncClient() as client:
        response = await client.patch(
            f"{SUPABASE_URL}/rest/v1/patients",
            json=patient.dict(exclude_unset=True),
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "apikey": SUPABASE_SERVICE_KEY,
                "Content-Type": "application/json",
            },
            params={
                "id": f"eq.{patient_id}",
                "doctor_id": f"eq.{doctor_id}",
            },
        )

        if response.status_code not in [200, 204]:
            raise HTTPException(status_code=400, detail="Error updating patient")

        return {"status": "success"}
