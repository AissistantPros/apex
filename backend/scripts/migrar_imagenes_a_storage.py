"""
Pasa a Supabase Storage (WebP, tamaño reducido) las imágenes de marca que hoy están como base64
dentro de la base de datos: foto del doctor, logotipo del consultorio y, si existen,
logo_white_url / avatar_url de clinics.brand.

Antes de reemplazar nada guarda un respaldo con los valores originales (JSON, fuera del repo).
Idempotente: lo que ya es una URL no se toca. No procesa fotos de pacientes.

Uso (desde backend/):
    venv/bin/python scripts/migrar_imagenes_a_storage.py --dry-run
    venv/bin/python scripts/migrar_imagenes_a_storage.py
"""
import base64
import datetime as dt
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
sys.path.insert(0, BACKEND)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(BACKEND, ".env.local"))

DRY = "--dry-run" in sys.argv


def es_data_url(v) -> bool:
    return isinstance(v, str) and v.startswith("data:image/")


def decodificar(v: str) -> bytes:
    return base64.b64decode(v.split(",", 1)[1])


def main():
    from db import supabase
    from services import imagenes

    respaldo = {"fecha": dt.datetime.now().isoformat(timespec="seconds"), "clinics": [], "doctor_profiles": []}

    # Respaldo ANTES de tocar nada: valores originales de todo lo que sea base64.
    ruta_respaldo = None
    if not DRY:
        for c in supabase.table("clinics").select("id, logo_url").execute().data or []:
            if es_data_url(c.get("logo_url")):
                respaldo["clinics"].append({"id": c["id"], "campo": "logo_url", "valor": c["logo_url"]})
        for p in supabase.table("doctor_profiles").select("id, photo_url, clinic_logo_url").execute().data or []:
            for campo in ("photo_url", "clinic_logo_url"):
                if es_data_url(p.get(campo)):
                    respaldo["doctor_profiles"].append({"id": p["id"], "campo": campo, "valor": p[campo]})
        if respaldo["clinics"] or respaldo["doctor_profiles"]:
            carpeta = os.path.expanduser("~/.apex-backups")
            os.makedirs(carpeta, exist_ok=True)
            ruta_respaldo = os.path.join(carpeta, f"imagenes-{dt.datetime.now():%Y%m%d-%H%M%S}.json")
            with open(ruta_respaldo, "w", encoding="utf-8") as f:
                json.dump(respaldo, f)
            os.chmod(ruta_respaldo, 0o600)
            print("Respaldo de los valores originales:", ruta_respaldo, "\n")
    antes = despues = 0
    cambios = 0

    def convertir(valor: str, kind: str, dueno: str):
        """Devuelve (url_nueva, bytes_antes, bytes_despues). En dry-run no sube nada."""
        crudo = decodificar(valor)
        webp, (w, h) = imagenes.procesar(crudo, kind)
        if DRY:
            return None, len(valor), len(webp), (w, h)
        url = imagenes.subir(imagenes.ruta(kind, dueno, webp), webp)
        return url, len(valor), len(webp), (w, h)

    # ── Clínicas ──────────────────────────────────────────────────────────────
    logos_clinica = {}
    for c in supabase.table("clinics").select("id, name, logo_url").execute().data or []:
        if es_data_url(c.get("logo_url")):
            url, a, d, dim = convertir(c["logo_url"], "logo", c["id"])
            print(f"clínica «{c['name']}» logo: {a // 1024} KB base64 → {d // 1024} KB WebP {dim[0]}×{dim[1]}")
            antes += a; despues += d; cambios += 1
            logos_clinica[c["id"]] = url
            if not DRY:
                supabase.table("clinics").update({"logo_url": url}).eq("id", c["id"]).execute()
        else:
            logos_clinica[c["id"]] = c.get("logo_url")
    try:
        for c in supabase.table("clinics").select("id, name, brand").execute().data or []:
            marca = c.get("brand") if isinstance(c.get("brand"), dict) else {}
            tocado = False
            for campo, kind in (("logo_white_url", "logo_dark"), ("avatar_url", "logo")):
                if es_data_url(marca.get(campo)):
                    url, a, d, dim = convertir(marca[campo], kind, c["id"])
                    print(f"clínica «{c['name']}» marca.{campo}: {a // 1024} KB → {d // 1024} KB WebP")
                    antes += a; despues += d; cambios += 1
                    marca[campo] = url; tocado = True
            if tocado and not DRY:
                supabase.table("clinics").update({"brand": marca}).eq("id", c["id"]).execute()
    except Exception:
        print("(clinics.brand aún no existe: se omite; corre la migración de marca)")

    # ── Perfiles (foto del doctor y logo guardado en el perfil) ───────────────────
    for p in supabase.table("doctor_profiles").select("id, display_name, clinic_id, photo_url, clinic_logo_url").execute().data or []:
        parche = {}
        if es_data_url(p.get("photo_url")):
            url, a, d, dim = convertir(p["photo_url"], "photo", p["id"])
            print(f"perfil «{p.get('display_name')}» foto: {a // 1024} KB base64 → {d // 1024} KB WebP {dim[0]}×{dim[1]}")
            antes += a; despues += d; cambios += 1
            parche["photo_url"] = url
        if es_data_url(p.get("clinic_logo_url")):
            # El logo vive en la clínica: se reutiliza su URL (si no tenía, se sube este)
            url_clinica = logos_clinica.get(p.get("clinic_id"))
            if url_clinica and not es_data_url(url_clinica):
                print(f"perfil «{p.get('display_name')}» logo: se reutiliza el de la clínica (se libera {len(p['clinic_logo_url']) // 1024} KB)")
                antes += len(p["clinic_logo_url"]); cambios += 1
                parche["clinic_logo_url"] = url_clinica
            else:
                url, a, d, dim = convertir(p["clinic_logo_url"], "logo", p.get("clinic_id") or p["id"])
                print(f"perfil «{p.get('display_name')}» logo: {a // 1024} KB → {d // 1024} KB WebP")
                antes += a; despues += d; cambios += 1
                parche["clinic_logo_url"] = url
        if parche and not DRY:
            supabase.table("doctor_profiles").update(parche).eq("id", p["id"]).execute()

    print(f"\n{cambios} imagen(es) {'por convertir' if DRY else 'convertidas'}: "
          f"{antes // 1024} KB en base64 → {despues // 1024} KB en WebP")
    if DRY:
        print("[dry-run] No se escribió nada.")


if __name__ == "__main__":
    main()
