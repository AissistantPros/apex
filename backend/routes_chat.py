"""
Chat general con IA — home de APEX
- Personalizado con perfil del doctor
- Tool use: búsqueda web via DuckDuckGo (sin API key)
- Sin memoria persistente (el historial viaja en cada request)
- Solo texto de salida (el médico puede enviar imágenes)
"""

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Union
from anthropic import Anthropic
from db import get_doctor_profile
from auth import get_actor
import json, re

router = APIRouter(prefix="/chat", tags=["chat"])
client = Anthropic()

MODEL = "claude-sonnet-4-5"

# ─── Modelos ──────────────────────────────────────────────────────────────────

class ImageContent(BaseModel):
    type: str = "image"
    image_data: str          # base64 con prefix "data:image/jpeg;base64,..."
    image_type: str = "image/jpeg"

class TextContent(BaseModel):
    type: str = "text"
    text: str

class ChatMessage(BaseModel):
    role: str                              # "user" | "assistant"
    content: Union[str, List[dict]]        # texto plano o lista de partes

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

# ─── System prompt personalizado ─────────────────────────────────────────────

def build_system_prompt(profile: dict, clinic_brand: Optional[dict] = None, daily_info: Optional[dict] = None) -> str:
    lh = profile.get("letterhead") if isinstance(profile.get("letterhead"), dict) else {}
    cb = clinic_brand if isinstance(clinic_brand, dict) else {}
    brand_raw = cb.get("raw") if isinstance(cb.get("raw"), dict) else {}
    doc_brand = brand_raw.get("doctor") if isinstance(brand_raw.get("doctor"), dict) else {}
    contacto = brand_raw.get("contacto") if isinstance(brand_raw.get("contacto"), dict) else {}

    name    = profile.get("display_name") or doc_brand.get("nombre") or "Doctor"
    pref    = profile.get("ai_name_preference") or ""
    clinic  = profile.get("clinic_name") or cb.get("name") or ""
    spec    = profile.get("specialty") or lh.get("specialty") or doc_brand.get("especialidad") or ""
    subspec = lh.get("subspecialty") or doc_brand.get("subespecialidad") or ""
    ced_p   = lh.get("cedula_profesional") or doc_brand.get("cedula_profesional") or ""
    ced_e   = lh.get("cedula_especialidad") or doc_brand.get("cedula_especialidad") or ""
    univ    = lh.get("universidad") or doc_brand.get("universidad") or ""
    inst_e  = doc_brand.get("institucion_especialidad") or ""
    addr    = lh.get("clinic_address") or contacto.get("direccion") or cb.get("address") or ""
    city    = profile.get("city") or lh.get("city") or contacto.get("ciudad") or ""
    country = profile.get("country") or "México"
    phone   = profile.get("phone") or lh.get("clinic_phone") or contacto.get("tel_citas") or cb.get("phone") or ""
    horario = contacto.get("horario") or ""
    web     = lh.get("website") or contacto.get("web") or cb.get("website") or ""
    tagline = cb.get("tagline") or brand_raw.get("tagline") or ""
    bio     = profile.get("bio") or ""

    lines = [
        "Eres APEX AI, el agente médico de inteligencia artificial integrado en APEX.",
        "Eres experto en Medicina de Longevidad, Péptidos terapéuticos, Suplementación clínica avanzada, Medicina Funcional e Integrativa, así como en la especialidad del médico titular.",
        "",
        "## FICHA DEL MÉDICO Y SU CONSULTORIO",
        f"- Médico titular: {name}" + (f" (dirígete a él/ella como: {pref})" if pref else ""),
    ]
    if spec:    lines.append(f"- Especialidad: {spec}")
    if subspec: lines.append(f"- Subespecialidad / Enfoque: {subspec}")
    if ced_p:   lines.append(f"- Cédula profesional: {ced_p}" + (f" | Cédula especialidad: {ced_e}" if ced_e else ""))
    if univ:    lines.append(f"- Formación: {univ}" + (f" / {inst_e}" if inst_e else ""))
    if clinic:  lines.append(f"- Consultorio / Clínica: {clinic}")
    if tagline: lines.append(f"- Lema / Enfoque del consultorio: {tagline}")
    if addr:    lines.append(f"- Dirección del consultorio: {addr}")
    loc = ", ".join(filter(None, [city, country]))
    if loc:     lines.append(f"- Ciudad / País: {loc}")
    if phone:   lines.append(f"- Teléfono de contacto / citas: {phone}")
    if horario: lines.append(f"- Horario de atención: {horario}")
    if web:     lines.append(f"- Sitio web: {web}")
    if bio:     lines.append(f"- Acerca de su práctica: {bio}")

    if daily_info and daily_info.get("daily_limit"):
        lines.append(f"- Plan activo: Consultas de IA hoy {daily_info.get('daily_used', 0)}/{daily_info.get('daily_limit', 50)}")

    lines += [
        "",
        "## CAPACIDADES Y REGLAS",
        f"- Conoces perfectamente a {name}, su especialidad ({spec or 'medicina clínica'}), dónde está su consultorio y su perfil profesional; personaliza tus respuestas acorde a su práctica.",
        "- Dominas a profundidad: Medicina de Longevidad (biomarcadores de envejecimiento, senolíticos, NAD+, rapamicina, metformina, hormesis, sueño, VO2max), Péptidos (BPC-157, TB-500, CJC-1295, Ipamorelin, GHK-Cu, Semax, Selank, Thymosin Alpha-1, GLP-1/GIP, dosificación, reconstitución, contraindicaciones), Suplementos y nutracéuticos basados en evidencia, y Medicina Funcional (eje intestino-cerebro, microbiota, tiroides, hormonas, inflamación crónica, detoxificación hepática, mitocondria).",
        "- TIENES ACCESO DIRECTO A LA BASE DE DATOS DEL CONSULTORIO mediante herramientas (`buscar_pacientes`, `ver_expediente_paciente`, `estadisticas_consultorio`). Cuando el médico pregunte por sus pacientes, cuántos tiene, el historial/estudios/visitas de un paciente o métricas de su consultorio, USA las herramientas para darle datos reales y exactos.",
        "- Tienes acceso a búsqueda web (`web_search`) — úsala para estudios recientes, interacciones, precios o guías actualizadas.",
        "- BIBLIOTECA: cuando tu contexto incluya un bloque de 'BIBLIOTECA CLÍNICA DEL MÉDICO', esos fragmentos son de sus libros — úsalos para fundamentar tu respuesta y cítalos.",
        "- Responde en español, con rigor clínico, conciso, claro y directo de colega a colega.",
    ]
    return "\n".join(lines)


