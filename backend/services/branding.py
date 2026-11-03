"""
Marca por consultorio (personalización por cliente).

Cada clínica guarda en `clinics.brand` (jsonb) su identidad: colores, tipografías y los
datos que salen en sus documentos (receta, reportes). `clinics.logo_url` guarda el logo.

Forma de `brand` (todo opcional; el consumidor debe tolerar llaves ausentes):
{
  "version": 1,
  "colors": {"primary", "accent", "accent_text", "dark", "secondary", "surface", "muted",
             "success", "white"},                      # hex; los roles son fijos
  "palette": [{"nombre", "hex", "uso"}],               # paleta completa con su uso
  "fonts": {"heading", "body", "google_css"},          # familias y URL de Google Fonts
  "tagline": "Cardiólogo Intervencionista",
  "doctor": {"nombre", "titulo", "cedulas": [{"numero", "especialidad", ...}]},
  "contacto": {"tel_citas", "urgencias", "web", "direccion"},
  "logo_white_url": "data:image/png;base64,...",       # versión para fondos oscuros
  "avatar_url": "data:image/png;base64,..."            # símbolo cuadrado
}
"""
from typing import Optional

from db import supabase

# Roles de color que la interfaz y los documentos pueden pedir.
COLOR_ROLES = ("primary", "accent", "accent_text", "dark", "secondary", "surface", "muted",
               "success", "white")


def get_clinic_branding(clinic_id: Optional[str]) -> dict:
    """Nombre, logo y marca de la clínica. Si la columna `brand` aún no existe en la base
    (migración pendiente) o no hay clínica, devuelve lo que haya sin fallar."""
    if not clinic_id:
        return {"name": None, "logo_url": None, "brand": {}}
    try:
        r = supabase.table("clinics").select("name, logo_url, brand").eq("id", clinic_id)\
            .limit(1).execute().data
    except Exception:
        r = supabase.table("clinics").select("name, logo_url").eq("id", clinic_id)\
            .limit(1).execute().data
    row = (r or [{}])[0]
    brand = row.get("brand")
    return {"name": row.get("name"), "logo_url": row.get("logo_url"),
            "brand": brand if isinstance(brand, dict) else {}}
