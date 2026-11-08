from fastapi import APIRouter, HTTPException, Header, Depends, File, Form, UploadFile
from typing import Optional
from datetime import datetime
from auth import get_doctor_id_from_token
from tenant import enforce_tenant, patient_belongs, strip_protected
from db import (
    insert_patient,
    get_patient,
    update_patient,
    list_patients,
    list_patient_visits,
    get_doctor_profile,
    upsert_doctor_profile,
    add_patient_note,
    get_patient_notes,
    delete_patient_note,
    check_duplicate_patients,
)

router = APIRouter(prefix="/patients", tags=["patients"], dependencies=[Depends(enforce_tenant)])

# Campos de tipo date en patients — strings vacíos causan error
DATE_PATIENT_FIELDS = {"date_of_birth", "birth_date"}

# Columnas reales soportadas en la tabla 'patients' de Supabase
KNOWN_PATIENT_COLUMNS = {
    'alcohol_amount', 'alcohol_cantidad', 'alcohol_notes', 'alcohol_since',
    'alcohol_status', 'alcohol_tipo', 'alcohol_type', 'allergies_environmental',
    'allergies_foods', 'allergies_medications', 'billing', 'birth_date',
    'births', 'care_type', 'childhood_antibiotics', 'childhood_diseases',
    'childhood_infections', 'childhood_residence_exposure', 'children',
    'chronic_diseases', 'ciclos_regulares', 'cigarettes_per_day', 'city',
    'clinic_id', 'colpo_ultima', 'contraceptive', 'created_at', 'date_of_birth',
    'dental_amalgams', 'doctor_id', 'dx_psiquiatrico', 'email',
    'emergency_contact_email', 'emergency_contact_name', 'emergency_contact_phone',
    'emergency_contact_relationship', 'entrevista_funcional_completa',
    'erectile_dysfunction', 'family_history_table', 'family_other_history',
    'first_name', 'fractures', 'full_name', 'func_intake', 'genero_identidad',
    'hospitalizations', 'id', 'last_name', 'libido_basal', 'masto_ultima',
    'med_notas', 'med_psiquiatrica', 'medications', 'menarca_age', 'menopausal',
    'menopausal_age', 'menopausal_tipo', 'miscarriages', 'notes_doctor',
    'notes_nurse', 'notes_reception', 'occupation', 'pap_ultimo',
    'personal_history_notes', 'phases_completed', 'phone', 'phone_landline',
    'photo_url', 'pregnancies', 'prev_gmaps', 'prev_redes', 'prev_web',
    'psa_ultimo', 'psa_valor', 'referred_by', 'referred_other', 'referred_type',
    'registration_phase', 'remote_history_notes', 'salud_sexual_notas',
    'secondhand_smoke_exposure', 'sexo_biologico', 'smoking_count', 'smoking_notes',
    'smoking_since', 'smoking_status', 'smoking_until', 'smoking_years',
    'social_network', 'sources_of_contact', 'surgeries', 'sust_recreativas',
    'tattoos_piercings', 'testosterone_detalle', 'testosterone_use',
    'toxic_exposure_occupational', 'transfusions', 'trauma_relevante',
    'updated_at', 'vaping', 'vaping_nicotine_mg', 'vaping_since'
}

def clean_patient_data(data: dict) -> dict:
    """
    Limpia y normaliza datos para la tabla 'patients':
    1. Si se envían campos sueltos de facturación (factura_*), se agrupan en el JSONB 'billing'.
    2. Normaliza 'gender' o 'sex' hacia 'sexo_biologico'.
    3. Convierte strings vacíos en campos date a None.
    4. Descarta cualquier campo inexistente en el esquema para evitar errores PGRST204.
    """
    data_copy = dict(data)

    # Agrupar campos de facturación en el JSONB 'billing' si vienen planos
    if any(k.startswith("factura_") for k in data_copy):
        existing_billing = data_copy.get("billing")
        if not isinstance(existing_billing, dict):
            existing_billing = {}
        data_copy["billing"] = {
            "requiere": bool(data_copy.pop("factura_requiere", existing_billing.get("requiere", False))),
            "rfc": str(data_copy.pop("factura_rfc", existing_billing.get("rfc", "")) or "").strip(),
            "razon_social": str(data_copy.pop("factura_razon_social", existing_billing.get("razon_social", "")) or "").strip(),
            "regimen": str(data_copy.pop("factura_regimen", existing_billing.get("regimen", "")) or "").strip(),
            "uso_cfdi": str(data_copy.pop("factura_uso_cfdi", existing_billing.get("uso_cfdi", "")) or "").strip(),
            "cp": str(data_copy.pop("factura_cp", existing_billing.get("cp", "")) or "").strip(),
            "email": str(data_copy.pop("factura_email", existing_billing.get("email", "")) or "").strip(),
            "direccion": str(data_copy.pop("factura_direccion", existing_billing.get("direccion", "")) or "").strip(),
        }

    # Normalizar gender/sex a sexo_biologico
    if "gender" in data_copy:
        val = data_copy.pop("gender")
        if "sexo_biologico" not in data_copy and val:
            data_copy["sexo_biologico"] = val
    if "sex" in data_copy:
        val = data_copy.pop("sex")
        if "sexo_biologico" not in data_copy and val:
            data_copy["sexo_biologico"] = val

    cleaned = {}
    for k, v in data_copy.items():
        if k not in KNOWN_PATIENT_COLUMNS:
            continue
        if k in DATE_PATIENT_FIELDS and v == "":
            cleaned[k] = None
        else:
            cleaned[k] = v
    return cleaned