# ─── Herramientas de Base de Datos del Consultorio y Web ─────────────────────

CLINIC_DB_TOOLS = [
    {
        "name": "buscar_pacientes",
        "description": (
            "Busca o lista pacientes registrados en la base de datos del consultorio del médico. "
            "Úsala cuando el doctor pregunte por un paciente por nombre/apellido, o pida listar sus pacientes recientes."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Nombre, apellido o término a buscar (vacío para ver los pacientes más recientes)."
                },
                "limit": {
                    "type": "integer",
                    "description": "Máximo de pacientes a devolver (default 15)."
                }
            }
        }
    },
    {
        "name": "ver_expediente_paciente",
        "description": (
            "Consulta la ficha clínica completa de un paciente específico (por ID o por nombre): "
            "datos personales, antecedentes, alergias, medicamentos, visitas, recetas, notas, estudios y laboratorios subidos."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "patient_id_or_name": {
                    "type": "string",
                    "description": "ID del paciente (ej. JUPE-150580-123456) o nombre completo/parcial del paciente."
                }
            },
            "required": ["patient_id_or_name"]
        }
    },
    {
        "name": "estadisticas_consultorio",
        "description": (
            "Obtiene estadísticas generales y financieras de la base de datos del consultorio: "
            "total de pacientes, visitas recientes, citas agendadas, ingresos y gastos del mes actual e histórico."
        ),
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
]


