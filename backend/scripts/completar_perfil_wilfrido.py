"""
Completa el perfil del Dr. Wilfrido Alarcón en Apex con los datos de su marca (seeds/wilfrido_alarcon).

Solo LLENA lo que está vacío: nunca pisa lo que el doctor o el administrador ya capturó
(foto, nombre, teléfono, nombre del consultorio, llaves del membrete ya escritas).
Idempotente. NO usa ni imprime contraseñas.

Qué completa:
  - doctor_profiles.letterhead  → cédulas, universidad, clínica, dirección, ciudad, teléfono, web
  - doctor_profiles.clinic_logo_url → logotipo (si está vacío)
  - location_hours de su ubicación → lunes a sábado 8:30–14:00 (si no tiene horario)

Uso (desde backend/):
    venv/bin/python scripts/completar_perfil_wilfrido.py --dry-run
    venv/bin/python scripts/completar_perfil_wilfrido.py
"""
import base64
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
sys.path.insert(0, BACKEND)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(BACKEND, ".env.local"))

SEED = os.path.join(BACKEND, "seeds", "wilfrido_alarcon")
USERNAME = "wilfrido"
DRY = "--dry-run" in sys.argv

# Lunes=0 … sábado=5; minutos desde medianoche (8:30 a 14:00)
HORARIO = [{"weekday": d, "open_min": 8 * 60 + 30, "close_min": 14 * 60} for d in range(6)]


def main():
    from db import supabase

    brand = json.load(open(os.path.join(SEED, "brand.json"), encoding="utf-8"))
    contacto, doctor = brand["contacto"], brand["doctor"]
    cedulas = {c["especialidad"]: c for c in doctor["cedulas"]}
    prof_ced = cedulas["Médico Cirujano"]
    esp_ced = cedulas["Cardiología"]

    quiere = {
        "profesional": doctor["nombre"],
        "especialidad": brand["tagline"],
        "cedula_profesional": prof_ced["numero"],
        "cedula_especialidad": esp_ced["numero"],
        "universidad": f'{prof_ced["institucion"]} · {esp_ced["institucion"]}',
        "clinica": "Torre Médica Amerimed · Consultorio 1",
        "direccion": "Av. Tulum Sur 260, planta baja, consultorio 1",
        "ciudad": "Cancún, Quintana Roo",
        "telefono": contacto["tel_citas"],
        "website": contacto["web"],
        # whatsapp y email quedan vacíos a propósito: no hay dato confirmado de ninguno de los dos
    }

    rows = supabase.table("doctor_profiles").select("id, clinic_id, letterhead, clinic_logo_url")\
        .eq("username", USERNAME).limit(1).execute().data
    if not rows:
        sys.exit("No existe el usuario 'wilfrido'. Créalo primero desde el panel de administración.")
    p = rows[0]

    actual = p.get("letterhead") if isinstance(p.get("letterhead"), dict) else {}
    nuevo = {k: v for k, v in quiere.items() if not str(actual.get(k) or "").strip()}
    patch = {}
    if nuevo:
        patch["letterhead"] = {**actual, **nuevo}
    if not p.get("clinic_logo_url"):
        with open(os.path.join(SEED, "logo.png"), "rb") as f:
            patch["clinic_logo_url"] = "data:image/png;base64," + base64.b64encode(f.read()).decode()

    print("Membrete — se llenan:", ", ".join(nuevo) or "(nada, ya estaba completo)")
    print("Membrete — ya existían (no se tocan):", ", ".join(k for k in quiere if k not in nuevo) or "(ninguno)")
    print("Logotipo del perfil:", "se llena" if "clinic_logo_url" in patch else "ya tenía, no se toca")

    loc = supabase.table("locations").select("id, name").eq("clinic_id", p["clinic_id"]).limit(1).execute().data
    horas = []
    if loc:
        horas = supabase.table("location_hours").select("id").eq("location_id", loc[0]["id"]).limit(1).execute().data
    poner_horario = bool(loc) and not horas
    print("Horario de %s:" % (loc[0]["name"] if loc else "(sin ubicación)"),
          "se pone lunes a sábado 8:30–14:00" if poner_horario else "ya tenía o no hay ubicación; no se toca")

    if DRY:
        print("\n[dry-run] No se escribió nada.")
        return
    if patch:
        supabase.table("doctor_profiles").update(patch).eq("id", p["id"]).execute()
    if poner_horario:
        supabase.table("location_hours").insert(
            [{"location_id": loc[0]["id"], **h} for h in HORARIO]).execute()
    print("\nListo.")


if __name__ == "__main__":
    main()
