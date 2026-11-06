"""Pruebas de imágenes de marca: reducción a WebP, subida, permisos y campos del perfil.
Sin red: Storage se reemplaza por funciones de prueba y la base es la falsa en memoria."""
import io
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Reutiliza la base falsa, el cliente y los datos de las pruebas de aislamiento
from test_aislamiento_clinicas import FAKE, TestClient, TOKENS, app, hdr, seed  # noqa: E402
from PIL import Image  # noqa: E402

from services import imagenes  # noqa: E402


def png(w, h, modo="RGB", color=None, ruido=True):
    """Imagen sintética: degradado + algo de ruido, para que el WebP no sea trivial."""
    import random
    random.seed(1)
    im = Image.new(modo, (w, h))
    px = im.load()
    for y in range(0, h):
        for x in range(0, w):
            v = (x * 255 // max(1, w - 1), y * 255 // max(1, h - 1), (x + y) % 256)
            if ruido and (x % 7 == 0):
                v = tuple(min(255, c + random.randint(0, 25)) for c in v)
            px[x, y] = v + ((255,) if modo == "RGBA" else ())
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def abre(webp):
    im = Image.open(io.BytesIO(webp))
    im.load()
    return im


class TestProcesar(unittest.TestCase):
    def test_foto_grande_queda_cuadrada_256_y_ligera(self):
        original = png(2000, 2000)
        webp, size = imagenes.procesar(original, "photo")
        im = abre(webp)
        self.assertEqual(im.format, "WEBP")
        self.assertEqual(size, (256, 256))
        self.assertEqual(im.size, (256, 256))
        self.assertLess(len(webp), 30 * 1024)
        self.assertLess(len(webp), len(original) / 20)

    def test_foto_staff_grande_queda_cuadrada_800_y_menor_a_80kb(self):
        original = png(2400, 2400)
        webp, size = imagenes.procesar(original, "staff_photo")
        im = abre(webp)
        self.assertEqual(im.format, "WEBP")
        self.assertEqual(size[0], size[1])  # Rigurosamente cuadrada
        self.assertLessEqual(size[0], 800)
        self.assertLessEqual(len(webp), 80 * 1024)  # Garantizado < 80 KB

    def test_foto_staff_rectangular_se_recorta_al_rostro_sin_deformar(self):
        # Foto panorámica rectangular 16:9
        original = png(1920, 1080)
        webp, size = imagenes.procesar(original, "staff_photo")
        im = abre(webp)
        self.assertEqual(im.format, "WEBP")
        self.assertEqual(size, (800, 800))
        self.assertEqual(im.size, (800, 800))  # Aspect ratio 1:1, sin deformación
        self.assertLessEqual(len(webp), 80 * 1024)

    def test_foto_rectangular_se_recorta_al_centro(self):
        webp, size = imagenes.procesar(png(1200, 600), "photo")
        self.assertEqual(size, (256, 256))

    def test_no_se_amplia_una_imagen_pequena(self):
        _, size = imagenes.procesar(png(100, 60), "photo")
        self.assertEqual(size, (60, 60))
        _, size = imagenes.procesar(png(200, 80), "logo")
        self.assertEqual(size, (200, 80))

    def test_logo_conserva_proporcion_y_transparencia(self):
        im_rgba = Image.new("RGBA", (3000, 1000), (0, 0, 0, 0))
        for x in range(500, 2500):
            for y in range(300, 700):
                im_rgba.putpixel((x, y), (4, 44, 100, 255))
        buf = io.BytesIO(); im_rgba.save(buf, "PNG")
        webp, size = imagenes.procesar(buf.getvalue(), "logo")
        im = abre(webp)
        self.assertLessEqual(size[0], 640)
        self.assertLessEqual(size[1], 240)
        self.assertAlmostEqual(size[0] / size[1], 3.0, delta=0.05)
        self.assertEqual(im.mode, "RGBA")
        self.assertEqual(im.getpixel((2, 2))[3], 0)            # el fondo sigue transparente
        self.assertEqual(im.getpixel((size[0] // 2, size[1] // 2))[3], 255)
        self.assertLess(len(webp), 20 * 1024)

    def test_respeta_orientacion_del_celular(self):
        im = Image.new("RGB", (400, 100), (200, 30, 30))
        ex = im.getexif(); ex[0x0112] = 6                       # girada 90°
        buf = io.BytesIO(); im.save(buf, "JPEG", exif=ex)
        _, size = imagenes.procesar(buf.getvalue(), "logo")
        self.assertGreater(size[1], size[0])                    # quedó vertical

    def test_foto_con_transparencia_se_aplana_sobre_blanco(self):
        webp, _ = imagenes.procesar(png(300, 300, "RGBA"), "photo")
        self.assertEqual(abre(webp).mode, "RGB")

    def test_rechaza_lo_que_no_es_imagen(self):
        for malo in (b"", b"hola, no soy una imagen", b"%PDF-1.4 ..."):
            with self.assertRaises(imagenes.ImagenInvalida):
                imagenes.procesar(malo, "photo")

    def test_rechaza_archivos_enormes_y_tipo_invalido(self):
        with self.assertRaises(imagenes.ImagenInvalida) as cm:
            imagenes.procesar(b"0" * (imagenes.MAX_BYTES_ENTRADA + 1), "photo")
        self.assertIn("12 MB", str(cm.exception))
        with self.assertRaises(imagenes.ImagenInvalida):
            imagenes.procesar(png(50, 50), "documento")


class TestRutas(unittest.TestCase):
    def test_ruta_cambia_con_el_contenido(self):
        a = imagenes.ruta("logo", "C1", b"uno")
        b = imagenes.ruta("logo", "C1", b"dos")
        self.assertNotEqual(a, b)
        self.assertTrue(a.startswith("clinica/C1/logo-") and a.endswith(".webp"))
        self.assertTrue(imagenes.ruta("photo", "U1", b"x").startswith("perfil/U1/photo-"))

    def test_ruta_de_url_solo_reconoce_el_bucket_propio(self):
        os.environ["SUPABASE_URL"] = "http://fake.invalid"
        u = imagenes.url_publica("perfil/U1/photo-abc.webp")
        self.assertEqual(imagenes.ruta_de_url(u), "perfil/U1/photo-abc.webp")
        self.assertEqual(imagenes.ruta_de_url(u + "?v=2"), "perfil/U1/photo-abc.webp")
        self.assertIsNone(imagenes.ruta_de_url("data:image/png;base64,AAAA"))
        self.assertIsNone(imagenes.ruta_de_url("https://otro.com/x.png"))
        self.assertIsNone(imagenes.ruta_de_url(None))


class TestEndpoint(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.c = TestClient(app, raise_server_exceptions=False)
        TOKENS["tokRec"] = "recA"

    def setUp(self):
        seed()
        FAKE.store["doctor_profiles"].append({"id": "recA", "role": "receptionist", "clinic_id": "A",
                                              "parent_doctor_id": "docA", "username": "rec"})
        self.subidas, self.borradas = [], []
        self._subir, self._quitar = imagenes.subir, imagenes.quitar
        imagenes.subir = lambda path, webp: (self.subidas.append((path, len(webp))) or
                                             f"http://fake.invalid/storage/v1/object/public/{imagenes.BUCKET}/{path}")
        imagenes.quitar = lambda url: self.borradas.append(url)

    def tearDown(self):
        imagenes.subir, imagenes.quitar = self._subir, self._quitar

    def _post(self, tok, kind, contenido):
        return self.c.post("/doctor/images", headers=hdr(tok), data={"kind": kind},
                           files={"file": ("x.png", contenido, "image/png")})

    def test_foto_del_doctor_se_reduce_y_queda_en_el_perfil(self):
        r = self._post("tokA", "photo", png(2000, 2000))
        self.assertEqual(r.status_code, 200, r.text[:200])
        j = r.json()
        self.assertEqual((j["ancho"], j["alto"]), (256, 256))
        self.assertLess(j["bytes"], 30 * 1024)
        perfil = next(p for p in FAKE.store["doctor_profiles"] if p["id"] == "docA")
        self.assertEqual(perfil["photo_url"], j["url"])
        self.assertTrue(j["url"].endswith(".webp"))

    def test_logo_va_al_consultorio_y_borra_el_anterior(self):
        previo = imagenes.url_publica("clinica/A/logo-viejo.webp")
        next(c for c in FAKE.store["clinics"] if c["id"] == "A")["logo_url"] = previo
        r = self._post("tokA", "logo", png(1500, 500))
        self.assertEqual(r.status_code, 200, r.text[:200])
        clinica = next(c for c in FAKE.store["clinics"] if c["id"] == "A")
        self.assertEqual(clinica["logo_url"], r.json()["url"])
        self.assertEqual(self.borradas, [previo])
        otra = next(c for c in FAKE.store["clinics"] if c["id"] == "B")
        self.assertFalse(otra.get("logo_url"))                  # la otra clínica no cambia

    def test_logo_oscuro_se_guarda_en_la_marca(self):
        r = self._post("tokA", "logo_dark", png(900, 300))
        self.assertEqual(r.status_code, 200, r.text[:200])
        clinica = next(c for c in FAKE.store["clinics"] if c["id"] == "A")
        self.assertEqual(clinica["brand"]["logo_white_url"], r.json()["url"])

    def test_recepcion_no_cambia_el_logo_pero_si_su_foto(self):
        self.assertEqual(self._post("tokRec", "logo", png(300, 100)).status_code, 403)
        self.assertEqual(self._post("tokRec", "logo_dark", png(300, 100)).status_code, 403)
        self.assertEqual(self._post("tokRec", "photo", png(300, 300)).status_code, 200)
        perfil = next(p for p in FAKE.store["doctor_profiles"] if p["id"] == "recA")
        self.assertTrue(perfil["photo_url"].endswith(".webp"))

    def test_requiere_sesion_y_valida_el_archivo(self):
        self.assertEqual(self._post(None, "photo", png(100, 100)).status_code, 401)
        r = self._post("tokA", "photo", b"esto no es una imagen")
        self.assertEqual(r.status_code, 400)
        self.assertIn("imagen", r.json()["detail"].lower())
        self.assertEqual(self._post("tokA", "otra-cosa", png(100, 100)).status_code, 400)
        self.assertEqual(self.subidas, [])

    def test_quitar_logo(self):
        previo = imagenes.url_publica("clinica/A/logo-x.webp")
        next(c for c in FAKE.store["clinics"] if c["id"] == "A")["logo_url"] = previo
        r = self.c.delete("/doctor/images/logo", headers=hdr("tokA"))
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(next(c for c in FAKE.store["clinics"] if c["id"] == "A")["logo_url"])
        self.assertEqual(self.borradas, [previo])
        self.assertEqual(self.c.delete("/doctor/images/logo", headers=hdr("tokRec")).status_code, 403)


class TestPerfilProtegido(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.c = TestClient(app, raise_server_exceptions=False)

    def setUp(self):
        seed()

    def test_el_perfil_no_deja_cambiarse_rol_ni_clinica(self):
        r = self.c.put("/doctor/profile", headers=hdr("tokA"), json={
            "display_name": "Dr. Nuevo", "phone": "555", "role": "admin", "clinic_id": "B",
            "permissions": {"todo": "edit"}, "is_local_admin": True, "parent_doctor_id": "x",
            "photo_url": "data:image/png;base64,AAAA", "clinic_logo_url": "data:image/png;base64,BBBB"})
        self.assertEqual(r.status_code, 200, r.text[:200])
        p = next(p for p in FAKE.store["doctor_profiles"] if p["id"] == "docA")
        self.assertEqual((p["display_name"], p["phone"]), ("Dr. Nuevo", "555"))
        self.assertEqual((p["role"], p["clinic_id"]), ("doctor", "A"))
        self.assertNotIn("permissions", p)
        self.assertNotIn("is_local_admin", p)
        self.assertNotIn("photo_url", p)                        # las imágenes solo entran por /images


if __name__ == "__main__":
    unittest.main()
