"""
Imágenes de marca (logo del consultorio, logo para fondo oscuro, foto del doctor).

Antes se guardaban como base64 dentro de la base de datos: pesadas, lentas y caras en
transferencia. Ahora la imagen se REDUCE al tamaño en que se usa, se convierte a WebP y se
guarda en Supabase Storage (bucket público); en la base solo queda la URL.

  photo      → cuadrada, máx. 256×256   (se muestra a ~40–96 px; 256 cubre pantallas 2–3×)
  logo       → máx. 640×240, conserva transparencia (WebP sin pérdida: queda nítido)
  logo_dark  → igual que logo, para fondos oscuros (versión en blanco)

Nunca se amplía una imagen: si ya es más pequeña, se respeta su tamaño.
"""
import hashlib
import io
import os
from typing import Optional

from PIL import Image, ImageOps, UnidentifiedImageError

BUCKET = "apex-branding"
MAX_BYTES_ENTRADA = 12 * 1024 * 1024          # lo que se acepta de entrada (fotos de celular)
Image.MAX_IMAGE_PIXELS = 50_000_000           # corta imágenes-bomba (descompresión enorme)

PERFILES = {
    "photo":         {"max": (256, 256),   "cuadrada": True,  "calidad": 82, "alfa": False, "sin_perdida": False, "dir": "perfil"},
    "logo":          {"max": (640, 240),   "cuadrada": False, "calidad": 90, "alfa": True,  "sin_perdida": True,  "dir": "clinica"},
    "logo_dark":     {"max": (640, 240),   "cuadrada": False, "calidad": 90, "alfa": True,  "sin_perdida": True,  "dir": "clinica"},
    "patient_photo": {"max": (1400, 1400), "cuadrada": False, "calidad": 85, "alfa": False, "sin_perdida": False, "dir": "expediente"},
}
LOGOS = ("logo", "logo_dark")


class ImagenInvalida(ValueError):
    """La imagen no se puede usar (no es imagen, es demasiado grande, está dañada…)."""


def procesar(data: bytes, kind: str) -> tuple[bytes, tuple[int, int]]:
    """Valida, orienta, reduce y convierte a WebP. Devuelve (bytes_webp, (ancho, alto))."""
    perfil = PERFILES.get(kind)
    if not perfil:
        raise ImagenInvalida("Tipo de imagen no válido.")
    if not data:
        raise ImagenInvalida("El archivo está vacío.")
    if len(data) > MAX_BYTES_ENTRADA:
        raise ImagenInvalida("La imagen pesa más de 12 MB. Elige una más ligera.")
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ImagenInvalida("No se pudo leer el archivo como imagen. Usa JPG, PNG o WebP.")

    im = ImageOps.exif_transpose(im)               # respeta la orientación del celular
    tiene_alfa = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)

    if perfil["alfa"] and tiene_alfa:
        im = im.convert("RGBA")
    else:
        if tiene_alfa:                             # foto con transparencia: se aplana sobre blanco
            base = Image.new("RGB", im.size, (255, 255, 255))
            base.paste(im.convert("RGBA"), mask=im.convert("RGBA").split()[-1])
            im = base
        else:
            im = im.convert("RGB")

    if perfil["cuadrada"]:
        lado = min(perfil["max"][0], min(im.size))  # no se amplía
        im = ImageOps.fit(im, (lado, lado), Image.LANCZOS, centering=(0.5, 0.4))
    else:
        im.thumbnail(perfil["max"], Image.LANCZOS)  # conserva proporción, solo reduce

    buf = io.BytesIO()
    if perfil["sin_perdida"]:
        # Logos: colores planos y texto fino. Sin pérdida se ve nítido y pesa lo mismo o menos.
        im.save(buf, format="WEBP", lossless=True, quality=100, method=6)
    else:
        im.save(buf, format="WEBP", quality=perfil["calidad"], method=6)
    return buf.getvalue(), im.size


def ruta(kind: str, dueno_id: str, webp: bytes) -> str:
    """Ruta única por contenido: cambiar la imagen cambia la URL (el navegador no usa la vieja)."""
    h = hashlib.sha1(webp).hexdigest()[:10]
    return f"{PERFILES[kind]['dir']}/{dueno_id}/{kind}-{h}.webp"


def _storage():
    from db import supabase
    return supabase.storage


def asegurar_bucket():
    """Crea el bucket público si todavía no existe (idempotente)."""
    st = _storage()
    try:
        st.get_bucket(BUCKET)
    except Exception:
        try:
            st.create_bucket(BUCKET, options={"public": True})
        except Exception:
            pass   # si otro proceso lo creó a la vez, la subida lo confirmará


def url_publica(path: str) -> str:
    return f"{os.environ['SUPABASE_URL'].rstrip('/')}/storage/v1/object/public/{BUCKET}/{path}"


def subir(path: str, webp: bytes, content_type: str = "image/webp") -> str:
    """Sube el WebP (o documento) al bucket y devuelve su URL pública."""
    asegurar_bucket()
    _storage().from_(BUCKET).upload(
        path, webp, {"content-type": content_type, "cache-control": "31536000", "upsert": "true"})
    return url_publica(path)


def ruta_de_url(url: Optional[str]) -> Optional[str]:
    """Si la URL es de nuestro bucket, devuelve la ruta del objeto; si no (base64, otra web), None."""
    if not url or not isinstance(url, str):
        return None
    marca = f"/storage/v1/object/public/{BUCKET}/"
    return url.split(marca, 1)[1].split("?", 1)[0] if marca in url else None


def quitar(url: Optional[str]) -> None:
    """Borra del bucket la imagen anterior (si era nuestra). Si falla no pasa nada: queda huérfana."""
    p = ruta_de_url(url)
    if not p:
        return
    try:
        _storage().from_(BUCKET).remove([p])
    except Exception:
        pass