def _run_clinic_tool(name: str, tool_input: dict, actor: dict) -> str:
    """Ejecuta herramientas de consulta sobre la base de datos de la clínica del médico."""
    from db import supabase, list_patients, list_patient_visits, get_patient_notes
    from tenant import patient_belongs
    clinic = actor.get("clinic_id") or actor.get("doctor_id")
    doctor_id = actor.get("doctor_id")

    try:
        if name == "buscar_pacientes":
            q = (tool_input.get("query") or "").strip().lower()
            lim = min(int(tool_input.get("limit") or 15), 40)
            pats = list_patients(limit=100, clinic=clinic) or []
            pats = [p for p in pats if patient_belongs(actor, p)]
            if q:
                pats = [
                    p for p in pats
                    if q in (p.get("full_name") or "").lower()
                    or q in (p.get("first_name") or "").lower()
                    or q in (p.get("last_name") or "").lower()
                    or q in (p.get("id") or "").lower()
                ]
            seleccion = pats[:lim]
            if not seleccion:
                return f"No se encontraron pacientes que coincidan con '{q}'."
            rows = []
            for p in seleccion:
                rows.append({
                    "id": p.get("id"),
                    "nombre": p.get("full_name"),
                    "fecha_nacimiento": p.get("date_of_birth") or p.get("birth_date"),
                    "sexo": p.get("sexo_biologico"),
                    "ciudad": p.get("city"),
                    "ocupacion": p.get("occupation"),
                    "tipo_atencion": p.get("care_type"),
                    "alergias_med": p.get("allergies_medications"),
                    "enfermedades_cronicas": p.get("chronic_diseases"),
                    "registrado": str(p.get("created_at") or "")[:10],
                })
            return json.dumps({"total_en_consultorio": len(pats), "mostrando": len(rows), "pacientes": rows}, ensure_ascii=False)

        if name == "ver_expediente_paciente":
            target = (tool_input.get("patient_id_or_name") or "").strip()
            pats = list_patients(limit=150, clinic=clinic) or []
            pats = [p for p in pats if patient_belongs(actor, p)]
            match = None
            for p in pats:
                if p.get("id") == target or target.lower() == (p.get("full_name") or "").lower():
                    match = p
                    break
            if not match:
                for p in pats:
                    if target.lower() in (p.get("full_name") or "").lower():
                        match = p
                        break
            if not match:
                return f"No se encontró ningún paciente con identificador o nombre '{target}'."

            pid = match["id"]
            visits = list_patient_visits(pid) or []
            notes = get_patient_notes(pid) or []
            analyses = supabase.table("analyses").select(
                "visit_id, diagnosis, summary, protocol_traditional, protocol_functional, protocol_longevity, updated_at"
            ).eq("patient_id", pid).order("updated_at", desc=True).limit(5).execute().data or []
            fi = match.get("func_intake") if isinstance(match.get("func_intake"), dict) else {}
            files = fi.get("patient_files") if isinstance(fi.get("patient_files"), list) else []

            resumen_visitas = []
            for v in visits[:8]:
                da = v.get("dynamic_answers") or {}
                lite = da.get("lite") if isinstance(da, dict) else {}
                cierre = (lite or {}).get("cierre") if isinstance(lite, dict) else {}
                receta_lite = (lite or {}).get("receta") if isinstance(lite, dict) else []
                resumen_visitas.append({
                    "fecha": str(v.get("visit_date") or v.get("created_at") or "")[:10],
                    "motivo": v.get("chief_complaint") or v.get("motivo_principal"),
                    "pa": f"{v.get('pa_der_sistolica') or ''}/{v.get('pa_der_diastolica') or ''}",
                    "fc": v.get("heart_rate") or v.get("fc"),
                    "peso_kg": v.get("weight") or v.get("peso"),
                    "imc": v.get("imc"),
                    "diagnostico": cierre.get("diagnostico"),
                    "plan": cierre.get("plan"),
                    "receta": receta_lite,
                    "labs_extraidos": (v.get("labs_extracted") or "")[:1000],
                })

            resumen_archivos = [
                {
                    "fecha": f.get("taken_at") or str(f.get("created_at") or "")[:10],
                    "categoria": f.get("category"),
                    "etapa": f.get("stage"),
                    "titulo": f.get("title"),
                    "notas": f.get("notes"),
                    "texto_extraido": (f.get("extracted_text") or "")[:800],
                }
                for f in files[:12]
            ]

            return json.dumps({
                "paciente": {
                    "id": pid,
                    "nombre": match.get("full_name"),
                    "fecha_nacimiento": match.get("date_of_birth") or match.get("birth_date"),
                    "sexo": match.get("sexo_biologico"),
                    "ocupacion": match.get("occupation"),
                    "ciudad": match.get("city"),
                    "enfermedades_cronicas": match.get("chronic_diseases"),
                    "cirugias": match.get("surgeries"),
                    "alergias_medicamentos": match.get("allergies_medications"),
                    "alergias_alimentos": match.get("allergies_foods"),
                    "medicamentos_base": match.get("medications"),
                },
                "visitas": resumen_visitas,
                "analisis_y_recetas": analyses,
                "archivos_y_estudios": resumen_archivos,
                "notas": [{"fecha": str(n.get("created_at") or "")[:10], "autor": n.get("author_role"), "contenido": n.get("content")} for n in notes[:10]],
            }, ensure_ascii=False)

        if name == "estadisticas_consultorio":
            pats = list_patients(limit=500, clinic=clinic) or []
            pats = [p for p in pats if patient_belongs(actor, p)]
            sales = supabase.table("sales").select("total, estado, metodo_pago, created_at")\
                .eq("doctor_id", doctor_id).order("created_at", desc=True).limit(200).execute().data or []
            expenses = supabase.table("expenses").select("monto, categoria, concepto, fecha")\
                .eq("doctor_id", doctor_id).order("fecha", desc=True).limit(200).execute().data or []
            cobradas = [s for s in sales if s.get("estado") == "cobrada"]
            pendientes = [s for s in sales if s.get("estado") == "pendiente"]
            return json.dumps({
                "total_pacientes": len(pats),
                "ingresos_cobrados_recientes": sum(float(s.get("total") or 0) for s in cobradas),
                "cobros_pendientes_mostrador": len(pendientes),
                "monto_pendiente_mostrador": sum(float(s.get("total") or 0) for s in pendientes),
                "gastos_registrados_recientes": sum(float(e.get("monto") or 0) for e in expenses),
            }, ensure_ascii=False)
    except Exception as e:
        return f"Error al consultar la base del consultorio: {str(e)[:180]}"
    return "Herramienta no reconocida."

