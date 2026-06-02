from fastapi import APIRouter, HTTPException, Depends, Header
from typing import Optional
from uuid import UUID, uuid4
import httpx
import os
from datetime import datetime
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

# In-memory storage for MVP testing
patients_db = {}

async def get_doctor_id(authorization: Optional[str] = Header(None)) -> str:
    """Extract doctor_id from JWT token"""
    if not authorization:
        # For testing, return a dummy doctor_id
        return "550e8400-e29b-41d4-a716-446655440000"

    # Extract Bearer token
    if authorization.startswith("Bearer "):
        token = authorization[7:]
        # TODO: Verify JWT signature
        # For now, just use the token as a placeholder
        return "550e8400-e29b-41d4-a716-446655440000"

    return "550e8400-e29b-41d4-a716-446655440000"


# ==========================================
# ETAPA 1: CREAR PACIENTE (RECEPCIONISTA)
# ==========================================

@router.post("/", response_model=PatientStage1Response)
async def create_patient(
    patient: PatientStage1Create,
    doctor_id: str = Depends(get_doctor_id),
):
    """Crear nuevo paciente - ETAPA 1 (Recepcionista)"""

    # Generate patient ID
    patient_id = uuid4()

    # Store in memory (MVP testing)
    patient_data = {
        "id": patient_id,
        "doctor_id": doctor_id,
        **patient.dict(exclude_unset=True),
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
    }
    patients_db[str(patient_id)] = patient_data

    return PatientStage1Response(**patient_data)


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

    # Filter from in-memory database
    all_patients = [p for p in patients_db.values() if p["doctor_id"] == doctor_id]

    # Filter by search
    if search:
        search_lower = search.lower()
        all_patients = [
            p for p in all_patients
            if search_lower in (p.get("full_name") or "").lower()
            or search_lower in (p.get("email") or "").lower()
        ]

    # Sort by created_at descending
    all_patients.sort(key=lambda p: p.get("created_at"), reverse=True)

    # Apply pagination
    paginated = all_patients[skip : skip + limit]

    return {
        "total": len(all_patients),
        "patients": [
            PatientSearchResponse(
                id=p["id"],
                full_name=p.get("full_name"),
                email=p.get("email"),
                phone=p.get("phone"),
                created_at=p.get("created_at"),
            )
            for p in paginated
        ],
    }


@router.get("/{patient_id}", response_model=PatientStage1Response)
async def get_patient(
    patient_id: UUID,
    doctor_id: str = Depends(get_doctor_id),
):
    """Obtener detalles del paciente"""

    patient = patients_db.get(str(patient_id))
    if not patient or patient["doctor_id"] != doctor_id:
        raise HTTPException(status_code=404, detail="Patient not found")

    return PatientStage1Response(**patient)


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