# ─── Generar ID legible ──────────────────────────────────────────────────────

def generate_patient_id(first_name: str, last_name: str, birth_date: str) -> str:
    """Genera ID legible: JUPE-150580-000001"""
    if not first_name or not last_name or not birth_date:
        raise ValueError("Faltan datos para generar ID")

    prefix = (first_name[:1] + last_name[:1]).upper()[:2]
    suffix = last_name[-2:].upper()[:2]

    try:
        from datetime import datetime as dt
        date_obj = dt.strptime(birth_date, "%Y-%m-%d")
        date_str = date_obj.strftime("%d%m%y")
    except:
        date_str = "000000"

    import time
    seq = str(int(time.time() * 1000) % 1000000).zfill(6)

    return f"{prefix}{suffix}-{date_str}-{seq}"


async def get_doctor_id(authorization: Optional[str] = Header(None)) -> str:
    """Extrae doctor_id del JWT de Supabase."""
    return get_doctor_id_from_token(authorization)


@router.get("/check-duplicate")
async def check_duplicate(
    first_name: str,
    last_name: str,
    date_of_birth: str,
    authorization: Optional[str] = Header(None),
):
    """Verifica si ya existe un paciente con el mismo nombre y fecha de nacimiento"""
    try:
        from auth import get_actor
        actor = get_actor(authorization)
        # Solo duplicados dentro de la clínica de quien pregunta (y sin exponer las anclas).
        matches = [
            {k: v for k, v in m.items() if k not in ("clinic_id", "doctor_id")}
            for m in check_duplicate_patients(first_name, last_name, date_of_birth)
            if patient_belongs(actor, m)
        ]
        return {"duplicates": matches, "count": len(matches)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/")
def get_all_patients(
    limit: int = 50,
    authorization: Optional[str] = Header(None),
):
    """Listar pacientes — cada campo filtrado según el rol de quien consulta."""
    try:
        from auth import get_actor
        from access import filter_patient
        actor = get_actor(authorization)
        # Aislamiento por clínica: cada quien ve solo los pacientes de su clínica.
        clinic = actor.get("clinic_id") or actor.get("doctor_id")
        patients = list_patients(limit=limit, clinic=clinic)
        patients = [filter_patient(p, actor["role"]) for p in patients]
        return {"total": len(patients), "patients": patients}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/")
async def create_patient(
    patient_data: dict,
    authorization: Optional[str] = Header(None),
):
    """Crear paciente con todas las 3 fases"""
    try:
        from auth import get_actor
        actor = get_actor(authorization)

        first_name = patient_data.get("first_name", "")
        last_name = patient_data.get("last_name", "")
        birth_date = patient_data.get("date_of_birth") or patient_data.get("birth_date")

        if not first_name or not last_name or not birth_date:
            raise HTTPException(400, "Faltan datos requeridos")

        patient_id = generate_patient_id(first_name, last_name, birth_date)

        save_data = {
            "id": patient_id,
            "full_name": f"{first_name} {last_name}",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            **patient_data,
            # El paciente se ancla a la CLÍNICA (multi-tenant), no a quien lo captura.
            # Se ponen después del spread para que manden sobre cualquier valor entrante.
            "doctor_id": actor.get("doctor_id"),
            "clinic_id": actor.get("clinic_id"),
        }

        result = insert_patient(clean_patient_data(save_data))

        if not result:
            raise HTTPException(500, "Error al guardar paciente")

        return {
            "id": result.get("id"),
            "full_name": result.get("full_name"),
            "created_at": result.get("created_at"),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/{patient_id}")
async def get_patient_data(
    patient_id: str,
    authorization: Optional[str] = Header(None),
):
    """Obtener datos de un paciente — filtrados según el rol de quien consulta."""
    try:
        patient = get_patient(patient_id)

        if not patient:
            raise HTTPException(404, "Paciente no encontrado")

        from auth import get_actor
        from access import filter_patient
        actor = get_actor(authorization)
        return filter_patient(patient, actor["role"])

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.put("/{patient_id}")
async def update_patient_data(
    patient_id: str,
    data: dict,
    authorization: Optional[str] = Header(None),
):
    """Actualizar un paciente — cada rol solo puede escribir SUS campos."""
    try:
        from auth import get_actor
        from access import filter_write
        actor = get_actor(authorization)
        # El ancla (id, clinic_id, doctor_id) no se reasigna desde el cliente.
        data = strip_protected(filter_write(data, actor["role"]))
        if not data:
            raise HTTPException(403, "Tu rol no puede editar estos campos")
        data["updated_at"] = datetime.utcnow().isoformat()
        result = update_patient(patient_id, clean_patient_data(data))

        if not result:
            raise HTTPException(404, "Paciente no encontrado")

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/{patient_id}/visits")
async def get_patient_visits(
    patient_id: str,
    authorization: Optional[str] = Header(None),
):
    """Obtener todas las visitas de un paciente"""
    try:
        from auth import get_actor
        actor = get_actor(authorization)
        if actor.get("role") == "receptionist":
            return {"patient_id": patient_id, "total": 0, "visits": []}
        visits = list_patient_visits(patient_id)
        return {
            "patient_id": patient_id,
            "total": len(visits),
            "visits": visits,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/{patient_id}/notes")
async def get_notes(patient_id: str, authorization: Optional[str] = Header(None)):
    """Listar todas las notas de un paciente"""
    try:
        from auth import get_actor
        actor = get_actor(authorization)
        if actor.get("role") == "receptionist":
            return {"notes": []}
        notes = get_patient_notes(patient_id)
        return {"notes": notes}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/{patient_id}/notes")
async def create_note(patient_id: str, data: dict, authorization: Optional[str] = Header(None)):
    """Agregar nota con autor y timestamp"""
    try:
        content = data.get("content", "").strip()
        if not content:
            raise HTTPException(400, "El contenido de la nota no puede estar vacío")
        note = add_patient_note(
            patient_id=patient_id,
            visit_id=data.get("visit_id"),
            author_role=data.get("author_role", "doctor"),
            author_name=data.get("author_name", ""),
            content=content,
            audiencia=data.get("audiencia", "general"),
        )
        return note
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.delete("/{patient_id}/notes/{note_id}")
async def remove_note(patient_id: str, note_id: str, authorization: Optional[str] = Header(None)):
    """Eliminar una nota"""
    try:
        delete_patient_note(note_id, patient_id)
        return {"deleted": True, "id": note_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.delete("/{patient_id}")
async def delete_patient(
    patient_id: str,
    authorization: Optional[str] = Header(None),
):
    """Si quien solicita es el médico titular (doctor), elimina el expediente inmediatamente
    (previa confirmación en UI). Si es personal del equipo, debe solicitar autorización al doctor."""
    from auth import get_actor
    actor = get_actor(authorization)
    if actor["role"] == "doctor":
        patient = get_patient(patient_id)
        if not patient or not patient_belongs(actor, patient):
            raise HTTPException(404, "Paciente no encontrado")
        from routes_deletions import _cascade_delete_patient
        _cascade_delete_patient(patient_id)
        return {"ok": True, "deleted": True, "patient_id": patient_id}
    raise HTTPException(
        403,
        "El personal no puede borrar un expediente directamente. Envía una solicitud de baja; "
        "el médico la revisará desde su plataforma.",
    )


# ── Última prescripción + envío al paciente ─────────────

def _last_prescription(patient_id: str) -> dict:
    """Última prescripción del paciente (protocolos + notas del médico, incluyendo Consulta Lite)."""
    from db import supabase
    import json as _json
    r = supabase.table("analyses").select(
        "visit_id, protocol_traditional, protocol_functional, protocol_longevity, "
        "doctor_traditional, doctor_functional, updated_at"
    ).eq("patient_id", patient_id).order("updated_at", desc=True).limit(1).execute()
    ana = (r.data or [{}])[0]

    # También revisar si la última visita tiene receta manual de Consulta Lite
    v_rows = supabase.table("visits").select("id, visit_date, created_at, dynamic_answers")\
        .eq("patient_id", patient_id).order("visit_date", desc=True).limit(5).execute().data or []
    for v in v_rows:
        da = v.get("dynamic_answers") or {}
        lite = da.get("lite") if isinstance(da, dict) else None
        receta_lite = (lite or {}).get("receta") if isinstance(lite, dict) else None
        if isinstance(receta_lite, list) and any((m or {}).get("nombre_generico") or (m or {}).get("medicamento") for m in receta_lite):
            meds = []
            for m in receta_lite:
                if not isinstance(m, dict):
                    continue
                nombre = (m.get("nombre_generico") or m.get("medicamento") or "").strip()
                if not nombre:
                    continue
                meds.append({
                    "nombre_generico": nombre,
                    "nombre_comercial": m.get("nombre_comercial") or "",
                    "presentacion": m.get("presentacion") or "",
                    "dosis": m.get("dosis") or "",
                    "via": m.get("via") or "Oral",
                    "frecuencia": m.get("frecuencia") or "",
                    "duracion": m.get("duracion") or "",
                    "indicaciones": m.get("indicaciones") or "",
                })
            if meds and not ana.get("visit_id"):
                cierre = (lite or {}).get("cierre") or {}
                return {
                    "visit_id": v.get("id"),
                    "protocol_traditional": _json.dumps({"medicamentos": meds, "estudios": []}, ensure_ascii=False),
                    "protocol_functional": None,
                    "protocol_longevity": None,
                    "doctor_traditional": cierre.get("plan") or "",
                    "doctor_functional": None,
                    "updated_at": v.get("visit_date") or v.get("created_at"),
                }
            break
    return ana


# ── Archivos continuos del expediente (estudios, labs, fotos Antes/Después sin visita) ──

def _extract_document_text(raw_bytes: bytes, filename: str, content_type: str) -> str:
    """Extrae texto legible de un PDF o archivo de texto para que la IA lo conozca."""
    ext = (filename or "").lower().rsplit(".", 1)[-1] if "." in (filename or "") else ""
    if ext in ("txt", "csv", "md"):
        try:
            return raw_bytes.decode("utf-8", errors="ignore")[:8000]
        except Exception:
            return ""
    if ext == "pdf" or "pdf" in (content_type or "").lower():
        import io
        for mod_name in ("pypdf", "PyPDF2"):
            try:
                mod = __import__(mod_name)
                reader = mod.PdfReader(io.BytesIO(raw_bytes))
                pages = [p.extract_text() or "" for p in reader.pages[:15]]
                txt = "\n".join(pages).strip()
                if txt:
                    return txt[:8000]
            except Exception:
                pass
    return ""


@router.get("/{patient_id}/files")
async def list_patient_files(patient_id: str, authorization: Optional[str] = Header(None)):
    """Lista los archivos, estudios, laboratorios y fotos (Antes/Después) del expediente continuo."""
    from auth import get_actor
    from access import require
    actor = get_actor(authorization)
    require(actor, "doctor", "nurse", "receptionist")
    p = get_patient(patient_id)
    if not p or not patient_belongs(actor, p):
        raise HTTPException(404, "Paciente no encontrado")
    fi = p.get("func_intake") if isinstance(p.get("func_intake"), dict) else {}
    files = fi.get("patient_files") if isinstance(fi.get("patient_files"), list) else []
    ai_summary = fi.get("ai_summary") if isinstance(fi.get("ai_summary"), dict) else None
    return {"patient_id": patient_id, "files": files, "ai_summary": ai_summary}


@router.post("/{patient_id}/files")
async def upload_patient_file(
    patient_id: str,
    file: UploadFile = File(...),
    category: str = Form("estudio"),          # laboratorio | estudio | foto_clinica | documento
    stage: str = Form("general"),             # antes | despues | seguimiento | general
    title: str = Form(""),
    notes: str = Form(""),
    taken_at: str = Form(""),
    visit_id: str = Form(""),
    authorization: Optional[str] = Header(None),
):
    """Sube un estudio, resultado de laboratorio o fotografía clínica (ej. Antes / Después)
    directamente a la ficha del paciente sin necesidad de abrir una consulta."""
    import hashlib
    from uuid import uuid4
    from auth import get_actor
    from access import require
    from services import imagenes
    from db import supabase

    actor = get_actor(authorization)
    require(actor, "doctor", "nurse", "receptionist")
    p = get_patient(patient_id)
    if not p or not patient_belongs(actor, p):
        raise HTTPException(404, "Paciente no encontrado")

    raw_bytes = await file.read(imagenes.MAX_BYTES_ENTRADA + 1)
    if not raw_bytes:
        raise HTTPException(400, "El archivo está vacío")
    if len(raw_bytes) > imagenes.MAX_BYTES_ENTRADA:
        raise HTTPException(400, "El archivo supera el límite de 12 MB")

    fname = file.filename or "archivo"
    ctype = (file.content_type or "").lower()
    ext = fname.lower().rsplit(".", 1)[-1] if "." in fname else ""
    is_image = ctype.startswith("image/") or ext in ("jpg", "jpeg", "png", "webp", "heic")

    url = None
    width, height = None, None
    extracted_text = ""

    if is_image:
        try:
            webp, (width, height) = imagenes.procesar(raw_bytes, "patient_photo")
            path = imagenes.ruta("patient_photo", patient_id, webp)
            url = imagenes.subir(path, webp, content_type="image/webp")
        except Exception as e:
            raise HTTPException(400, f"No se pudo procesar la imagen: {str(e)[:140]}")
    else:
        h = hashlib.sha1(raw_bytes).hexdigest()[:10]
        safe_ext = ext if ext in ("pdf", "txt", "csv", "doc", "docx", "xls", "xlsx") else "bin"
        mime = ctype or ("application/pdf" if safe_ext == "pdf" else "application/octet-stream")
        path = f"expediente/{patient_id}/doc-{h}.{safe_ext}"
        try:
            url = imagenes.subir(path, raw_bytes, content_type=mime)
        except Exception as e:
            raise HTTPException(502, f"No se pudo guardar el archivo: {str(e)[:140]}")
        extracted_text = _extract_document_text(raw_bytes, fname, mime)

    now_iso = datetime.utcnow().isoformat()
    entry = {
        "id": str(uuid4()),
        "title": (title or "").strip() or fname,
        "filename": fname,
        "category": category if category in ("laboratorio", "estudio", "foto_clinica", "documento") else "estudio",
        "stage": stage if stage in ("antes", "despues", "seguimiento", "general") else "general",
        "notes": (notes or "").strip(),
        "taken_at": (taken_at or "").strip() or now_iso[:10],
        "visit_id": (visit_id or "").strip() or None,
        "is_image": is_image,
        "url": url,
        "width": width,
        "height": height,
        "extracted_text": extracted_text[:4000] if extracted_text else "",
        "uploaded_by": actor.get("user_id"),
        "uploaded_by_role": actor.get("role"),
        "created_at": now_iso,
    }

    fi = dict(p.get("func_intake") or {}) if isinstance(p.get("func_intake"), dict) else {}
    files = list(fi.get("patient_files") or []) if isinstance(fi.get("patient_files"), list) else []
    files.insert(0, entry)
    fi["patient_files"] = files
    supabase.table("patients").update({
        "func_intake": fi,
        "updated_at": now_iso,
    }).eq("id", patient_id).execute()

    return {"ok": True, "file": entry, "total": len(files)}


@router.delete("/{patient_id}/files/{file_id}")
async def delete_patient_file(
    patient_id: str,
    file_id: str,
    authorization: Optional[str] = Header(None),
):
    from auth import get_actor
    from access import require
    from services import imagenes
    from db import supabase

    actor = get_actor(authorization)
    require(actor, "doctor")
    p = get_patient(patient_id)
    if not p or not patient_belongs(actor, p):
        raise HTTPException(404, "Paciente no encontrado")

    fi = dict(p.get("func_intake") or {}) if isinstance(p.get("func_intake"), dict) else {}
    files = list(fi.get("patient_files") or []) if isinstance(fi.get("patient_files"), list) else []
    removed = [f for f in files if f.get("id") == file_id]
    new_files = [f for f in files if f.get("id") != file_id]
    fi["patient_files"] = new_files
    supabase.table("patients").update({
        "func_intake": fi,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", patient_id).execute()
    for r in removed:
        if r.get("url"):
            imagenes.quitar(r["url"])
    return {"ok": True, "deleted_id": file_id, "total": len(new_files)}


@router.post("/{patient_id}/ai-summary")
async def generate_patient_ai_summary(
    patient_id: str,
    authorization: Optional[str] = Header(None),
):
    """Genera un resumen clínico integral con IA leyendo datos del paciente, todas las visitas
    (tradicionales, Lite y funcionales), estudios, laboratorios, fotos/notas de evolución y recetas.
    Disponible en Apex Lite (dentro de las 50 consultas/día) y Apex Pro."""
    import os
    import json as _json
    import anthropic
    from auth import get_actor
    from access import require
    from services.plans import require_ai_lite_or_pro
    from services.usage import log_event
    from db import supabase

    actor = get_actor(authorization)
    require(actor, "doctor")
    ent = require_ai_lite_or_pro(actor.get("clinic_id"), "ia_lite")

    p = get_patient(patient_id)
    if not p or not patient_belongs(actor, p):
        raise HTTPException(404, "Paciente no encontrado")

    visits = list_patient_visits(patient_id) or []
    notes = get_patient_notes(patient_id) or []
    analyses = supabase.table("analyses").select(
        "visit_id, diagnosis, summary, protocol_traditional, protocol_functional, protocol_longevity, doctor_traditional, updated_at"
    ).eq("patient_id", patient_id).order("updated_at", desc=True).limit(10).execute().data or []
    fi = p.get("func_intake") if isinstance(p.get("func_intake"), dict) else {}
    pfiles = fi.get("patient_files") if isinstance(fi.get("patient_files"), list) else []

    # Construir contexto clínico estructurado
    ctx_parts = [
        f"PACIENTE: {p.get('full_name')} | Fecha nac.: {p.get('date_of_birth') or p.get('birth_date') or 'N/D'} | Sexo: {p.get('sexo_biologico') or 'N/D'} | Ocupación: {p.get('occupation') or 'N/D'}",
        f"Antecedentes personales: crónicos={p.get('chronic_diseases') or 'ninguno'}, cirugías={p.get('surgeries') or 'ninguna'}, alergias med={p.get('allergies_medications') or 'ninguna'}, alergias alim={p.get('allergies_foods') or 'ninguna'}",
        f"Medicamentos de base: {_json.dumps(p.get('medications') or [], ensure_ascii=False)[:800]}",
    ]

    if visits:
        ctx_parts.append(f"\nHISTORIAL DE VISITAS ({len(visits)} registradas):")
        for v in visits[:12]:
            da = v.get("dynamic_answers") or {}
            lite = da.get("lite") if isinstance(da, dict) else {}
            cierre = (lite or {}).get("cierre") if isinstance(lite, dict) else {}
            receta_lite = (lite or {}).get("receta") if isinstance(lite, dict) else []
            labs_txt = (v.get("labs_extracted") or "")[:1200]
            ctx_parts.append(
                f"- Visita {str(v.get('visit_date') or v.get('created_at') or '')[:10]}: "
                f"Motivo={v.get('chief_complaint') or v.get('motivo_principal') or 'N/D'} | "
                f"PA={v.get('pa_der_sistolica') or '?'}/{v.get('pa_der_diastolica') or '?'} FC={v.get('heart_rate') or v.get('fc') or '?'} "
                f"Peso={v.get('weight') or v.get('peso') or '?'}kg IMC={v.get('imc') or '?'} | "
                f"Dx Lite={cierre.get('diagnostico') or ''} | Plan Lite={cierre.get('plan') or ''} | "
                f"Evolución={cierre.get('evolucion') or v.get('doctor_notes') or ''} | "
                f"Receta Lite={_json.dumps(receta_lite, ensure_ascii=False)[:600]} | "
                f"Labs en visita={labs_txt}"
            )

    if analyses:
        ctx_parts.append(f"\nANÁLISIS Y RECETAS EMITIDAS ({len(analyses)}):")
        for a in analyses[:6]:
            ctx_parts.append(
                f"- Fecha {str(a.get('updated_at') or '')[:10]}: Dx={str(a.get('diagnosis') or '')[:400]} | "
                f"Tradicional={str(a.get('protocol_traditional') or '')[:500]} | "
                f"Funcional={str(a.get('protocol_functional') or '')[:400]}"
            )

    if pfiles:
        ctx_parts.append(f"\nESTUDIOS, LABORATORIOS Y FOTOS EN EXPEDIENTE CONTINUO ({len(pfiles)}):")
        for f in pfiles[:20]:
            ctx_parts.append(
                f"- [{f.get('taken_at') or str(f.get('created_at') or '')[:10]}] ({f.get('category')} / etapa: {f.get('stage')}): "
                f"{f.get('title')} — Notas: {f.get('notes') or 'sin nota'} "
                f"{('| Texto extraído: ' + f.get('extracted_text')[:800]) if f.get('extracted_text') else ''}"
            )

    if notes:
        ctx_parts.append(f"\nNOTAS CLÍNICAS Y DE SEGUIMIENTO ({len(notes)}):")
        for n in notes[:15]:
            ctx_parts.append(f"- [{str(n.get('created_at') or '')[:10]}] ({n.get('author_role')}): {n.get('content')}")

    clinical_context = "\n".join(ctx_parts)

    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    prompt = f"""Eres el asistente médico clínico de cabecera del doctor. Analiza el expediente completo del paciente (incluyendo visitas, recetas, notas, estudios, laboratorios y registro fotográfico Antes/Después) y genera un RESUMEN EJECUTIVO CLÍNICO claro, estructurado y accionable para el médico.

DATOS DEL EXPEDIENTE:
{clinical_context}

Responde en español con formato estructurado usando estas secciones exactas:
1. **Síntesis del Paciente y Contexto Base**: Edad/demografía, antecedentes clave, alergias y medicación habitual.
2. **Evolución por Visitas y Tratamientos**: Qué se ha diagnosticado, qué medicamentos o protocolos se han indicado y cómo ha evolucionado.
3. **Estudios, Laboratorios y Registro Antes/Después**: Hallazgos en laboratorios/estudios subidos (con o sin visita) y seguimiento fotográfico/estético o funcional.
4. **Puntos de Atención y Seguimiento Sugerido**: Pendientes, estudios por revisar o aspectos a vigilar en la siguiente revisión."""

    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1200,
        messages=[{"role": "user", "content": prompt}],
    )
    summary_text = "".join(b.text for b in msg.content if hasattr(b, "text")).strip()
    tokens_in = getattr(msg.usage, "input_tokens", 0)
    tokens_out = getattr(msg.usage, "output_tokens", 0)

    log_event(
        actor["user_id"],
        actor.get("clinic_id"),
        actor["role"],
        "patient.ai_summary",
        "Resumen IA",
        ai_tokens=tokens_in + tokens_out,
        input_tokens=tokens_in,
        output_tokens=tokens_out,
        model="claude-haiku-4-5-20251001",
        meta={"patient_id": patient_id},
    )

    now_iso = datetime.utcnow().isoformat()
    summary_obj = {
        "text": summary_text,
        "generated_at": now_iso,
        "visits_count": len(visits),
        "files_count": len(pfiles),
    }
    fi_updated = dict(fi)
    fi_updated["ai_summary"] = summary_obj
    supabase.table("patients").update({
        "func_intake": fi_updated,
        "updated_at": now_iso,
    }).eq("id", patient_id).execute()

    daily_used = (ent.get("ai_daily_used") or 0) + 1
    daily_limit = ent.get("ai_daily_limit") or 50
    return {
        "ok": True,
        "summary": summary_obj,
        "daily_used": daily_used,
        "daily_limit": daily_limit,
        "daily_remaining": max(0, daily_limit - daily_used),
    }


@router.get("/{patient_id}/last-prescription")
async def last_prescription(patient_id: str, authorization: Optional[str] = Header(None)):
    """VER la última prescripción — solo médico/admin. Recepción puede ENVIARLA, no verla."""
    from auth import get_actor
    from access import require
    require(get_actor(authorization), "doctor")
    p = get_patient(patient_id) or {}
    pres = _last_prescription(patient_id)
    return {
        "patient_name": p.get("full_name"), "patient_email": p.get("email"),
        "prescription": pres, "tiene": bool(pres.get("visit_id")),
    }


@router.post("/{patient_id}/send-prescription")
async def send_prescription(patient_id: str, authorization: Optional[str] = Header(None)):
    """Envía por correo la última prescripción al paciente.

    Usa Resend si RESEND_API_KEY está configurado; si no, devuelve el contenido y un enlace
    mailto para que recepción lo envíe desde su propio correo (degradación segura).
    """
    import os
    p = get_patient(patient_id) or {}
    email = p.get("email")
    if not email:
        raise HTTPException(400, "El paciente no tiene correo registrado")
    pres = _last_prescription(patient_id)
    if not pres.get("visit_id"):
        raise HTTPException(404, "Este paciente aún no tiene una prescripción")

    # Armar un cuerpo LEGIBLE a partir de los protocolos (que se guardan como JSON)
    from routes_analysis import _parse_protocol
    lineas = [f"Hola {p.get('full_name', '')},", "", "Esta es tu prescripción:", ""]
    n = 0
    for campo in ("protocol_traditional", "protocol_functional", "protocol_longevity"):
        meds, _est = _parse_protocol(pres.get(campo))
        for m in meds:
            n += 1
            nombre = m.get("nombre_generico", "")
            if m.get("nombre_comercial"):
                nombre += f" ({m['nombre_comercial']})"
            detalle = " · ".join(filter(None, [m.get("presentacion"), m.get("dosis"),
                                              m.get("via"), m.get("frecuencia")]))
            linea = f"{n}. {nombre} — {detalle}"
            if m.get("duracion"):
                linea += f" — {m['duracion']}"
            lineas.append(linea)
    if n == 0:
        lineas.append("(Sin medicamentos registrados)")
    lineas += ["", "Cualquier duda, contáctanos.", "", p.get("full_name") and "" or ""]
    cuerpo = "\n".join([l for l in lineas if l is not None])
    asunto = f"Tu prescripción — {p.get('full_name', '')}".strip()

    api_key = os.getenv("RESEND_API_KEY")
    remitente = os.getenv("PRESCRIPTION_FROM", "clinica@apex.mx")
    if api_key:
        try:
            import urllib.request, json as _json
            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=_json.dumps({"from": remitente, "to": [email],
                                  "subject": asunto, "text": cuerpo}).encode(),
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            )
            urllib.request.urlopen(req, timeout=20)
            return {"ok": True, "enviado": True, "via": "resend", "to": email}
        except HTTPException:
            raise
        except Exception as e:
            print(f"[WARN] Resend falló: {e}")

    # Sin proveedor de correo: el mailto expone el contenido, así que SOLO se devuelve a
    # médico/admin. Recepción puede enviar (con Resend en producción) pero nunca ver el reporte.
    from auth import get_actor
    actor = get_actor(authorization)
    if actor["role"] != "doctor":
        return {"ok": False, "enviado": False, "via": "sin_correo",
                "nota": "El envío automático requiere el proveedor de correo (aún no configurado). "
                        "Recepción no puede ver el contenido de la prescripción."}
    import urllib.parse
    mailto = f"mailto:{email}?subject={urllib.parse.quote(asunto)}&body={urllib.parse.quote(cuerpo)}"
    return {"ok": True, "enviado": False, "via": "mailto", "to": email,
            "mailto": mailto, "asunto": asunto, "cuerpo": cuerpo,
            "nota": "No hay proveedor de correo configurado; usa el enlace para enviarlo desde tu correo."}


# ── Doctor profile ──────────────────────────────────────

doctor_profile_router = APIRouter(prefix="/doctor", tags=["doctor"])

@doctor_profile_router.get("/profile")
async def get_profile(authorization: Optional[str] = Header(None)):
    doctor_id = get_doctor_id_from_token(authorization)
    profile = get_doctor_profile(doctor_id) or {}
    return profile

# Campos que el médico puede editar de su propio perfil. NUNCA role, clinic_id, permissions,
# parent_doctor_id ni is_local_admin: antes cualquier clave del cuerpo se guardaba tal cual.
PERFIL_EDITABLE = {"display_name", "phone", "clinic_name", "ai_name_preference", "letterhead"}


@doctor_profile_router.put("/profile")
async def save_profile(data: dict, authorization: Optional[str] = Header(None)):
    doctor_id = get_doctor_id_from_token(authorization)
    # Las imágenes (foto y logos) NO se guardan por aquí: se suben con POST /doctor/images.
    limpio = {k: v for k, v in (data or {}).items() if k in PERFIL_EDITABLE}
    result = upsert_doctor_profile(doctor_id, limpio)
    return result or {"ok": True}


# ── Imágenes de marca: foto del doctor y logotipos del consultorio ───────────

@doctor_profile_router.post("/images")
async def subir_imagen(
    kind: str = Form(...),
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    """Recibe una imagen, la reduce y la convierte a WebP, la guarda en Storage y deja la URL
    en el perfil (photo) o en el consultorio (logo, logo_dark)."""
    from auth import get_actor
    from services import imagenes
    from db import supabase
    actor = get_actor(authorization)
    if kind not in imagenes.PERFILES:
        raise HTTPException(400, "Tipo de imagen no válido.")
    es_logo = kind in imagenes.LOGOS
    if es_logo:
        if actor["role"] != "doctor":
            raise HTTPException(403, "Solo el médico puede cambiar el logotipo del consultorio.")
        if not actor.get("clinic_id"):
            raise HTTPException(400, "Tu cuenta no tiene un consultorio asignado.")

    data = await file.read(imagenes.MAX_BYTES_ENTRADA + 1)
    try:
        webp, (w, h) = imagenes.procesar(data, kind)
    except imagenes.ImagenInvalida as e:
        raise HTTPException(400, str(e))

    dueno = actor["clinic_id"] if es_logo else actor["user_id"]
    path = imagenes.ruta(kind, dueno, webp)

    # Valor anterior (para borrarlo del bucket después) y dónde se guarda la referencia
    if kind == "photo":
        previo = (supabase.table("doctor_profiles").select("photo_url").eq("id", actor["user_id"])
                  .limit(1).execute().data or [{}])[0].get("photo_url")
    elif kind == "logo":
        previo = (supabase.table("clinics").select("logo_url").eq("id", actor["clinic_id"])
                  .limit(1).execute().data or [{}])[0].get("logo_url")
    else:
        try:
            marca = (supabase.table("clinics").select("brand").eq("id", actor["clinic_id"])
                     .limit(1).execute().data or [{}])[0].get("brand") or {}
        except Exception:
            raise HTTPException(409, "Falta aplicar la migración de marca (columna clinics.brand) "
                                     "para guardar el logotipo de fondo oscuro.")
        previo = marca.get("logo_white_url")

    try:
        url = imagenes.subir(path, webp)
    except Exception as e:
        raise HTTPException(502, f"No se pudo guardar la imagen: {str(e)[:120]}")

    if kind == "photo":
        supabase.table("doctor_profiles").update({"photo_url": url}).eq("id", actor["user_id"]).execute()
    elif kind == "logo":
        supabase.table("clinics").update({"logo_url": url}).eq("id", actor["clinic_id"]).execute()
        supabase.table("doctor_profiles").update({"clinic_logo_url": url}).eq("id", actor["user_id"]).execute()
    else:
        marca["logo_white_url"] = url
        supabase.table("clinics").update({"brand": marca}).eq("id", actor["clinic_id"]).execute()

    if previo and previo != url:
        imagenes.quitar(previo)
    return {"url": url, "kind": kind, "bytes": len(webp), "ancho": w, "alto": h}


@doctor_profile_router.delete("/images/{kind}")
async def quitar_imagen(kind: str, authorization: Optional[str] = Header(None)):
    """Quita la foto o el logotipo (vuelve a mostrarse el valor por defecto)."""
    from auth import get_actor
    from services import imagenes
    from db import supabase
    actor = get_actor(authorization)
    if kind not in imagenes.PERFILES:
        raise HTTPException(400, "Tipo de imagen no válido.")
    if kind in imagenes.LOGOS and actor["role"] != "doctor":
        raise HTTPException(403, "Solo el médico puede cambiar el logotipo del consultorio.")
    if kind == "photo":
        previo = (supabase.table("doctor_profiles").select("photo_url").eq("id", actor["user_id"])
                  .limit(1).execute().data or [{}])[0].get("photo_url")
        supabase.table("doctor_profiles").update({"photo_url": None}).eq("id", actor["user_id"]).execute()
    elif kind == "logo":
        previo = (supabase.table("clinics").select("logo_url").eq("id", actor["clinic_id"])
                  .limit(1).execute().data or [{}])[0].get("logo_url")
        supabase.table("clinics").update({"logo_url": None}).eq("id", actor["clinic_id"]).execute()
        supabase.table("doctor_profiles").update({"clinic_logo_url": None}).eq("id", actor["user_id"]).execute()
    else:
        try:
            marca = (supabase.table("clinics").select("brand").eq("id", actor["clinic_id"])
                     .limit(1).execute().data or [{}])[0].get("brand") or {}
        except Exception:
            return {"ok": True}
        previo = marca.pop("logo_white_url", None)
        supabase.table("clinics").update({"brand": marca}).eq("id", actor["clinic_id"]).execute()
    imagenes.quitar(previo)
    return {"ok": True}
