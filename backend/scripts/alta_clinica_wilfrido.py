"""
Alta del consultorio del Dr. Wilfrido Alarcón en Apex (plan Lite) con su marca real.

Idempotente: si la clínica ya existe (por nombre) la actualiza; la ubicación solo se crea si
la clínica no tiene ninguna. NO crea el usuario del doctor: eso se hace desde el panel de
administración (Clínicas → Usuarios), que genera y muestra la contraseña.

Uso (desde backend/):
    venv/bin/python scripts/alta_clinica_wilfrido.py --dry-run   # muestra qué haría, no escribe
    venv/bin/python scripts/alta_clinica_wilfrido.py             # aplica

Requiere en .env.local: SUPABASE_URL y SUPABASE_SERVICE_KEY. Nunca imprime llaves.
La columna clinics.brand viene de migrations/2026-11-03_clinic_brand.sql; si aún no existe,
todo lo demás se aplica y el script avisa que falta esa migración.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
sys.path.insert(0, BACKEND)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(BACKEND, ".env.local"))

SEED = os.path.join(BACKEND, "seeds", "wilfrido_alarcon")
CLINIC_NAME = "Consultorio Dr. Wilfrido Alarcón"
PLAN = "apex_lite"
DRY = "--dry-run" in sys.argv


def main():
    from services.plans import DEFAULT_LIMITS, PLAN_LABELS, preset_features  # importa db (cliente)
    from db import supabase

    brand = json.load(open(os.path.join(SEED, "brand.json"), encoding="utf-8"))
    contacto = brand["contacto"]

    row = {
        "name": CLINIC_NAME,
        "website": "https://www." + contacto["web"],
        "address": contacto["direccion"],
        "phone": contacto["tel_citas"],
        "plan": PLAN,
        "features": preset_features(PLAN),
        "limits": DEFAULT_LIMITS[PLAN],
        "ai_credits": 0,
        "ai_credits_used": 0,
        "active": True,
    }
    print(f"Plan: {PLAN_LABELS[PLAN]}")
    print("Servicios activos:", ", ".join(k for k, v in row["features"].items() if v))
    print("Servicios apagados:", ", ".join(k for k, v in row["features"].items() if not v))
    print("Límites:", row["limits"], "| créditos IA:", row["ai_credits"])
    print("Marca: %d colores, tipografías %s + %s; logotipos se suben a Storage en WebP" % (
        len(brand["palette"]), brand["fonts"]["heading"], brand["fonts"]["body"]))

    existing = supabase.table("clinics").select("id, name").eq("name", CLINIC_NAME).limit(1).execute().data
    if DRY:
        print("\n[dry-run] " + ("Actualizaría la clínica existente %s" % existing[0]["id"] if existing
                              else "Crearía la clínica nueva") + ". No se escribió nada.")
        return

    if existing:
        clinic_id = existing[0]["id"]
        supabase.table("clinics").update(row).eq("id", clinic_id).execute()
        print("\nClínica actualizada:", clinic_id)
    else:
        r = supabase.table("clinics").insert(row).execute()
        clinic_id = r.data[0]["id"]
        print("\nClínica creada:", clinic_id)

    # Logotipos: se reducen y se guardan en Storage como WebP (nada de base64 en la base)
    from services import imagenes
    logo_web, _ = imagenes.procesar(open(os.path.join(SEED, "logo.png"), "rb").read(), "logo")
    logo_bco, _ = imagenes.procesar(open(os.path.join(SEED, "logo-blanco.png"), "rb").read(), "logo_dark")
    url_logo = imagenes.subir(imagenes.ruta("logo", clinic_id, logo_web), logo_web)
    url_blanco = imagenes.subir(imagenes.ruta("logo_dark", clinic_id, logo_bco), logo_bco)
    actual = supabase.table("clinics").select("logo_url").eq("id", clinic_id).limit(1).execute().data[0].get("logo_url")
    if isinstance(actual, str) and actual.startswith("data:"):
        carpeta = os.path.expanduser("~/.apex-backups"); os.makedirs(carpeta, exist_ok=True)
        ruta = os.path.join(carpeta, f"logo-clinica-{clinic_id}.txt")
        open(ruta, "w").write(actual); os.chmod(ruta, 0o600)
        print("Logo anterior respaldado en", ruta)
    supabase.table("clinics").update({"logo_url": url_logo}).eq("id", clinic_id).execute()
    supabase.table("doctor_profiles").update({"clinic_logo_url": url_logo}).eq("clinic_id", clinic_id).eq("role", "doctor").execute()
    print("Logotipo (WebP): %d KB · logotipo para fondo oscuro: %d KB" % (len(logo_web) // 1024, len(logo_bco) // 1024))
    brand["logo_white_url"] = url_blanco

    try:
        supabase.table("clinics").update({"brand": brand}).eq("id", clinic_id).execute()
        print("Marca guardada en clinics.brand")
    except Exception as e:
        print("AVISO: no se pudo guardar clinics.brand (¿falta la migración?):", str(e)[:160])
        print("  Corre migrations/2026-11-03_clinic_brand.sql en el SQL Editor y vuelve a ejecutar este script.")

    locs = supabase.table("locations").select("id").eq("clinic_id", clinic_id).limit(1).execute().data
    if not locs:
        supabase.table("locations").insert({
            "clinic_id": clinic_id, "name": "Torre Médica Amerimed",
            "address": contacto["direccion"], "phone": contacto["tel_citas"],
            "color": brand["colors"]["primary"],
        }).execute()
        print("Ubicación creada: Torre Médica Amerimed")
    else:
        print("La clínica ya tiene ubicación; no se toca.")

    print("\nPendiente: crear el usuario del doctor desde el panel de administración.")


if __name__ == "__main__":
    main()
