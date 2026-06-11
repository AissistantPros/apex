"""
Chat general con IA — home de APEX
- Personalizado con perfil del doctor
- Tool use: búsqueda web via DuckDuckGo (sin API key)
- Sin memoria persistente (el historial viaja en cada request)
- Solo texto de salida (el médico puede enviar imágenes)
"""

from fastapi import APIRouter, Header
from pydantic import BaseModel
from typing import Optional, List, Union
from anthropic import Anthropic
from db import get_doctor_profile
import json, re

router = APIRouter(prefix="/chat", tags=["chat"])
client = Anthropic()

FALLBACK_DOCTOR_ID = "1c330e4b-c0e8-424b-8b06-0700e9e3dcc5"
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

def build_system_prompt(profile: dict) -> str:
    name    = profile.get("display_name") or "Doctor"
    clinic  = profile.get("clinic_name") or ""
    spec    = profile.get("specialty")   or ""
    city    = profile.get("city")        or ""
    country = profile.get("country")     or "México"
    bio     = profile.get("bio")         or ""

    lines = [
        "Eres APEX AI, el asistente de inteligencia artificial integrado en APEX, una plataforma de inteligencia clínica para médicos.",
        "",
        "## CONTEXTO",
        f"- Médico: {name}",
    ]
    if clinic:  lines.append(f"- Clínica/Consultorio: {clinic}")
    if spec:    lines.append(f"- Especialidad: {spec}")
    loc = ", ".join(filter(None, [city, country]))
    if loc:     lines.append(f"- Ubicación: {loc}")
    if bio:     lines.append(f"- Acerca de su práctica: {bio}")

    lines += [
        "",
        "## INSTRUCCIONES",
        f"- Asistes a {name} con consultas médicas, científicas, de investigación y cualquier tema de interés.",
        "- Responde en español, a menos que el médico escriba en otro idioma.",
        "- SOLO devuelves texto. No generes imágenes, código ejecutable, aplicaciones ni archivos adjuntos.",
        "- Puedes analizar imágenes que el médico te envíe (radiografías, fotos clínicas, estudios, etc.).",
        "- Tienes acceso a búsqueda web — úsala cuando necesites información actualizada, estudios recientes o datos que puedan haber cambiado.",
        "- Esta conversación NO tiene memoria persistente. Se borra al cerrar la sesión. No guardes información entre sesiones.",
        "- Para análisis de pacientes específicos registrados en APEX, el médico debe usar el módulo de Análisis Clínico.",
        "- Sé conciso, claro y directo. El médico es el experto — lo apoyas, no lo instruyes.",
        "- Si algo está fuera de tu conocimiento actual o puede estar desactualizado, dilo explícitamente.",
    ]
    return "\n".join(lines)

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
    except Exception as e:
        return f"Error en búsqueda: {str(e)}"

# ─── Endpoint principal ───────────────────────────────────────────────────────

@router.post("")
async def chat_endpoint(req: ChatRequest, authorization: Optional[str] = Header(None)):
    profile = get_doctor_profile(FALLBACK_DOCTOR_ID) or {}
    system  = build_system_prompt(profile)

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

    # Agentic loop (máx 5 iteraciones para tool_use)
    for _ in range(5):
        response = client.messages.create(
            model=MODEL,
            max_tokens=2048,
            system=system,
            tools=[WEB_SEARCH_TOOL],
            messages=messages,
        )

        if response.stop_reason == "end_turn":
            text = "".join(
                block.text for block in response.content if hasattr(block, "text")
            )
            return {"response": text}

        if response.stop_reason == "tool_use":
            # Añadir respuesta del asistente con tool_use al historial
            messages.append({"role": "assistant", "content": response.content})
            # Ejecutar herramientas y devolver resultados
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    if block.name == "web_search":
                        result = await do_web_search(block.input.get("query", ""))
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

    return {"response": "No se pudo completar la consulta. Intenta de nuevo."}