# ─── Tool: búsqueda web ───────────────────────────────────────────────────────

WEB_SEARCH_TOOL = {
    "name": "web_search",
    "description": (
        "Busca información actualizada en internet. "
        "Usa esta herramienta cuando el médico pregunte sobre: noticias médicas recientes, "
        "estudios publicados recientemente, precios o disponibilidad de medicamentos, "
        "guías clínicas actualizadas, eventos actuales o cualquier dato que pueda haber cambiado."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "La consulta de búsqueda. Escríbela en español o inglés según la fuente esperada."
            }
        },
        "required": ["query"]
    }
}

async def do_web_search(query: str) -> str:
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=6))
        if not results:
            return "No se encontraron resultados para esa búsqueda."
        parts = []
        for r in results:
            title = r.get("title", "")
            body  = r.get("body", "")
            href  = r.get("href", "")
            parts.append(f"**{title}**\n{body}\nFuente: {href}")
        return "\n\n---\n\n".join(parts)
    except ImportError:
        return "Búsqueda web no disponible en este entorno."
    except HTTPException:
        raise
    except Exception as e:
        return f"Error en búsqueda: {str(e)}"

# ─── Endpoint principal ───────────────────────────────────────────────────────

def _ultimo_texto_usuario(mensajes) -> str:
    """El texto del último mensaje del usuario, para consultar la biblioteca."""
    for msg in reversed(mensajes):
        if msg.role != "user":
            continue
        if isinstance(msg.content, str):
            return msg.content
        textos = [p.get("text", "") for p in msg.content
                  if isinstance(p, dict) and p.get("type") == "text"]
        if textos:
            return " ".join(textos)
    return ""


@router.get("/status")
async def chat_status(authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)
    from services.plans import get_entitlements
    from services.branding import get_clinic_branding
    ent = get_entitlements(actor.get("clinic_id"), include_daily_usage=True)
    profile = get_doctor_profile(actor["doctor_id"]) or {}
    cb = get_clinic_branding(actor.get("clinic_id")) or {}
    brand_raw = cb.get("raw") if isinstance(cb.get("raw"), dict) else {}
    doc_brand = brand_raw.get("doctor") if isinstance(brand_raw.get("doctor"), dict) else {}
    lh = profile.get("letterhead") if isinstance(profile.get("letterhead"), dict) else {}
    return {
        "doctor_name": profile.get("display_name") or doc_brand.get("nombre") or "Doctor",
        "specialty": profile.get("specialty") or lh.get("specialty") or doc_brand.get("especialidad") or "",
        "clinic_name": profile.get("clinic_name") or cb.get("name") or "",
        "plan": ent.get("plan"),
        "daily_used": ent.get("ai_daily_used") or 0,
        "daily_limit": ent.get("ai_daily_limit") or 50,
        "daily_remaining": ent.get("ai_daily_remaining") if ent.get("ai_daily_limit") else 50,
    }


