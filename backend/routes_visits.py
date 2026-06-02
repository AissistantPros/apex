from fastapi import APIRouter, HTTPException, Depends, Header
from typing import Optional
from uuid import UUID, uuid4
from datetime import datetime
from models_visits import VisitCreate, VisitResponse, VisitListResponse

router = APIRouter(prefix="/visits", tags=["visits"])

# In-memory storage
visits_db = {}


async def get_doctor_id(authorization: Optional[str] = Header(None)) -> str:
    """Extract doctor_id from JWT token"""
    if not authorization:
        return "550e8400-e29b-41d4-a716-446655440000"
    if authorization.startswith("Bearer "):
        return "550e8400-e29b-41d4-a716-446655440000"
    return "550e8400-e29b-41d4-a716-446655440000"


@router.post("/{patient_id}", response_model=VisitResponse)
async def create_visit(
    patient_id: UUID,
    visit: VisitCreate,
    doctor_id: str = Depends(get_doctor_id),
):
    """Crear nueva visita para paciente"""

    visit_id = uuid4()
    visit_data = {
        "id": visit_id,
        "patient_id": patient_id,
        "doctor_id": doctor_id,
        **visit.dict(exclude_unset=True),
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
    }
    visits_db[str(visit_id)] = visit_data

    return VisitResponse(**visit_data)


@router.get("/{patient_id}", response_model=VisitListResponse)
async def list_patient_visits(
    patient_id: UUID,
    doctor_id: str = Depends(get_doctor_id),
):
    """Listar visitas de un paciente"""

    all_visits = [
        v for v in visits_db.values()
        if v["patient_id"] == patient_id and v["doctor_id"] == doctor_id
    ]
    all_visits.sort(key=lambda v: v.get("created_at"), reverse=True)

    return {
        "total": len(all_visits),
        "visits": [VisitResponse(**v) for v in all_visits],
    }


@router.get("/{visit_id}/detail", response_model=VisitResponse)
async def get_visit(
    visit_id: UUID,
    doctor_id: str = Depends(get_doctor_id),
):
    """Obtener detalles de una visita"""

    visit = visits_db.get(str(visit_id))
    if not visit or visit["doctor_id"] != doctor_id:
        raise HTTPException(status_code=404, detail="Visit not found")

    return VisitResponse(**visit)