@router.post("")
async def chat_endpoint(req: ChatRequest, authorization: Optional[str] = Header(None)):
    actor = get_actor(authorization)          # exige sesión válida (401 si no)
    from services.plans import require_ai_lite_or_pro, consume_credits
    from services.branding import get_clinic_branding
    ent = require_ai_lite_or_pro(actor.get("clinic_id"), "ia_lite")   # Lite (50/día) o Pro
    _tok = {"n": 0}

    def _cobrar():
        try:
            consume_credits(actor.get("clinic_id"), _tok["n"])
            from services.usage import log_event
            log_event(actor["user_id"], actor.get("clinic_id"), actor["role"], "ia.chat", "Chat IA", ai_tokens=_tok["n"])
        except Exception:
            pass

    profile = get_doctor_profile(actor["doctor_id"]) or {}
    cb = {}
    try:
        cb = get_clinic_branding(actor.get("clinic_id")) or {}
    except Exception:
        pass
    daily_used_now = (ent.get("ai_daily_used") or 0)
    daily_limit_now = (ent.get("ai_daily_limit") or 50)
    system = build_system_prompt(profile, clinic_brand=cb, daily_info={
        "daily_used": daily_used_now,
        "daily_limit": daily_limit_now,
    })

    # Fundamentar la respuesta en la biblioteca del médico (si hay algo relevante).
    # area=None → busca en toda la biblioteca, porque el chat no tiene una voz fija.
    try:
        from services.knowledge_base import consultar_biblioteca
        kb = consultar_biblioteca(_ultimo_texto_usuario(req.messages), area=None, match_count=6)
        if kb:
            system += "\n\n" + kb
    except HTTPException:
        raise
    except Exception as e:
        print(f"[WARN] biblioteca en chat no disponible: {e}")

    # Construir mensajes en formato Anthropic
    messages = []
    for msg in req.messages:
        if isinstance(msg.content, str):
            messages.append({"role": msg.role, "content": msg.content})
        else:
            # Lista de partes (texto + imágenes)
            content = []
            for part in msg.content:
                if isinstance(part, dict):
                    ptype = part.get("type")
                    if ptype == "text":
                        content.append({"type": "text", "text": part.get("text", "")})
                    elif ptype == "image":
                        raw = part.get("image_data", "")
                        # Separar "data:image/jpeg;base64,XXXX" → media_type + data
                        if raw.startswith("data:"):
                            header, b64 = raw.split(",", 1)
                            media_type  = header.split(":")[1].split(";")[0]
                        else:
                            b64, media_type = raw, part.get("image_type", "image/jpeg")
                        content.append({
                            "type": "image",
                            "source": {"type": "base64", "media_type": media_type, "data": b64}
                        })
            messages.append({"role": msg.role, "content": content})

    all_tools = [WEB_SEARCH_TOOL] + CLINIC_DB_TOOLS

    # Agentic loop (máx 5 iteraciones para tool_use)
    for _ in range(5):
        response = client.messages.create(
            model=MODEL,
            max_tokens=2048,
            system=system,
            tools=all_tools,
            messages=messages,
        )
        try:
            _tok["n"] += (response.usage.input_tokens or 0) + (response.usage.output_tokens or 0)
        except Exception:
            pass

        if response.stop_reason == "end_turn":
            text = "".join(
                block.text for block in response.content if hasattr(block, "text")
            )
            _cobrar()
            new_used = daily_used_now + 1
            return {
                "response": text,
                "daily_used": new_used,
                "daily_limit": daily_limit_now,
                "daily_remaining": max(0, daily_limit_now - new_used),
            }

        if response.stop_reason == "tool_use":
            # Añadir respuesta del asistente con tool_use al historial
            messages.append({"role": "assistant", "content": response.content})
            # Ejecutar herramientas y devolver resultados
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    if block.name == "web_search":
                        result = await do_web_search(block.input.get("query", ""))
                    elif block.name in ("buscar_pacientes", "ver_expediente_paciente", "estadisticas_consultorio"):
                        result = _run_clinic_tool(block.name, block.input or {}, actor)
                    else:
                        result = "Herramienta desconocida."
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    })
            messages.append({"role": "user", "content": tool_results})
        else:
            break

    _cobrar()
    new_used = daily_used_now + 1
    return {
        "response": "No se pudo completar la consulta. Intenta de nuevo.",
        "daily_used": new_used,
        "daily_limit": daily_limit_now,
        "daily_remaining": max(0, daily_limit_now - new_used),
    }
